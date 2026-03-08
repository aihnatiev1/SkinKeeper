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

### Active (Milestone 1 — Auth & Selling)

- [ ] Steam session authentication — 3 methods: QR code, login+Steam Guard, ClientJS token
- [ ] Improved sell UX — "Sell" (custom price) and "Quick Sell" (market min - 1 kopek)
- [ ] Robust Steam session management — validation, refresh, expiry handling
- [ ] Enhanced batch selling — progress feedback, sell all duplicates
- [ ] Security hardening — fix SQL injection, encrypt credentials, real sessionid

### Future (Milestone 2 — Premium & Growth)

- [ ] Freemium tier system with subscription payments
- [ ] Multi-source pricing — Buff, CSFloat, Skinport real prices
- [ ] Push notifications for price alerts
- [ ] Profit/loss tracking per item
- [ ] Cross-market price comparison
- [ ] CSV/Excel export
- [ ] Competitor parity with Skinledger (research needed)

### Out of Scope

- Third-party marketplace selling (DMarket, Skinport) — Steam Community Market only
- Desktop-specific UI — mobile-first
- Real-time price streaming — polling/cron is sufficient
- User-to-user trading — only marketplace selling
- Game mechanics / gambling features

## Context

The app already has a working foundation with inventory tracking, price collection, and basic selling.

**Milestone 1 (current)** focuses on proper Steam session auth and enhanced selling — the features that make the app actually useful for trading. Three auth methods for session cookies, two sell buttons, batch operations.

**Milestone 2 (next)** will add the freemium business model, multi-source pricing, push notifications, and premium features to compete with Skinledger.

**Competitor reference:** [skinledger.com](https://skinledger.com/) — needs detailed research before Milestone 2 to identify features to match and differentiate on.

## Constraints

- **Steam API rate limits**: Market sell operations need 1.5s delay; inventory fetches throttled on 429
- **Session cookies expire**: Need validation and refresh logic
- **Steam Guard**: All accounts likely have 2FA, must handle Steam Guard codes
- **No official sell API docs**: Steam Market sell endpoint is unofficial, reverse-engineered
- **Mobile-first**: All features must work great on mobile before considering desktop

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Freemium model ($4.99/mo) | Lower price than Skinledger, mobile advantage | — Pending |
| Three auth methods for session | QR cleanest, login+guard reliable, clientjstoken fallback | — Pending |
| Quick sell = market min - 1 kopek | Guarantees fastest sale by undercutting | — Pending |
| Flutter + Express.js stack | Already built and working | ✓ Good |
| PostgreSQL with raw SQL | Works well for this scale | ✓ Good |
| Skinport for bulk pricing (free tier) | Free API, good CS2 coverage | ✓ Good |
| Multi-source pricing for premium | Buff + CSFloat + Skinport = real market value | — Pending |

---
*Last updated: 2026-03-08 after adding freemium vision and competitor context*
