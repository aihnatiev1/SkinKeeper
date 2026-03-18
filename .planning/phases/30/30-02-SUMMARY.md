---
phase: 30-scaling-infrastructure
plan: 02
subsystem: backend-infra
tags: [steam-gateway, rate-limiting, circuit-breaker, caching, pg-pool]
dependency_graph:
  requires: []
  provides: [SteamGateway, ResponseCache, getPoolStats]
  affects: [steam.ts, pool.ts]
tech_stack:
  added: []
  patterns: [token-bucket-rate-limiter, request-dedup, circuit-breaker, response-cache]
key_files:
  created:
    - backend/src/infra/SteamGateway.ts
    - backend/src/infra/ResponseCache.ts
  modified:
    - backend/src/services/steam.ts
    - backend/src/db/pool.ts
    - backend/src/utils/SteamClient.ts
decisions:
  - "SteamRequestOptions and SteamResponse exported from SteamClient.ts for gateway consumption"
  - "ResponseCache uses its own Map (not TTLCache) to support per-entry TTL and pattern invalidation"
  - "registerCache adapter uses duck-typed stats getter for compatibility with TTLCache-based registry"
metrics:
  duration: 446s
  completed: "2026-03-18T18:36:30Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
---

# Phase 30 Plan 02: Steam Gateway + Response Cache + PG Pool Tuning Summary

Centralized Steam API gateway with token bucket rate limiter, GET request dedup, and per-domain circuit breaker; response cache with pattern invalidation; PG pool with env-configurable sizing and slow query logging.

## Task Results

### Task 1: Create SteamGateway and ResponseCache modules (2e7c0cf)

Created `backend/src/infra/SteamGateway.ts`:
- Token bucket rate limiter: configurable via STEAM_RATE_LIMIT env (default 10 req/s)
- Request dedup: GET-only, 5s window, keyed by method+url+sorted_params
- Circuit breaker: per-domain (steamcommunity.com, api.steampowered.com), configurable threshold (STEAM_CIRCUIT_THRESHOLD, default 5) and cooldown (STEAM_CIRCUIT_COOLDOWN_MS, default 60s)
- Metrics: dedupHits, circuitBreaks, rateLimitWaits + wrapped client metrics
- CircuitOpenError custom error class

Created `backend/src/infra/ResponseCache.ts`:
- TTL cache with per-entry expiry (not fixed TTL like TTLCache)
- Pattern-based invalidation (string includes matching)
- Default TTLs configurable via CACHE_TTL_PORTFOLIO, CACHE_TTL_INVENTORY, CACHE_TTL_PRICES env vars
- Registered with cacheRegistry for admin monitoring

Also exported SteamRequestOptions and SteamResponse interfaces from SteamClient.ts.

### Task 2: Migrate steam.ts to SteamGateway, enhance PG pool (5f836d3)

Migrated steam.ts:
- All 6 axios call sites replaced with SteamGateway.request()
- Removed local inventoryRateLimit function and state variables
- Removed proxy pool imports (proxyPool.ts kept for price crawlers)
- Removed axios import entirely
- fetchInventoryContext simplified: SteamGateway handles rate limiting, steamRequest handles retry/backoff

Enhanced pool.ts:
- Pool size configurable via PG_POOL_MAX (default 20), PG_POOL_MIN (default 2)
- Statement timeout via PG_STATEMENT_TIMEOUT (default 30s)
- Slow query logging: queries exceeding PG_SLOW_QUERY_MS (default 500ms) logged to console
- New getPoolStats() export: totalCount, idleCount, waitingCount, max

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported SteamRequestOptions/SteamResponse from SteamClient.ts**
- Found during: Task 1
- Issue: SteamGateway needed to import types from SteamClient, but the interfaces were not exported
- Fix: Added `export` keyword to both interfaces in SteamClient.ts
- Files modified: backend/src/utils/SteamClient.ts
- Commit: 2e7c0cf

**2. [Rule 3 - Blocking] Fixed MapIterator downlevelIteration error in ResponseCache**
- Found during: Task 1
- Issue: `for...of` on Map.keys() required --downlevelIteration flag
- Fix: Used `Map.forEach()` instead of `for...of` iteration
- Files modified: backend/src/infra/ResponseCache.ts
- Commit: 2e7c0cf

## Verification

- `npx tsc --noEmit`: zero errors (full project)
- `grep axios steam.ts`: no matches (all migrated)
- Existing test suite: 3 failures pre-existing (market route tests), unchanged by this plan

## Self-Check: PASSED

- All 5 files verified present on disk
- Both commits (2e7c0cf, 5f836d3) verified in git log
- TypeScript compilation: zero errors
- No axios references remain in steam.ts
