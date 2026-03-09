# SkinTracker

## What This Is

Mobile-first CS2 skin inventory tracker and trading tool with freemium model. Flutter app with Express.js backend that lets users track skin values across multiple price sources, monitor price changes with push notifications, and sell items directly on the Steam Community Market with smart pricing. Competitive advantage: mobile push notifications + multi-source pricing cheaper than Skinledger.

## Core Value

Users can track their CS2 inventory value and sell skins quickly — with real market prices from multiple sources, instant price alerts, and one-tap quick sell at market minimum minus 1 kopek.

## Business Model — Freemium

### Free Tier
- 1 Steam account
- Inventory view with Steam Market prices
- Portfolio total value
- 7-day price history

### Premium ($4.99/mo or $29.99/yr)
- Unlimited Steam accounts
- Buff/CSFloat/Skinport prices (real market prices)
- Full price history + trend charts
- Push notifications ("AWP Asiimov +10% this week")
- Profit/loss tracking (bought at X, now worth Y)
- Cross-market price comparison
- CSV/Excel export

## Requirements

### Validated

- ✓ Steam OpenID authentication — existing
- ✓ CS2 inventory fetching with pagination — existing
- ✓ Price tracking from Skinport API (5-min cron) — existing
- ✓ Portfolio value summary with 24h/7d changes — existing
- ✓ Price history charts — existing
- ✓ Item selling via Steam Market API — existing (basic)
- ✓ Batch selling with rate limiting — existing (basic)
- ✓ Transaction history sync from Steam — existing (basic)
- ✓ Price alerts — existing (basic)
- ✓ Multi-account support — existing
- ✓ Dark theme UI with bottom navigation — existing

### Complete (Milestone 1 — Auth & Selling)

- [x] Steam session authentication — 3 methods: QR code, login+Steam Guard, ClientJS token
- [x] Improved sell UX — "Sell" (custom price) and "Quick Sell" (market min - 1 kopek)
- [x] Robust Steam session management — validation, refresh, expiry handling
- [x] Enhanced batch selling — progress feedback, sell all duplicates
- [x] Security hardening — fix SQL injection, encrypt credentials, real sessionid

### Complete (Milestone 2 — Premium & Growth)

- [x] Multi-source pricing — CSFloat + Skinport + DMarket (free for all users)
- [x] Cross-market price comparison
- [x] P/L tracking (basic + detailed with premium gate)
- [x] Float value + stickers (with wear) + charms display
- [x] Onboarding flow
- [x] In-app purchases — paywall, subscription management
- [x] Push notifications + flexible alerts (price/% threshold, cross-market)
- [x] CSV/Excel export (date range filter, buy/sell filter)
- [x] ASO — app name, keywords, screenshots, localization, review prompts, privacy policy

### Active (Milestone 3 — Post-Launch Features)

Premium tier:
- [ ] Multi-account support — link multiple Steam accounts, switch between them, per-account selling

All users:
- [ ] Offline price cache — local DB for prices, show cached data when offline, background sync
- [ ] Home screen widget — portfolio summary widget for iOS (WidgetKit) and Android (AppWidget)

### Out of Scope

- Buff pricing — complex registration, geo-blocking (revisit later)
- Desktop-specific UI — mobile-first
- Real-time price streaming — polling/cron is sufficient
- User-to-user trading — only marketplace selling
- Game mechanics / gambling features

## Context

The app already has a working foundation with inventory tracking, price collection, and basic selling.

**Milestone 1 (complete)** — Steam session auth (3 methods), enhanced selling (quick sell, custom price, batch ops, duplicates), security hardening.

**Milestone 2 (complete)** — Freemium business model, multi-source pricing (CSFloat + Skinport + DMarket as free tier), push notifications, P/L tracking, float/stickers/charms, ASO, in-app purchases.

**Milestone 3 (current)** — Post-launch power features: multi-account support (premium), offline price cache, home screen widgets (iOS WidgetKit + Android AppWidget).

**DMarket integration:** Existing DMarket bot project in adjacent directory provides API reference for price fetching.

## Constraints

- **Steam API rate limits**: Market sell operations need 1.5s delay; inventory fetches throttled on 429
- **Session cookies expire**: Need validation and refresh logic
- **Steam Guard**: All accounts likely have 2FA, must handle Steam Guard codes
- **No official sell API docs**: Steam Market sell endpoint is unofficial, reverse-engineered
- **Mobile-first**: All features must work great on mobile before considering desktop

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Freemium model ($4.99/mo) | Lower price than Skinledger, mobile advantage | ✓ Confirmed |
| Three auth methods for session | QR cleanest, login+guard reliable, clientjstoken fallback | ✓ Built |
| Quick sell = market min - 1 kopek | Guarantees fastest sale by undercutting | ✓ Built |
| Flutter + Express.js stack | Already built and working | ✓ Good |
| PostgreSQL with raw SQL | Works well for this scale | ✓ Good |
| Skinport for bulk pricing (free tier) | Free API, good CS2 coverage | ✓ Good |
| Multi-source pricing FREE for all | CSFloat + Skinport + DMarket = attracts users, premium upsells on alerts/export | ✓ Confirmed |
| Buff pricing deferred | Complex registration + geo-blocking, revisit when revenue covers effort | ✓ Deferred |
| Basic P/L free, detailed P/L premium | Free hook: see total profit → premium: per-item breakdown | ✓ Confirmed |

| Multi-account = premium only | DB schema ready, session cookies need migration to steam_accounts | ✓ Confirmed |
| home_widget for cross-platform widgets | Single Flutter package handles iOS WidgetKit + Android AppWidget bridge | ✓ Confirmed |
| Offline cache before widget | Widget needs cached data to display without network | ✓ Confirmed |

---
*Last updated: 2026-03-09 after M2 completion, M3 planning*
