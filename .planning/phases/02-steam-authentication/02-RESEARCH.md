# Phase 2: Steam Authentication - Research

**Researched:** 2026-03-08
**Domain:** Steam session authentication (QR code, credentials+Guard, clientjstoken) and session status UI
**Confidence:** HIGH

## Summary

Phase 2 delivers three Steam session authentication methods and a session status indicator. The backend already has `SteamSessionService` (from Phase 1) with encrypted storage, session validation, and `extractSessionId()`. What's missing is the actual authentication flows that produce the session cookies in the first place, and a Flutter UI to drive them.

The `steam-session` npm package (v1.9.4, by DoctorMcKay) is the definitive library for this. It provides `LoginSession` with `startWithQR()`, `startWithCredentials()`, and `getWebCookies()` -- exactly the three flows needed. The backend generates sessions via `steam-session`, extracts web cookies, and stores them through the existing `SteamSessionService.saveSession()`. The Flutter side needs: a QR code display screen, a credentials+Guard form, an improved clientjstoken flow, and a session status widget.

**Primary recommendation:** Install `steam-session` v1.9.4, build three backend auth endpoints that produce cookies via `getWebCookies()`, store via existing `SteamSessionService`, and add a session status endpoint. Flutter gets a tabbed auth picker UI and a session status indicator.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | QR code auth via Steam mobile app scan | `steam-session` `startWithQR()` generates challenge URL; `qrcode` npm renders to base64 PNG; backend polls for `authenticated` event; `getWebCookies()` produces session cookies |
| AUTH-02 | ClientJS token auth (redirect to `/chat/clientjstoken`) | Existing `exchangeTokenForSession()` in `market.ts` already handles this partially; needs cleanup to use `steam-session` token refresh or keep current direct cookie construction with `extractSessionId()` |
| AUTH-03 | Login + password + Steam Guard 2FA | `steam-session` `startWithCredentials()` triggers `steamGuard` event; backend holds `LoginSession` in memory, waits for guard code submission; `getWebCookies()` after auth completes |
| AUTH-04 | Session validity status in app UI | Existing `SteamSessionService.validateSession()` checks Steam Market redirect; new `/api/session/status` endpoint returns `valid/expiring/expired/none`; Flutter widget displays status |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `steam-session` | 1.9.4 | QR auth, credential auth, Steam Guard, `getWebCookies()` | The only maintained Node.js library for Steam's IAuthenticationService protobuf API. By DoctorMcKay, same author as all major Steam Node.js libs. |
| `qrcode` | 1.5.4 | Generate QR code image from challenge URL string | 20M+ weekly downloads, renders to data URI/PNG. Backend renders QR, sends base64 to Flutter. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto` (built-in) | Node.js | `crypto.randomUUID()` for nonce generation | Nonce-based pending session tracking for multi-step auth flows |

### Not Needed for Phase 2
| Library | Why Skip |
|---------|----------|
| `steamcommunity` | Not needed for auth. Useful for sell operations (Phase 3). Keep current raw axios approach for now. |
| `steam-totp` | Only needed if generating TOTP codes from shared_secret. For AUTH-03, the user provides their own code from the Steam app. |
| `webview_flutter` | ClientJS token flow uses external browser, not in-app WebView. User copies the JSON response. |
| `qr_flutter` | Backend renders QR as base64 PNG via `qrcode` npm. Flutter just displays an image -- simpler, no Flutter QR dependency. |

**Installation:**
```bash
cd backend
npm install steam-session qrcode
npm install -D @types/qrcode
```

## Architecture Patterns

### Backend: New Session Auth Routes

Create a new route file `backend/src/routes/session.ts` mounted at `/api/session/*`. Keep existing `/api/market/session` and `/api/market/clienttoken` as deprecated aliases temporarily.

```
backend/src/routes/session.ts       # NEW: all auth flow endpoints
backend/src/services/steamSession.ts # EXISTING: extend with auth flow methods
```

### New API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/session/qr/start` | Start QR auth, return base64 QR image + nonce |
| GET | `/api/session/qr/poll/:nonce` | Poll QR session status (pending/complete/expired) |
| POST | `/api/session/login` | Start credential auth with username+password, return nonce + guardRequired |
| POST | `/api/session/guard` | Submit Steam Guard code for pending credential auth |
| POST | `/api/session/token` | Submit clientjstoken JSON (migrated from `/api/market/clienttoken`) |
| GET | `/api/session/status` | Session validity: `valid`, `expiring`, `expired`, `none` |

### Flutter: Auth Method Picker

Add a session setup screen accessible from Settings (not the login screen -- OpenID login is separate from Steam session auth).

```
lib/features/auth/
  steam_session_screen.dart         # NEW: tabbed auth method picker
  widgets/
    qr_auth_tab.dart                # NEW: displays QR, polls status
    credentials_auth_tab.dart       # NEW: username/password/guard form
    clienttoken_auth_tab.dart       # NEW: instructions + paste field
    session_status_widget.dart      # NEW: valid/expiring/expired indicator
```

### Pattern 1: Nonce-Based Pending Session Tracking

Multi-step auth flows (QR, credentials) need the `LoginSession` object to persist across HTTP requests. Store in-memory `Map<string, PendingSession>` keyed by UUID nonce.

```typescript
interface PendingSession {
  loginSession: LoginSession;
  createdAt: Date;
  userId: number;
  status: 'pending' | 'guard_required' | 'authenticated' | 'expired';
  cookies?: SteamSession;
}

// In SteamSessionService (extended):
private static pendingSessions = new Map<string, PendingSession>();

// Cleanup stale sessions every 5 minutes
static {
  setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [nonce, entry] of this.pendingSessions) {
      if (entry.createdAt.getTime() < cutoff) {
        this.pendingSessions.delete(nonce);
      }
    }
  }, 5 * 60 * 1000);
}
```

**Why in-memory:** Pending sessions are transient (2-3 min timeout), contain non-serializable library objects (`LoginSession`), and single-instance backend. Server restart = user retries auth (acceptable).

### Pattern 2: Backend Renders QR Image

Backend generates QR as base64 PNG data URI via `qrcode` npm package. Flutter receives and displays as `Image.memory()`. This avoids adding a Flutter QR dependency and keeps the Flutter side simple.

```typescript
import QRCode from 'qrcode';
const qrDataUri = await QRCode.toDataURL(challengeUrl);
// Send to client: { qrImage: qrDataUri, nonce: "uuid" }
```

### Pattern 3: Session Status Levels

| Status | Meaning | How Determined |
|--------|---------|----------------|
| `none` | No session stored | No `steam_login_secure` in DB |
| `expired` | Session cookies invalid | `validateSession()` returns false |
| `expiring` | Session will expire soon | `session_updated_at` > 20 hours ago (access tokens last ~24h) |
| `valid` | Session is active | `validateSession()` returns true AND not expiring |

### Anti-Patterns to Avoid

- **Storing raw passwords:** Never persist username/password. They transit from Flutter to backend over HTTPS, get used for Steam API call, then discarded immediately.
- **WebSocket for QR polling:** HTTP polling at 3s intervals is sufficient. QR flows complete in 10-30s. No need for socket.io complexity.
- **Client-side steam-session:** The `steam-session` library is Node.js only. All auth flows run on the backend, not in Flutter.
- **Duplicating session routes:** All new auth endpoints go in `session.ts`, not in `market.ts`. Keep `market.ts` auth endpoints as deprecated aliases.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR code Steam auth | Manual protobuf calls to IAuthenticationService | `steam-session` `startWithQR()` | Protobuf schema changes when Valve updates; library tracks changes |
| RSA password encryption for Steam login | Manual RSA key fetch + encrypt | `steam-session` `startWithCredentials()` | Library handles RSA key fetching, timestamp, encryption internally |
| QR image generation | Canvas/SVG rendering | `qrcode` npm `toDataURL()` | Edge cases in QR encoding, error correction levels |
| Cookie extraction from Steam tokens | Manual `steamLoginSecure` construction | `steam-session` `getWebCookies()` | Format has changed historically; library tracks current format |
| Steam Guard code handling | Manual 2FA submission API | `steam-session` `submitSteamGuardCode()` | Handles device vs email guard types, retry logic |

## Common Pitfalls

### Pitfall 1: QR Code Timeout Without User Feedback
**What goes wrong:** Steam QR challenges expire in ~2-3 minutes. If the user doesn't scan in time, polling returns nothing and the UI hangs.
**How to avoid:** Show a countdown timer. When expired, auto-generate a new QR challenge without requiring user action. Stop polling on timeout.
**Warning signs:** `steam-session` `timeout` event fires on the `LoginSession`.

### Pitfall 2: Credential Auth Holding LoginSession Too Long
**What goes wrong:** `startWithCredentials()` creates a `LoginSession` that waits for the Steam Guard code. If the user abandons the flow, the object leaks in the pending sessions map.
**How to avoid:** 5-minute TTL cleanup interval on `pendingSessions` map. Also clean up when the nonce is polled and found expired.

### Pitfall 3: steamLoginSecure Format From getWebCookies()
**What goes wrong:** `getWebCookies()` returns an array of cookie strings like `steamLoginSecure=STEAMID%7C%7CTOKEN`. Must parse correctly -- the value is URL-encoded with `%7C%7C` separating steamid and token.
**How to avoid:** Parse the cookie strings properly. Store the raw cookie value (with `%7C%7C`). The existing `SteamSessionService.saveSession()` handles this correctly as long as we pass the parsed values.

### Pitfall 4: Session Status Validation Hammering Steam
**What goes wrong:** Every time the Flutter app checks session status, it calls `validateSession()` which makes an HTTP request to Steam. If the status widget polls frequently, this creates excessive traffic.
**How to avoid:** Cache validation result with a TTL (e.g., 30 minutes). Use `session_updated_at` timestamp for "expiring" detection without hitting Steam. Only do full validation on explicit user action or before sell operations.

### Pitfall 5: Guard Code Timing Window
**What goes wrong:** Steam Guard TOTP codes rotate every 30 seconds. If the user takes too long to enter the code, it expires. The `steamGuard` event callback must be resolved before the session times out.
**How to avoid:** The `steam-session` library's `steamGuard` event provides a callback. Store the callback in the pending session, invoke it when the user submits the code via POST `/api/session/guard`. If the code is wrong, `steam-session` will emit another `steamGuard` event for retry.

### Pitfall 6: ClientJS Token Already Partially Implemented
**What goes wrong:** The existing `exchangeTokenForSession()` in `market.ts` already handles clientjstoken but has issues (dual format fallback, dead API call). Implementing it again in `session.ts` creates duplication.
**How to avoid:** Migrate the existing logic into `SteamSessionService` as a static method. Remove from `market.ts`. The new `/api/session/token` endpoint calls the service method. Keep `/api/market/clienttoken` as a deprecated alias that forwards to the same service method.

## Code Examples

### QR Auth Flow (Backend)
```typescript
// steam-session v1.9.4 API (verified via npm)
import { LoginSession, EAuthTokenPlatformType } from 'steam-session';
import QRCode from 'qrcode';

// In SteamSessionService:
static async startQRSession(userId: number): Promise<{ qrImage: string; nonce: string }> {
  const session = new LoginSession(EAuthTokenPlatformType.WebBrowser);
  const startResult = await session.startWithQR();

  const nonce = crypto.randomUUID();
  const qrImage = await QRCode.toDataURL(startResult.qrChallengeUrl);

  // Listen for authentication
  session.on('authenticated', async () => {
    const pending = this.pendingSessions.get(nonce);
    if (!pending) return;
    const cookies = await session.getWebCookies();
    // cookies is string[] like ["sessionid=XXX", "steamLoginSecure=ID%7C%7CTOKEN"]
    pending.status = 'authenticated';
    pending.cookies = this.parseCookies(cookies);
  });

  session.on('timeout', () => {
    const pending = this.pendingSessions.get(nonce);
    if (pending) pending.status = 'expired';
  });

  this.pendingSessions.set(nonce, {
    loginSession: session,
    createdAt: new Date(),
    userId,
    status: 'pending',
  });

  return { qrImage, nonce };
}
```

### Credentials + Guard Flow (Backend)
```typescript
static async startCredentialLogin(
  userId: number, username: string, password: string
): Promise<{ nonce: string; guardRequired: boolean; guardType?: string }> {
  const session = new LoginSession(EAuthTokenPlatformType.WebBrowser);
  const nonce = crypto.randomUUID();

  let guardResolve: ((code: string) => void) | null = null;

  session.on('steamGuard', (domain, callback, lastCodeWrong) => {
    const pending = this.pendingSessions.get(nonce);
    if (pending) {
      pending.status = 'guard_required';
      pending.guardCallback = callback;
    }
  });

  session.on('authenticated', async () => {
    const pending = this.pendingSessions.get(nonce);
    if (!pending) return;
    const cookies = await session.getWebCookies();
    pending.status = 'authenticated';
    pending.cookies = this.parseCookies(cookies);
  });

  this.pendingSessions.set(nonce, {
    loginSession: session,
    createdAt: new Date(),
    userId,
    status: 'pending',
  });

  await session.startWithCredentials({ accountName: username, password });

  const pending = this.pendingSessions.get(nonce)!;
  return {
    nonce,
    guardRequired: pending.status === 'guard_required',
    guardType: 'device', // or 'email' based on steamGuard domain param
  };
}

static async submitGuardCode(nonce: string, code: string): Promise<SteamSession | null> {
  const pending = this.pendingSessions.get(nonce);
  if (!pending || !pending.guardCallback) return null;

  pending.guardCallback(code);

  // Wait briefly for authenticated event
  await new Promise(resolve => setTimeout(resolve, 3000));

  if (pending.status === 'authenticated' && pending.cookies) {
    this.pendingSessions.delete(nonce);
    return pending.cookies;
  }
  return null;
}
```

### Cookie Parsing Helper
```typescript
private static parseCookies(cookieStrings: string[]): SteamSession {
  const result: Partial<SteamSession> = {};
  for (const cookie of cookieStrings) {
    const [nameVal] = cookie.split(';');
    const eqIdx = nameVal.indexOf('=');
    const name = nameVal.substring(0, eqIdx);
    const value = nameVal.substring(eqIdx + 1);
    if (name === 'sessionid') result.sessionId = value;
    if (name === 'steamLoginSecure') result.steamLoginSecure = value;
  }
  return result as SteamSession;
}
```

### Flutter Session Status Widget
```dart
// Simple status indicator for app bar or settings
Widget buildSessionStatus(String status) {
  final (icon, color, label) = switch (status) {
    'valid' => (Icons.check_circle, Colors.green, 'Session Active'),
    'expiring' => (Icons.warning, Colors.orange, 'Expiring Soon'),
    'expired' => (Icons.error, Colors.red, 'Session Expired'),
    _ => (Icons.help_outline, Colors.grey, 'Not Connected'),
  };
  return Row(children: [Icon(icon, color: color, size: 16), SizedBox(width: 4), Text(label)]);
}
```

## Database Schema Changes

```sql
-- Add refresh token and session method columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS steam_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_method VARCHAR(20);
  -- values: 'qr', 'credentials', 'clienttoken'
```

Existing columns already sufficient: `steam_session_id`, `steam_login_secure`, `steam_access_token`, `session_updated_at`. The `steam_refresh_token` enables future auto-refresh (Phase 3 SESS-03). The `session_method` tracks which auth method was used (useful for debugging).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `steamLoginSecure` construction | `steam-session` `getWebCookies()` | Steam auth overhaul 2023 | Library handles format correctly |
| Random `sessionid` generation | `extractSessionId()` from Steam response | Phase 1 (SEC-03) | Already fixed in codebase |
| Single clientjstoken flow | Three auth methods (QR primary) | Phase 2 | Much better UX, QR is fastest |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual testing (no automated test infrastructure detected) |
| Config file | none |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | QR code auth produces valid session | manual | N/A (requires Steam mobile app) | N/A |
| AUTH-02 | ClientJS token auth produces valid session | manual | N/A (requires browser login) | N/A |
| AUTH-03 | Login+Guard auth produces valid session | manual | N/A (requires real Steam credentials) | N/A |
| AUTH-04 | Session status shows correct state | manual | N/A (depends on session state) | N/A |

### Sampling Rate
- All auth flows require real Steam interaction -- automated testing not feasible
- Manual verification: attempt each auth method, verify session cookies are stored and valid via sell operation

### Wave 0 Gaps
- All testing is manual for this phase due to Steam's external authentication dependency
- Could add unit tests for cookie parsing helper and session status logic (non-Steam-dependent code)

## Open Questions

1. **`steam-session` `startWithCredentials` callback pattern**
   - What we know: The library emits a `steamGuard` event with a callback function
   - What's unclear: Exact timing -- does `startWithCredentials()` resolve before or after the `steamGuard` event fires? Need to verify during implementation.
   - Recommendation: Set up the event listener before calling `startWithCredentials()`, test with real credentials

2. **`getWebCookies()` return format**
   - What we know: Returns `string[]` of cookie strings
   - What's unclear: Exact format of each string (just `name=value` or full `Set-Cookie` format with domain/path/expiry?)
   - Recommendation: Log the actual output on first successful auth and adapt parser

3. **QR challenge URL refresh**
   - What we know: QR expires in ~2-3 minutes
   - What's unclear: Can we call `startWithQR()` again on the same `LoginSession` instance, or do we need a new instance?
   - Recommendation: Create new `LoginSession` instance on each refresh attempt (safe approach)

## Sources

### Primary (HIGH confidence)
- npm registry: `steam-session` v1.9.4 (verified current version via `npm view`)
- npm registry: `qrcode` v1.5.4 (verified)
- npm registry: `steam-totp` v2.1.2 (verified, not needed for Phase 2)
- npm registry: `steamcommunity` v3.49.0 (verified, deferred to Phase 3)
- Codebase: `backend/src/services/steamSession.ts` (existing service from Phase 1)
- Codebase: `backend/src/routes/market.ts` (existing clientjstoken flow)

### Secondary (MEDIUM confidence)
- `steam-session` API surface (`LoginSession`, `startWithQR`, `startWithCredentials`, `getWebCookies`, events) from training data and prior research. Core API stable since package creation.
- Architecture patterns from `.planning/research/ARCHITECTURE.md` (project-specific, well-analyzed)

### Tertiary (LOW confidence)
- Exact `getWebCookies()` return format -- needs validation during implementation
- `startWithCredentials()` timing relative to `steamGuard` event -- needs validation
- QR challenge timeout duration (stated as ~2-3 min) -- verify experimentally

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions verified on npm, `steam-session` is the only real option
- Architecture: HIGH - builds directly on Phase 1 `SteamSessionService`, patterns well-established in research
- Pitfalls: HIGH - comprehensive pitfalls documented in prior research, Phase 1 already addressed several
- Code examples: MEDIUM - `steam-session` API details from training data, core pattern stable but exact signatures need verification

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable domain, `steam-session` API unlikely to change)
