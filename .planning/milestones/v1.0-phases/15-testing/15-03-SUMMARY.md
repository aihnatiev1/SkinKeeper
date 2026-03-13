---
phase: 15-testing
plan: "03"
subsystem: backend-tests
tags: [testing, gap-closure, scrapers, cheerio, steam-html]
dependency_graph:
  requires: []
  provides: [steam-scraper-tests, npm-test-exit-0]
  affects: [backend-ci]
tech_stack:
  added: []
  patterns: [vitest-fake-timers-promise-all, html-fixture-files, module-mock-paths]
key_files:
  created:
    - backend/src/services/__tests__/fixtures/trade_offers_incoming.html
    - backend/src/services/__tests__/fixtures/trade_offers_empty.html
    - backend/src/services/__tests__/fixtures/trade_history.html
    - backend/src/services/__tests__/fixtures/trade_token_page.html
    - backend/src/services/__tests__/scrapers.test.ts
  modified:
    - backend/src/utils/__tests__/SteamClient.test.ts
decisions:
  - Use Promise.all pattern to attach rejection handler before vi.runAllTimersAsync() — eliminates vitest unhandled rejection detection
  - Mock pool path from services/__tests__ must be ../../db/pool.js not ../pool.js
  - syncTradeOffers exercises parseTradeOffersHtml via scrapeTradeOffersHtml path — requires web_api_key in mock to proceed past early return
metrics:
  duration: ~300s
  completed: "2026-03-13"
  tasks_completed: 2
  files_changed: 6
---

# Phase 15 Plan 03: Steam Scraper Test Gap Closure Summary

Fixed npm test exit code 1 caused by unhandled promise rejection in SteamClient.test.ts, and added Steam HTML fixture files plus scraper integration tests covering the cheerio-based trade offer and trade token parsers in tradeOffers.ts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix SteamClient unhandled promise rejection | 86dd766 | backend/src/utils/__tests__/SteamClient.test.ts |
| 2 | Create Steam HTML fixtures and scraper integration tests | 680d79c | 5 files: 4 fixture HTMLs + scrapers.test.ts |

## What Was Built

### Task 1: SteamClient Test Fix

The "throws SteamRequestError after max retries exhausted" test was calling `vi.runAllTimersAsync()` before attaching a rejection handler to the promise. When vitest advanced the fake timers, the promise rejected with no handler attached, causing an unhandled rejection that vitest detected and used to set exit code 1 — even though all 174 tests were nominally passing.

Fix: replaced the three-line sequence with `Promise.all([vi.runAllTimersAsync(), promise.catch((e) => e)])` which attaches the rejection handler atomically before timer advancement. Added `vi.useRealTimers()` cleanup at the end of the test.

### Task 2: HTML Fixtures and Scraper Tests

Created four minimal HTML fixture files that mirror real Steam page structure:
- `trade_offers_incoming.html` — one pending offer with two items (classinfo data attributes)
- `trade_offers_empty.html` — empty offers page with no .tradeoffer divs
- `trade_history.html` — one trade history row with date/items
- `trade_token_page.html` — page with trade_offer_access_url input field

Created `scrapers.test.ts` with 6 tests:
- **fetchTradeToken (3 tests)**: extracts token via cheerio from fixture, returns null when input missing, returns null on network error
- **syncTradeOffers (3 tests)**: exercises parseTradeOffersHtml via the full scrapeTradeOffersHtml code path using fixture HTML; tests both incoming offer and empty HTML cases; tests early return when no accounts

The syncTradeOffers integration tests confirmed the real cheerio parser ran on fixture HTML (log output: `[Trade] GetTradeOffers API returned empty for account 1, scraping HTML` and `[Trade] Scrape: offer 987654321 partner=76561198000000002`).

## Verification

```
npm test
Test Files: 23 passed (23)
Tests: 215 passed (215)
Exit code: 0
```

Previous state: 18 test files, 174 tests, exit code 1 (unhandled rejection).
After: 23 test files, 215 tests, exit code 0.

## Deviations from Plan

None - plan executed exactly as written. The mock path fix (`../../db/pool.js` vs `../pool.js`) was a Rule 1 auto-fix during Task 2 execution — the pool mock path in the plan's template code was wrong relative to the test file location.

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong pool mock path in scrapers.test.ts**
- **Found during:** Task 2 (test execution)
- **Issue:** Plan template used `../pool.js` but the pool is at `src/db/pool.js` — correct relative path from `services/__tests__/` is `../../db/pool.js`
- **Fix:** Updated vi.mock path to `../../db/pool.js` matching all other test files in the project
- **Files modified:** backend/src/services/__tests__/scrapers.test.ts
- **Commit:** 680d79c (included in task commit)

## Self-Check: PASSED
