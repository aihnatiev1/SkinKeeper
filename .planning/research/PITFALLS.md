# Domain Pitfalls

**Domain:** Steam CS2 skin trading app -- session auth and sell operations
**Researched:** 2026-03-08

## Critical Pitfalls

Mistakes that cause broken auth flows, lost sales, or Steam account restrictions.

### Pitfall 1: Session Cookies Expire Silently, Sell Operations Fail Without Feedback

**What goes wrong:** `steamLoginSecure` cookies have a finite lifetime (typically hours to days depending on how they were obtained). The app stores them once and reuses indefinitely. When they expire, the Steam sell endpoint returns `{"success": false}` or a 401/403 -- but the current code surfaces a generic "Failed to create listing" message. Users don't know their session expired; they think the item can't be sold. Batch sells waste all their rate-limit budget on failed requests.

**Why it happens:** The current `exchangeTokenForSession` stores cookies with no TTL. `getUserSession` reads from DB without any freshness check. There is no validation that a session is still active before attempting operations.

**Consequences:** Users see mysterious sell failures. Batch operations of 50 items burn 75+ seconds of rate-limited requests against a dead session. Trust in the app erodes.

**Prevention:**
- Add a `steam_session_expires_at` column (or at minimum `steam_session_updated_at`). Set a conservative TTL (e.g., 4 hours for constructed sessions, 24 hours for QR/login sessions).
- Before any sell operation, call a lightweight Steam endpoint (e.g., `GET https://steamcommunity.com/market/` with the session cookies and check for a redirect to login).
- On session validation failure, return a specific error code (e.g., `SESSION_EXPIRED`) so the Flutter client can prompt re-authentication instead of showing a generic error.
- In bulk sell, validate the session ONCE before starting the batch. Abort the entire batch if session is dead.

**Detection (warning signs):**
- Sell success rate drops suddenly for a user who was previously selling fine.
- `sellItem` returns `success: false` but no specific Steam error message.
- Multiple consecutive sell failures in bulk operations.

**Phase:** Session Auth phase (validate session before sell operations).

---

### Pitfall 2: Fabricated sessionid Cookie Rejected by Steam

**What goes wrong:** The `exchangeTokenForSession` function generates a random `sessionId` via `crypto.randomBytes(12).toString("hex")` (market.ts lines 126, 135). Steam's `sessionid` cookie is NOT a random value -- it must match the `sessionid` embedded in Steam's actual session state. When you send a sell request with a fabricated sessionid, Steam rejects it because the sessionid in the POST body doesn't match anything in their session store.

**Why it happens:** The sessionid is part of Steam's CSRF protection. It is set by Steam when you authenticate and must be extracted from the actual `Set-Cookie` response header during auth, not invented.

**Consequences:** Every sell operation that uses a fabricated sessionid will fail. The token exchange looks like it works (returns a session object) but the session is unusable for write operations like selling.

**Prevention:**
- For QR code and login+guard flows: extract the `sessionid` from the actual `Set-Cookie` headers returned by Steam during authentication.
- For the clientjstoken flow: after constructing `steamLoginSecure`, make a GET request to `https://steamcommunity.com` with the `steamLoginSecure` cookie, and extract the `sessionid` from the response's `Set-Cookie` header.
- Never generate a random sessionid. Always extract it from Steam's response.

**Detection (warning signs):**
- `sellItem` always returns `success: false` even with a valid `steamLoginSecure`.
- Steam returns an error about invalid session or CSRF token.

**Phase:** Session Auth phase -- this is the first thing to fix in the token exchange logic.

---

### Pitfall 3: steamLoginSecure Format Is Wrong or Inconsistent

**What goes wrong:** The `exchangeTokenForSession` function tries two formats: `steamId||accessToken` (line 123) and `steamId%7C%7CaccessToken` (line 133). The correct format depends on context: the raw cookie value uses `%7C%7C` (URL-encoded pipes), but if the HTTP client automatically URL-encodes cookie values, you end up with double-encoding (`%257C%257C`). The code also ignores which API call succeeded or failed -- the try block calls `GenerateAccessTokenForApp` but always falls through to manual construction regardless of the result (lines 122-128).

**Why it happens:** The `steamLoginSecure` cookie format has changed over Steam's history. The current format with access tokens (JWT-based) differs from the legacy format that used session tokens. Additionally, axios may or may not URL-encode cookie header values depending on the version.

**Consequences:** If double-encoded, Steam doesn't recognize the cookie. If the wrong format is used, all authenticated operations fail. The fallback logic hides the real failure -- the code always returns a session but it may be invalid.

