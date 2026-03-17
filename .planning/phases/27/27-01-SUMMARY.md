---
phase: 27-zero-friction-entry
plan: 01
subsystem: backend-auth-inventory
tags: [inventory, auth, nonce-polling, private-inventory, session-detection]
dependency_graph:
  requires: []
  provides: [inventory-private-detection, has-session-metadata, nonce-ttl-cleanup]
  affects: [inventory-refresh, inventory-list, auth-polling]
tech_stack:
  added: []
  patterns: [per-entry-ttl-cleanup, typed-error-propagation]
key_files:
  created: []
  modified:
    - backend/src/services/steam.ts
    - backend/src/routes/inventory.ts
    - backend/src/routes/auth.ts
    - backend/src/routes/__tests__/inventory.test.ts
decisions:
  - INVENTORY_PRIVATE thrown on 403 or success:false from Steam context 2 fetch
  - hasSession derived from SteamSessionService.getSession on active account
  - pendingLogins TTL set to 10 minutes with 60s cleanup interval
metrics:
  duration: 268s
  completed: "2026-03-17T18:40:18Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 27 Plan 01: Backend Session-Optional Hardening Summary

Private inventory detection with INVENTORY_PRIVATE error propagation, hasSession metadata on inventory list, and TTL-based nonce cleanup for OpenID polling.

## Task Results

### Task 1: Private-inventory detection and session-status metadata

- `fetchInventoryContext` in steam.ts now throws `Error('INVENTORY_PRIVATE')` when Steam returns HTTP 403 or `success:false` on context 2 (public inventory endpoint)
- `/api/inventory/refresh` catches INVENTORY_PRIVATE per-account, continues processing other accounts, and returns `private_accounts: number[]` in response
- `GET /api/inventory` now includes `hasSession: boolean` by checking active account's session via `SteamSessionService.getSession()`
- Updated inventory test mock to include `getSession` method

**Commit:** `8c127b7` feat(27-01): add private-inventory detection and hasSession to inventory endpoints
**Commit:** `33b7d96` fix(27-01): add getSession mock to inventory tests for hasSession support

### Task 2: Harden OpenID nonce-based polling flow

- Changed `pendingLogins` Map value type to include `createdAt: number` timestamp
- Replaced bulk-clear cleanup (clear all if size > 100) with per-entry TTL cleanup (remove entries older than 10 minutes, checked every 60 seconds)
- Added `createdAt: Date.now()` to both success and error entries in pendingLogins
- Added debug log line in poll endpoint on successful nonce completion

**Commit:** `a867b21` feat(27-01): harden OpenID nonce polling with TTL cleanup and logging

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed inventory test mock missing getSession**
- **Found during:** Task 1 verification
- **Issue:** Adding `hasSession` to GET /api/inventory called `SteamSessionService.getSession()` which was not in the test mock, causing 500 errors in 6 tests
- **Fix:** Added `getSession: vi.fn().mockResolvedValue(null)` to the SteamSessionService mock
- **Files modified:** backend/src/routes/__tests__/inventory.test.ts
- **Commit:** 33b7d96

## Verification

- TypeScript compiles cleanly (`npx tsc --noEmit`)
- All 8 inventory route tests pass
- All auth route tests pass (pre-existing link gate test failure unrelated)
