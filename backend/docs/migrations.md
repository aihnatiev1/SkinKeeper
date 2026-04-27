# Migration Runbook

Owner: solo dev (aihnatiev1@gmail.com)
Last updated: 2026-04-24 (DevOps-1)

---

## Overview

SkinKeeper uses a file-based migration runner (`src/db/migrationRunner.ts`).
Each schema change lives in a numbered `.sql` file under `src/db/migrations/`.
The runner applies pending files on every boot, tracks each in `schema_migrations`,
and refuses to start if any previously-applied file has been silently modified.

---

## Day-to-Day: Adding a Migration

```bash
# 1. Create template files (auto-picks next NNN)
npm run migrate:create -- add_new_thing

# 2. Edit the generated files
#    src/db/migrations/037_add_new_thing.sql       ← forward
#    src/db/migrations/037_add_new_thing.down.sql  ← rollback

# 3. Test locally against dev DB
npm run migrate:up

# 4. Commit both files
git add src/db/migrations/037_add_new_thing.sql src/db/migrations/037_add_new_thing.down.sql
git commit -m "feat(db): 037 add new thing"

# 5. Deploy — on boot, runMigrations() picks up 037 automatically
npm run deploy
```

### Check migration status at any time

```bash
npm run migrate:status
```

Output shows each version, its status (applied / PENDING), and timestamp.

---

## Adding a Column Safely (NOT NULL via Two Steps)

Adding `NOT NULL` columns directly fails if the table has rows.
Always use the two-step approach in two separate migrations:

### Step 1: Add nullable (migration NNN)
```sql
-- NNN_add_widget_id.sql
ALTER TABLE items ADD COLUMN widget_id INTEGER REFERENCES widgets(id) ON DELETE SET NULL;
```
Deploy this. Zero downtime — existing rows get NULL.

### Step 2: Backfill + enforce NOT NULL (migration NNN+1)
```sql
-- NNN+1_widget_id_not_null.sql
-- Backfill: set a sensible default for existing rows
UPDATE items SET widget_id = 1 WHERE widget_id IS NULL;
-- Now enforce
ALTER TABLE items ALTER COLUMN widget_id SET NOT NULL;
```
Deploy only after the backfill covers all rows.

For large tables (e.g. `price_history`), wrap the UPDATE in batches
or use a background job — do not run a single UPDATE on 10M rows inside
a migration transaction.

---

## Rollback Procedure on Production

### Single migration rollback

```bash
# On the server
cd /path/to/skinkeeper/backend
npm run migrate:down -- 037
```

This runs `037_*.down.sql` and removes the version from `schema_migrations`.
The down file must exist; if it doesn't, write it manually first.

After rollback, revert the corresponding application code and redeploy.

### What if down.sql doesn't exist?

1. Write the SQL manually to undo the change (ALTER TABLE DROP COLUMN, DROP TABLE, etc.).
2. Run it against prod DB directly via psql.
3. Remove the version from schema_migrations:
   ```sql
   DELETE FROM schema_migrations WHERE version = '037';
   ```
4. Add the down file to the repo so it's tracked going forward.

---

## Recovery from a Bad Migration (the "Shipped a Broken NNN" Playbook)

### Scenario: migration 037 deployed, application is broken, rollback needed.

1. **Stop new instances from picking up the broken state:**
   PM2 will restart on crash. Set maintenance mode if you have it; otherwise
   accept the restart loop briefly.

2. **Roll back the migration:**
   ```bash
   npm run migrate:down -- 037
   ```
   If the down file is missing, write it ad-hoc (see above).

3. **Revert application code** to the commit before 037:
   ```bash
   git revert HEAD   # or git reset --soft HEAD~1 if not pushed
   ```

4. **Redeploy the reverted code:**
   ```bash
   pm2 reload skinkeeper-api
   ```

5. **Investigate root cause** before re-attempting. Write a postmortem entry
   in `backend/docs/` describing what went wrong and what guards would catch it.

6. **Fix the migration**, update the down file, re-run in staging first.

---

## Why We Refuse Checksum Drift (and How to Override)

If a `.sql` file is modified after it was applied, the runner refuses to start:

```
[Migration] FATAL: CHECKSUM MISMATCH for version 035 (035_user_feature_flags.sql):
  stored:  abc123...
  current: def456...
  The file was modified after it was applied.
  Set MIGRATIONS_ALLOW_CHECKSUM_DRIFT=1 to bypass (emergency only).
```

