---
phase: "14"
plan: "01"
subsystem: backend
tags: [refactoring, performance, security, typescript, validation]
dependency_graph:
  requires: []
  provides: [pool-config, zod-validation, steam-client, ttl-caches, typed-errors, graceful-shutdown, cheerio-scrapers]
  affects: [all-backend-routes, all-backend-services]
tech_stack:
  added: [zod@4.3.6, cheerio]
  patterns: [TTLCache, SteamClient, AppError-hierarchy, cache-registry, validate-middleware]
key_files:
  created:
    - backend/src/middleware/schemas.ts
    - backend/src/utils/SteamClient.ts
    - backend/src/utils/TTLCache.ts
    - backend/src/utils/cacheRegistry.ts
    - backend/src/utils/errors.ts
    - backend/src/middleware/errorHandler.ts
  modified:
    - backend/src/db/pool.ts
    - backend/src/db/migrate.ts
    - backend/src/middleware/auth.ts
    - backend/src/middleware/validate.ts
    - backend/src/routes/alerts.ts
    - backend/src/routes/trades.ts
    - backend/src/routes/market.ts
    - backend/src/routes/prices.ts
    - backend/src/routes/manualTransactions.ts
    - backend/src/services/tradeOffers.ts
    - backend/src/services/priceJob.ts
    - backend/src/services/currency.ts
    - backend/src/index.ts
decisions:
  - "Zod v4 API (z.record requires key+value args, not just value)"
  - "Express 5 req.params typed as string|string[] - use `as string` casts"
  - "TTLCache as shared utility rather than per-service implementations"
  - "Cache registry pattern for centralized monitoring via admin endpoint"
  - "Cheerio-first with regex fallback for all HTML scrapers"
  - "SteamClient as utility module (not class instance) for simpler integration"
metrics:
  duration: "970s"
  completed: "2026-03-12"
  tasks: 8
  files: 35
---

# Phase 14 Plan 01: Backend Refactoring Summary

Production-grade backend hardening: explicit pool config with health checks, Zod v4 request validation on all routes, TTL-bounded caches with centralized monitoring, centralized SteamClient with retry/backoff, typed AppError hierarchy with global error handler, graceful shutdown with job tracking, and cheerio HTML parsing with regex fallback.

## Task Results

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Database Layer Hardening | 1044a69 | Done |
| 2 | Request Validation Layer | 2bc69b7 | Done |
| 3 | Fix Auth Middleware Race Condition | 4f1b1e3 | Done |
| 4 | Steam API Client Refactoring | a41039d | Done |
| 5 | Fix Unbounded Caches | 3b315a6 | Done |
| 6 | TypeScript Strictness & Error Types | 0a4ce8b | Done |
| 7 | Background Task Reliability | f37f7db | Done |
| 8 | Scraper Robustness | c794731 | Done |

## Key Changes

### Task 1: Database Layer Hardening
- Explicit pool config: max 20 connections, 30s idle timeout, 5s connection timeout
- Pool error handler prevents unhandled crashes
- `checkPoolHealth()` runs `SELECT 1` on startup with graceful failure messaging
- Added indexes: `idx_inventory_items_name`, `idx_transactions_account_date`, `idx_price_history_name`

### Task 2: Request Validation Layer
- Installed Zod v4 (^4.3.6), created `middleware/schemas.ts` with schemas for all route inputs
- Applied `validateBody`/`validateQuery` to alerts, trades, market, prices, manualTransactions routes
- Removed manual validation code replaced by Zod schemas
- Array sizes bounded (max 256 items, max 1000 batch prices)

### Task 3: Fix Auth Middleware Race Condition
- `requirePremium` already used async/await pattern (confirmed no race condition)
- Premium status cache already present with TTL — verified and committed

### Task 4: Steam API Client Refactoring
- Created `utils/SteamClient.ts` with `steamRequest()` function
- Automatic retry with exponential backoff for 429/5xx responses
- Session expiry detection (302 redirects to login, 403)
- Request timing metrics with p50/p95 tracking via `getSteamClientMetrics()`

### Task 5: Fix Unbounded Caches
- Created generic `TTLCache<K,V>` class with maxSize eviction and hit/miss stats
- Created `cacheRegistry.ts` for centralized cache monitoring
- Converted: premiumCache (auth.ts), tradeHistorySyncCache (tradeOffers.ts), rateCache (currency.ts)
- All caches registered in registry for `/api/admin/cache-stats` endpoint

### Task 6: TypeScript Strictness & Error Types
- Created `utils/errors.ts`: AppError, ValidationError, AuthenticationError, ForbiddenError, NotFoundError, SteamError, SessionExpiredError, RateLimitError
- Created `middleware/errorHandler.ts`: global error handler mapping AppError subclasses to HTTP status codes
- Registered error handler in `index.ts` after all routes

### Task 7: Background Task Reliability
- Added `scheduledTasks[]` array tracking all cron.schedule() handles
- Added `stopAllJobs()` export: stops cron tasks + steam/csfloat crawlers
- Enhanced graceful shutdown: stopAllJobs -> pool.end() with 10s force timeout
- Job health tracking with consecutive failure counter and warning at 3+ failures

### Task 8: Scraper Robustness
- Installed cheerio for HTML parsing
- Converted `parseTradeOffersHtml` to cheerio-first with regex fallback
- Converted `parseTradeHistoryHtml` to cheerio-first with regex fallback
- Converted `fetchTradeToken` to cheerio-first with regex fallback
- All original regex logic preserved as fallback functions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Zod v4 API difference for z.record()**
- **Found during:** Task 2
- **Issue:** `z.record(z.boolean())` fails in Zod v4 — requires `z.record(z.string(), z.boolean())`
- **Fix:** Added explicit key schema to all z.record() calls
- **Files modified:** backend/src/middleware/schemas.ts

**2. [Rule 3 - Blocking] Express 5 req.params typing**
- **Found during:** Task 2
- **Issue:** `req.params.id` typed as `string | string[]` in Express 5, causing TS2345 errors
- **Fix:** Added `as string` casts where route params are used
- **Files modified:** backend/src/routes/trades.ts

**3. [Rule 3 - Blocking] cheerio.AnyNode not exported**
- **Found during:** Task 8
- **Issue:** `cheerio.AnyNode` type doesn't exist in installed cheerio version
- **Fix:** Used `ReturnType<typeof $>` instead
- **Files modified:** backend/src/services/tradeOffers.ts

### Scope Notes

- Task 3 (auth race condition): Already fixed in working tree — no code changes needed, just verification and commit
- Task 4 (SteamClient): Created as utility module, did not replace all raw axios calls across all files (gradual migration path)
- Pre-existing `csfloat.test.ts` TypeScript errors excluded from validation (not related to this plan)

## Verification

- `npx tsc --noEmit` passes with zero errors (excluding pre-existing csfloat.test.ts)
- All 8 tasks committed individually with proper commit messages
- No breaking changes to API response shapes

## Self-Check: PASSED

- All 6 created files verified on disk
- All 8 commit hashes verified in git log
