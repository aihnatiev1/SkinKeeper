# Technology Stack

**Project:** SkinTracker - Steam Session Auth & Enhanced Selling
**Researched:** 2026-03-08
**Research Mode:** Ecosystem (Stack dimension)

## Context

The app already has a working Express.js + PostgreSQL backend with raw `axios` HTTP calls to Steam endpoints. The current approach manually constructs cookies (`steamLoginSecure`, `sessionid`) and POSTs to `steamcommunity.com/market/sellitem/`. What's missing is **proper Steam session authentication** -- the three flows (QR code, login+Steam Guard, clientjstoken) that produce those cookies in the first place.

## Recommended Stack Additions

### Primary: `steam-session` by DoctorMcKay

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `steam-session` | ^1.x (latest 1.x) | Steam session auth: QR login, credentials+Guard login, token refresh | **The** library for Steam authentication in Node.js. DoctorMcKay (the author) maintains all major Steam Node.js libraries. Implements Steam's new unified auth system (IAuthenticationService protobuf API). Handles QR code generation, Steam Guard 2FA, access/refresh token management. No other library comes close. | HIGH |

**What `steam-session` provides:**

1. **QR Code Login (`StartSessionViaQR`)** -- generates a challenge URL that encodes to a QR code. User scans with Steam mobile app. Library polls for approval and returns access/refresh tokens.
2. **Credentials Login (`StartSessionViaCredentials`)** -- username + password login. If Steam Guard is enabled (it will be), fires a `steamGuard` event where your code provides the 2FA code. Returns access/refresh tokens.
3. **Token-to-Cookie Exchange** -- `getWebCookies()` method converts access tokens into `steamLoginSecure` and `sessionid` web cookies. This is exactly what the app needs for market sell operations.
4. **Token Refresh** -- access tokens expire (~24h). `steam-session` can refresh them using the refresh token without re-authentication.

**Key classes:**
- `LoginSession` -- main class, supports `EAuthTokenPlatformType.WebBrowser` (what we need)
- Events: `authenticated`, `timeout`, `error`, `steamGuard`, `polling`
- Methods: `startWithQR()`, `startWithCredentials(accountName, password)`, `getWebCookies()`

### Secondary: `steamcommunity`

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `steamcommunity` | ^3.x (latest 3.x) | Steam Community web operations: session management, market operations, confirmations | Wraps all `steamcommunity.com` web endpoints with proper cookie/session management. Handles the `sellItem()` call with correct headers, CSRF tokens, and error parsing. Also handles mobile trade confirmations (required after listing items). Already does what the current `market.ts` does manually, but correctly. | HIGH |

**What `steamcommunity` provides that the current code lacks:**

1. **Proper session management** -- `setCookies()` method handles cookie jar correctly; no manual `Cookie` header construction.
2. **`sellItem(appid, assetid, contextid, price, callback)`** -- does the sell POST with correct CSRF handling, retries, error codes.
3. **Confirmation handling** -- `acceptConfirmationForObject()` can accept mobile confirmations. Without this, listings created with `sellitem/` stay in "pending confirmation" state and never go live.
4. **Session validation** -- `getSessionID()`, `getWebApiOAuth()`, and login state checking.

### Supporting: `steam-totp`

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `steam-totp` | ^2.x | Generate Steam Guard TOTP codes | Needed for the login+Steam Guard flow if the user provides their shared secret. Tiny utility, same author (DoctorMcKay). Generates time-based 2FA codes compatible with Steam Guard. | HIGH |

### Supporting: `qrcode`

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `qrcode` | ^1.5.x | Generate QR code images from challenge URLs | `steam-session` provides a challenge URL string; this converts it to a data URI or PNG that the Flutter app can display. Lightweight, well-maintained, 20M+ weekly downloads. | HIGH |

### Supporting: Crypto (built-in)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `node:crypto` | built-in | Encrypt session cookies at rest in PostgreSQL | Session cookies are sensitive credentials. AES-256-GCM encryption for `steam_login_secure` and `steam_access_token` columns. No external library needed. | HIGH |

## What NOT to Use