**Prevention:**
- Standardize on ONE format. Use the raw (non-encoded) value `steamId||accessToken` in the database. Let the Cookie header construction handle it as a raw string (which it does currently in market.ts line 98).
- Remove the dead `GenerateAccessTokenForApp` API call that is ignored anyway.
- Add a validation step after constructing the session: make a test request to a lightweight authenticated endpoint and verify it succeeds before storing.
- Log which construction path was used (the CONCERNS.md already flags this).

**Detection (warning signs):**
- Users can store tokens but sells always fail.
- The `exchangeTokenForSession` function never returns `null` (it always constructs something, even on API failure).

**Phase:** Session Auth phase -- clean up token exchange before adding new auth methods.

---

### Pitfall 4: Steam Rate Limits Cause Account-Level Throttling or Soft Bans

**What goes wrong:** Steam enforces multiple layers of rate limiting: per-endpoint, per-session, per-IP, and per-account. The current 1.5s delay between sell operations (market.ts line 155) is a starting point but not sufficient protection. Selling too many items too fast (even with delays) can trigger account-level restrictions: temporary market bans, mandatory email confirmations for every listing, or 7-day trading cooldowns. These are not HTTP 429s -- they are business-logic restrictions applied to the Steam account.

**Why it happens:** Steam's anti-automation measures are aggressive and undocumented. The thresholds change without notice. There's no official documentation on what's "too fast."

**Consequences:** User's Steam account gets market-restricted. This is NOT an app bug -- it's an account-level punishment that persists even outside the app. Users blame the app for getting their account restricted.

