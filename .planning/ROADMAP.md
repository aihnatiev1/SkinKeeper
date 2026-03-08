# Roadmap: SkinTracker

## Overview

Milestone 1 (Security + Auth + Selling) is complete. Milestone 2 focuses on turning SkinTracker into a competitive product: multi-source pricing as free tier hook, freemium monetization, push alerts, item details (float/stickers/charms), P/L tracking, and App Store optimization.

## Milestones

### Milestone 1: Auth & Selling — COMPLETE
- Phase 1: Security Hardening and Session Foundation
- Phase 2: Steam Authentication (3 methods)
- Phase 3: Enhanced Selling and Session Lifecycle

### Milestone 2: Premium & Growth — ACTIVE

## Phases

**Phase Numbering:**
- Integer phases (1-10): Planned milestone work
- Decimal phases (4.1, 4.2): Urgent insertions (marked with INSERTED)

### Milestone 1 (Complete)

- [x] **Phase 1: Security Hardening and Session Foundation**
- [x] **Phase 2: Steam Authentication**
- [x] **Phase 3: Enhanced Selling and Session Lifecycle**

### Milestone 2 (Active)

- [x] **Phase 4: Multi-Source Pricing** — Add CSFloat + DMarket price sources, unified price aggregation, cross-market comparison UI (FREE tier) (completed 2026-03-08)
- [ ] **Phase 5: Item Details — Float, Stickers, Charms** — Inspect link parsing, float value display, sticker/charm visualization on item cards (FREE tier)
- [ ] **Phase 6: Profit/Loss Tracking** — Purchase price recording, per-item P/L, portfolio P/L summary (basic FREE, detailed PREMIUM)
- [ ] **Phase 7: In-App Purchases** — Paywall screen, StoreKit/Google Play subscriptions, receipt verification, premium gating
- [ ] **Phase 8: Push Notifications & Alerts** — FCM setup, flexible alerts (price/% threshold, cross-market), alert management UI (PREMIUM)
- [ ] **Phase 9: Export & Onboarding** — CSV/Excel export with date range + buy/sell filter, onboarding flow (PREMIUM export, FREE onboarding)
- [ ] **Phase 10: ASO** — App name/keywords, screenshots, localization (EN/UK/RU/DE/PT/ZH), privacy policy, review prompts

## Phase Details

### Phase 4: Multi-Source Pricing
**Goal**: Users see real market prices from multiple sources, not just inflated Steam prices
**Depends on**: Phase 3
**Requirements**: PRICE-01, PRICE-02, PRICE-03
**Success Criteria**:
  1. Price cron fetches from CSFloat API and DMarket API in addition to existing Skinport + Steam
  2. Inventory items show best price across all sources with source label
  3. Price detail screen shows cross-market comparison table (Steam vs Skinport vs CSFloat vs DMarket)
  4. Price history charts show lines per source
  5. All pricing is free tier — no premium gate
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — Backend: CSFloat + DMarket price fetchers, unified price aggregation, updated cron job
- [ ] 04-02-PLAN.md — Flutter: cross-market comparison UI, multi-source price display on item cards, price detail screen

### Phase 5: Item Details — Float, Stickers, Charms
**Goal**: Users see float value, applied stickers (with wear %), and charms for each skin
**Depends on**: Phase 4
**Requirements**: ITEM-01, ITEM-02, ITEM-03
**Success Criteria**:
  1. Float value displayed on item card (e.g., "0.0712") with visual wear bar
  2. Applied stickers shown on item detail with sticker name, wear %, and image
  3. Charms displayed if present
  4. Data fetched via Steam inspect link or CSFloat API
**Plans**: 2 plans

Plans:
- [ ] 05-01-PLAN.md — Backend: inspect link parsing, float/sticker/charm data fetching and storage
- [ ] 05-02-PLAN.md — Flutter: float bar widget, sticker/charm display on item cards and detail screen

### Phase 6: Profit/Loss Tracking
**Goal**: Users track profit and loss on their inventory — basic P/L free, detailed P/L premium
**Depends on**: Phase 5
**Requirements**: PL-01, PL-02, PL-03
**Success Criteria**:
  1. User can record purchase price per item (manual entry or auto-detect from transaction history)
  2. Portfolio screen shows total P/L: "Invested $500, Current $650, Profit +$150 (+30%)"
  3. Free tier: total portfolio P/L visible
  4. Premium tier: per-item P/L breakdown, P/L charts over time, P/L by category
