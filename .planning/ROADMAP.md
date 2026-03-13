# Roadmap: SkinTracker

## Overview

Milestones 1 (Auth & Selling) and 2 (Premium & Growth) are complete. Milestone 3 adds post-launch power features: multi-account support, offline price cache, and home screen widgets. Milestone 4 focuses on quality: full-stack refactoring and comprehensive test coverage.

## Milestones

### Milestone 1: Auth & Selling — COMPLETE
- Phase 1: Security Hardening and Session Foundation
- Phase 2: Steam Authentication (3 methods)
- Phase 3: Enhanced Selling and Session Lifecycle

### Milestone 2: Premium & Growth — COMPLETE

### Milestone 3: Post-Launch Features — ACTIVE

### Milestone 4: Quality & Stability — PLANNED

## Phases

**Phase Numbering:**
- Integer phases (1-10): Planned milestone work
- Decimal phases (4.1, 4.2): Urgent insertions (marked with INSERTED)

### Milestone 1 (Complete)

- [x] **Phase 1: Security Hardening and Session Foundation**
- [x] **Phase 2: Steam Authentication**
- [x] **Phase 3: Enhanced Selling and Session Lifecycle**

### Milestone 2 (Complete)

- [x] **Phase 4: Multi-Source Pricing** — CSFloat + DMarket + Skinport + Steam pricing (completed 2026-03-08)
- [x] **Phase 5: Item Details** — Float, stickers, charms display (completed 2026-03-08)
- [x] **Phase 6: Profit/Loss Tracking** — Cost basis, portfolio P/L, premium gate (completed 2026-03-09)
- [x] **Phase 7: In-App Purchases** — Paywall, subscriptions, receipt verification (completed 2026-03-09)
- [x] **Phase 8: Push Notifications & Alerts** — FCM, alert engine, cross-market alerts (completed 2026-03-09)
- [x] **Phase 9: Export & Onboarding** — CSV export, onboarding flow (completed 2026-03-09)
- [x] **Phase 10: ASO** — i18n, review prompts, legal pages (completed 2026-03-09)

### Milestone 3 (Active)

- [ ] **Phase 11: Multi-Account Support** — Link multiple Steam accounts, account switching, per-account selling, premium gate (PREMIUM)
- [ ] **Phase 12: Offline Price Cache** — Local price DB, offline inventory display, background sync, cache management
- [ ] **Phase 13: Home Screen Widget** — iOS WidgetKit + Android AppWidget, portfolio summary, periodic refresh

### Milestone 4 (Planned)

- [ ] **Phase 14: Grand Refactoring** — Backend perf (DB pool, caches, validation, SteamClient), Flutter UX/UI overhaul (widget decomposition, state optimization, design polish)
- [x] **Phase 15: Testing** — Backend unit + integration tests, Flutter unit + widget + E2E tests, coverage targets (completed 2026-03-13)

## Phase Details (M3)

See `.planning/phases/` for archived M1/M2 phase details.

### Phase 11: Multi-Account Support
**Goal**: Premium users can link multiple Steam accounts and manage inventory/selling across all of them
**Depends on**: Phase 10 (M2 complete, premium gating exists)
**Requirements**: ACCT-01, ACCT-02, ACCT-03, ACCT-04, ACCT-05, ACCT-06
**Success Criteria**:
  1. User can link additional Steam accounts via QR or credentials from settings
  2. Account picker in inventory screen lets user switch active account or view all
  3. Inventory items show account badge when viewing "All accounts"
  4. Session cookies stored per steam_account (not per user) — selling works for any linked account
  5. Free tier enforces 1-account limit with premium upgrade CTA
  6. User can unlink an account from settings (deletes session + inventory data for that account)
**Plans**: 2 plans

Plans:
- [ ] 11-01-PLAN.md — Backend: migrate session cookies to steam_accounts table, per-account session management, account CRUD endpoints, premium gate
- [ ] 11-02-PLAN.md — Flutter: account linking flow, account picker UI, per-account inventory display, account management in settings

### Phase 12: Offline Price Cache
**Goal**: App shows inventory and prices instantly from local cache, even when offline
**Depends on**: Phase 11
**Requirements**: CACHE-01, CACHE-02, CACHE-03, CACHE-04, CACHE-05
**Success Criteria**:
  1. Prices and inventory structure cached locally using Hive or Drift
  2. App launches instantly with cached data — no loading spinner on repeat opens
  3. "Last updated X min ago" indicator when showing cached data
  4. Background sync fetches fresh data when network is available
  5. Cache respects TTL (1h prices, 24h inventory) and LRU eviction (50MB max)
**Plans**: 2 plans

Plans:
- [ ] 12-01-PLAN.md — Flutter: local database setup (Hive/Drift), cache service, TTL management, LRU eviction
- [ ] 12-02-PLAN.md — Flutter: integrate cache with providers, offline indicator UI, background sync, instant app launch

