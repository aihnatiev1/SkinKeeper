# DevOps-1: Migration Runner Design

## Goals

1. Replace the single `schema` const re-executed on every boot with a file-based, versioned migration runner.
2. Provide a `schema_migrations` tracking table so any engineer (or the on-call solo dev) can answer "which migrations ran on this DB and when?"
3. Advisory-lock migrations so PM2 cluster restarts don't double-apply.
4. Store checksums of applied files so silent edits of historical migrations are caught immediately.
5. Add a CLI surface for day-to-day migration tasks (status, up, down, create).
6. Backfill existing prod DB (currently at block 036) without re-running any DDL.

## Non-goals

- No auto-rollback on failure. Failing migrations leave the DB in whatever partial state the SQL got to. The operator must intervene manually (see runbook).
- No parallel migration execution. Migrations are strictly sequential.
- No ORM-style migration DSL — raw SQL is the source of truth.
- No multi-tenant schema routing. Single schema (`public`) only.

---

## `schema_migrations` Table

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(10)  PRIMARY KEY,          -- e.g. "001", "036"
  applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  checksum    VARCHAR(64)  NOT NULL,              -- SHA-256 hex of file content at apply time
  applied_by  VARCHAR(100) DEFAULT current_user
);
```

`version` is the numeric prefix (zero-padded to 3 digits). It is the canonical key — filename body (e.g. `_initial_schema`) is informational only.

---

## File Naming Convention

```
backend/src/db/migrations/
  NNN_description.sql        -- forward migration (auto-applied on boot)
  NNN_description.down.sql   -- rollback (CLI only, never auto-run)
