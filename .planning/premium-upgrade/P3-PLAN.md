# P3-PLAN.md — Premium Upgrade — Phase P3 (Auto-sell Backend)

> **Owner:** backend-dev (execution), architect (plan authority)
> **Phase in scope:** P3 Auto-sell engine backend + schema + routes + cron (3d)
> **Out of scope:** P3.5 histogram-based `market_max`, P4 Flutter UI, native push actions
> **Status:** Ready for execution. Supersedes draft artifacts (`018_auto_sell_tables.sql`, `autoSellEngine.ts`, `autoSell.ts`, `autoSellCron.ts`) — drafts become implementation starting point, not final code.

---

## 1. Executive Summary

Auto-sell is a premium feature that watches user inventory for skins whose market price crosses a user-defined trigger, then either notifies or (with explicit opt-in) lists the item via existing `sellOperations` pipeline after a 60s user cancel window. Backend-dev produced functional draft artifacts; they are ~80% production-ready but carry five open questions (migration strategy, multi-quantity handling, `market_max` semantics, native push actions, premium rule limit) and three latent defects (no advisory lock on cron, missing FK indexes, dynamic-UPDATE column allowlist). All decisions are now resolved below. P3 proceeds as a 3-day backend task with `createOperation` handoff preserving the existing MAX guard and per-item retry logic. Native push "Undo" is explicitly deferred — the backend contract already supports cancel via API, so UI polish can ship later without schema changes. P3 unblocks P4 (Flutter UI) and P5 (smart alerts share execution history table shape).

---

## 2. Decisions Taken

### 2.1 Migration Strategy → Option A (merge into `schema` const)

**Decision:** Merge the SQL from `018_auto_sell_tables.sql` into `backend/src/db/migrate.ts`'s `schema` const. Keep the `.sql` file as historical reference (renamed to `034_auto_sell_tables.sql` to match current migration ordinal — note: current schema has migrations up through 033).

**Rationale:**
- 33 prior migrations follow this pattern; breaking it in one phase creates inconsistency worse than the marginal loss of history granularity.
- Schema const is idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Applies safely on every deploy.
- A proper migration runner is a multi-day DevOps task with its own risks (version tracking table, down-migrations, locking). Not worth blocking P3.
- Orchestrator's suggestion to file backlog task accepted — see §8.

**File-level change:** Append the contents of `018_auto_sell_tables.sql` (reordered as `-- 034: Auto-sell rules & executions` block) to the `schema` const in `migrate.ts`. Delete the standalone `.sql` file OR keep as history reference under `migrations/`.

---

### 2.2 Multi-Quantity Handling → 1 per fire, no schema column

**Decision:** MVP lists exactly one asset per rule fire. No `quantity_to_sell` column. No custom-N option.

**Rationale:**
- YAGNI: premature. A nullable unused column ages badly.
- Safer default: a rule that dumps all 3 copies of an AK Redline when market spikes 5% is a liability.
- Cooldown default 6h — user owning 3 copies gets them sold over 18h. That's a FEATURE.
- When P9 introduces "sell all" UX, migration is one line.
- Asset selection: newest `asset_id DESC` (already in draft). **Domain-expert flag for future:** consider lowest-float-first for rare skins.

---

### 2.3 `sell_strategy = 'market_max'` → `current_price * 0.99` in P3 MVP

**Decision:** In P3, `computeIntendedListPrice` for `market_max` returns `currentPrice * 0.99` (1% undercut). True histogram-based top-of-book undercut is **P3.5**, with domain-expert input.

**Rationale:**
- `getMarketItemOrdersHistogram` needs `item_nameid` (cache from migration 028), rate-limit management, gap handling, currency conversion — 1-2 days of domain-expert work alone.
- 1% undercut is a safe, simple default for 80% of items. MIN guard (0.5x) catches thin books.
- Users choosing `market_max` get "undercut market by 1%" in MVP. P3.5 upgrades same rules to "top of book minus min unit" automatically — no user action, no schema change.

**Change to draft:** `autoSellEngine.ts` line 325 — replace `return currentPrice;` with `return currentPrice * 0.99;`. Add inline comment referencing P3.5.

---

### 2.4 Native Push Actions → Option B (in-app actions only)

**Decision:** P3 and P5 ship WITHOUT native `UNNotificationCategory` / Android action intents. Push notifications are plain — tapping opens in-app screen where user sees pending execution and taps "Undo" or "Edit".

