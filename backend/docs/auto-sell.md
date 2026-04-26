# Auto-sell — Backend Reference

Premium feature (P3). Watches user inventory; when market price crosses a
user-defined trigger, either notifies or (with explicit opt-in) lists the
item via the existing `sellOperations` pipeline after a 60-second user
cancel window.

## Architecture

```
   cron(*/15)            evaluateRules            fireRule
   ─────────             ──────────────           ────────
        │                      │                      │
        ▼                      ▼                      ▼
  pg_try_advisory_lock   SELECT enabled rules    insert exec row
        │                      │                  ('notified' or
        │                      ├── per-rule       'pending_window')
        ▼                      │   evaluate            │
   if !locked → skip           ▼                      ▼
                       cooldown? price >= trigger?  push (FCM)
                                  │                    │
                                  ▼                    ▼
                              fireRule        setTimeout(60s)
                                                       │
                                                       ▼
                                                executeListing
                                                       │
                                                       ▼
                                          atomic UPDATE
                                          pending_window→listed
                                                       │
                                                       ▼
                                          createOperation()
                                          (existing sellOps path)
```

User cancel path: `POST /api/auto-sell/executions/:id/cancel` does
`UPDATE auto_sell_executions SET action='cancelled' WHERE
action='pending_window' AND cancel_window_expires_at > NOW()`. Atomic, so
the 60-second `setTimeout` simply finds 0 rows when the claim runs.

Restart safety: `drainOnStartup()` runs at boot and during every cron tick.
It picks up any `pending_window` rows whose 60-second window already
expired (process died mid-window) and runs them through `executeListing`.

## Five Decisions (from P3-PLAN §2)

1. **Migration strategy → schema-const merge** (§2.1). Schema lives inside
   `backend/src/db/migrate.ts` `schema` const as the `-- 034:` block.
   `034_auto_sell_tables.sql` in `migrations/` is history reference only.
   DevOps-1 backlog: introduce a real migration runner before we hit ~50
   migrations.
2. **One asset per fire, no `quantity_to_sell` column** (§2.2). YAGNI; rules
   that auto-dump 3 copies on a 5% spike are a footgun. Cooldown spreads
   sales out across hours organically.
3. **`market_max` = `currentPrice * 0.99`** (§2.3). True histogram-based
   top-of-book undercut is **P3.5** (domain-expert + 1-2d), gated on
   item_nameid cache + rate-limit budget. 1% undercut is safe-default for
   80% of items; MIN guard catches thin books.
4. **Native push actions deferred** (§2.4). Plain push for now; tap goes
   to in-app screen with "Undo" button. `category: "AUTO_SELL_CANCEL"` is
   kept in the FCM data payload for future-compat — when publisher wires
   `UNNotificationCategory` / `NotificationCompat.Action` later, the
   backend contract doesn't need changes.
5. **`MAX_RULES_PER_USER_PREMIUM = 10`** (§2.5). Matches alerts pattern
   (5 free / 20 premium). 10 covers a real trader's top watchlist;
   power users hitting the ceiling = good signal for a future Pro+ tier.

## Safety Rails

| Guard | Where | Default | Notes |
|-------|-------|---------|-------|
| Cooldown | `evaluateRule` | 360 min (6h) | Per-rule, configurable 15m..7d |
| MIN price multiplier | `fireRule` | 0.5x current | Below this, downgrade to `notified` with refusal reason |
| MAX price multiplier | `sellOperations.processOperation` | 5x market | Pre-existing — different layer, different concern (see §2.6) |
| 60s cancel window | `fireRule` (auto_list only) | 60_000 ms | User undo via push or in-app |
| Premium gate | `requirePremium` middleware | — | POST + PATCH only; GET/DELETE open so lapsed users can clean up |
| Rule limit | `POST /rules` | 10 per user | Spam prevention; cron is O(N) |
| Advisory lock | `evaluateRules` | `pg_try_advisory_lock(848502)` | Multi-instance safety; concurrent runs skip |

The MIN guard only applies to auto-sell. Manual sell (`sellOperations.createOperation` direct call) does NOT get a MIN guard — paternalism would break legit urgent-liquidation use cases. See §2.6 of P3-PLAN.

## Endpoints