**Prevention:**
- Increase delay between sell operations to at least 3 seconds. Community consensus from trading bots is 3-5 seconds minimum.
- Implement per-user daily sell limits (e.g., warn at 20 items/hour, hard cap at 100 items/day).
- Add exponential backoff when Steam returns any error during batch operations -- don't just continue with fixed delay.
- After each successful sell, check the `requires_confirmation` field. If Steam suddenly starts requiring mobile confirmation on every listing (when it didn't before), that's a sign of throttling -- stop the batch.
- Show users a prominent warning before large batch sells explaining the risk.

**Detection (warning signs):**
- `requires_confirmation` starts returning `true` for listings that shouldn't need it.
- Steam responses include messages about "too many recent listings."
- Sell success rate drops mid-batch.

**Phase:** Enhanced Batch Selling phase -- implement adaptive rate limiting and daily caps.

---

### Pitfall 5: Storing Steam Credentials in Plaintext Enables Account Takeover

**What goes wrong:** `steamLoginSecure` and `steam_access_token` are stored as plaintext in the `users` table (already flagged in CONCERNS.md). These are equivalent to full account session credentials. Anyone with database read access (SQL injection, backup leak, compromised admin) can impersonate users on the Steam Community Market, create listings, buy items, or modify account settings.

**Why it happens:** Quick-and-dirty persistence during initial development.

**Consequences:** If the database is compromised (and there IS a SQL injection vulnerability in `getTransactionStats`), attackers can take over Steam accounts for market operations. This is a liability and reputation catastrophe.

**Prevention:**
- Encrypt session tokens at rest using AES-256-GCM with a server-side key from environment variables. The encryption key must NOT be in the database.
- Fix the SQL injection in `getTransactionStats` BEFORE adding more session auth methods. The existing vulnerability is a direct path to these credentials.
- Add automatic expiry: delete stored sessions after 24 hours. Don't accumulate long-lived credentials.
- Consider a separate encrypted secrets store (e.g., a dedicated table with encrypted blobs) rather than inline columns.

**Detection (warning signs):**
- This is a latent risk, not something that shows warning signs before exploitation.
- Monitor for unusual sell activity patterns across multiple accounts.

**Phase:** Session Auth phase -- encrypt at rest before storing more credential types.

---

### Pitfall 6: Steam Mobile Confirmations Block Automated Sells

**What goes wrong:** Steam requires mobile confirmation for market listings when Steam Guard Mobile Authenticator is enabled (which is required for trading). The app lists an item, `requires_confirmation` comes back `true`, but the app has no way to complete the confirmation. The listing sits in limbo until the user manually confirms in the Steam mobile app, or it expires after ~24 hours.

**Why it happens:** Steam's security model requires out-of-band confirmation for market operations. This is intentional anti-automation.

**Consequences:** Users list items thinking they're sold, but items stay in a pending state. If using "quick sell" to undercut, the price may have moved by the time the user confirms in the Steam app, defeating the purpose. Batch operations create a pile of pending confirmations.

**Prevention:**
- Make confirmation status prominent in the UI. After listing, if `requires_confirmation` is true, show a clear "Open Steam app to confirm" instruction.
- Don't show the item as "sold" -- show it as "Pending Confirmation."
- For batch sells, show a summary at the end: "15 listed, all pending confirmation in Steam app."
- Consider implementing Steam trade confirmation via the Steam Guard shared secret (if the user provides it), but this is complex and carries security risk.
- Track pending listings and periodically check their status.

**Detection (warning signs):**
- All sell operations return `requires_confirmation: true`.
- Users report items still in inventory after "selling."

**Phase:** Improved Sell UX phase -- confirmation state must be a first-class UI state.

---

## Moderate Pitfalls

### Pitfall 7: Currency Mismatch Between Price APIs and Sell Operations

**What goes wrong:** `getMarketPrice` hardcodes `currency: 1` (USD). The sell endpoint expects the price in the account's wallet currency. If a user's Steam wallet is in EUR or RUB, the "quick sell" calculation is wrong -- it fetches USD prices, subtracts 1 cent, and lists at a USD price on a non-USD market, resulting in either dramatically overpriced or underpriced listings.

**Prevention:**
- Detect the user's wallet currency during session establishment (available from Steam profile or market page).
- Store the user's currency and use it in all price API calls.
- The `quickSellPrice` function must use the same currency as the user's Steam wallet.
- Add a currency display in the UI so users can verify prices are in their currency.

**Phase:** Improved Sell UX phase.

---

### Pitfall 8: Price Fetched and Price Listed Are Out of Sync (Stale Quick-Sell)

**What goes wrong:** The "quick sell" flow fetches the current lowest price, then the user confirms, then the sell request is sent. Between fetch and sell, the market price can change (especially for liquid items). If the price dropped, the user's listing is not the lowest and doesn't sell quickly. If the price rose, the user sold for less than they needed to.

**Prevention:**
- Fetch the price as late as possible -- ideally server-side at sell time, not client-side at display time.
- Show a timestamp on the price: "Price as of 3 seconds ago."
- For quick sell, re-fetch and re-confirm if more than 30 seconds have passed since the price was displayed.
- Accept that this is inherent to any non-real-time market. Don't promise "instant sell" -- promise "undercut current lowest."

**Phase:** Improved Sell UX phase.

---

### Pitfall 9: QR Code Auth Flow Timeout and State Management

**What goes wrong:** Steam's QR code auth has a short timeout (approximately 2-3 minutes). If the user doesn't scan in time, the flow silently expires. The app needs to poll for completion and handle the timeout gracefully. Additionally, the QR code challenge ID is single-use -- once expired, a new one must be generated.

**Prevention:**
- Show a visible countdown timer on the QR code.
- When the QR expires, auto-refresh with a new challenge (don't require the user to restart the flow).
- Poll with reasonable intervals (2-3 seconds) and stop polling on timeout or completion.
- Handle the case where the user scans the QR but denies the login in the Steam app.
- Test on both iOS and Android Steam apps, as behavior can differ.

**Phase:** Session Auth phase (QR code implementation).

---

### Pitfall 10: Login+Guard Flow Exposes User Credentials to Your Server

**What goes wrong:** The login+guard flow requires the user to enter their Steam username, password, and 2FA code into your app. These credentials pass through your server. Even if you don't store them, they transit through your infrastructure, making you a target and creating liability. If your server is compromised or logging is too verbose, credentials leak.

**Prevention:**
- Prefer QR code auth as the primary method (no credentials pass through your server).
- If implementing login+guard, do the Steam auth API call client-side from the Flutter app, not server-side. Only send the resulting session tokens to your server.
- NEVER log request bodies on the auth endpoint.
- NEVER store username/password, even temporarily.
- Consider whether login+guard is worth the liability versus just supporting QR and clientjstoken.

**Phase:** Session Auth phase -- decide auth method priority before implementing.

---

### Pitfall 11: Inventory Refresh After Sell Shows Stale Data

**What goes wrong:** After listing an item for sale, the item is still in the user's inventory (it's reserved, not removed). The inventory fetch returns it normally. Users see the item still listed in the app and may try to sell it again, resulting in an error ("item is already listed"). Conversely, after a sale completes, Steam may take seconds to minutes to remove the item from the inventory endpoint response.

**Prevention:**
- After a successful `sellItem`, mark the item as "listed" locally in the database with the listing details. Don't rely solely on inventory refresh.
- Show a "Listed on Market" badge on items that have pending listings.
- Prevent double-listing by checking the local listing status before attempting to sell.
- On inventory refresh, reconcile local listing status with actual inventory state.

**Phase:** Improved Sell UX phase and Enhanced Batch Selling phase.

---

### Pitfall 12: Multi-Account Session Confusion

**What goes wrong:** The app supports multiple Steam accounts. Each account needs its own session cookies. If the session management doesn't properly scope sessions to specific Steam accounts, sell operations could be executed against the wrong account -- listing items from Account A using Account B's session (which would fail with confusing errors, or worse, if both accounts exist on the same user record, session cookies could be overwritten).

**Prevention:**
- Ensure `steam_session_id` and `steam_login_secure` are stored per linked account, not per user. If the current schema stores them on the `users` table directly, this breaks for multi-account.
- Before each sell operation, verify the session's Steam ID matches the account that owns the item being sold.
- When refreshing a session, make sure it only updates the specific account's session, not all accounts.

**Phase:** Session Auth phase -- verify the schema supports per-account sessions before adding auth flows.

---

## Minor Pitfalls

### Pitfall 13: User-Agent String Gets Fingerprinted and Blocked

**What goes wrong:** The hardcoded User-Agent (`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36`) is used across all Steam requests for all users. If Steam detects many requests with the identical User-Agent from the same IP, it can flag the traffic as automated.

**Prevention:**
- Use a more realistic, complete User-Agent string.
- Consider rotating User-Agent strings or using the actual client's User-Agent.
- Not a high priority but worth updating to a current Chrome version string.

**Phase:** Any phase -- minor cleanup.

---

### Pitfall 14: Fee Calculation Rounding Errors

**What goes wrong:** The `sellerReceivesToBuyerPays` function uses floating-point division (`sellerReceivesCents / 0.8696`). While it has a verification step, edge cases at low prices (under $0.10) can produce incorrect buyer-pays values because the minimum fees (1 cent Steam + 1 cent CS2 = 2 cents minimum) create a non-linear fee structure at the bottom of the price range.

**Prevention:**
- Add comprehensive unit tests covering edge cases: 1 cent, 2 cents, 3 cents, $0.03 (the practical minimum), and prices at fee tier boundaries.
- Consider using an iterative calculation instead of the approximation -- start at `sellerReceivesCents + 2` and increment until the fee math matches.
- Compare results against Steam's actual fee calculator for a set of known prices.

**Phase:** Improved Sell UX phase -- test before relying on it for quick-sell.

---

### Pitfall 15: Error Swallowing Hides Root Causes

**What goes wrong:** Multiple functions catch errors and return default/empty values: `getMarketPrice` returns nulls on error (line 50-52), `fetchSteamInventory` returns partial results on error (line 106), `sellItem` returns a generic message (line 120-126). This makes debugging extremely difficult -- you can't distinguish between "Steam is down," "session expired," "rate limited," and "item doesn't exist."

**Prevention:**
- Categorize errors: network errors, auth errors (401/403), rate limits (429), Steam business errors (item already listed, trade hold), and unknown errors.
- Return error codes alongside messages so the client can handle each case differently.
- Log the raw Steam response (status code + body) at error level for debugging.
- For rate limits specifically, include the retry-after time if Steam provides one.

**Phase:** All phases -- establish error taxonomy early in Session Auth phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| QR Code Auth | Timeout handling, polling race conditions | Countdown timer, auto-refresh QR, clean polling lifecycle |
| Login + Guard | Credential transit liability, 2FA timing | Client-side auth preferred, never log credentials |
| ClientJS Token | Token format changes, extraction reliability | Validate token structure before exchange, test in WebView |
| Session Storage | Plaintext credentials, no encryption | Encrypt before storing, fix SQL injection first |
| Session Validation | Silent expiry, no health check | Pre-operation validation, specific error codes |
| Sell Operations | Fabricated sessionid, currency mismatch | Extract real sessionid from Steam, detect wallet currency |
| Quick Sell | Stale prices, wrong currency | Server-side price fetch at sell time, currency awareness |
| Batch Selling | Rate limit bans, dead session wasting budget | Session pre-check, adaptive delays, daily caps |
| Confirmations | Pending state invisible to user | First-class "pending confirmation" UI state |
| Multi-account | Session scope confusion | Per-account session storage, verify session-account match |

## Sources

- Direct analysis of codebase: `backend/src/services/market.ts`, `backend/src/routes/market.ts`, `backend/src/services/steam.ts`, `backend/src/services/transactions.ts`
- Known issues from `.planning/codebase/CONCERNS.md`
- Domain knowledge: Steam Community Market reverse-engineering patterns, `steamLoginSecure` cookie format, Steam's rate limiting behavior, Steam Guard confirmation requirements (MEDIUM confidence -- based on established community knowledge of Steam's unofficial APIs, verified against codebase patterns)
- Steam trade bot community conventions: 3-5 second minimum delays, session validation patterns, currency handling requirements (MEDIUM confidence -- widely documented in steam-user/steam-community library ecosystems)

---

*Pitfalls audit: 2026-03-08*
