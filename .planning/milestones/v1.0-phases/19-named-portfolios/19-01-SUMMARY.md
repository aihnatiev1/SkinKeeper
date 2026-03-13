---
phase: 19-named-portfolios
plan: 01
subsystem: backend/portfolio
tags: [portfolios, crud, migration, profit-loss, postgresql]
dependency_graph:
  requires: []
  provides: [portfolios-table, portfolios-crud-api, portfolio-pl-filter]
  affects: [backend/src/routes/portfolio.ts, backend/src/services/profitLoss.ts, backend/src/db/migrations/009_portfolios.sql, backend/src/index.ts]
tech_stack:
  added: []
  patterns: [named-export-router, nullable-fk-on-delete-set-null, portfolio-id-filter-bypass-cost-basis]
key_files:
  created:
    - backend/src/db/migrations/009_portfolios.sql
  modified:
    - backend/src/routes/portfolio.ts
    - backend/src/services/profitLoss.ts
    - backend/src/index.ts
decisions:
  - "portfoliosRouter exported as named export from portfolio.ts, mounted at /api in index.ts — avoids /api/portfolio/portfolios prefix conflict while keeping all portfolio code co-located"
  - "getPortfolioPL accountId branch refactored to dynamic params array (portfolioCond) instead of hardcoded $2 — required to support both accountId and portfolioId independently or together"
  - "getItemsPL with portfolioId bypasses item_cost_basis entirely and aggregates from transactions directly — item_cost_basis is global, per-portfolio view cannot use it"
metrics:
  duration: "~15 minutes"
  completed: "2026-03-13T19:52:00Z"
  tasks_completed: 3
  files_changed: 4
---

# Phase 19 Plan 01: Portfolios Table Migration + CRUD Routes + P/L Filter Summary

Named portfolio backend foundation: PostgreSQL DDL for portfolios table with user ownership, four CRUD API endpoints, and optional portfolioId filtering on both P/L summary and per-item P/L endpoints.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migration 009 — portfolios table + transactions.portfolio_id | 4f89092 | backend/src/db/migrations/009_portfolios.sql |
| 2 | Update profitLoss.ts — portfolioId filter in getPortfolioPL and getItemsPL | 4f89092 | backend/src/services/profitLoss.ts |
| 3 | Portfolio CRUD routes + wire portfolioId to P/L endpoints | 4f89092 | backend/src/routes/portfolio.ts, backend/src/index.ts |

## What Was Built

### Migration 009
- `portfolios` table: `id SERIAL PK`, `user_id INT FK→users CASCADE`, `name VARCHAR(100) NOT NULL`, `color VARCHAR(20) DEFAULT '#6366F1'`, `created_at TIMESTAMPTZ`
- Index: `idx_portfolios_user_id`
- `portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE SET NULL` column added to `transactions`
- Index: `idx_transactions_portfolio_id`
- All DDL idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)

### profitLoss.ts Changes
- `getPortfolioPL(userId, accountId?, portfolioId?)`: when portfolioId is set, falls into the direct-from-transactions path (same as accountId). Builds dynamic params array so both filters compose cleanly.
- `getItemsPL(userId, portfolioId?)`: when portfolioId is set, computes from transactions directly using buy_agg/sell_agg/combined CTE pattern + LATERAL price join. Falls through to item_cost_basis path when no portfolioId.

### portfolio.ts + index.ts Changes
- `portfoliosRouter` (named export): GET/POST/PUT/DELETE `/portfolios` — auth + ownership checks on all mutating operations
- Mounted at `/api` in `index.ts` so routes resolve to `/api/portfolios`
- `/pl` route: now extracts `portfolioId` query param and passes to `getPortfolioPL`
- `/pl/items` route: now extracts `portfolioId` query param and passes to `getItemsPL`

## Decisions Made

1. **portfoliosRouter as named export** — The existing router is mounted at `/api/portfolio`. Adding `/portfolios` routes there would produce `/api/portfolio/portfolios`. Exporting a second router (`portfoliosRouter`) from `portfolio.ts` and mounting it at `/api` in `index.ts` keeps all portfolio code co-located while achieving the correct `/api/portfolios` URL prefix.

2. **Dynamic params array for accountId+portfolioId in getPortfolioPL** — The original accountId branch used hardcoded `$2` for `steam_account_id`. To support portfolioId independently or in combination, the function now builds a params array dynamically, appending conditions as `$N` based on array length.

3. **getItemsPL bypasses item_cost_basis when portfolioId provided** — `item_cost_basis` is a global aggregate across all transactions. It has no portfolio awareness. The portfolio-filtered view must aggregate from `transactions` directly. The global path (no portfolioId) continues using `item_cost_basis` as before for performance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / Architectural] Refactored accountId branch in getPortfolioPL to use dynamic params**
- **Found during:** Task 2
- **Issue:** The plan showed the accountId branch using hardcoded `$2` for `steam_account_id`. Adding portfolioId as another conditional param required a dynamic params approach to correctly assign `$N` positions.
- **Fix:** Replaced hardcoded `[userId, accountId]` params + `$2` literal with a dynamic `params` array and string interpolation using `params.length` for each new condition. The branch now handles accountId-only, portfolioId-only, or both.
- **Files modified:** `backend/src/services/profitLoss.ts`
- **Commit:** 4f89092

**2. [Rule 3 - Blocking] Added portfoliosRouter mount in index.ts**
- **Found during:** Task 3
- **Issue:** The CRUD routes live in a `portfoliosRouter` named export that must be mounted to be reachable. Without the `app.use("/api", portfoliosRouter)` in `index.ts`, the routes would never handle requests.
- **Fix:** Updated `index.ts` to import `portfoliosRouter` as named import and added `app.use("/api", portfoliosRouter)`.
- **Files modified:** `backend/src/index.ts`
- **Commit:** 4f89092

## Verification

```
grep -n "CREATE TABLE IF NOT EXISTS portfolios" backend/src/db/migrations/009_portfolios.sql
# 1 match

grep -n "portfolio_id" backend/src/db/migrations/009_portfolios.sql
# 2 matches (ADD COLUMN + index)

grep -n "portfoliosRouter.*portfolios" backend/src/routes/portfolio.ts
# 4 matches (GET/POST/PUT/DELETE)

grep -n "portfolioId" backend/src/services/profitLoss.ts
# 8 matches in getPortfolioPL and getItemsPL

cd backend && npx tsc --noEmit
# Only pre-existing test file errors (unchanged from before this plan)
```

## Self-Check: PASSED

- `/Users/abs/ideaProjects/skinkeeper/backend/src/db/migrations/009_portfolios.sql` — EXISTS
- `/Users/abs/ideaProjects/skinkeeper/backend/src/services/profitLoss.ts` — EXISTS, contains portfolioId
- `/Users/abs/ideaProjects/skinkeeper/backend/src/routes/portfolio.ts` — EXISTS, contains CRUD + portfolioId wiring
- `/Users/abs/ideaProjects/skinkeeper/backend/src/index.ts` — EXISTS, mounts portfoliosRouter
- Commit `4f89092` — EXISTS
