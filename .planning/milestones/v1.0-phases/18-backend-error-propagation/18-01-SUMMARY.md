---
phase: 18-backend-error-propagation
plan: "01"
subsystem: backend/services
tags: [error-handling, typed-errors, steam-session, trade-offers, refactor]
dependency_graph:
  requires: []
  provides: [typed-SessionExpiredError-throws, steamRequest-migration]
  affects: [backend/src/services/steamSession.ts, backend/src/services/tradeOffers.ts]
tech_stack:
  added: []
  patterns: [AppError-subclass-throws, instanceof-checks, steamRequest-retry]
key_files:
  created:
    - backend/src/services/__tests__/steamSession.test.ts
  modified:
    - backend/src/services/steamSession.ts
    - backend/src/services/tradeOffers.ts
decisions:
  - "tradeOffers.ts isSessionExpiredError() retains duck-type fallback for backward compat with catch blocks that may still encounter old-style errors"
  - "axios import kept in steamSession.ts — used elsewhere (refreshSession flow); only extractSessionId/validateSession migrated to steamRequest()"
metrics:
  duration: "~7 minutes"
  completed: "2026-03-13"
  tasks_completed: 2
  files_changed: 3
---

# Phase 18 Plan 01: Typed Error Hierarchy — Services Summary

Wire the typed AppError hierarchy to steamSession.ts and tradeOffers.ts, replacing raw Error + duck-typed `.code` with `SessionExpiredError` (AppError subclass), and migrate the two raw axios calls in steamSession.ts to `steamRequest()` for retry/backoff coverage.

## Completed

- **steamSession.ts line 624**: throws `SessionExpiredError` (AppError subclass, status=401, code=SESSION_EXPIRED) — errorHandler now maps it correctly to 401+SESSION_EXPIRED
- **tradeOffers.ts isSessionExpiredError()**: upgraded from single duck-type check to `instanceof SessionExpiredError` + `instanceof SteamSessionError` + duck-type fallback — retry logic preserved intact
- **tradeOffers.ts getValidSession()**: throws `SessionExpiredError` (line ~114)
- **tradeOffers.ts**: all 9 remaining raw `(sessionErr as any).code = "SESSION_EXPIRED"` throw sites in accept/decline/cancel replaced with `new SessionExpiredError()` — 11 total sites migrated
- **extractSessionId()**: raw `axios.get("https://steamcommunity.com/")` replaced with `steamRequest()` — retry/backoff now active
- **validateSession()**: raw `axios.get("https://steamcommunity.com/my/")` replaced with `steamRequest({ followRedirects: false })` — retry/backoff now active
- **steamSession.test.ts**: 6 tests created and passing, verifying steamRequest() usage for both functions

## Files Modified

- `backend/src/services/steamSession.ts` — SessionExpiredError import, steamRequest import, 1 throw site replaced, 2 axios calls migrated
- `backend/src/services/tradeOffers.ts` — SessionExpiredError + SteamSessionError imports, isSessionExpiredError upgraded, 11 throw sites replaced
- `backend/src/services/__tests__/steamSession.test.ts` (created) — 6 unit tests

## Test Results

```
 RUN  v4.0.18

 ✓ services/__tests__/steamSession.test.ts (6 tests) 3ms

 Test Files  1 passed (1)
       Tests  6 passed (6)
    Duration  174ms
```

Full suite: 227 tests, 24 files — all passing, no regressions.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `backend/src/services/__tests__/steamSession.test.ts` — FOUND
- Commits c8bac0f (Task 1) and d7ced2a (Task 2) — FOUND
- `grep "(error as any).code|(sessionErr as any).code" steamSession.ts tradeOffers.ts` — 0 matches
- `grep "axios.get" steamSession.ts` — 0 matches (no raw axios.get in file)
- `grep "steamRequest" steamSession.ts` — 2 call sites (lines 269, 294)