**Rationale:**
- `POST /executions/:id/cancel` endpoint is identical whether caller is native push action or in-app button. Backend contract unchanged.
- Native actions require: iOS `UNNotificationCategory`, APNs payload changes, Android `NotificationCompat.Action`, FCM data-messages — multi-agent coordination across `publisher`, `flutter-dev`, backend `firebase.ts`.
- Risk: native actions go wrong (user taps "Undo" on locked screen, actions fire without auth) → bad UX + security review.
- Deferral is costless: schema unchanged. Add native actions later once usage data tells us users actually want one-tap cancel vs "tap to review".

**Change to draft:** keep `category: "AUTO_SELL_CANCEL"` data field (future-compat). Update TODO at line 429: *"Native actions deferred — users cancel via in-app notification center."*

---

### 2.5 Premium Rules Limit → 10

**Decision:** `MAX_RULES_PER_USER_PREMIUM = 10`. No tiered plans.

**Rationale:**
- Matches P1/P2 scaling pattern (alerts: 5 free / 20 premium).
- 10 covers real traders' top-10 watched skins. Power users hitting ceiling = GOOD signal (engaged, tolerate future "Pro+" tier).
- Spam prevention: rules scan is O(N) per cron run. Unlimited = DoS vector.
- Single constant, no schema change to bump later.

---

### 2.6 MIN_PRICE_MULTIPLIER Scoping → Confirmed in autoSellEngine, NOT sellOperations

**Decision:** The 0.5x floor guard stays in `autoSellEngine.fireRule()`, downgrades fire to `notify_only`. Manual sell via `sellOperations.createOperation` does NOT get a MIN guard.

**Rationale:**
- Manual sell is explicit, attended, user-typed. Guarding against "too low" is paternalistic, breaks legit urgent-liquidation and market-floor-testing use cases.
- Auto-sell is unattended. Stakes of a bug (stale trigger, bad strategy math, old typo) are systemic — one bad rule could list a $500 knife for $2.50. MIN guard essential BECAUSE user isn't watching.
- MAX guard in `sellOperations.ts` protects against API/calc bugs regardless of caller — different layer, different concern.
- Symmetry argument is seductive but wrong: MAX and MIN protect different failure modes at different layers.

---

## 3. Draft Files Review

### 3.1 `backend/src/db/migrations/018_auto_sell_tables.sql`

**Overall:** Schema well-designed. Comments thorough. Constraint names consistent. Partial indexes appropriate.

**Required changes:**
1. **Rename file** to `034_auto_sell_tables.sql` (current last migration is 033).
2. **Move content into `migrate.ts` schema const** (see §2.1).
3. **Add missing index:** `CREATE INDEX IF NOT EXISTS idx_auto_sell_exec_sell_op ON auto_sell_executions(sell_operation_id) WHERE sell_operation_id IS NOT NULL;`
4. **`account_id NOT NULL`** — **keep NOT NULL.** Widening later is non-breaking; narrowing isn't.
5. **Constraint chk_auto_sell_exec_action** includes `'pending_window'` but comment only mentions 4 — update comment.
6. **CASCADE delete from rule → executions** is OK given soft-delete for user-facing rule deletion. Only hard CASCADE from `users.id` deletion triggers it.

**Acceptable as-is:** `DECIMAL(10,2)`, soft-delete via `cancelled_at`, partial index `WHERE enabled = TRUE AND cancelled_at IS NULL`.

---

### 3.2 `backend/src/services/autoSellEngine.ts`

**Overall:** Skeleton is solid. Reads like production code with TODO markers. Sequential evaluation correct for MVP.

**Required changes:**
1. **Advisory lock:** Add `pg_try_advisory_lock` at top of `evaluateRules` (prevent concurrent runs on multi-instance deploys):
   ```typescript
   const lockKey = 848502;
   const { rows: [{ locked }] } = await pool.query<{ locked: boolean }>(
     `SELECT pg_try_advisory_lock($1) AS locked`, [lockKey]
   );
   if (!locked) { log.warn("auto_sell_eval_skipped_locked"); return; }
   try { /* body */ } finally {
     await pool.query(`SELECT pg_advisory_unlock($1)`, [lockKey]);
   }
   ```