| Library | Why Not |
|---------|---------|
| `steam-user` | Full Steam client emulation (game playing, chat, etc). Massive dependency. Overkill -- we only need auth and web cookies, not a game client. |
| `passport-steam` | OpenID-only strategy for Passport.js. Already have OpenID working. Does NOT provide session cookies needed for market operations. |
| `node-steam` / `steam` | Deprecated predecessors to DoctorMcKay's libraries. Uses old Steam protocol, not maintained. |
| `steam-web-api-ts` | Typed wrapper for official Steam Web API. Doesn't cover authentication or market sell (those are unofficial endpoints). |
| Manual protobuf implementation | `steam-session` already implements the `IAuthenticationService` protobuf API. Rolling your own is fragile and will break when Valve updates proto definitions. |
| `tough-cookie` / `cookie-jar` | Manual cookie management. `steamcommunity` handles this internally with its own cookie jar. Adding another layer adds complexity with no benefit. |

## Architecture Decision: `steamcommunity` vs Keep Raw `axios`

**Recommendation: Use `steamcommunity` for all Steam Community web operations.**

The current `market.ts` manually constructs HTTP requests to Steam endpoints. This works but has problems:

1. **Missing confirmation handling** -- the current code detects `requires_confirmation: 1` but cannot accept confirmations. Items stay in limbo.
2. **Fragile cookie construction** -- the `exchangeTokenForSession()` function constructs `steamLoginSecure` manually (`steamId%7C%7CaccessToken`). This format has changed before and will change again.
3. **No CSRF rotation** -- Steam periodically rotates `sessionid`. The current code uses a randomly generated one, which may fail.
4. **No retry logic for auth failures** -- a 403 from Steam means cookies expired. Current code returns error; should attempt token refresh.

`steamcommunity` handles all of this. The trade-off is adding a dependency, but it's the standard library with 7+ years of maintenance tracking Valve's changes.

**However:** If the goal is to stay lightweight and keep the current raw-HTTP approach, `steam-session` alone is sufficient for the auth flows. The current `sellItem()` code in `market.ts` can remain as-is; just feed it real cookies from `steam-session` instead of manually constructed ones. The downside is no confirmation handling and continued fragility.

**Verdict:** Use `steam-session` (mandatory). Use `steamcommunity` (strongly recommended). The codebase can adopt incrementally -- start with `steam-session` for auth, then migrate sell operations to `steamcommunity` later.

## How the Auth Flows Map to Libraries

### Flow 1: QR Code Login
```
Frontend                    Backend (steam-session)              Steam
   |                              |                                |
   |-- GET /auth/qr/start -----→ |                                |
   |                              |-- new LoginSession()           |
   |                              |-- startWithQR() -------→       |
   |                              |← challenge URL                 |
   |← { qrUrl, pollToken } ------|                                |
   |                              |                                |
   | [Display QR code]            |                                |
   | [User scans with Steam app]  |                                |
   |                              |                                |
   |-- GET /auth/qr/poll ------→  |                                |
   |                              |-- (session polls internally)   |
   |                              |← 'authenticated' event         |
   |                              |-- getWebCookies() ------→      |
   |                              |← [steamLoginSecure, sessionid] |
   |← { success, cookies saved } -|                                |
```

### Flow 2: Login + Steam Guard
```
Frontend                    Backend (steam-session)              Steam
   |                              |                                |
   |-- POST /auth/credentials --> |                                |
   |   { username, password }     |-- startWithCredentials() --→   |
   |                              |← 'steamGuard' event            |
   |← { needsGuardCode } --------|                                |
   |                              |                                |
   | [User enters 2FA code]       |                                |
   |-- POST /auth/guard-code --→  |                                |
   |   { code }                   |-- submitSteamGuardCode() --→   |
   |                              |← 'authenticated' event         |
   |                              |-- getWebCookies() ------→      |
   |← { success, cookies saved } -|                                |
```

### Flow 3: ClientJS Token
```
Frontend                    Backend                              Steam
   |                              |                                |
   | [Open WebView to             |                                |
   |  steamcommunity.com/         |                                |
   |  chat/clientjstoken]         |                                |
   | [Capture JSON response]      |                                |
   |                              |                                |
   |-- POST /auth/clienttoken --> |                                |
   |   { steamid, token }         |-- steam-session               |
   |                              |   refreshToken(token) -----→   |
   |                              |-- getWebCookies() ------→      |
   |← { success, cookies saved } -|                                |
```

