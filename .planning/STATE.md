---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Auth Flow Redesign
status: executing
stopped_at: "Completed 30-02-PLAN.md (SteamGateway + ResponseCache + PG pool tuning)"
last_updated: "2026-03-18T18:36:30Z"
last_activity: "2026-03-18 -- Phase 30 Plan 02 executed: SteamGateway, ResponseCache, PG pool tuning"
progress:
  total_phases: 13
  completed_phases: 5
  total_plans: 30
  completed_plans: 21
  percent: 70
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-09)

**Core value:** Users can track their CS2 inventory value and sell skins quickly — with real market prices, instant price alerts, and one-tap quick sell.
**Current focus:** Phase 15: Testing — gap closure plans in progress

## Current Position

Phase: 30 (Scaling Infrastructure) — Plan 02 complete
Next: Phase 30 Plan 03
Status: SteamGateway + ResponseCache + PG pool tuning complete
Last activity: 2026-03-18 -- Completed 30-02 (SteamGateway + ResponseCache + PG pool tuning)

Progress: [██████████████] 70%

## Performance Metrics

**Velocity (from M1/M2):**
- Total plans completed: 22
- Average duration: ~3.5min
- Total execution time: ~1.3 hours

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 13 | 02 | 169s | 5 | 5 |
| 14 | 01 | 970s | 8 | 35 |
| 14 | 02 | 2175s | 8 | 30 |
| 15 | 01 | 1800s | 6 | 19 |
| 15 | 02 | 1800s | 6 | 12 |
| 15 | 03 | 300s | 2 | 6 |
| 15 | 04 | 455s | 2 | 6 |
| 16 | 01 | 180s | 2 | 4 |
| 16 | 02 | 600s | 2 | 5 |
| 16 | 03 | 600s | 2 | 3 |
| 18 | 01 | 420s | 2 | 3 |
| 18 | 02 | 566s | 2 | 5 |
| 19 | 01 | ~900s | 3 | 4 |
| 19 | 02 | ~1200s | 4 | 6 |
| 20 | 01 | ~480s | 9 | 11 |
| 27 | 01 | 268s | 2 | 4 |
| 27 | 02 | 147s | 2 | 3 |
| 28 | 01 | 197s | 2 | 3 |
| 28 | 02 | 285s | 2 | 5 |
| 30 | 01 | 221s | 2 | 3 |
| 30 | 02 | 446s | 2 | 5 |

## Accumulated Context

### Decisions