2. **`market_max` strategy fix:** Line 325, `return currentPrice * 0.99;` (§2.3).
3. **`createOperation` signature match confirmed** — draft uses `priceCurrencyId: 1` compatibly with `SellOperationItemInput`. Verify USD→wallet conversion in `currency.ts` when user wallet isn't USD (known working path).
4. **`executeListing` edge case:** If `inventory_items` row absent entirely (not just untradable), query returns 0 rows → action `'failed'` with "No tradable asset owned". **Accepted.** Don't layer `is_holding` / trade-lock checks for MVP (`tradable = TRUE` suffices).
5. **Startup drain hook:** Export `drainOnStartup` function, wire from `priceJob.ts` init block. Handles pending_window rows whose process died mid-window.
6. **Error handling:** `fireRule` relies on `createOperation` internals for retry (it has async background processing). Execution row updated to `'failed'` if `createOperation` throws synchronously. Correct contract.
7. **`shouldFire` exported for unit testing** — good. Pure function.

**Acceptable as-is:** Sequential eval (batching = future), `setTimeout` `.unref()`, drain-on-completion as restart safety net.

---

### 3.3 `backend/src/routes/autoSell.ts`

**Overall:** CRUD routes well-shaped. Zod validation tight. IDOR protection via `user_id` scoping correct on every query.

**Required changes:**
1. **Dynamic UPDATE column allowlist** (defense-in-depth, even though Zod pre-validates):
   ```typescript
   const ALLOWED_PATCH_COLUMNS = new Set([
     'enabled','mode','trigger_price_usd','sell_price_usd',
     'sell_strategy','cooldown_minutes'
   ]);
   for (const [col, val] of Object.entries(body)) {
     if (val === undefined) continue;
     if (!ALLOWED_PATCH_COLUMNS.has(col)) continue;
     set.push(`${col} = $${i++}`);
     vals.push(val);
   }
   ```
2. **`requirePremium` on PATCH:** Currently only POST `/rules` is premium-gated. PATCH too — downgraded users shouldn't modify rules. DELETE/GET stay open (let lapsed users clean up).
3. **Route registration:** Not wired into `index.ts` — see §4 task P3.T4.

**Acceptable as-is:** 404 vs 403 on PATCH/DELETE for other users' rules (don't leak existence), atomic cancel window query, `cancelled_at IS NULL` filter in GET.

---

### 3.4 `backend/src/cron/autoSellCron.ts`

**Overall:** Wrapper file is dead code. Option A (merge into `priceJob.ts`) is right — matches existing convention.

**Required changes:**
1. **Delete this file.** The wrapper just re-exports `registerAutoSellCron`.
2. **Wire into `priceJob.ts`:** In `startPriceJobs()`:
   ```typescript
   import { registerAutoSellCron, drainOnStartup } from "./autoSellEngine.js";
   registerAutoSellCron();
   drainOnStartup().catch(err => console.error("[INIT] auto-sell drain failed:", err));
   ```
3. **Push into `scheduledTasks[]`:** add `stopAutoSellCron()` to `stopAllJobs()`.
4. **Cron interval `*/15` fine** — only DB queries per eval, no Steam API per rule in MVP.
5. **Health tracking:** Register `autoSell` in `jobHealth` dict so `/api/admin/job-health` shows status.

---

## 4. Task Breakdown — Backend-Dev Next Run

| # | Task | Est | Depends on |
|---|------|-----|------------|
| P3.T1 | Merge `018_*.sql` into `migrate.ts` `schema` const as `-- 034:` block; add `idx_auto_sell_exec_sell_op`; clean up standalone .sql | 1h | — |
| P3.T2 | `autoSellEngine.ts` edits: advisory lock, `market_max` 0.99x, export `drainOnStartup`, `stopAutoSellCron` integration | 2h | P3.T1 |
| P3.T3 | `autoSellEngine.ts` unit tests: `shouldFire` (above/below boundaries), `computeIntendedListPrice` (3 strategies), MIN guard | 3h | P3.T2 |
| P3.T4 | `autoSell.ts` routes: `ALLOWED_PATCH_COLUMNS` allowlist, `requirePremium` on PATCH, wire into `index.ts` | 1h | P3.T1 |
| P3.T5 | Integration test: notify_only happy path (create rule, cross trigger, assert execution `'notified'`) | 3h | P3.T2, P3.T4 |
| P3.T6 | Integration test: auto_list path (pending_window, cancel via API, vs fake-timer elapse → `createOperation` called) | 3h | P3.T5 |
| P3.T7 | Delete `autoSellCron.ts` wrapper. Wire `registerAutoSellCron` + `drainOnStartup` + `stopAutoSellCron` into `priceJob.ts`. Add to `jobHealth`. | 1h | P3.T2 |
| P3.T8 | Deploy: staging migration, Postman smoke, verify cron logs | 2h | all |
| P3.T9 | Admin: extend `/api/admin/job-health` with `autoSell.lastRun/lastSuccess`. Add `/api/admin/auto-sell-stats` (rule count, fire count 24h, failures) | 2h | P3.T7 |
| P3.T10 | Document premium limit + guards in `backend/docs/auto-sell.md` | 1h | — |

