# Requirements: SkinTracker

**Defined:** 2026-03-08 (M1/M2), Updated: 2026-03-09 (M3)
**Core Value:** Users can track their CS2 inventory value and sell skins quickly — with real market prices from multiple sources, instant price alerts, and one-tap quick sell.

## Milestone 1 Requirements — COMPLETE

- [x] **SEC-01**: Fix SQL injection vulnerability
- [x] **SEC-02**: Encrypt stored session credentials (AES-256-GCM)
- [x] **SEC-03**: Use real Steam CSRF sessionid
- [x] **AUTH-01**: QR code Steam session auth
- [x] **AUTH-02**: ClientJS token auth flow
- [x] **AUTH-03**: Login + password + Steam Guard 2FA
- [x] **AUTH-04**: Session validity status in UI
- [x] **SELL-01**: Sell (custom price) + Quick Sell (market min - 1 kopek)
- [x] **SELL-02**: Steam + Valve fee breakdown before confirming
- [x] **SELL-03**: Per-item progress status during batch sell
- [x] **SELL-04**: Sell all duplicates shortcut
- [x] **SESS-01**: Validate session before sell operations
- [x] **SESS-02**: Centralized SteamSessionService
- [x] **SESS-03**: Auto-refresh session before expiry
- [x] **SESS-04**: Daily sell volume tracking + rate limit warnings

## Milestone 2 Requirements — COMPLETE

- [x] **PRICE-01**: Multi-source prices (CSFloat + Skinport + DMarket + Steam)
- [x] **PRICE-02**: Cross-market comparison table on item detail
- [x] **PRICE-03**: Price history charts with per-source lines
- [x] **ITEM-01**: Float value displayed with visual wear bar
- [x] **ITEM-02**: Applied stickers with wear % and image
- [x] **ITEM-03**: Charms displayed if present
- [x] **PL-01**: Purchase price recording (manual + auto-detect)
- [x] **PL-02**: Portfolio P/L summary (free tier)
- [x] **PL-03**: Per-item P/L breakdown (premium)
- [x] **IAP-01**: Paywall screen with free vs premium comparison
- [x] **IAP-02**: Monthly ($4.99) and yearly ($29.99) subscriptions
- [x] **IAP-03**: Backend receipt verification (Apple + Google)
- [x] **ALERT-01**: Flexible alert creation (price/% threshold)
- [x] **ALERT-02**: Cross-market alert monitoring
- [x] **ALERT-03**: FCM push notifications for triggered alerts
- [x] **EXP-01**: CSV export with date range + buy/sell filter
- [x] **ONB-01**: Onboarding flow on first launch
- [x] **ASO-01**: App name/keywords optimized, metadata localized (6 langs)
- [x] **ASO-02**: Privacy policy + Terms of Service hosted
- [x] **ASO-03**: In-app review prompt after positive actions

## Milestone 3 Requirements — ACTIVE

### Multi-Account Support (Premium)

- [ ] **ACCT-01**: User can link additional Steam accounts from settings (QR or credentials auth)
- [ ] **ACCT-02**: User can switch active account in inventory screen (account picker)
- [ ] **ACCT-03**: Inventory shows items from all linked accounts with account badge/label
- [ ] **ACCT-04**: User can sell items from any linked account (session cookies per account)
- [ ] **ACCT-05**: Free tier limited to 1 account; premium unlocks unlimited accounts
- [ ] **ACCT-06**: User can remove a linked account from settings

### Offline Price Cache

- [ ] **CACHE-01**: Prices cached locally on device (persistent across app restarts)
- [ ] **CACHE-02**: App shows cached inventory + prices when offline with "last updated" indicator
- [ ] **CACHE-03**: Background sync fetches fresh prices when network available
- [ ] **CACHE-04**: Cache TTL: 1 hour for prices, 24 hours for inventory structure
- [ ] **CACHE-05**: Cache size managed with LRU eviction (max 50MB)

### Home Screen Widget

- [ ] **WIDGET-01**: iOS WidgetKit widget shows portfolio value + 24h change
- [ ] **WIDGET-02**: Android AppWidget shows portfolio value + 24h change
- [ ] **WIDGET-03**: Widget updates periodically via background refresh (every 30 min)
- [ ] **WIDGET-04**: Tapping widget opens app to portfolio screen
- [ ] **WIDGET-05**: Widget shows P/L summary if premium user

## Out of Scope (M3)

| Feature | Reason |
|---------|--------|
| Buff pricing | Complex registration + geo-blocking, revisit when revenue covers effort |
| Apple Watch / WearOS app | Widget covers the quick-glance use case |
| Real-time price streaming | Polling/cron + cache sufficient |
| Widget configuration (choose items) | Keep widget simple — portfolio summary only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ACCT-01 | Phase 11 | Pending |
| ACCT-02 | Phase 11 | Pending |
| ACCT-03 | Phase 11 | Pending |
| ACCT-04 | Phase 11 | Pending |
| ACCT-05 | Phase 11 | Pending |
| ACCT-06 | Phase 11 | Pending |
| CACHE-01 | Phase 12 | Pending |
| CACHE-02 | Phase 12 | Pending |
| CACHE-03 | Phase 12 | Pending |
| CACHE-04 | Phase 12 | Pending |
| CACHE-05 | Phase 12 | Pending |
| WIDGET-01 | Phase 13 | Pending |
| WIDGET-02 | Phase 13 | Pending |
| WIDGET-03 | Phase 13 | Pending |
| WIDGET-04 | Phase 13 | Pending |
| WIDGET-05 | Phase 13 | Pending |

**Coverage:**
- M3 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-03-08 (M1/M2)*
*Last updated: 2026-03-09 (M3 added)*
