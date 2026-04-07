# SkinKeeper Browser Extension — Privacy Policy

**Last updated:** April 6, 2026

This privacy policy applies to the SkinKeeper browser extension for Chrome ("the Extension").

## 1. Data We Collect

**No personal data is collected by default.** The Extension works without an account and does not require login.

**Steam page data:** The Extension reads publicly visible information from Steam Community pages you visit (inventory items, market listings, prices, float values). This data is processed locally in your browser and is not sent to our servers.

**Price data from CDN:** The Extension downloads a community price database from prices.csgotrader.app (a public, free CDN). No personal data is sent in this request.

**Optional account features:** If you choose to sign in with a SkinKeeper account, a JWT token is stored in chrome.storage.local to authenticate API requests for enriched data (Buff/CSFloat prices, P/L tracking, price alerts).

**Analytics:** We collect anonymous usage events (e.g. "inventory loaded", "extension installed") via PostHog to improve the product. No personally identifiable information is included.

## 2. Data We Do NOT Collect

- Steam passwords or credentials
- Payment or financial information
- Browsing history outside of Steam
- Keystrokes, form inputs, or personal messages
- Data from non-Steam websites (except skinkeeper.store for optional login)

## 3. Permissions Explained

- **steamcommunity.com:** Read and enhance inventory, market, trade offer, and profile pages with prices, float values, and action buttons.
- **storage:** Save user preferences (display settings, NSFW mode) and cached price data locally in your browser.
- **alarms:** Schedule periodic tasks: flush collected data, monitor friend requests, notify when trade-locked items become tradable.
- **notifications:** Show a browser notification when a bookmarked item becomes tradable. User must explicitly bookmark an item to opt in.
- **api.skinkeeper.store:** Fetch enriched item data (multi-source prices, P/L) for users who optionally sign in.
- **prices.csgotrader.app:** Download the community price database (one request for all CS2 items).
- **steamrep.com:** Check if a Steam profile is flagged as a scammer.

## 4. Data Storage

All data is stored locally in your browser via chrome.storage.local. We do not maintain server-side databases of Extension user data. If you sign in, your JWT token is stored locally and sent only to api.skinkeeper.store for authentication.

## 5. Third-Party Services

- **PostHog:** Anonymous product analytics. [PostHog Privacy Policy](https://posthog.com/privacy)
- **CSGO Trader CDN:** Public price data. No personal data shared.
- **SteamRep:** Public scammer database. Only Steam ID is sent.

## 6. Data Sharing

We do not sell, rent, or share your data with third parties. Anonymous analytics data is processed by PostHog under their privacy policy.

## 7. Your Rights

You can uninstall the Extension at any time to stop all data processing. To clear stored data, go to chrome://extensions, find SkinKeeper, and click "Clear data". If you have a SkinKeeper account, you can request data deletion at skillar.app@gmail.com.

## 8. Contact

For questions about this policy, email skillar.app@gmail.com.
