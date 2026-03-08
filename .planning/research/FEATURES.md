# Feature Landscape

**Domain:** Steam CS2 skin inventory management and selling tool
**Researched:** 2026-03-08
**Confidence:** MEDIUM (training data only -- no web search available to verify current competitor features)

## Table Stakes

Features users expect from any Steam skin selling tool. Missing any of these and users will abandon for alternatives (CSFloat, Steam Inventory Helper browser extension, Buff163).

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Steam session authentication (at least 1 method) | Cannot sell without authenticated session cookies; every selling tool requires this | High | QR code is the cleanest UX. Login+SteamGuard is most reliable fallback. ClientJS token is a middle ground. Need at least one working method. |
| Session validity indicator | Users need to know if their session is active before attempting sales; silent failures are the #1 complaint about Steam selling tools | Low | Simple banner/icon showing green (valid) / yellow (expiring) / red (expired). Check on app open and before sell operations. |
| Quick sell (undercut lowest listing) | The core value prop -- one tap to list at competitive price. Steam Inventory Helper popularized this. Every tool has it. | Low | Already partially built. Price = lowest listing converted to seller-receives minus 1 kopek/cent. |
| Custom price selling | Users with rare/expensive skins want to set their own price, not just undercut | Low | Already partially built. Need a proper price input field with fee calculator showing buyer-pays vs seller-receives. |
| Fee calculator / price breakdown | Steam's 15% fee (5% Valve + 10% CS2) confuses users. Showing "you receive X, buyer pays Y" is expected | Low | Already implemented in backend (`sellerReceivesToBuyerPays`). Need clear UI display in sell sheet. |
| Batch/bulk selling | Users with 50+ cheap skins (cases, stickers) need to list many items at once, not one by one | Medium | Already partially built. Needs progress feedback (X/Y sold), error handling per item, and cancel capability. |
| Session expiry handling | Sessions expire after ~24h of inactivity or when Steam invalidates them. App must detect and prompt re-auth, not silently fail | Medium | Check session before sell operations. On 401/403 from Steam, clear stored session and prompt re-login. |
| Inventory sorting and filtering | Users need to find items by name, price, rarity, type (weapon/sticker/case). Every inventory viewer has this. | Low | Already exists. Verify it covers: name search, sort by price/name/rarity, filter by type. |
| Price source display | Users want to know where the price comes from (Steam Market, Skinport, etc.) and how fresh it is | Low | Show price source and "updated X minutes ago" timestamp. Already have Skinport prices. |
| Pull-to-refresh inventory | Inventory changes after trades/purchases. Must be refreshable. | Low | Already exists. |
| Transaction history | Users need to see what they sold, when, and for how much | Medium | Already exists (basic). Needs filtering, search, and clear profit/loss display. |
| Multi-account inventory view | Many CS2 players have alt/storage accounts | Low | Already exists. |

## Differentiators