- [M3-Roadmap]: Multi-account is PREMIUM only (free = 1 account)
- [M3-Roadmap]: Session cookies must migrate from users → steam_accounts table
- [M3-Roadmap]: Offline cache before widget (widget reads from cache)
- [M3-Roadmap]: home_widget package for cross-platform widget bridge
- [M3-Roadmap]: Hive or Drift for local price cache (TBD during planning)
- [12-01]: Chose Hive ^2.2.3 for local cache (plan specified ^4.0.0 which does not exist)
- [M3-Roadmap]: Widget shows portfolio value + 24h change, P/L for premium
- [13-01]: iOS containerBackground uses availability check for iOS 17+ with gradient fallback
- [13-01]: project.pbxproj not auto-modified — Xcode manual setup needed for widget extension target
- [13-01]: Android widget uses unicode arrows for change indicators
- [13-02]: Background callback uses getPortfolioRaw() to ignore TTL for stale-but-present widget data
- [13-02]: pushCachedToWidget() helper avoids duplication between foreground resume and background callback
- [14-01]: Zod v4 API requires z.record(key, value) not z.record(value)
- [14-01]: Express 5 req.params typed as string|string[] — use `as string` casts
- [14-01]: TTLCache as shared utility with cache registry for centralized monitoring
- [14-01]: Cheerio-first with regex fallback for all Steam HTML scrapers
- [14-01]: SteamClient as utility module with retry/backoff, not class instance
- [14-02]: IndexedStack for portfolio tabs instead of StatefulShellRoute migration
- [14-02]: Settings bottom sheets kept Material-themed (solid bg, not glass)
- [14-02]: GlassCard.interactive uses AnimatedScale for press feedback
- [14-02]: StatusChip.fromTradeStatus replaces all inline status badge implementations
- [15-01]: Coverage thresholds set to 18% baseline — large services (steamSession, tradeOffers) deferred; raise incrementally as coverage grows
- [15-01]: csfloat.test.ts rewritten to match refactored API — fetchCSFloatItemPrice no longer exported, AdaptiveCrawler pattern tested instead
- [15-02]: Use pump(Duration) not pumpAndSettle — flutter_animate repeating animations block pumpAndSettle indefinitely
- [15-02]: CacheService.initForTest(path) added to CacheService for test Hive init without path_provider plugin
- [15-02]: Provider overrides pattern for all screen tests — no network calls in any test
- [15-02]: Coverage thresholds deferred for Flutter — integration_test requires device/emulator
- [15-03]: Use Promise.all pattern to attach rejection handler before vi.runAllTimersAsync() — eliminates vitest unhandled rejection
- [15-03]: Mock pool path from services/__tests__ must be ../../db/pool.js not ../pool.js
- [15-03]: syncTradeOffers exercises parseTradeOffersHtml via scrapeTradeOffersHtml — requires web_api_key mock to proceed past early return
- [15-04]: vi.mock factory cannot reference top-level variables (hoisting issue) — use inline `new Map()` instead of variable reference
- [15-04]: session routes were missing from createTestApp — added as auto-fix
- [15-04]: Coverage thresholds updated to actual measured values (25/19/26/26%)
- [16-02]: _LinkAccountButton updated to call startLinkAccount() directly (browser OAuth flow) instead of navigating to /session?linkMode=true (QR flow)
- [16-03]: CachedNetworkImage uses errorWidget not errorBuilder — plan had wrong param name, auto-fixed
- [18-01]: isSessionExpiredError() retains duck-type fallback for backward compat with catch blocks that may still hold old-style errors
- [18-01]: axios import kept in steamSession.ts — used elsewhere; only extractSessionId/validateSession migrated to steamRequest()
- [18-02]: Test bodies must satisfy Zod schema validation before mocks are exercised — partnerSteamId requires 17-digit string, sellOperationSchema requires marketHashName per item
- [19-01]: portfoliosRouter exported as named export from portfolio.ts, mounted at /api — avoids /api/portfolio/portfolios prefix conflict
- [19-01]: getPortfolioPL accountId branch refactored to dynamic params array — supports accountId + portfolioId independently or together
- [19-01]: getItemsPL with portfolioId bypasses item_cost_basis entirely — aggregates from transactions directly since item_cost_basis is global
- [19-02]: color.toARGB32() used instead of deprecated color.value for Color→hex serialization in Flutter
- [19-02]: _PortfolioSelectorBar placed in Items tab (tab 2) above ItemPLList — shows portfolio filter chips for item-level P/L view
- [20-01]: premiumProvider derives isPremium from authStateProvider.valueOrNull?.isPremium — no separate API call needed
- [20-01]: Bulk sell gate placed in InventoryScreen callbacks (not SellBottomSheet) — avoids showing sheet at all for free users
- [20-01]: Route is /premium not /paywall — plan had /paywall but router only registers /premium
- [20-01]: /pl, /pl/items, and /pl/history all get requirePremium re-enabled — all P/L routes are premium
- [27-01]: INVENTORY_PRIVATE thrown on 403 or success:false from Steam context 2 — propagated per-account in refresh
- [27-01]: hasSession derived from SteamSessionService.getSession on active account (not DB column)
- [27-01]: pendingLogins TTL 10 minutes with 60s cleanup interval (replaces bulk clear at size > 100)
- [27-02]: Polling is fallback only — deep link handler in main.dart remains primary auth path
- [27-02]: isLinking mode preserved for account linking flow (uses openSteamLinkLogin, no polling)
- [27-02]: hasSessionProvider checks valid/expiring status for future sell/trade UI gating
- [28-01]: Duplicated _StepCard and token helpers from ClientTokenAuthTab (private classes cannot be shared)
- [28-01]: QR fallback uses ExpansionTile with polling timer scoped to expanded state
- [28-01]: ConnectProgressOverlay is a regular widget (not OverlayEntry) shown as Scaffold body swap
- [28-02]: SellBottomSheet keeps sessionStatus.when wrapper for mid-sheet expiry, uses minimal TextButton prompt instead of full warning
- [28-02]: CreateTradeScreen uses addPostFrameCallback + _hasSession bool to gate entry, pops back if dismissed
- [30-02]: SteamRequestOptions/SteamResponse exported from SteamClient.ts for SteamGateway consumption
- [30-02]: ResponseCache uses own Map (not TTLCache) to support per-entry TTL and pattern invalidation
- [30-02]: registerCache adapter uses duck-typed stats getter for TTLCache-based registry compatibility

### Pending Todos

None yet.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-18
Stopped at: "Completed 30-02-PLAN.md (SteamGateway + ResponseCache + PG pool tuning)"
Resume file: None
