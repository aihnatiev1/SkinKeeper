# Roadmap: SkinTracker

## Overview

Milestones 1 (Auth & Selling) and 2 (Premium & Growth) are complete. Milestone 3 adds post-launch power features: multi-account support, offline price cache, and home screen widgets. Milestone 4 focuses on quality: full-stack refactoring and comprehensive test coverage. Milestone 5 delivers a full web platform with Next.js — full feature parity with the mobile app, responsive design, Stripe payments, and animations.

## Milestones

### Milestone 1: Auth & Selling — COMPLETE
- Phase 1: Security Hardening and Session Foundation
- Phase 2: Steam Authentication (3 methods)
- Phase 3: Enhanced Selling and Session Lifecycle

### Milestone 2: Premium & Growth — COMPLETE

### Milestone 3: Post-Launch Features — ACTIVE

### Milestone 4: Quality & Stability — COMPLETE (phases 14-15)

### Gap Closure (v1.0 audit) — ACTIVE
- [x] Phase 16: Multi-Account Gap Closure
- [ ] Phase 17: Offline Cache Gap Closure
- [x] Phase 18: Backend Error Propagation
- [x] Phase 19: Named Portfolios
- [x] Phase 20: Premium Gate Activation (completed 2026-03-14)

### Milestone 6: Auth Flow Redesign — ACTIVE
- [ ] Phase 27: Tier 1 — Zero Friction Entry
- [ ] Phase 28: Tier 2 — Intent-Based Session Unlock
- [ ] Phase 29: UX Polish — Locked States, Nudges & Connect Reward

### Milestone 5: Web Platform — PLANNED
- [ ] Phase 21: Web Foundation — Next.js scaffold, design system, auth, layout shell
- [ ] Phase 22: Dashboard & Inventory — Portfolio dashboard, inventory grid, item detail, price comparison
- [ ] Phase 23: Trading & Transactions — Trade management, transaction history, bulk sell, manual transactions
- [ ] Phase 24: Alerts & Settings — Price alerts CRUD, settings, linked accounts, CSV export, Web Push
- [ ] Phase 25: Stripe Payments — Checkout, webhooks, billing page, cross-platform premium
- [ ] Phase 26: Polish & Launch — Animations, responsive QA, performance, error pages

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

## Phase Details (Gap Closure)

### Phase 16: Multi-Account Gap Closure
**Goal**: Complete multi-account feature — re-enable premium gate, implement multi-account inventory merge with per-account badges, wire per-item account context for sell flow
**Depends on**: Phase 15 (tests in place to catch regressions)
**Requirements**: ACCT-01, ACCT-03, ACCT-04, ACCT-05
**Gap Closure**: Closes gaps from v1.0 milestone audit
**Success Criteria**:
  1. Free tier enforces 1-account limit — `/auth/accounts/link` returns 403 for free users with >1 account; Flutter shows paywall
  2. Inventory shows items from ALL linked accounts simultaneously with account badge (avatar/initials) on each item card
  3. Account badge tap switches active account and reloads inventory
  4. Sell flow works from any account (active account session used; account-switch CTA when item belongs to non-active account)
  5. Link callback correctly associates new Steam account with existing user (state param verified)
**Plans**: 3 plans

Plans:
- [ ] 16-01-PLAN.md — Backend: uncomment premium gate in auth.ts, add account_avatar_url to inventory query, integration tests for ACCT-05 + multi-account inventory
- [ ] 16-02-PLAN.md — Flutter data layer: drop accountId filter in inventory provider, add PremiumRequiredException handling, account-linked deep link handler, accountAvatarUrl in InventoryItem model
- [ ] 16-03-PLAN.md — Flutter UI: account badge overlay on ItemCard, sell sheet cross-account warning banner + accountId in sell request

### Phase 17: Offline Cache Gap Closure
**Goal**: Complete offline cache — wire price caching, add cache-first providers, offline display with last-updated indicator, background price sync, LRU eviction
**Depends on**: Phase 16
**Requirements**: CACHE-01, CACHE-02, CACHE-03, CACHE-05
**Gap Closure**: Closes gaps from v1.0 milestone audit
**Success Criteria**:
  1. `putPrices` called after every price fetch; `getPrices` used as cache-first fallback — item cards show cached prices offline
  2. All providers (inventory, portfolio, prices) show cached data when offline with SyncIndicator showing "last updated X ago"
  3. Background price sync registered — WorkManager (Android) / BGTask (iOS) fetches fresh prices every 30min when network available
  4. `CacheService.evictIfNeeded(maxBytes: 50MB)` called on app resume via `didChangeAppLifecycleState`
  5. App opens instantly with cached data — no loading spinner on repeat launches when cache is fresh