## Session Lifecycle Management

### Token Storage Schema (extends existing `users` table)

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS steam_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ;
```

The existing columns (`steam_session_id`, `steam_login_secure`, `steam_access_token`) are sufficient. Add `steam_refresh_token` for automatic refresh and `session_expires_at` for proactive expiry checking.

### Refresh Strategy

- Access tokens: ~24h lifetime. Store and refresh proactively.
- Refresh tokens: ~200 day lifetime. Store securely (encrypted).
- Web cookies: derived from access tokens via `getWebCookies()`. Regenerate when access token refreshes.
- **On every sell operation:** check `session_expires_at`. If within 1 hour of expiry, refresh first. If refresh fails, prompt user to re-authenticate.

## Installation

```bash
# In backend/
npm install steam-session steamcommunity steam-totp qrcode

# Type definitions (steam-session ships its own types, others need DefinitelyTyped or custom)
npm install -D @types/qrcode
```

Note: `steam-session` is written in TypeScript and ships its own type definitions. `steamcommunity` does not have official TypeScript types -- use with `// @ts-ignore` or write a minimal `.d.ts` declaration file for the methods used. `steam-totp` similarly needs a small declaration file or `@ts-ignore`.

## Version Confidence Notes

| Package | Confidence in Version | Notes |
|---------|----------------------|-------|
| `steam-session` ^1.x | MEDIUM | My training data knows v1.x as latest stable. Verify on npm before installing -- there may be a v2.x by now. The API surface (LoginSession, startWithQR, getWebCookies) is stable. |
| `steamcommunity` ^3.x | MEDIUM | Last known stable is 3.x. Verify on npm. Core sell/cookie API has been stable for years. |
| `steam-totp` ^2.x | MEDIUM | Small utility, API is `generateAuthCode(sharedSecret)`. Unlikely to have breaking changes. Verify version. |
| `qrcode` ^1.5.x | HIGH | Extremely stable, widely used. 1.5.x is well-established. |

## Existing Dependencies -- No Changes Needed

The following existing backend dependencies remain as-is:

| Package | Stays? | Notes |
|---------|--------|-------|
| `express` ^5.2.1 | Yes | HTTP server, no change |
| `pg` ^8.20.0 | Yes | Database, no change |
| `jsonwebtoken` ^9.0.3 | Yes | JWT auth, no change |
| `axios` ^1.13.6 | Yes | Still used for Skinport API, Steam Web API. Market operations may migrate to `steamcommunity` but `axios` stays for other HTTP calls |
| `helmet`, `cors`, `dotenv`, `node-cron` | Yes | Infrastructure, no change |

## Flutter-Side Additions

| Package | Purpose | Confidence |
|---------|---------|------------|
| `webview_flutter` ^4.x | Display QR code and handle clientjstoken WebView capture | HIGH |
| `mobile_scanner` ^5.x or `qr_flutter` ^4.x | Alternative: render QR code natively from URL string (lighter than WebView for QR display) | MEDIUM |

For the QR flow, the backend generates a URL string. The Flutter app needs to render it as a QR image. Two approaches:
1. **Backend renders QR as base64 PNG** (using `qrcode` npm package) and sends to Flutter. Flutter just displays an image. Simpler Flutter-side.
2. **Backend sends URL string**, Flutter renders QR using `qr_flutter`. More work Flutter-side but no image transfer.

**Recommendation:** Option 1 (backend renders QR). Keeps Flutter simple, leverages the `qrcode` npm package, and the base64 image is small (~2KB).

For the clientjstoken flow, Flutter needs a WebView to navigate to `steamcommunity.com/chat/clientjstoken` and capture the JSON response. `webview_flutter` is the standard choice.

## Sources

- DoctorMcKay's GitHub repositories (github.com/DoctorMcKay) -- author of all major Steam Node.js libraries
- npm package registries for steam-session, steamcommunity, steam-totp
- Steam IAuthenticationService protobuf documentation
- **Confidence caveat:** Version numbers are from training data (cutoff ~early 2025). Verify latest versions via `npm view <package> version` before installing.

---

*Stack research: 2026-03-08*