**Plans**: 2 plans

Plans:
- [ ] 06-01-PLAN.md — Backend: purchase price endpoints, P/L calculation service, auto-detect from transactions
- [ ] 06-02-PLAN.md — Flutter: P/L widgets on portfolio and item cards, premium gate for detailed view

### Phase 7: In-App Purchases
**Goal**: Users can subscribe to premium with StoreKit / Google Play Billing
**Depends on**: Phase 6 (so premium features exist to sell)
**Requirements**: IAP-01, IAP-02, IAP-03
**Success Criteria**:
  1. Paywall screen shows free vs premium comparison
  2. User can purchase monthly ($4.99) or yearly ($29.99) subscription
  3. Backend verifies receipts from Apple/Google
  4. Premium features gated: push alerts, detailed P/L, CSV export, multi-account
  5. Subscription status synced and displayed in settings
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md — Backend: receipt verification for App Store + Google Play, subscription status management
- [ ] 07-02-PLAN.md — Flutter: paywall screen, purchase flow, premium gate middleware, subscription management in settings

### Phase 8: Push Notifications & Alerts
**Goal**: Premium users get push notifications for price changes with flexible alert configuration
**Depends on**: Phase 7 (premium gating)
**Requirements**: ALERT-01, ALERT-02, ALERT-03
**Success Criteria**:
  1. User can create alert: "Item X above $Y" or "Item X changed >Z%"
  2. User can choose which markets to monitor (Steam, Skinport, CSFloat, DMarket, or any)
  3. Backend checks alerts on each price update cron and sends FCM push
  4. Alert history shows triggered alerts with timestamps
  5. Premium-only feature with clear upgrade CTA for free users
**Plans**: 2 plans

Plans:
- [ ] 08-01-PLAN.md — Backend: FCM integration, alert evaluation engine, notification service
- [ ] 08-02-PLAN.md — Flutter: alert creation UI (price/% threshold, market selector), alert list, notification handling

### Phase 9: Export & Onboarding
**Goal**: Premium users can export data, all users get onboarding
**Depends on**: Phase 8
**Requirements**: EXP-01, EXP-02, ONB-01
**Success Criteria**:
  1. CSV export with date range picker and buy/sell filter
  2. Export includes: item name, prices from all sources, P/L, float, transaction history
  3. Onboarding flow (3-4 screens) on first launch: what app does, Steam connection, premium teaser
  4. Onboarding can be revisited from settings
**Plans**: 2 plans

Plans:
- [ ] 09-01-PLAN.md — Backend: CSV generation endpoint with filters + Flutter: export UI
- [ ] 09-02-PLAN.md — Flutter: onboarding PageView with animations

### Phase 10: ASO
**Goal**: App Store presence optimized for discoverability and conversion
**Depends on**: Phase 9 (all features complete for screenshots)
**Requirements**: ASO-01, ASO-02, ASO-03
**Success Criteria**:
  1. App name + subtitle with keywords: "CS2 Skin Tracker — Inventory & Price Alerts"
  2. 6 screenshots with device mockups showing key screens
  3. Metadata localized: EN, UK, RU, DE, PT, ZH
  4. Privacy policy and Terms of Service pages hosted
  5. In-app review prompt after positive actions (successful sell, first profit milestone)
  6. App preview video (15-30s)
**Plans**: 1 plan

Plans:
- [ ] 10-01-PLAN.md — ASO metadata, screenshots, localization, legal pages, review prompt implementation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 (M1) → 4 → 5 → 6 → 7 → 8 → 9 → 10 (M2)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Hardening | 2/2 | Complete | 2026-03-08 |
| 2. Steam Authentication | 2/2 | Complete | 2026-03-08 |
| 3. Enhanced Selling | 2/2 | Complete | 2026-03-08 |
| 4. Multi-Source Pricing | 2/2 | Complete   | 2026-03-08 |
| 5. Item Details (Float/Stickers) | 0/2 | Not started | - |
| 6. Profit/Loss Tracking | 0/2 | Not started | - |
| 7. In-App Purchases | 0/2 | Not started | - |
| 8. Push Notifications | 0/2 | Not started | - |
| 9. Export & Onboarding | 0/2 | Not started | - |
| 10. ASO | 0/1 | Not started | - |