Features that set SkinTracker apart from competitors. Not expected by default, but create real value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Smart quick-sell pricing with market depth | Instead of just "lowest - 1 cent", analyze order book depth. If 50 listings at $10.00 and next is $10.50, undercutting by 1 cent is smart. If only 1 listing at $5.00 and 20 at $8.00, that listing might be an outlier -- suggest $7.99 instead. | High | Requires fetching Steam Market listing page (not just priceoverview API). Major differentiator but complex. Defer to later milestone. |
| Sell progress with real-time feedback | During batch sell, show per-item status: queued / listing / listed / failed, with running total of successfully listed items and revenue. Most tools just show a spinner. | Medium | Use server-sent events or polling. Already have 1.5s delay between items -- stream status updates during that window. |
| Quick-sell "all duplicates" | One tap to list all duplicate items (items you own 2+ of) at quick-sell price. Common pattern: users want to keep 1 of each skin and sell extras. | Low | Filter inventory for items with count > 1, pre-select the extras, route to batch sell. |
| Profit/loss tracking per item | Compare sell price against purchase price (from transaction history) to show actual profit after fees. Most tools only show current value. | Medium | Requires matching buy/sell transactions for same item. Complicated by item wear values and stickers. |
| Session health monitoring with proactive refresh | Instead of waiting for sell to fail, periodically validate session in background and prompt user to re-auth before it expires | Medium | Ping Steam with a lightweight authenticated request (e.g., check wallet balance) on app open and every 30 min. |
| Price change notifications (push) | Alert when a tracked item's price moves above/below threshold. Move beyond in-app polling to actual push notifications. | High | Already have basic price alerts. Enhancement: Firebase Cloud Messaging for push delivery, more trigger types (% change, volume spike). |
| Sell queue with retry | Items that fail to list (rate limited, session issue) get queued for automatic retry instead of being lost. User can see queue status. | Medium | Persistent queue in DB. Background retry with exponential backoff. Important for batch operations hitting rate limits. |
| Cross-account portfolio view | Unified portfolio value across all linked Steam accounts with per-account breakdown | Low | Already have multi-account. Enhancement: aggregate portfolio summary across accounts. |
| Listing management | View your active Steam Market listings, cancel listings, relist at new price | High | Requires scraping steamcommunity.com/market/mylistings. Cancel requires authenticated POST. Very valuable but complex. |
| Float value / wear display | Show exact float value (0.00-1.00) for skins. Important for pricing -- a 0.01 float Factory New is worth much more than 0.06. | Medium | Requires Steam inspect link parsing or third-party API (CSFloat/SteamFloat). Nice-to-have, not core to selling. |

## Anti-Features

