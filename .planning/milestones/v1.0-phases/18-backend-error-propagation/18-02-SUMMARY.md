---
phase: 18
plan: "02"
subsystem: backend-routes
tags: [error-handling, session-expired, testing, flutter]
dependency_graph:
  requires: [18-01]
  provides: [route-error-propagation, session-expired-tests]
  affects: [trades-route, market-route, api-client]
tech_stack:
  added: []
  patterns: [next(err) error propagation, SessionExpiredError throw in pre-checks]
key_files:
  created:
    - test/core/api_client_test.dart
  modified:
    - backend/src/routes/trades.ts
    - backend/src/routes/market.ts
    - backend/src/routes/__tests__/trades.test.ts
    - backend/src/routes/__tests__/market.test.ts
decisions:
  - "Fixed test bodies to satisfy Zod schema validation (partnerSteamId must be 17-digit, marketHashName required in sellOperationSchema)"
metrics:
  duration: 566s
  completed: "2026-03-13"
  tasks: 2
  files: 5
---

# Phase 18 Plan 02: Route Cleanup + Session Error Tests Summary

Routes now delegate all error handling to errorHandler via `next(err)` — no more inline SESSION_EXPIRED response blocks.

## Completed

- **trades.ts**: 5 catch blocks replaced with `catch (err) { next(err); }`, `NextFunction` added to 5 handler signatures
- **market.ts**: sell-operation catch simplified to `next(err)`; /sell and /bulk-sell pre-checks replaced inline `res.status(401).json({...code:"SESSION_EXPIRED"})` with `next(new SessionExpiredError(...))`; `NextFunction` and `SessionExpiredError` imports added
- **trades.test.ts**: `SessionExpiredError` import + 4 SESSION_EXPIRED propagation tests (send/accept/decline/cancel)
- **market.test.ts**: `SessionExpiredError` import + 2 SESSION_EXPIRED propagation tests (sell-operation/sell)
- **test/core/api_client_test.dart**: Created with 4 Flutter unit tests for `isSessionExpired` helper

## Test Results

```
backend vitest run: 233 passed (24 test files) — 0 failures
flutter test test/core/api_client_test.dart: 4 passed — 0 failures
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid test request bodies failing schema validation**
- **Found during:** Task 2
- **Issue:** trades test sent `partnerSteamId: "123"` (rejected by Zod regex `/^\d{17}$/`). market test sent items without `marketHashName` (required by `sellOperationSchema`). Both hit 400 before reaching the handler, so the mock throw was never exercised.
- **Fix:** Updated trade test to send valid 17-digit `partnerSteamId: "76561198000000001"`. Updated market test to include `marketHashName` in sell-operation item payload.
- **Files modified:** trades.test.ts, market.test.ts
- **Commit:** 3be863f (included in test commit)

## Self-Check: PASSED

Files confirmed present:
- backend/src/routes/trades.ts — modified
- backend/src/routes/market.ts — modified
- backend/src/routes/__tests__/trades.test.ts — modified
- backend/src/routes/__tests__/market.test.ts — modified
- test/core/api_client_test.dart — created

Commits confirmed:
- b3d6dc5: refactor(18-02): replace inline SESSION_EXPIRED handlers with next(err)
- 3be863f: test(18-02): add SESSION_EXPIRED propagation tests + Flutter api_client test
