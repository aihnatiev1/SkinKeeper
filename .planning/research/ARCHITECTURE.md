# Architecture Patterns

**Domain:** Steam CS2 skin trading — session authentication and enhanced marketplace selling
**Researched:** 2026-03-08

## Current State

The app has a working foundation: OpenID login (read-only identity), inventory tracking, price collection, and basic selling. Session cookies (`steamLoginSecure`, `sessionid`) are stored in the `users` table but obtained only via manual clientjstoken paste — a friction-heavy flow with no QR or credential-based auth. The `getUserSession()` helper is duplicated across `market.ts` and `transactions.ts`. There is no session validation, expiry detection, or refresh mechanism.

## Recommended Architecture

### Overview

Introduce a **SteamSessionService** as the single authority for Steam session lifecycle on the backend, and a **SteamAuthFlow** orchestrator on the frontend. The backend manages three authentication methods (QR, credentials+guard, clientjstoken), validates sessions before use, and handles expiry. The frontend presents a unified auth UI with method selection.

```
Flutter App                          Express.js Backend                    Steam
-----------                          ------------------                    -----

AuthMethodPicker                     SteamSessionService
  |                                    |
  +-- QRAuthScreen ----[WS]-------> startQRSession() -----> Steam IAuth API
  |     (displays QR)  <--[WS]---- (qr_url, poll status)   (QR challenge)
  |                                    |
  +-- CredentialAuth --> POST -----> startCredentialSession() -> Steam IAuth API
  |   (user+pass+guard)  /session/login  (login + 2FA)       (RSA + login)
  |                                    |
  +-- ClientToken -----> POST -----> exchangeClientToken() --> (token->cookies)
      (paste JSON)      /clienttoken   |
                                       v
                                  validateSession()
                                       |
                                       v
                                  storeSession() --> users table
                                       |
                                       v
                          Market/Tx routes use getValidSession()
                          which validates before each operation
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **SteamSessionService** (backend) | All Steam session lifecycle: create via 3 methods, validate, store, retrieve, invalidate | Steam IAuthentication API, PostgreSQL, route handlers |
| **Session Routes** (`/api/session/*`) (backend) | HTTP endpoints for auth flows, session status, validation | SteamSessionService, auth middleware |
| **Market Service** (backend, existing) | Sell items on Steam Market using session cookies | SteamSessionService (for session retrieval), Steam Market API |
| **Transaction Service** (backend, existing) | Sync transaction history from Steam | SteamSessionService (for session retrieval), Steam Market History API |
| **Session Middleware** (backend, new) | Pre-check session validity on routes that need Steam cookies | SteamSessionService |
| **SteamAuthFlow** (Flutter) | Orchestrates auth method selection and UI flows | Backend session routes, WebSocket (for QR polling) |
| **SteamSessionProvider** (Flutter, existing) | Riverpod state for session status | ApiClient |
| **SellBottomSheet** (Flutter, enhanced) | Two-button sell UI (custom price vs quick sell) | Market API endpoints |
| **BatchSellScreen** (Flutter, new) | Multi-item selection, preview, progress tracking | Market bulk-sell endpoint |

### Data Flow

#### 1. QR Code Authentication Flow

This is the most user-friendly method. The backend creates a QR login session with Steam, sends the QR URL to the client, and polls for completion.

```
Flutter                    Backend                         Steam
  |                          |                               |
  |-- POST /session/qr/start |                               |
  |                          |-- LoginSession.startWithQR()   |
  |                          |   (steam-session package)  --> |
  |                          |<-- qr challenge URL            |
  |<-- { challengeUrl }      |                               |
  |                          |                               |
  | (display QR code)        |                               |
  |                          |                               |
  |-- GET /session/qr/poll   |                               |
  |   (poll every 3-5s)      |-- check session status        |
  |                          |   or listen 'authenticated'   |
  |<-- { status: pending }   |                               |
  |   ...                    |                               |
  | (user scans with         |                               |
  |  Steam mobile app)       |                   'authenticated' event
  |                          |<-- refresh token + access token|
  |                          |-- getWebCookies() ----------->|
  |                          |<-- steamLoginSecure, sessionid |
  |                          |-- store in users table         |
  |<-- { status: complete }  |                               |
```

**Why polling over WebSocket:** The backend already uses Express.js without WebSocket infrastructure. HTTP polling at 3-5s intervals is simpler, avoids adding `ws`/`socket.io` dependency, and works reliably. A QR session typically completes in 10-30 seconds. If WebSocket support is added later for other features, QR can migrate to it.

**Alternative: Server-Sent Events (SSE):** A middle ground — single HTTP connection, server pushes status updates. Lighter than WebSocket, but Express.js SSE requires keeping the connection open. Viable but polling is simpler for this use case.

#### 2. Credentials + Steam Guard Flow

```
Flutter                    Backend                         Steam
  |                          |                               |
  |-- POST /session/login    |                               |
  |   { username, password } |                               |
  |                          |-- fetch RSA public key ------>|
  |                          |<-- RSA key + timestamp        |
  |                          |-- encrypt password            |
  |                          |-- LoginSession.startWith      |
  |                          |   Credentials() ------------->|
  |                          |                               |
  |                          |<-- needs Steam Guard code     |
  |<-- { needsGuard: true,   |                               |
  |      guardType: "device"} |                              |
  |                          |                               |
  | (user enters 2FA code)   |                               |
  |-- POST /session/guard    |                               |
  |   { code: "ABC123" }     |-- submitSteamGuardCode() ---->|
  |                          |<-- access token               |
  |                          |-- getWebCookies() ----------->|
  |                          |<-- cookies                    |
  |                          |-- store in users table         |
  |<-- { status: complete }  |                               |
```

**Security consideration:** Username and password transit from app to backend over HTTPS. The backend encrypts the password with Steam's RSA key before sending to Steam — the raw password is never stored. This is a standard pattern in Steam trading tools. The backend acts as the Steam client.

#### 3. ClientJS Token Flow (existing, improved)

```
Flutter                    Backend                         Steam
  |                          |                               |
  | (user opens browser,     |                               |
  |  navigates to            |                               |
  |  /chat/clientjstoken,    |                               |
  |  copies JSON)            |                               |
  |                          |                               |
  |-- POST /session/token    |                               |
  |   { steamid, token }     |                               |
  |                          |-- construct steamLoginSecure   |
  |                          |   from steamid + access_token  |
  |                          |-- validate with test request ->|
  |                          |<-- success/fail               |
  |                          |-- store in users table         |
  |<-- { status: complete }  |                               |
```

This flow already exists in `market.ts` but should be moved into SteamSessionService and enhanced with validation.

#### 4. Session Validation Flow (new)

Every operation that needs Steam cookies should validate the session first, not just check for cookie existence.

```
Route Handler              SteamSessionService              Steam
  |                          |                               |
  |-- getValidSession(uid)   |                               |
  |                          |-- fetch cookies from DB       |
  |                          |-- check last_validated_at     |
  |                          |                               |
  |                          | (if > 30 min since validate)  |
  |                          |-- test request to Steam ----->|
  |                          |   (e.g., GET /market/ with    |
  |                          |    cookies, check for 200)    |
  |                          |<-- success or 403/redirect    |
  |                          |                               |
  |                          | (if valid)                    |
  |                          |-- update last_validated_at    |
  |<-- session cookies       |                               |
  |                          |                               |
  |                          | (if invalid)                  |
  |                          |-- clear stored cookies        |
  |<-- null (session expired)|                               |
```

#### 5. Enhanced Selling Flow

```
Flutter                    Backend                         Steam
  |                          |                               |
  | [Single Item Sell]       |                               |
  |-- user taps "Sell"       |                               |
  |   on item card           |                               |
  |-- SellSheet opens with   |                               |
  |   two buttons:           |                               |
  |   "Quick Sell" / "Sell"  |                               |
  |                          |                               |
  | (Quick Sell tapped)      |                               |
  |-- GET /market/quickprice |                               |
  |<-- { price, fee info }   |                               |
  |-- confirm dialog         |                               |
  |-- POST /market/sell      |                               |
  |   { assetId, price }     |-- getValidSession() -------->|
  |                          |-- sellItem() --------------->|
  |                          |<-- result                    |
  |<-- { success, message }  |                               |
  |                          |                               |
  | [Batch Sell]             |                               |
  |-- user selects items     |                               |
  |   (multi-select mode)    |                               |
  |-- taps "Sell Selected"   |                               |
  |-- BatchSellSheet opens   |                               |
  |   shows item list +      |                               |
  |   prices + total         |                               |
  |-- user confirms          |                               |
  |-- POST /market/bulk-sell |                               |
  |   { items[] }            |                               |
  |                          |-- for each item:              |
  |                          |   sellItem() + 1.5s delay     |
  |                          |   (progress not streamed)     |
  |<-- { results[], stats }  |                               |
  |-- show results summary   |                               |
```

**Batch sell progress:** The current implementation blocks until all items are sold. For better UX with large batches, consider returning immediately with a `batchId` and letting the client poll `GET /market/batch/:id/status`. However, with the 50-item cap and 1.5s delay, max wait is ~75 seconds — acceptable for a synchronous response. Keep synchronous for now, add async batch processing only if users report UX issues.

## Patterns to Follow

### Pattern 1: Service Singleton for Session Management

**What:** Extract all session logic into a single `SteamSessionService` class that owns the entire lifecycle — create, validate, store, retrieve, invalidate.

**When:** Now. The current codebase has session retrieval duplicated in `market.ts` and `transactions.ts`, and session creation logic embedded directly in route handlers.

**Example:**
```typescript
// backend/src/services/session.ts

interface SteamSessionData {
  sessionId: string;
  steamLoginSecure: string;
  accessToken?: string;
  refreshToken?: string;
  validatedAt: Date;
}

class SteamSessionService {
  // In-memory cache of active QR/credential sessions (keyed by nonce)
  private pendingSessions = new Map<string, LoginSession>();

  async startQRSession(): Promise<{ challengeUrl: string; nonce: string }> { ... }
  async pollQRSession(nonce: string): Promise<{ status: string; cookies?: SteamSessionData }> { ... }

  async startCredentialLogin(username: string, password: string): Promise<{ needsGuard: boolean; guardType: string; nonce: string }> { ... }
  async submitGuardCode(nonce: string, code: string): Promise<SteamSessionData> { ... }

  async exchangeClientToken(steamId: string, token: string): Promise<SteamSessionData> { ... }

  async getValidSession(userId: number): Promise<SteamSessionData | null> { ... }
  async storeSession(userId: number, session: SteamSessionData): Promise<void> { ... }
  async invalidateSession(userId: number): Promise<void> { ... }
  async validateSession(session: SteamSessionData): Promise<boolean> { ... }
}

export const sessionService = new SteamSessionService();
```

### Pattern 2: Session-Required Middleware

**What:** A middleware that checks for a valid Steam session before allowing the request to proceed, attaching the session to the request object.

**When:** Apply to all routes that call Steam authenticated endpoints (sell, bulk-sell, transaction sync).

**Example:**
```typescript
// backend/src/middleware/steamSession.ts

export async function requireSteamSession(req: AuthRequest, res: Response, next: NextFunction) {
  const session = await sessionService.getValidSession(req.userId!);
  if (!session) {
    res.status(401).json({
      error: "Steam session expired or not configured",
      code: "SESSION_REQUIRED",
    });
    return;
  }
  req.steamSession = session;
  next();
}
```

### Pattern 3: Nonce-Based Pending Session Tracking

**What:** When starting a QR or credential auth flow, generate a random nonce (UUID), store the in-progress `LoginSession` in an in-memory `Map`, and return the nonce to the client. The client uses the nonce for subsequent poll/guard-submit requests.

**When:** QR and credential flows are multi-step — the session object must persist between HTTP requests.

**Why in-memory, not DB:** Pending sessions are transient (timeout after 2-3 minutes), contain library objects that cannot be serialized, and there is only one backend instance. If the server restarts mid-flow, the user simply retries.

**Example:**
```typescript
private pendingSessions = new Map<string, {
  loginSession: LoginSession;
  createdAt: Date;
  userId: number;
}>();

// Cleanup stale sessions every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [nonce, entry] of this.pendingSessions) {
    if (entry.createdAt.getTime() < cutoff) {
      this.pendingSessions.delete(nonce);
    }
  }
}, 5 * 60 * 1000);
```

### Pattern 4: Graceful Session Degradation

**What:** When a session is found to be expired during an operation (sell, sync), return a specific error code (`SESSION_EXPIRED`) so the frontend can prompt re-authentication inline rather than showing a generic error.

**When:** Always. Session cookies expire without notice, and the app currently fails silently.

**Example:**
```typescript
// In sell route handler
const session = await sessionService.getValidSession(req.userId!);
if (!session) {
  return res.status(401).json({
    error: "Steam session expired. Please re-authenticate.",
    code: "SESSION_EXPIRED",
  });
}
```

Flutter side:
```dart
// In sell provider
try {
  await api.post('/market/sell', data: {...});
} on DioException catch (e) {
  if (e.response?.data?['code'] == 'SESSION_EXPIRED') {
    // Show session re-auth dialog instead of generic error
    ref.read(steamSessionStatusProvider.notifier).invalidate();
    throw SessionExpiredException();
  }
  rethrow;
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing Raw Passwords

**What:** Saving the user's Steam username and password in the database for automatic re-authentication.
**Why bad:** Massive security liability. If the database is compromised, all user Steam accounts are exposed. Additionally violates Steam's ToS more aggressively than session cookie storage.
**Instead:** Store only session cookies and refresh tokens. When the session expires, prompt the user to re-authenticate through one of the three methods.

### Anti-Pattern 2: WebSocket for QR Polling Only

**What:** Adding `socket.io` or `ws` dependency solely to push QR status updates to the client.
**Why bad:** Adds significant complexity (connection management, reconnection, auth token relay) for a feature that is used once per session setup. HTTP polling at 3-5s intervals generates minimal overhead.
**Instead:** Use HTTP polling. If WebSocket is needed later for other real-time features (e.g., live price updates, batch sell progress), add it then and migrate QR polling as a bonus.

### Anti-Pattern 3: Duplicated Session Retrieval

**What:** Each route handler independently queries the database for session cookies (current state in `market.ts` and `transactions.ts`).
**Why bad:** No centralized validation, easy to forget validation in new routes, leads to inconsistent error handling.
**Instead:** Use `SteamSessionService.getValidSession()` everywhere, or the `requireSteamSession` middleware.

### Anti-Pattern 4: Synchronous Bulk Sell for Very Large Batches

**What:** Blocking the HTTP response for 50 items * 1.5s = 75 seconds.
**Why bad:** Mobile clients may timeout, HTTP proxies may close the connection, user has no feedback during the wait.
**Instead:** For the current 50-item limit, synchronous is acceptable. If the limit increases, switch to job-based: return a `batchId` immediately, process in background, let client poll status.

## Component Build Order

Build order is driven by dependencies — each component depends on the ones above it.

```
Phase 1: SteamSessionService (backend)
  |  - Core session storage/retrieval/validation
  |  - Replaces duplicated getUserSession() in market.ts and transactions.ts
  |  - ClientJS token exchange (migrate from market.ts)
  |  - Session validation logic
  |  - DB schema: add session_validated_at, refresh_token columns
  |
  v
Phase 2: Session Routes + Middleware (backend)
  |  - New route file: /api/session/* endpoints
  |  - requireSteamSession middleware
  |  - Refactor market.ts and transactions.ts to use middleware
  |
  v
Phase 3: QR Authentication (backend + frontend)
  |  - npm install steam-session
  |  - SteamSessionService.startQRSession() + pollQRSession()
  |  - Backend: POST /session/qr/start, GET /session/qr/poll
  |  - Flutter: QR display screen (qr_flutter package)
  |  - Flutter: polling logic in provider
  |
  v
Phase 4: Credential + Steam Guard Authentication (backend + frontend)
  |  - SteamSessionService.startCredentialLogin() + submitGuardCode()
  |  - Backend: POST /session/login, POST /session/guard
  |  - Flutter: login form + guard code input UI
  |
  v
Phase 5: Enhanced Selling UX (frontend, mostly)
  |  - Redesigned SellBottomSheet with "Sell" and "Quick Sell" buttons
  |  - Inline session-expired handling in sell flows
  |  - BatchSellScreen with item selection preview and totals
  |  - Existing backend bulk-sell endpoint is sufficient
  |
  v
Phase 6: Session Lifecycle Polish
     - Auto-validation on app resume
     - Session status indicator in app bar or settings
     - Re-auth prompt when session expires mid-operation
     - Session refresh using stored refresh token (if available)
```

**Rationale for ordering:**
- Phase 1 must come first because every subsequent phase depends on the centralized session service.
- Phase 2 (routes/middleware) enables clean integration points for auth methods.
- QR (Phase 3) before credentials (Phase 4) because QR is the better UX and does not require handling passwords/2FA — it is also the method Steam is actively promoting.
- Selling UX (Phase 5) depends on reliable session management from Phases 1-2 but does not depend on specific auth methods.
- Polish (Phase 6) is last because it enhances reliability of already-working features.

## Database Schema Changes

```sql
-- Add session lifecycle columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS steam_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_validated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_method VARCHAR(20);
  -- 'qr', 'credentials', 'clienttoken', 'manual'
```

**Existing columns used:** `steam_session_id`, `steam_login_secure`, `steam_access_token` (already in `users` table).

No new tables needed. Session data is per-user, stored on the `users` table. Pending (in-progress) auth sessions are in-memory only.

## New API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/session/qr/start` | JWT | Start QR auth, return challenge URL + nonce |
| GET | `/api/session/qr/poll/:nonce` | JWT | Poll QR session status |
| POST | `/api/session/login` | JWT | Start credential auth, return guard requirement + nonce |
| POST | `/api/session/guard` | JWT | Submit Steam Guard code for pending credential auth |
| POST | `/api/session/token` | JWT | Submit clientjstoken (migrated from `/market/clienttoken`) |
| GET | `/api/session/status` | JWT | Session status with validation info (replaces `/market/session/status`) |
| POST | `/api/session/validate` | JWT | Force re-validate current session |
| DELETE | `/api/session` | JWT | Invalidate/clear current session |

**Migration note:** Keep `/api/market/session` and `/api/market/clienttoken` as deprecated aliases initially to avoid breaking the existing Flutter app during development.

## New Dependencies

### Backend
| Package | Purpose | Confidence |
|---------|---------|------------|
| `steam-session` | QR auth, credential auth, Steam Guard, `getWebCookies()` | MEDIUM (training data only, verify version/API on npm) |
| `uuid` or `crypto.randomUUID()` | Nonce generation for pending sessions | HIGH (Node.js built-in) |

`steam-session` by DoctorMcKay is the de facto Node.js library for Steam's new authentication system (replacing the deprecated `steam-user` auth). It provides `LoginSession` with `startWithQR()`, `startWithCredentials()`, `submitSteamGuardCode()`, and `getWebCookies()`. The library handles RSA key fetching, password encryption, and token exchange internally.

**Confidence note:** The `steam-session` API details are from training data. Before implementation, verify the current API surface by checking `npm info steam-session` and the package README. The core pattern (LoginSession + startWithQR/startWithCredentials + getWebCookies) has been stable since the package was created in response to Steam's auth overhaul.

### Frontend
| Package | Purpose | Confidence |
|---------|---------|------------|
| `qr_flutter` | Render QR code from challenge URL | HIGH (well-known Flutter package) |

## Scalability Considerations

| Concern | Current (1 user) | At 100 users | At 10K users |
|---------|-------------------|--------------|--------------|
| Pending session memory | Negligible | ~100 LoginSession objects, fine | Could accumulate; add TTL cleanup (already proposed) |
| Session validation requests to Steam | On-demand | Throttle with 30-min cache | Add validation batching or increase cache duration |
| Bulk sell blocking | 75s max | Many concurrent 75s requests | Need job queue (Bull/BullMQ) + async processing |
| DB session queries | Trivial | Add index on users.id (PK, already indexed) | No change needed |

For the current single-user + small-scale use case, all components can be synchronous and in-memory. The architecture is designed so that async/queue-based processing can be added later without restructuring.

## Sources

- Codebase analysis: `backend/src/routes/market.ts`, `backend/src/services/market.ts`, `backend/src/services/transactions.ts`, `backend/src/db/migrate.ts`, `lib/features/settings/settings_screen.dart`, `lib/features/settings/steam_session_provider.dart`
- `steam-session` npm package: Training data (MEDIUM confidence — verify current API before implementation)
- Steam authentication architecture: Training data based on Steam's 2023 auth system overhaul (HIGH confidence on general pattern, MEDIUM on specific API details)

---

*Architecture research: 2026-03-08*