Features to explicitly NOT build. These are tempting but wrong for this app.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Third-party marketplace selling (DMarket, Skinport, Buff163) | Each marketplace has its own auth, API, fee structure, and TOS. Massive scope increase for marginal value. Also legal/TOS risk. | Focus on Steam Community Market only. It is the primary marketplace. Users who want third-party can use those platforms directly. |
| Trade offer automation | Sending/receiving trade offers programmatically invites abuse, scam risk, and Steam bans. Steam actively monitors for automated trading. | Only support selling on the Steam Market. No P2P trade automation. |
| Storing Steam credentials (username/password) | Massive security liability. If your server is compromised, attackers have Steam account access. Also violates Steam TOS. | Use session-based auth only (QR code, client token). Never store passwords. Session cookies are time-limited and revocable. |
| Skin gambling or coinflip features | Legal minefield, ethical issues, attracts wrong audience | Stay focused on legitimate inventory management and selling. |
| Real-time price streaming via WebSocket | Over-engineering. Steam Market prices update slowly (minutes, not seconds). Real-time adds infra cost for no user value. | Keep 5-minute cron polling from Skinport. It is sufficient. |
| Price prediction / ML-based pricing | Unreliable, creates false confidence, liability if users lose money on bad predictions | Show historical data and let users decide. Trend arrows (up/down over 24h/7d) are the most helpful without being misleading. |
| Browser extension companion | Different platform, different codebase, different distribution. Steam Inventory Helper already dominates this space. | Mobile-first. The value prop is managing skins on your phone, not from the browser (where Steam's own UI works fine). |
| Automated selling bots (sell when price hits X) | Requires always-on server holding user sessions. Security risk, rate limit risk, Steam ban risk. Users lose control. | Price alerts that notify users, then they manually confirm the sell. Keep the human in the loop. |
| Steam wallet balance management | Out of scope, different domain, complex Steam APIs | Show wallet balance as informational only if easily available from session. Do not support adding funds or managing wallet. |

## Feature Dependencies

```
Steam Session Auth -----> Quick Sell (requires session to list)
                    |---> Custom Price Sell (requires session to list)
                    |---> Batch Sell (requires session to list)
                    |---> Transaction Sync (requires session to scrape history)
                    |---> Listing Management (requires session, future)

Session Validation -----> Session Expiry Handling
                    |---> Session Health Monitoring

Quick Sell Price Logic -> Quick Sell UI
                    |---> "Sell All Duplicates" (uses quick sell pricing)

Batch Sell -----------> Sell Progress Feedback (enhances batch UX)
                    |---> Sell Queue with Retry (enhances batch reliability)

Transaction History --> Profit/Loss Tracking (needs buy+sell data)

Price Alerts ---------> Push Notifications (delivery mechanism)

Inventory Fetch ------> Duplicate Detection -> "Sell All Duplicates"
```

## MVP Recommendation (for this milestone)

This milestone is about Steam session auth and enhanced selling. Prioritize in this order:

### Must Ship

1. **Steam session auth (QR code method)** -- Unlocks all selling features. QR code is the cleanest UX and avoids storing credentials. This is the critical path.
2. **Steam session auth (ClientJS token fallback)** -- Already partially built. Second method ensures users have options if QR code has issues.
3. **Session validity checking** -- Without this, users will attempt sells with expired sessions and get cryptic errors. Show session status clearly.
4. **Session expiry detection and re-auth prompting** -- When a sell fails due to expired session, detect it and prompt re-auth instead of showing a generic error.
5. **Improved sell bottom sheet with two clear buttons** -- "Quick Sell" (undercut by 1 kopek) and "Sell at Custom Price" (manual input). Current UI only has quick sell.
6. **Fee calculator in sell UI** -- Show "Buyer pays: $X.XX / You receive: $Y.YY" breakdown. Already have backend logic; wire it to UI.
7. **Enhanced batch sell with progress** -- Show per-item status during batch operations. Current UI just shows a spinner until all are done.

### Should Ship

8. **"Sell all duplicates" shortcut** -- Low complexity, high convenience for users with many cheap skins. Leverages existing batch sell.
9. **Login + Steam Guard auth (third method)** -- Backup auth for users who cannot use QR or ClientJS. More complex due to 2FA code handling.

### Defer

- **Smart pricing with market depth** -- High complexity, needs separate research into Steam listing scraping.
- **Sell queue with retry** -- Good idea but over-engineering for V1. Users can manually retry failed items.
- **Listing management (view/cancel active listings)** -- Valuable but separate feature set. Different Steam API surface.
- **Profit/loss tracking** -- Depends on good transaction history which is still basic.
- **Push notifications for price alerts** -- Requires Firebase setup, separate infrastructure work.
- **Float value display** -- Nice to have, not core to selling workflow.

## Current State vs Target

| Feature | Current State | Target for Milestone |
|---------|--------------|---------------------|
| Steam session auth | Manual cookie input only (POST /market/session) | QR code flow + ClientJS token flow in-app |
| Session management | No validation, no expiry detection | Validity check on app open, before sells, expiry handling |
| Quick sell | Works but only via bottom sheet with quick sell button | Clear "Quick Sell" button with price preview |
| Custom price sell | Not implemented in UI | "Sell" button with price input and fee breakdown |
| Batch sell | Works (max 50 items) but spinner-only UI | Per-item progress, success/fail counts, cancel option |
| Sell duplicates | Not implemented | One-tap "sell all duplicates" action |
| Fee display | Backend calculates but UI shows only seller-receives | Show both buyer-pays and seller-receives |

## Competitive Landscape (for context)

**Steam Inventory Helper (Browser Extension):** The dominant tool. Quick sell, bulk sell, price comparison across marketplaces. Browser-only, no mobile. Very mature.

**CSFloat:** Web platform focused on float values and trading. Has its own marketplace. More trading-focused than selling-focused.

**Buff163:** Dominant in Chinese market. P2P marketplace with lower fees than Steam. Not a direct competitor for Steam Market selling.

**SkinBaron / Skinport:** Third-party marketplaces with their own seller tools. Different ecosystem than Steam Community Market.

**Key insight:** There is no dominant *mobile* tool for Steam Market selling. Browser extensions dominate desktop. This app's mobile-first approach is the differentiator itself -- managing and selling skins from your phone without needing a computer.

## Sources

- Existing codebase analysis (PRIMARY -- HIGH confidence)
- Steam Community Market API reverse-engineering knowledge (MEDIUM confidence -- training data, unofficial APIs can change)
- Steam authentication flow knowledge (MEDIUM confidence -- Steam updates auth methods periodically; QR code flow and IAuthenticationService are well-established but specifics may have shifted)
- Competitor feature knowledge from training data (LOW-MEDIUM confidence -- feature sets change; general patterns are stable but specific capabilities may have evolved)

**Note:** Web search was unavailable during this research. Competitor features and Steam API details should be validated against current documentation during implementation.