**Plans**: 0 plans

### Phase 18: Backend Error Propagation
**Goal**: Wire typed error hierarchy to production services — session expiry returns 401 not 500; Steam errors typed and propagated correctly
**Depends on**: Phase 17
**Requirements**: REFAC-03-gap, REFAC-05-gap
**Gap Closure**: Closes integration gaps from v1.0 milestone audit
**Success Criteria**:
  1. `steamSession.ts` throws `SessionExpiredError` / `SteamRequestError` (AppError subclasses) — errorHandler maps to 401/429
  2. `tradeOffers.ts` throws typed errors — session expiry during trade returns 401 not 500
  3. `steamSession.ts` uses `steamRequest()` from SteamClient — retry/backoff active on all Steam HTTP calls
  4. Flutter SESSION_EXPIRED handling tested end-to-end with typed error response
**Plans**: 2 plans

Plans:
- [ ] 18-01-PLAN.md — Services: replace raw Error+.code throws with SessionExpiredError, migrate steamSession.ts axios to steamRequest(), add steamSession.test.ts
- [ ] 18-02-PLAN.md — Routes + tests: remove inline SESSION_EXPIRED handlers, convert to next(err), extend route integration tests, add Flutter api_client_test.dart

### Phase 19: Named Portfolios
**Goal**: Users can create named portfolio groups, tag manual transactions to them, and filter the P/L view by portfolio
**Depends on**: Phase 18 (backend error propagation complete)
**Requirements**: PORTFOLIO-01 (create/edit/delete portfolios), PORTFOLIO-02 (filter P/L by portfolio), PORTFOLIO-03 (assign portfolio in AddTransactionSheet)
**Success Criteria**:
  1. User can create/edit/delete named portfolios with name + color
  2. Portfolio selector bar on P/L tab — "All" + one chip per portfolio + "+" create button
  3. Selecting a portfolio chip filters the P/L summary + items table to that portfolio only
  4. AddTransactionSheet has optional portfolio picker (defaults to untagged)
  5. Long-press on item row in P/L table shows "Log transaction" shortcut
**Plans**: 2 plans

Plans:
- [x] 19-01-PLAN.md — Backend: migration (portfolios table + transactions.portfolio_id FK), CRUD routes, P/L filter by portfolioId
- [x] 19-02-PLAN.md — Flutter: Portfolio model, portfoliosProvider, selectedPortfolioIdProvider, selector bar, create/edit/delete sheets, AddTransactionSheet picker, item row long-press

### Phase 20: Premium Gate Activation
**Goal**: Enable the freemium model before public release — wire premiumProvider to real subscription status and activate all feature gates
**Depends on**: Phase 19 (all features built, gates can now be switched on)
**Requirements**: PREMIUM-01 (real subscription check), PREMIUM-02 (multi-account limit), PREMIUM-03 (P/L gate), PREMIUM-04 (multi-source prices gate), PREMIUM-05 (bulk sell gate), PREMIUM-06 (alerts limit), PREMIUM-07 (CSV export gate), PREMIUM-08 (paywall CTAs)
**Success Criteria**:
  1. `premiumProvider` returns real subscription status from `/auth/me` — no longer returns `true` unconditionally
  2. Free users limited to 1 linked account (Phase 16 backend gate already exists — Flutter CTA confirmed)
  3. P/L tracking tab shows paywall gate for free users (PremiumGate widget active)
  4. Multi-source prices (Buff, CSFloat, Skinport, DMarket) gated — free users see Steam price only
  5. Bulk sell gated — free users see paywall CTA when trying to bulk sell
  6. Free users limited to 5 price alerts — creating a 6th shows paywall
  7. CSV export gated — free users see paywall CTA in settings
  8. Paywall CTAs are consistent: same PaywallScreen with feature-specific highlight text
**Plans**: 1 plan

Plans:
- [ ] 20-01-PLAN.md — Flutter + backend: wire premiumProvider to authStateProvider, implement PremiumGate lock overlay, backend tier-based alert limit (5 free/20 premium), re-enable requirePremium on /pl/export/alerts-history, gate bulk-sell/CSV/multi-source prices in Flutter

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

## Phase Details (M6 — Auth Flow Redesign)