**Why refuse?** Editing a historical migration creates a split-brain between
databases that applied the original and those that would apply the modified version.
On a single-node setup like ours, it means prod differs from dev silently.

**Correct fix:**
1. Revert the file to its original content.
2. Create a new migration (NNN+1) that applies the correction.

**Emergency override** (ONLY if prod is down and you cannot revert the file):
```bash
MIGRATIONS_ALLOW_CHECKSUM_DRIFT=1 pm2 reload skinkeeper-api
```
This logs a loud warning but allows boot. Remove the env var immediately after.
Document the incident: which file, why it drifted, when you'll fix it.

Never set `MIGRATIONS_ALLOW_CHECKSUM_DRIFT=1` permanently in prod environment.

---

## Production Deployment Steps for First Runner Adoption

These steps are sequential and reversible.

### Pre-requisites
- `backend/src/db/migrations/000_data_backfill.sql` … `036_alert_snooze.sql` are committed.
- `backend/scripts/backfill-migrations.ts` is committed.
- The `index.ts` change (calling `runMigrations()` instead of `migrate()`) is committed but NOT yet deployed.

### Step 1: Run the backfill script on prod

```bash
# SSH into VPS
cd /path/to/skinkeeper/backend
git pull origin main  # pull only the backfill script + migration files, NOT the index.ts change yet
npm run migrate:backfill
```

Expected output: `schema_migrations now has 37 row(s): 000 … 036`.

Verify:
```sql
SELECT count(*) FROM schema_migrations;
-- expect 37
SELECT version, applied_at FROM schema_migrations ORDER BY version;
-- expect 000 through 036
```

### Step 2: Check migration status (expect "all applied, 0 pending")

```bash
npm run migrate:status
```

All 37 should show "applied". If any show "PENDING", the backfill missed them —
run `npm run migrate:backfill` again (idempotent).

### Step 3: Deploy the runner adoption commit

```bash
git pull origin main  # now includes index.ts change
pm2 reload skinkeeper-api
```

On boot, `runMigrations()` will:
1. Acquire advisory lock.
2. Create `schema_migrations` (already exists — no-op).
3. Read applied versions (all 37 recorded).
4. Find 0 pending.
5. Log "Up to date (37 migrations applied)."
6. Continue startup as normal.

### Step 4: Validate

```bash
pm2 logs skinkeeper-api --lines 50
# Should see: "[Migration] Up to date (37 migrations applied)."

curl https://api.skinkeeper.store/api/health
# Should return: {"status":"ok"}
```

### Rollback (if runner has a bug)

```bash
# In index.ts, revert the import back to legacy:
# import { migrate } from "./db/migrate.js";
# ...
# await migrate();
git revert HEAD  # or manually edit + commit
pm2 reload skinkeeper-api
```

The `LEGACY_SCHEMA` const and `migrate()` function are preserved in `migrate.ts`
for exactly this scenario.

---

## schema_migrations Table Reference

```sql
SELECT * FROM schema_migrations ORDER BY version;
```

| Column | Type | Notes |
|---|---|---|
| version | VARCHAR(10) | 3-digit padded, e.g. "001" |
| applied_at | TIMESTAMPTZ | when the migration was run |
| checksum | VARCHAR(64) | SHA-256 hex of the .sql file at apply time |
| applied_by | VARCHAR(100) | DB user; 'backfill' for backfilled rows |

---

## Advisory Lock Key

The runner uses `pg_advisory_lock(7777777777)`.
This key is hardcoded and must never change once in use.
It prevents PM2 cluster restarts from applying the same migration twice.
The lock is released automatically when the client disconnects.

---

## Single-VPS Failure Recovery

If the VPS goes down:
1. Restore DB from latest backup (see `backend/docs/STATE.md`).
2. The restored DB will have `schema_migrations` rows reflecting the last backup.
3. Redeploy application code — runner will apply only migrations newer than the backup.
4. If schema is ahead of the backup: migrations will fail because they try to create
   structures that are missing. This is expected — let them run; they are idempotent
   (`IF NOT EXISTS` guards).

---

## Checklist Before Running a Migration on Production

- [ ] Tested against a local or staging DB
- [ ] Down migration written and tested
- [ ] If adding NOT NULL column: two-step approach followed
- [ ] If modifying 10M+ row table (price_history): batched update or maintenance window
- [ ] Migration doesn't touch `steam_login_secure` or other encrypted columns without security review
- [ ] `npm run migrate:status` shows expected pending count
- [ ] Rollback plan documented