```
POST   /api/auto-sell/rules                       Create (PREMIUM)
GET    /api/auto-sell/rules                       List
PATCH  /api/auto-sell/rules/:id                   Update (PREMIUM)
DELETE /api/auto-sell/rules/:id                   Soft-delete
GET    /api/auto-sell/executions                  History; ?rule_id=&limit=
POST   /api/auto-sell/executions/:id/cancel       Cancel during 60s window
```

Soft-delete (`cancelled_at`) preserves execution-history integrity. GET
filters out cancelled rules.

PATCH allowlist (`ALLOWED_PATCH_COLUMNS` in `routes/autoSell.ts`):
`enabled, mode, trigger_price_usd, sell_price_usd, sell_strategy,
cooldown_minutes`. Adding a new mutable column requires updating both the
allowlist AND `patchRuleSchema`.

## Schema

Tables defined in `migrate.ts` block `-- 034: Auto-sell rules &
executions`:

- `auto_sell_rules` — user-defined rules. Soft-delete via `cancelled_at`.
  Indexes: `idx_auto_sell_rules_enabled` (partial, hot path),
  `idx_auto_sell_rules_name` (partial, fan-out).
- `auto_sell_executions` — fire log. Action enum: `notified`,
  `pending_window`, `listed`, `cancelled`, `failed`. Indexes:
  `idx_auto_sell_exec_rule`, `idx_auto_sell_exec_pending_window` (partial),
  `idx_auto_sell_exec_sell_op` (partial, FK).

## Observability

- **Logs:** structured JSON via `utils/logger.ts`. Key events:
  `auto_sell_eval_start`, `auto_sell_eval_done`, `auto_sell_eval_skipped_locked`,
  `auto_sell_cron_registered`, `auto_sell_drain_on_startup`,
  `auto_sell_eval_rule_failed`, `auto_sell_execute_listing_failed`,
  `auto_sell_drain_failed`, `auto_sell_cron_failed`.
- **`/api/admin/job-health`** — includes `autoSell.lastRun`,
  `autoSell.lastSuccess`, `autoSell.consecutiveFailures`.
- **`/api/admin/auto-sell-stats`** — `activeRules`, `fires24h`,
  `failures24h`, `minGuardRefusals24h`, plus the `cron` health snapshot.
- Auth: header `x-admin-secret` matching `ADMIN_SECRET` env var.

Reading job-health output: `consecutiveFailures >= 3` triggers a console
warning. `lastSuccess > 30 min ago` while cron is registered = something
is broken and needs investigation (most likely advisory lock leak or
DB outage).

## Rollback Playbook (P3-PLAN §10)

1. **Soft pause** (preserves data): `UPDATE auto_sell_rules SET enabled =
   FALSE WHERE enabled = TRUE` — disables all rules instantly. Cron still
   runs but finds nothing to fire.
2. **Stop cron** (admin or PM2 restart): `stopAutoSellCron()`. The
   route stays up; users can still cancel/delete rules.
3. **Route rollback**: comment `app.use("/api/auto-sell", ...)` in
   `index.ts`, redeploy. Flutter clients must handle 404 gracefully.
4. **Hard nuke**: `DROP TABLE auto_sell_executions, auto_sell_rules`.
   Schema const is idempotent — removing the `-- 034:` block + redeploy
   recreates fresh on boot. **History is lost.** Last resort.

## Testing

- Unit: `src/services/__tests__/autoSellEngine.test.ts` (19 tests) —
  pure functions and fire path with mocked pool/firebase/sellOps.
- Integration-style: `src/services/__tests__/autoSellEngine.integration.test.ts`
  (6 tests) — multi-step flows: notify_only / auto_list happy paths,
  cancel during window, drainOnStartup, advisory-lock concurrency.
- Routes: `src/routes/__tests__/autoSell.test.ts` (15 tests) — premium
  gating, IDOR guard, 10-rule limit, allowlist behavior, cancel race.

DB is mocked in all of the above (consistent with rest of repo). Real-DB
integration tests are gated on DevOps-1 (proper migration runner +
ephemeral test DB).

## Out-of-scope for P3 (links to P3-PLAN)

- **P3.5** — true histogram-based `market_max` (1-2d, domain-expert).
- **P9** — multi-quantity fire, float/phase filters, `prefer_float` rule
  setting.
- **DevOps-1** — real migration runner.
- **DevOps-2** — multi-instance cron + 60s window survival of process
  shutdown (BullMQ or DB-polling worker).
- **Native push actions** — UNNotificationCategory / Android action
  intents. `category` field already in FCM payload, future-compat.