### Phase 27: Tier 1 — Zero Friction Entry
**Goal**: Users enter app instantly after Steam OpenID — no session screen, full read-only access
**Depends on**: Phase 20 (existing auth works)
**Requirements**: AUTHUX-01, AUTHUX-02, AUTHUX-03, AUTHUX-04
**Success Criteria**:
  1. Login screen: single "Continue with Steam" CTA, clean design with app branding
  2. After OpenID callback, route goes to `/portfolio` — NOT to session screen
  3. Inventory loads via public Steam API (no cookies needed) for read-only view
  4. Portfolio value, prices, alerts all functional without session cookies
  5. Session screen removed from mandatory post-login flow
**Plans**: 2 plans

Plans:
- [ ] 27-01-PLAN.md — Backend: ensure public inventory endpoint works without session, separate identity (JWT) from session (cookies) in auth flow
- [ ] 27-02-PLAN.md — Flutter: redesign login screen (single CTA), remove mandatory session redirect, route to portfolio after OpenID, inventory provider falls back to public API

### Phase 28: Tier 2 — Intent-Based Session Unlock
**Goal**: When user tries sell/trade, show value-driven gate with system browser login (ASWebAuthenticationSession/Custom Tabs) as primary method
**Depends on**: Phase 27 (tier 1 entry works)
**Requirements**: AUTHUX-05, AUTHUX-06, AUTHUX-07, AUTHUX-08, AUTHUX-09, AUTHUX-10
**Architecture**:
  - Primary: System browser (flutter_custom_tabs / ASWebAuthenticationSession) — leverages existing Safari/Chrome Steam session, no password needed if already logged in
  - Polling: Frontend polls backend every 2-3s for session status after browser opens
  - Manual fallback: "I've Approved ✓" button triggers immediate backend check
  - Help section: QR (another device) + web token (advanced) as hidden fallbacks
