---
phase: 04-multi-source-pricing
plan: 01
subsystem: api
tags: [csfloat, dmarket, ed25519, cron, pricing, vitest]

# Dependency graph
requires:
  - phase: 01-security
    provides: "price_history table with source column, savePrices/getLatestPrices functions"
provides:
  - "CSFloat price fetcher (fetchCSFloatPrices)"
  - "DMarket price fetcher with Ed25519 signing (fetchDMarketPrices)"
  - "Staggered 3-source cron scheduling in priceJob"
  - "getUniqueInventoryNames helper for targeted price fetching"
affects: [04-multi-source-pricing, flutter-price-display]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Per-item price fetcher returning Map<string, number>", "Ed25519 PKCS8 DER construction from hex seed via native Node.js crypto", "Staggered cron with minute offsets to avoid DB contention"]

key-files:
  created:
    - backend/src/services/csfloat.ts
    - backend/src/services/dmarket.ts
    - backend/src/services/__tests__/csfloat.test.ts
    - backend/src/services/__tests__/dmarket.test.ts
    - backend/src/services/__tests__/priceJob.test.ts
  modified:
    - backend/src/services/priceJob.ts
    - backend/src/services/prices.ts
    - backend/.env.example
    - backend/vitest.config.ts

key-decisions:
  - "Used native Node.js crypto.sign for Ed25519 instead of tweetnacl -- zero new dependencies, Node 24 has full support"
  - "PKCS8 DER prefix constructed manually for Ed25519 private key from hex seed -- avoids tweetnacl dependency entirely"
  - "Per-item fetching with 200ms delay -- conservative rate limiting for CSFloat and DMarket APIs"

patterns-established:
  - "Price fetcher pattern: async function returning Map<string, number> with env var guard, deduplication, rate limiting"
  - "TDD workflow: RED (failing tests with mocked axios) -> GREEN (minimal implementation) -> verify all pass"

requirements-completed: [PRICE-01]

# Metrics
duration: 4min
completed: 2026-03-08
---

# Phase 4 Plan 01: Multi-Source Price Fetchers Summary

**CSFloat and DMarket price fetchers with Ed25519 signing, staggered cron scheduling, and 21 passing unit tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-08T18:44:03Z
- **Completed:** 2026-03-08T18:47:36Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- CSFloat fetcher queries listings API per-item, returns lowest listing price in USD
- DMarket fetcher with Ed25519 request signing via native Node.js crypto (zero new deps)
- Staggered cron: Skinport every 5min, CSFloat every 10min offset+2, DMarket every 10min offset+5
- Fetchers only query prices for items in users' inventories (getUniqueInventoryNames)
- 21 unit tests across 3 test files, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: CSFloat and DMarket price fetchers with tests**
   - `ed4d6b6` (test) - Failing tests for both fetchers
   - `1405827` (feat) - Implementation passing all tests
2. **Task 2: Wire fetchers into cron job and add env vars**
   - `7dc2b83` (feat) - Staggered cron, getUniqueInventoryNames, .env.example

## Files Created/Modified
- `backend/src/services/csfloat.ts` - CSFloat price fetcher with rate limiting and deduplication
- `backend/src/services/dmarket.ts` - DMarket price fetcher with Ed25519 HMAC signing
- `backend/src/services/priceJob.ts` - 3-source staggered cron scheduling
- `backend/src/services/prices.ts` - Added getUniqueInventoryNames helper
- `backend/vitest.config.ts` - Vitest config with src root
- `backend/.env.example` - Added CSFLOAT_API_KEY, DMARKET_PUBLIC_KEY, DMARKET_SECRET_KEY
- `backend/src/services/__tests__/csfloat.test.ts` - 7 tests for CSFloat fetcher
- `backend/src/services/__tests__/dmarket.test.ts` - 9 tests for DMarket fetcher + signing
- `backend/src/services/__tests__/priceJob.test.ts` - 5 tests for cron orchestration

## Decisions Made
- Used native Node.js crypto.sign for Ed25519 instead of tweetnacl -- Node 24 has full support, avoids new dependency
- Constructed PKCS8 DER manually with 16-byte prefix + 32-byte seed for Ed25519 private key creation
- Conservative 200ms delay between per-item API requests to avoid rate limiting

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

External API keys required for CSFloat and DMarket price fetching. Add to `.env`:
- `CSFLOAT_API_KEY` - from CSFloat Developer Portal (csfloat.com) -> Profile -> API Key
- `DMARKET_PUBLIC_KEY` - from DMarket Developer Portal -> API Keys -> Public Key
- `DMARKET_SECRET_KEY` - from DMarket Developer Portal -> API Keys -> Secret Key (hex)

Price fetching works without these keys but will log warnings and return empty results for those sources.

## Next Phase Readiness
- Backend multi-source pricing complete, ready for Flutter UI (Plan 02/03)
- Price comparison and history chart screens can now query all 3 sources
- No schema changes needed -- price_history source column handles arbitrary sources

---
*Phase: 04-multi-source-pricing*
*Completed: 2026-03-08*