```

- `NNN` is zero-padded to 3 digits: `001`, `036`, `037`, …
- `description` is lowercase with underscores: `add_stripe_customer_id`
- Up files must be present; down files are optional but strongly recommended for new migrations.
- Gaps in sequence (missing `NNN`) are a hard error at boot — prevents silent file deletions from going unnoticed.

### Historical reference files

The existing `003_sell_operations.sql` … `017_session_expiry_notify.sql` … `034_auto_sell_tables.sql` files in the folder are **history references only** and are NOT auto-applied. They are kept as-is, renamed with a `.ref` suffix to prevent the runner from treating them as active migrations. The extracted `001`–`036` files become the canonical source of truth.

---

## Locking Strategy

Advisory lock with a fixed application-level key. Chosen over table-level locks because:

- `pg_advisory_lock(key)` blocks at the session level — second caller waits, not errors.
- Automatically released on disconnect (no orphaned lock after a crash).
- Does not require the `schema_migrations` table to exist yet.

Lock key: `7777777777` (hardcoded, documented here — do not change without updating runner and runbook).

Sequence:
1. Acquire `pg_advisory_lock(7777777777)` on a dedicated client.
2. Ensure `schema_migrations` exists (`CREATE TABLE IF NOT EXISTS …`).
3. Read applied versions.
4. Apply pending files in order.
5. Release client (auto-releases lock).

---

## Checksum Policy

**Default: REFUSE on mismatch.** If a previously-applied file's SHA-256 differs from the stored checksum, the runner throws and the process exits 1. This is the correct default because:

- An edited historical migration is either a mistake or an attempt to retroactively change history.
- Silently continuing means every boot applies different SQL to different DBs.

**Emergency override:** set `MIGRATIONS_ALLOW_CHECKSUM_DRIFT=1` in the environment. The runner logs a loud `[MIGRATION CHECKSUM DRIFT]` warning per mismatched file but continues. This env var must never be set permanently; it exists for the "we shipped a bad file, prod won't start" recovery scenario (see runbook).

---

## Backfill Plan

The existing `schema` const contains blocks `001`–`036` (with a few gaps and re-numbering anomalies). The backfill process:

1. The 36 SQL blocks in `migrate.ts` are **extracted** into individual `001_*.sql` … `036_*.sql` files. The data-migration queries (UPDATE statements) that follow the schema block are extracted into a separate `000_data_migrations.down.sql`-style file — actually they are kept in a single `000_data_backfill.sql` file marked as version `000`, which the runner **marks applied without executing** during backfill.
2. `backend/scripts/backfill-migrations.ts` runs once:
   - If `schema_migrations` table already has rows, it is a no-op (idempotent).
   - Otherwise: computes SHA-256 of each extracted `.sql` file and inserts rows for `000`–`036` with `applied_by = 'backfill'`.
3. After backfill, the runner on next boot finds all 37 versions already recorded and does nothing.

The data-migration UPDATE queries (copy session data, backfill account IDs, etc.) ran on prod many deploys ago. They are idempotent (they all have `WHERE X IS NULL` guards). They are NOT re-extracted into numbered files because they are imperative data ops, not schema changes. They live in `000_data_backfill.sql` for historical reference, marked applied, never re-run.

---

## Rollback Story for Production

### If the runner itself has a bug on first deploy

The runner is imported as a *replacement* for `migrate()` in `index.ts`. The backfill script must run and succeed **before** deploying the runner. Deployment order:

1. Deploy `backfill-migrations.ts` run (one-shot on prod, `npm run migrate:backfill`).
2. Verify `schema_migrations` has 37 rows (000–036).
3. Deploy runner adoption commit.

If step 3 fails (runner bug, startup crash):

- PM2 will loop-restart. Check `pm2 logs skinkeeper-api`.
- Set `MIGRATIONS_ALLOW_CHECKSUM_DRIFT=1` and retry if checksum errors.
- If the runner itself is broken, revert the `index.ts` change to call `migrate()` again — the `schema` const export as `LEGACY_SCHEMA` is preserved for this. The `migrate()` function remains exported.

### If a migration itself has a bug

See runbook in `backend/docs/migrations.md`.

---

## CLI Command Surface

| Command | Script entry | Effect |
|---|---|---|
| `npm run migrate:status` | `scripts/migrate.ts status` | List all applied + pending migrations with timestamps |
| `npm run migrate:up` | `scripts/migrate.ts up` | Apply all pending (same as boot auto-apply) |
| `npm run migrate:up -- --target 038` | `scripts/migrate.ts up --target 038` | Apply up to and including version 038 |
| `npm run migrate:down -- 038` | `scripts/migrate.ts down 038` | Run `038_*.down.sql`, remove from schema_migrations |
| `npm run migrate:create -- add_widget` | `scripts/migrate.ts create add_widget` | Write `037_add_widget.sql` + `037_add_widget.down.sql` templates |
| `npm run migrate:backfill` | `scripts/backfill-migrations.ts` | One-shot: populate schema_migrations for 000–036 |

---

## `index.ts` Boot Sequence Change

Before:
```typescript
import { migrate } from "./db/migrate.js";
// ...
await migrate();
```

After:
```typescript
import { runMigrations } from "./db/migrationRunner.js";
// ...
await runMigrations();
```

The `migrate.ts` file retains its `migrate()` export (renamed internally to `LEGACY_SCHEMA` const, function kept as `migrate()`) for backward compatibility. No test files import `migrate.ts` directly based on the test harness audit — the `app.ts` test harness has no DB migrations at all. The vitest config already excludes `db/migrate.ts` from coverage.

---

## Migration of Existing Folder Content

The 16 existing files (003–034) are **history references** that were never auto-applied by the old runner. After implementation:

- They are renamed with a `.ref` suffix: `003_sell_operations.sql.ref`, etc.
- The runner ignores `.ref` files.
- They remain in the folder for history/blame context.
- The canonical SQL for those versions lives in the newly extracted `003_*.sql` … `034_*.sql` files.

Files `017_session_expiry_notify.sql` and `034_auto_sell_tables.sql` (the two the spec called out) are treated identically — renamed `.ref`, content absorbed into the canonical numbered files.

---

## Gap Detection

On boot, after reading the applied-version set, the runner verifies:

- Every version recorded in `schema_migrations` has a corresponding `.sql` file on disk.
- No `.sql` file exists between `001` and `max(applied_version)` that is NOT in `schema_migrations`.

Either violation throws `[MIGRATION GAP]` with a clear message listing the missing version.

---

## Decisions Diverging from Spec

1. **`000_data_backfill.sql`**: The spec says "materialise blocks 001–036 into individual numbered .sql files." The UPDATE-based data migrations do not map cleanly to a numbered DDL block; extracting them as a numbered migration would mean they re-run on fresh DBs inappropriately (the schema changes they backfill may not exist yet in the right order). Decision: they live in `000_data_backfill.sql`, marked applied in backfill, never re-executed.

2. **Existing folder files as `.ref`**: The spec says "keep them, renumber if needed, mark applied." They are already correctly named (003, 017, 034). Renaming to `.ref` (instead of deleting) preserves git history and blame context while preventing the runner from accidentally picking them up.

3. **No `schema` const duplication in runner**: The spec says "keep `schema` const as `LEGACY_SCHEMA`". Since the test harness (`app.ts`) does not import `migrate.ts` at all, the only real consumer is the boot path and the standalone `npm run migrate` script. Both are redirected cleanly. `LEGACY_SCHEMA` is kept exported for emergency fallback only.