**Success Criteria**:
  1. Tapping Sell/Quick Sell/Trade/Accept checks session state — if no session, shows gate
  2. Gate screen: "Enable Full Access" with value-driven copy + feature list
  3. Primary CTA "Log in to Steam" opens system browser (shared cookies with Safari/Chrome)
  4. Live sync status: "Waiting for Steam confirmation..." with polling + "I've Approved ✓" fallback
  5. "Having trouble?" section: QR from another device + paste token (advanced)
  6. Connect progress: animated steps (Syncing → Loading → Calculating)
  7. After connect, auto-navigate back to the screen that triggered the gate
  8. Deep link callback (myapp://auth-callback) to return user to app after browser login
**Plans**: 2 plans

Plans:
- [ ] 28-01-PLAN.md — Backend: /check-session polling endpoint, system browser auth flow (redirect URL + cookie capture), deep link callback handler. Flutter: flutter_custom_tabs setup, ASWebAuthenticationSession config, deep link registration
- [ ] 28-02-PLAN.md — Flutter: SessionGate widget, gate screen UI (system browser primary, QR/token fallback in "Having trouble?"), polling + "I've Approved" manual trigger, connect progress animation, auto-return after connect

### Phase 29: UX Polish — Locked States, Nudges & Connect Reward
**Goal**: Unconnected users see helpful banners, connected users get reward animation
**Depends on**: Phase 28 (gate flow works)
**Requirements**: AUTHUX-11, AUTHUX-12, AUTHUX-13
**Success Criteria**:
  1. Trades tab: "Connect Steam to manage trades" empty state with connect CTA
  2. Sell buttons: show lock icon when no session, tap triggers gate
  3. Portfolio: soft nudge banner "Connect Steam to unlock full potential"
  4. Post-connect reward: "✓ 772 items synced, +$1,350 profit detected" with confetti/animation
  5. All locked states consistent design language
**Plans**: 1 plan

Plans:
- [ ] 29-01-PLAN.md — Flutter: locked state banners (trades, sell, portfolio nudge), post-connect reward animation, consistent lock icon on gated actions

## Phase Details (M5 — Web Platform)

**Stack**: Next.js 15 (App Router) + Tailwind CSS 4 + Framer Motion + TanStack Query + Zustand + Recharts + Stripe
**Directory**: `web-app/` (separate from Flutter's `web/`)
**Deploy**: Vercel
**Auth**: Steam OpenID redirect → JWT in httpOnly cookie
**Payments**: Stripe (cross-platform with IAP — same `is_premium` flag)

### Phase 21: Web Foundation
**Goal**: Working Next.js shell with Steam auth, design system, and responsive layout
**Depends on**: Phase 20 (premium gates active, backend stable)
**Success Criteria**:
  1. `web-app/` scaffold: Next.js 15, TypeScript, Tailwind, Framer Motion, TanStack Query, Zustand
  2. Tailwind config ports all design tokens from Flutter `theme.dart` — colors, spacing, radius, typography
  3. Base components: `GlassCard`, `Button` (primary/secondary/ghost), `Badge`, `Skeleton`, `Modal`, `Sheet`
  4. Layout shell: sidebar nav (desktop) → bottom nav (mobile), responsive breakpoints (640/1024px)
  5. API client: fetch wrapper with JWT from httpOnly cookie, interceptors for TOKEN_EXPIRED/SESSION_EXPIRED
  6. Steam OpenID login: redirect to Steam → callback → backend verifies → Set-Cookie JWT → redirect to `/portfolio`
  7. QR code login as alternative: poll-based flow with animated QR display
  8. Protected route middleware: check JWT cookie, redirect to `/login` if missing/expired
  9. Dark theme by default, glassmorphic card style with `backdrop-blur`
**Plans**: 3 plans

Plans:
- [ ] 21-01-PLAN.md — Scaffold: Next.js init, Tailwind config (design tokens), base component library (GlassCard, Button, Badge, Skeleton, Modal)
- [ ] 21-02-PLAN.md — Layout: sidebar/bottom nav shell, responsive breakpoints, page transitions (Framer Motion AnimatePresence)
- [ ] 21-03-PLAN.md — Auth: API client with cookie JWT, Steam OpenID flow, QR login, protected route middleware, login/callback pages

### Phase 22: Dashboard & Inventory
**Goal**: Portfolio dashboard and inventory grid with full feature parity
**Depends on**: Phase 21 (auth and layout working)
**Success Criteria**:
  1. Portfolio page: total value card with 24h change %, animated counter, P/L summary (realized + unrealized)
  2. P/L stat cards: Invested, Current Value, Total Profit, ROI %, Item Count — with Framer Motion enter
  3. Value chart: Recharts LineChart — 7d/30d/90d toggle, tooltip on hover, responsive
  4. P/L items table: sortable by item, profit, %, quantity — with portfolio filter chips
  5. Inventory grid: CSS Grid 2→5 columns, item cards with rarity glow, wear pill, float bar, sticker thumbs
  6. Item grouping: identical items stacked (x797), click opens quantity selector
  7. Search + filters: search bar, wear dropdown, sort (price/float/name), tradable toggle, hide-no-price
  8. Item detail page: `/inventory/[assetId]` — hero image, float/stickers/charms, multi-source price table, inspect link
  9. Named portfolios: selector bar, create/edit/delete, filter P/L by portfolio
  10. Staggered fade-in animation on grid, hover scale on cards, layout animation on filter change
**Plans**: 3 plans

Plans:
- [ ] 22-01-PLAN.md — Portfolio dashboard: value card, P/L summary, stat cards, chart (Recharts), period toggle
- [ ] 22-02-PLAN.md — Inventory: grid layout, item card component, grouping, quantity selector, search/filter bar, sort
- [ ] 22-03-PLAN.md — Item detail page, multi-source price comparison table, named portfolio selector + CRUD

### Phase 23: Trading & Transactions
**Goal**: Trade management and transaction history with full CRUD
**Depends on**: Phase 22
**Success Criteria**:
  1. Trades page: tabs (Incoming/Outgoing), trade cards with partner info, items, status badge, value diff
  2. Trade detail: expand to see full item lists (give/receive), inspect links, partner profile
  3. Accept/Decline/Cancel: API calls with optimistic UI update + confirmation dialog
  4. Create trade: multi-step flow — search partner → select items give/receive → set message → send
  5. Transactions page: table with date, item, type (buy/sell), price, source — sortable, filterable
  6. Manual transaction: modal form (item name, type, price, date, quantity, optional portfolio, note)
  7. Bulk sell: selection mode → price summary → confirm → progress tracker with per-item status
  8. Multi-account context: account switcher in sidebar, all data scoped to active account
**Plans**: 3 plans

Plans:
- [ ] 23-01-PLAN.md — Trades: list page (tabs, trade cards, status badges), detail view, accept/decline/cancel actions
- [ ] 23-02-PLAN.md — Create trade flow, transactions page (table, filters, sort), manual transaction modal
- [ ] 23-03-PLAN.md — Bulk sell flow (selection → pricing → confirm → progress), multi-account switcher in sidebar

### Phase 24: Alerts & Settings
**Goal**: Price alerts, settings, and notifications
**Depends on**: Phase 23
**Success Criteria**:
  1. Alerts page: list of price alerts with condition, threshold, source, status toggle, last triggered
  2. Create alert: form with item search (autocomplete), condition (above/below/change%), threshold, source picker, cooldown
  3. Alert history: timeline of triggered alerts
  4. Settings page: profile info, theme, notification preferences (per alert type, per trade type)
  5. Linked accounts: list accounts, switch active, link new (Steam redirect), unlink with confirmation
  6. CSV export: download button with date range picker and type filter
  7. Web Push notifications: Service Worker registration, permission prompt, push events for alerts/trades
**Plans**: 2 plans

Plans:
- [ ] 24-01-PLAN.md — Alerts: list page, create form (autocomplete, condition, source), alert history, toggle/delete
- [ ] 24-02-PLAN.md — Settings page, linked accounts manager, CSV export, Web Push (Service Worker + permission flow)

### Phase 25: Stripe Payments
**Goal**: Web subscription via Stripe with cross-platform premium sync
**Depends on**: Phase 24
**Success Criteria**:
  1. Stripe Products configured: monthly ($4.99), semi-annual ($19.99), yearly ($29.99)
  2. Pricing page: plan cards with feature comparison, CTA buttons
  3. Checkout: Stripe Checkout Session → redirect → success page with confetti
  4. Backend webhook: `POST /api/stripe/webhook` handles `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`
  5. Backend updates `users.is_premium` + `premium_until` on Stripe events, `purchase_receipts.store = 'stripe'`
  6. Billing page: current plan, next billing date, cancel/change plan button
  7. Stripe Customer Portal: self-service billing management link
  8. Cross-platform: purchase on web (Stripe) → premium works in mobile app, and vice versa (IAP → works on web)
  9. Premium gates: same features gated as mobile (P/L, multi-source, bulk sell, alerts >5, CSV, multi-account)
**Plans**: 2 plans

Plans:
- [ ] 25-01-PLAN.md — Backend: Stripe integration (products, checkout session, webhook handler, premium sync), purchase_receipts store='stripe'
- [ ] 25-02-PLAN.md — Web: pricing page, checkout flow, success/cancel pages, billing management, premium gate components

### Phase 26: Polish & Launch
**Goal**: Production-ready web app with polished UX and performance
**Depends on**: Phase 25
**Success Criteria**:
  1. Page transitions: Framer Motion AnimatePresence on all route changes
  2. Micro-interactions: hover effects on all interactive elements, press feedback, toast notifications
  3. Skeleton loaders: every data-dependent component has a loading skeleton
  4. Mobile responsive QA: all pages tested at 375px, 640px, 1024px, 1440px
  5. Performance: Lighthouse score ≥90, code splitting per route, next/image for Steam CDN images
  6. Error pages: custom 404, 500, offline — consistent with design system
  7. Analytics: page views, feature usage, conversion funnel (Vercel Analytics or PostHog)
  8. Favicon, OG meta tags, manifest.json for PWA install prompt
**Plans**: 2 plans

Plans:
- [ ] 26-01-PLAN.md — Animations (page transitions, micro-interactions, skeletons, toasts), responsive QA pass
- [ ] 26-02-PLAN.md — Performance (Lighthouse, code splitting, image optimization), error pages, analytics, meta/OG/PWA

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
| 16. Multi-Account Gap Closure | 3/3 | Complete | 2026-03-13 |
| 17. Offline Cache Gap Closure | 0/0 | Pending | — |
| 18. Backend Error Propagation | 2/2 | Complete | 2026-03-13 |
| 19. Named Portfolios | 2/2 | Complete | 2026-03-14 |
| 20. Premium Gate Activation | 0/1 | Pending | — |
| **Milestone 6: Auth Redesign** | | | |
| 27. Tier 1 — Zero Friction Entry | 0/2 | Pending | — |
| 28. Tier 2 — Intent-Based Unlock | 0/2 | Pending | — |
| 29. UX Polish — Locked States | 0/1 | Pending | — |
| **Milestone 5: Web Platform** | | | |
| 21. Web Foundation | 0/3 | Pending | — |
| 22. Dashboard & Inventory | 0/3 | Pending | — |
| 23. Trading & Transactions | 0/3 | Pending | — |
| 24. Alerts & Settings | 0/2 | Pending | — |
| 25. Stripe Payments | 0/2 | Pending | — |
| 26. Polish & Launch | 0/2 | Pending | — |
