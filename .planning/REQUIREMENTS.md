# Requirements: SkinTracker

**Defined:** 2026-03-08
**Core Value:** Users can sell their CS2 skins quickly and profitably -- either at a custom price or with one-tap quick sell at market min - 1 kopek

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Security

- [ ] **SEC-01**: Fix SQL injection vulnerability in `getTransactionStats` query
- [ ] **SEC-02**: Encrypt stored session credentials in database (replace plaintext storage)
- [ ] **SEC-03**: Use real Steam CSRF sessionid from Steam's session state instead of fabricated random bytes

### Authentication

- [ ] **AUTH-01**: User can authenticate Steam session via QR code scanned with Steam mobile app
- [ ] **AUTH-02**: User can authenticate Steam session via ClientJS token flow (redirect to `/chat/clientjstoken`)
- [ ] **AUTH-03**: User can authenticate Steam session via login + password + Steam Guard 2FA code
- [ ] **AUTH-04**: User can see current session validity status in the app UI

### Selling

- [ ] **SELL-01**: User sees two buttons per item: "Sell" (custom price input) and "Quick Sell" (market min - 1 kopek)
- [ ] **SELL-02**: User sees Steam + Valve fee breakdown before confirming any sale
- [ ] **SELL-03**: User sees per-item progress status (queued/listing/listed/failed) during batch sell operations
- [ ] **SELL-04**: User can sell all duplicate items with one tap via "Sell all duplicates" shortcut

### Session Management

- [ ] **SESS-01**: App validates Steam session is active before attempting sell operations
- [ ] **SESS-02**: Centralized SteamSessionService replaces duplicated `getUserSession()` helpers
- [ ] **SESS-03**: App auto-refreshes Steam session before expiry using stored refresh tokens
- [ ] **SESS-04**: App tracks daily sell volume and warns user when approaching Steam rate limits

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Enhanced Trading

- **TRADE-01**: Support third-party marketplaces (DMarket, Skinport)
- **TRADE-02**: Price comparison across multiple marketplaces
- **TRADE-03**: Auto-sell rules (sell when price reaches threshold)

### Notifications

- **NOTF-01**: Push notifications for price alerts
- **NOTF-02**: Notification when sell completes on Steam Market
- **NOTF-03**: Daily portfolio value summary notification

### Analytics

- **ANAL-01**: Profit/loss tracking per item sold
- **ANAL-02**: Trading history analytics and charts
- **ANAL-03**: Best time to sell recommendations

## Out of Scope

| Feature | Reason |
|---------|--------|
| Third-party marketplace selling | Steam Community Market only for this milestone |
| Desktop-specific UI | Mobile-first, Flutter can expand later |
| Real-time price streaming | Polling/cron sufficient for now |
| User-to-user trading | Only marketplace selling |
| Payment processing | All transactions go through Steam |
| Mobile confirmation automation | Requires identity_secret which adds major UX complexity |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| SELL-01 | Phase 3 | Pending |
| SELL-02 | Phase 3 | Pending |
| SELL-03 | Phase 3 | Pending |
| SELL-04 | Phase 3 | Pending |
| SESS-01 | Phase 1 | Pending |
| SESS-02 | Phase 1 | Pending |
| SESS-03 | Phase 3 | Pending |
| SESS-04 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-03-08*
*Last updated: 2026-03-08 after roadmap creation*