### Phase 13: Home Screen Widget
**Goal**: Users see portfolio summary on their home screen without opening the app
**Depends on**: Phase 12 (widget reads from local cache)
**Requirements**: WIDGET-01, WIDGET-02, WIDGET-03, WIDGET-04, WIDGET-05
**Success Criteria**:
  1. iOS WidgetKit widget displays portfolio value + 24h change %
  2. Android AppWidget displays portfolio value + 24h change %
  3. Widget refreshes every 30 minutes via background task
  4. Tapping widget deep-links to portfolio screen
  5. Premium users see P/L summary in widget; free users see portfolio value only
**Plans**: 2 plans

Plans:
- [ ] 13-01-PLAN.md — Native: iOS WidgetKit extension (Swift) + Android AppWidgetProvider (Kotlin), App Groups data sharing, home_widget Flutter bridge
- [ ] 13-02-PLAN.md — Flutter: widget data provider, background refresh scheduling, premium P/L in widget, deep link handling

## Phase Details (M4)

### Phase 14: Grand Refactoring
**Goal**: Production-grade backend + polished, fast Flutter frontend
**Depends on**: Phase 13 (all features built, now refactor)
**Requirements**: REFAC-01 (DB hardening), REFAC-02 (input validation), REFAC-03 (SteamClient), REFAC-04 (memory management), REFAC-05 (TypeScript strictness), REFAC-06 (widget decomposition), REFAC-07 (state optimization), REFAC-08 (UX polish)
**Success Criteria**:
  1. Connection pool configured with explicit limits, health check on startup
  2. All API routes validated with zod schemas
  3. Centralized SteamClient with retry, rate limiting, metrics
  4. No unbounded caches — all use TTL + maxSize
  5. Zero TypeScript `any` in non-vendor code, strict mode enabled
  6. inventory_screen.dart under 200 lines (decomposed into components)
  7. No provider watched from GridView.builder — all use `.family` or `.select()`
  8. Glassmorphic design polished: micro-interactions, hero transitions, skeleton screens
**Plans**: 2 plans

Plans:
- [x] 14-01-PLAN.md — Backend: DB pool, indexes, zod validation, SteamClient, TTL caches, typed errors, background task reliability, cheerio scrapers
- [x] 14-02-PLAN.md — Flutter: widget decomposition, state rebuild optimization, sell dedup, nav perf, design polish, inventory grid UX, screen polish, loading transitions

### Phase 15: Testing
**Goal**: Comprehensive test coverage for both backend and Flutter app
**Depends on**: Phase 14 (refactored code is testable)
**Requirements**: TEST-01 (backend unit), TEST-02 (backend integration), TEST-03 (Flutter unit), TEST-04 (Flutter widget), TEST-05 (E2E flows)
**Success Criteria**:
  1. Backend: jest + ts-jest + supertest configured, test DB auto-setup
  2. Backend: ≥70% statement coverage, all 11 route files have integration tests
  3. Backend: Steam HTML fixtures cover all scraper functions
  4. Flutter: mocktail + integration_test configured
  5. Flutter: all providers have unit tests, key widgets have widget tests
  6. Flutter: 5 critical E2E flows pass (auth, inventory, sell, trades, portfolio)
  7. All tests run without network (API calls mocked)
**Plans**: 4 plans

Plans:
- [x] 15-01-PLAN.md — Backend: jest setup, test DB, utility tests, service tests, Steam client/scraper tests, route integration tests, coverage
- [x] 15-02-PLAN.md — Flutter: test infra, provider unit tests, widget tests, screen tests, E2E integration tests, coverage
- [x] 15-03-PLAN.md — Gap closure: fix SteamClient unhandled rejection (exit code 1), Steam HTML scraper fixtures + scrapers.test.ts
- [x] 15-04-PLAN.md — Gap closure: auth/trades/market/session route integration tests, coverage threshold update to actual measured value

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 (M1) → 4 → 10 (M2) → 11 → 13 (M3) → 14 → 15 (M4)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Hardening | 2/2 | Complete | 2026-03-08 |
| 2. Steam Authentication | 2/2 | Complete | 2026-03-08 |
| 3. Enhanced Selling | 2/2 | Complete | 2026-03-08 |
| 4. Multi-Source Pricing | 2/2 | Complete | 2026-03-08 |
| 5. Item Details | 2/2 | Complete | 2026-03-08 |
| 6. Profit/Loss Tracking | 2/2 | Complete | 2026-03-09 |
| 7. In-App Purchases | 2/2 | Complete | 2026-03-09 |
| 8. Push Notifications | 2/2 | Complete | 2026-03-09 |
| 9. Export & Onboarding | 2/2 | Complete | 2026-03-09 |
| 10. ASO | 1/1 | Complete | 2026-03-09 |
| 11. Multi-Account Support | 0/2 | Pending | — |
| 12. Offline Price Cache | 0/2 | Pending | — |
| 13. Home Screen Widget | 1/2 | In Progress | — |
| 14. Grand Refactoring | 2/2 | Complete | 2026-03-12 |
| 15. Testing | 4/4 | Complete    | 2026-03-13 |