**Total: 19h ≈ 2.5d execution + 0.5d buffer = 3d.**

---

## 5. Dependencies

### P4 Flutter UI
- **Requires:** P3.T4 complete (routes live on staging).
- **Contract:** API endpoints in §3.3 stable. Flutter retrofit client generated from OpenAPI OR hand-written against 5 routes.
- **Requires:** P3.T1 schema live (Flutter models match GET response shapes).
- **Does NOT require:** P3.5. `market_max` returns valid prices with 0.99x in P3.

### P5 Smart alerts backend
- **Loosely coupled.** P5 reuses `price_alerts` table, may reuse `auto_sell_executions` shape as pattern for `smart_alert_triggers`.
- **No hard blocker — can run in parallel** if backend-dev has capacity.

### P8 Tour — no dependency.

### P3.5 histogram-based market_max
- **Depends on P3 shipping.** P3.5 changes one function. No migration. No API change.
- **Owner:** domain-expert + backend-dev. 1-2 days.

---

## 6. Acceptance Criteria

### Schema
- [ ] Tables exist in production DB post-deploy
- [ ] All 5 indexes created (enabled-partial, name-partial, exec-rule, exec-pending, exec-sell-op)
- [ ] `CHECK` constraints enforce valid enums
- [ ] Dropping user CASCADEs through rules → executions
- [ ] Dropping steam_account CASCADEs to rules → executions

### Engine
- [ ] Advisory lock prevents double-run (simulated parallel calls)
- [ ] `shouldFire` returns `true` at `price == trigger` boundary for both directions, `false` otherwise
- [ ] MIN guard (`ratio < 0.5`) downgrades `auto_list` → `notified` with `refusalReason`
- [ ] Cooldown prevents fire within `cooldown_minutes` of `last_fired_at`
- [ ] `market_max` produces `currentPrice * 0.99` (rounding: `1.00 → 0.99`)

### Routes
- [ ] POST `/rules` without premium → 403
- [ ] POST `/rules` for another user's `account_id` → 404 (IDOR)
- [ ] POST `/rules` at limit 10 → 400 with descriptive error
- [ ] PATCH `/rules/:id` without premium → 403
- [ ] PATCH with unknown column rejected by Zod; known-but-not-allowlisted silently ignored
- [ ] DELETE sets `cancelled_at` (soft-delete). GET excludes cancelled
- [ ] POST `/executions/:id/cancel` atomic pending_window → cancelled; 409 if window expired

### Cron
- [ ] `*/15` cron fires, logs `auto_sell_eval_start` + `auto_sell_eval_done`
- [ ] `drainOnStartup` runs once at process start
- [ ] `stopAllJobs()` cleanly stops auto-sell cron
- [ ] `/api/admin/job-health` includes `autoSell` key

### E2E
- [ ] Create rule → ≤15 min → `notified` execution → push on test device
- [ ] Switch to `auto_list` → fire → 60s `pending_window` → cancel → `cancelled`
- [ ] Switch to `auto_list` → fire → wait 60s → listing in `sell_operations` → marketable on Steam

---

## 7. Test Plan

### Unit (`backend/test/services/autoSellEngine.test.ts`)
| Test | Covers |
|------|--------|
| `shouldFire above at boundary` | Edge case |
| `shouldFire below at boundary` | Edge case |
| `shouldFire unknown trigger_type` | Defensive default |
| `computeIntendedListPrice fixed` | Strategy fixed |
| `computeIntendedListPrice market_max 0.99x` | Strategy market_max MVP |
| `computeIntendedListPrice percent_of_market` | Strategy percent |
| `fireRule MIN guard → notified + refusalReason` | Safety floor |
| `fireRule cooldown blocks second fire` | Anti-oscillation |

### Integration (`backend/test/routes/autoSell.test.ts`)
| Test | Covers |
|------|--------|
| POST /rules → 201 (premium) | CRUD happy |
| POST /rules → 403 (non-premium) | Gating |
| POST /rules other's account_id → 404 | IDOR |
| POST /rules at limit 10 → 400 | Rate limit |
| PATCH /rules/:id → 200 | CRUD |
| PATCH /rules/:id → 403 (non-premium) | Gating on edit |
| DELETE /rules/:id → 204 + cancelled_at | Soft-delete |
| GET /rules excludes cancelled | Soft-delete filter |
| POST /executions/:id/cancel during window → 204 | Cancel race |
| POST /executions/:id/cancel after window → 409 | Cancel race |

