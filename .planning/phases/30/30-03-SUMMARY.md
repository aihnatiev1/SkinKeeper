---
phase: 30-scaling-infrastructure
plan: 03
subsystem: observability-ux
tags: [health-dashboard, stale-data, graceful-degradation]
dependency_graph:
  requires: [30-01, 30-02]
  provides: [health-dashboard-endpoint, stale-data-banner]
  affects: [admin.ts, inventory.ts, inventory_provider.dart, inventory_screen.dart]
tech_stack:
  added: []
  patterns: [stale-flag-propagation, graceful-degradation-on-429]
key_files:
  created:
    - lib/core/widgets/stale_data_banner.dart
  modified:
    - backend/src/routes/admin.ts
    - backend/src/routes/inventory.ts
    - lib/features/inventory/inventory_provider.dart
    - lib/features/inventory/inventory_screen.dart
decisions:
  - "getPoolStats alias (getDbPoolStats) to avoid collision with proxyPool.getPoolStats"
  - "Stale flag from API propagated through inventoryStaleProvider (StateProvider<bool>)"
  - "429/503 in job processor returns stale data from DB instead of failing the job"
metrics:
  duration: 278s
  completed: "2026-03-18"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
---

# Phase 30 Plan 03: Health Dashboard + Graceful Degradation Summary

Admin health dashboard aggregating all infra metrics in one endpoint, plus Flutter stale data banner when Steam API is unavailable

## What Was Done

### Task 1: Health dashboard endpoint + stale flag in inventory API
- Added `GET /api/admin/health-dashboard` endpoint aggregating: queue stats (JobQueue), gateway metrics + circuit state (SteamGateway), cache stats (TTLCache registry + ResponseCache), DB pool utilization, cron job health
- Added `stale` flag to `GET /api/inventory` response based on 15-minute data freshness threshold
- Updated inventory job processor to handle Steam 429/503 gracefully: if existing DB items exist, returns `stale: true` in job result instead of failing
- Added `stale` to `GET /api/inventory/sync-status/:jobId` response from job result
- **Commit:** 27bc8d3

### Task 2: Flutter stale data banner and sync progress
- Created `StaleDataBanner` widget in `lib/core/widgets/stale_data_banner.dart`: amber banner with info icon, "Data may be outdated" text, and optional refresh button
- Added `inventoryStaleProvider` (StateProvider<bool>) to track staleness from API
- `_fetchFromApi()` reads `stale` flag from API response and updates provider
- `_refreshInBackground()` error handler marks stale on failure (keeps cached data visible)
- `refresh()` DioException handler marks stale before falling back to cache
- Inventory screen conditionally shows `StaleDataBanner` above grid when stale, with refresh callback that resets stale and triggers refresh
- **Commit:** d2041d8

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Aliased getPoolStats import to avoid naming collision**
- **Found during:** Task 1
- **Issue:** `getPoolStats` was already imported from `../services/proxyPool.js` in admin.ts; importing from `../db/pool.js` caused a naming collision
- **Fix:** Imported as `getDbPoolStats` from pool.ts, used in health-dashboard endpoint
- **Files modified:** backend/src/routes/admin.ts

## Verification

- `npx tsc --noEmit`: zero errors
- `flutter analyze`: zero errors (2 pre-existing warnings in unmodified code)
