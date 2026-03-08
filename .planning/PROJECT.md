# SkinTracker

## What This Is

A Steam CS2 skin inventory tracker and trading tool. Flutter mobile app with Express.js backend that lets users track skin values, monitor price changes, and sell items directly on the Steam Community Market with smart pricing.

## Core Value

Users can sell their CS2 skins quickly and profitably — either at a custom price or with one-tap quick sell at the lowest market price minus 1 kopek to undercut competition.

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

### Active

- [ ] Steam session authentication — 3 methods: QR code, login+Steam Guard, ClientJS token (`/chat/clientjstoken`)
- [ ] Improved sell UX — two clear buttons per item: "Sell" (custom price) and "Quick Sell" (market min - 1 kopek)
- [ ] Robust Steam session management — session validation, refresh, expiry handling
- [ ] Enhanced batch selling — select multiple items, preview total, execute with progress feedback
- [ ] Enhanced price alerts — more granular triggers, notification delivery
- [ ] Enhanced transaction history — better sync, filtering, profit/loss tracking

### Out of Scope

- Third-party marketplaces (DMarket, Skinport selling) — Steam Community Market only for now
- Desktop app — mobile-first, Flutter can expand later
- Real-time price streaming — polling/cron is sufficient
- Trading between users — only marketplace selling
- Payment processing — all transactions go through Steam

## Context

The app already has a working foundation with inventory tracking, price collection, and basic selling. The main gap is **proper Steam session authentication** — current OpenID login only provides read access. For selling and transaction history, the app needs Steam session cookies (`steamLoginSecure`, `sessionid`) which require one of three auth methods:

1. **QR Code** — Steam's new auth flow, user scans with Steam mobile app
2. **Login + Steam Guard** — traditional username/password + 2FA code from Steam Guard
3. **ClientJS Token** — redirect to `steamcommunity.com/chat/clientjstoken`, capture the JSON response containing session token

Session cookies are already stored in the `users` table (`steam_session_id`, `steam_login_secure`, `steam_access_token`) but there's no proper flow for obtaining them from the user.

## Constraints

- **Steam API rate limits**: Market sell operations need 1.5s delay between requests; inventory fetches throttled on 429
- **Session cookies expire**: Need validation and refresh logic to avoid silent failures
- **Steam Guard requirement**: All accounts likely have 2FA enabled, must handle Steam Guard codes
- **No official sell API docs**: Steam Market sell endpoint is unofficial, reverse-engineered

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Three auth methods for session | Different users prefer different flows; QR is cleanest, login+guard is most reliable, clientjstoken is a middle ground | — Pending |
| Quick sell = market min - 1 kopek | Guarantees fastest sale by undercutting lowest listing | — Pending |
| Flutter + Express.js stack | Already built and working, no reason to change | ✓ Good |
| PostgreSQL with raw SQL | Already in use, works well for this scale | ✓ Good |
| Skinport for bulk pricing | Free API, good coverage of CS2 items | ✓ Good |

---
*Last updated: 2026-03-08 after initialization*