### Integration — Engine (`backend/test/services/autoSellEngine.integration.test.ts`)
| Test | Covers |
|------|--------|
| Full cron: seed rule + current_prices, run evaluate, assert execution | E2E notify_only |
| Full cron: auto_list, pending_window, fast-forward 60s, assert `createOperation` mock | E2E auto_list |
| Cancel during window: run, cancel, fast-forward, assert NO `createOperation` | Cancel wins |
| Restart mid-window: insert past-expiry pending_window, call `drainOnStartup`, assert processed | Restart safety |
| Advisory lock: two concurrent evaluate calls, only one proceeds | Concurrency |

### Manual QA (staging)
- Premium user creates rule via Postman
- Manually UPDATE `current_prices` to cross trigger
- Observe push (if Firebase wired)
- Verify execution row via admin endpoint
- Toggle `auto_list`, re-trigger, cancel via push (in-app fallback)

---

## 8. Open Questions

### For domain-expert (P3.5 follow-up, NOT P3 blocker)
1. **`market_max` true semantics:** highest current buy order vs lowest current sell order minus 1 unit? Default: lowest sell order minus 0.01 USD (undercut sellers).
2. **Histogram gap handling:** empty `sell_order_graph` → fall back to `current_price * 0.99` (safer than skip).
3. **Doppler / rare-pattern items:** rule is name-scoped; user with Ruby Doppler watches AWP Doppler and might auto-sell Ruby when market for ANY AWP Doppler crosses threshold. WRONG. Add `paint_index_filter` / `phase_filter` to rules, OR refuse to arm for known pattern-sensitive items.
4. **Multiple copies with different floats:** MVP picks newest `asset_id` (may be worst float). User might lose prized FN 0.02 because newer BS 0.70 picked first. Recommend P9: `prefer_float: 'highest'|'lowest'|'newest'` setting.

### For orchestrator (DevOps backlog)
1. **DevOps-1:** Proper migration runner before schema hits 50 migrations. 2-3d.
2. **DevOps-2:** Multi-instance cron coordination. Advisory lock works for eval, but `setTimeout` 60s window doesn't survive instance shutdown mid-window. Would need tiny job queue (BullMQ or DB-polling worker). Flag for horizontal-scale planning.

---

## 9. Handoff Notes for backend-dev

- Start with P3.T1 (schema merge) — lowest risk, unblocks everything.
- Write P3.T3 unit tests BEFORE P3.T2 engine edits — test-first on pure functions catches regressions fast.
- After P3.T7, verify `auto_sell_cron_registered` log line on startup.
- Use `@sandbox` premium user for testing — `users.is_premium = true`.
- Admin stats (P3.T9) piggybacks existing `/api/admin/price-stats` pattern with `ADMIN_SECRET`.
- If ambiguity hits P3.5 territory — STOP, open domain-expert ticket, don't guess. P3 ships with 0.99x.
- Do NOT register native push categories (APNs/FCM) — deferred per §2.4. Keep `category: "AUTO_SELL_CANCEL"` data field (free, future-compat).
- When done → `qa` for test review. `publisher` NOT needed (no store changes).

---

## 10. Rollback Plan

1. **Immediate:** `stopAutoSellCron()` via admin OR `PM2 restart` with `AUTO_SELL_DISABLED=1` (add feature flag in `registerAutoSellCron`).
2. **Soft:** `UPDATE auto_sell_rules SET enabled = FALSE WHERE enabled = TRUE` — disable all instantly, preserve data.
3. **Hard (last resort):** `DROP TABLE auto_sell_executions, auto_sell_rules`. Schema const idempotent — removing block + redeploy recreates on boot. History lost.
4. **Route rollback:** comment `app.use("/api/auto-sell", ...)` in `index.ts`, redeploy. Flutter must handle 404 in error boundary (document for flutter-dev).

---

## 11. Delivery Checklist

- [ ] `npm run test` green
- [ ] `npm run dev` boots with auto-sell cron log line
- [ ] `tsc --noEmit` clean
- [ ] Migration applied on staging (`\d auto_sell_rules` in psql)
- [ ] Postman collection saved `backend/postman/auto-sell.json`
- [ ] `CLAUDE.md` Current Priorities: P3 complete, P4 unblocked
- [ ] No `TODO(P3)` markers left (P3.5 / P9 / DevOps-1 OK)
- [ ] `backend/docs/auto-sell.md` created
- [ ] PR description lists 5 decisions from §2 + links to this PLAN
