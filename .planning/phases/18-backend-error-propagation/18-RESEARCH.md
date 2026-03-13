# Phase 18: Backend Error Propagation - Research

**Researched:** 2026-03-13
**Domain:** TypeScript error hierarchy, Express error middleware, Flutter Dio error handling
**Confidence:** HIGH

---

## Summary

The full infrastructure for typed error propagation already exists in this codebase. `utils/errors.ts` defines a complete `AppError` hierarchy including `SessionExpiredError` (401), `RateLimitError` (429), and `SteamError` (502). The `errorHandler` middleware correctly maps `AppError` subclasses to HTTP status codes. `SteamClient.ts` exports `steamRequest()` with retry/backoff. The Flutter `ApiClient` already intercepts 401+SESSION_EXPIRED and fires `sessionExpiredController`.

The gap is entirely on the **throwing side**: `steamSession.ts` and `tradeOffers.ts` still throw raw `Error` objects with a `.code` property tacked on via `(error as any).code = "SESSION_EXPIRED"`, bypassing the typed hierarchy. Routes then manually check `err?.code === "SESSION_EXPIRED"` and respond with inline `res.status(401).json(...)` — duplicating the errorHandler's job. Additionally, `steamSession.ts` still uses raw `axios` calls instead of `steamRequest()`, so retry/backoff is inactive for session validation and refresh calls.

**Primary recommendation:** Replace all `(err as any).code = "SESSION_EXPIRED"` throw sites with `throw new SessionExpiredError(...)`, replace raw axios calls in `steamSession.ts` with `steamRequest()`, and remove the manual `err?.code` checks from routes (let errorHandler handle everything via `next(err)`).

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REFAC-03-gap | `steamSession.ts` uses `steamRequest()` from SteamClient — retry/backoff active on all Steam HTTP calls | SteamClient.ts has full steamRequest() API; steamSession.ts currently uses raw axios for extractSessionId, validateSession, and refreshSession |
| REFAC-05-gap | Typed error hierarchy wired to production services — session expiry returns 401 not 500; Steam errors typed and propagated correctly | AppError hierarchy exists in errors.ts; errorHandler maps AppError to status codes; services still throw raw Error with .code property; routes manually check err.code instead of using next(err) |
</phase_requirements>

---

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `utils/errors.ts` | local | AppError hierarchy | Already written: SessionExpiredError, RateLimitError, SteamError, etc. |
| `middleware/errorHandler.ts` | local | Maps AppError to HTTP | Already registered in app; handles all AppError subclasses |
| `utils/SteamClient.ts` | local | steamRequest() with retry/backoff | Already written and tested; SteamSessionError/SteamRequestError are its own error types |
| `dio` (Flutter) | in pubspec | HTTP client with interceptors | ApiClient interceptor already handles 401+SESSION_EXPIRED code |

### The Dual Error Hierarchy Problem (Critical Finding)

There are **two separate error hierarchies** that must be reconciled:

**`utils/errors.ts` hierarchy (AppError-based — routes/errorHandler use this):**
```
AppError (base)
  SessionExpiredError  → status 401, code "SESSION_EXPIRED"
  RateLimitError       → status 429, code "RATE_LIMITED"
  SteamError           → status 502, code "STEAM_ERROR"
  ValidationError      → status 400
  AuthenticationError  → status 401, code "AUTH_ERROR"
```

**`utils/SteamClient.ts` hierarchy (plain Error — NOT AppError subclasses):**
```
SteamSessionError  → has .code = "SESSION_EXPIRED" but NOT extends AppError
SteamRequestError  → has .httpStatus but NOT extends AppError
```

The resolution strategy: `steamSession.ts` and `tradeOffers.ts` should throw `SessionExpiredError` (from `errors.ts`). The `SteamClient.ts` errors can remain as-is (internal to SteamClient). Services that call `steamRequest()` must catch `SteamSessionError` and re-throw as `SessionExpiredError`.

---

## Architecture Patterns

### Pattern 1: Service throws typed AppError, route uses next(err)

**Current (broken) pattern in routes:**
```typescript
// routes/trades.ts — current
try {
  await createAndSendOffer(...);
} catch (err: any) {
  if (err?.code === "SESSION_EXPIRED") {
    res.status(401).json({ error: "Session expired", code: "SESSION_EXPIRED" });
    return;
  }
  res.status(500).json({ error: "Failed to create trade" });
}
```

**Target pattern (after this phase):**
```typescript
// routes/trades.ts — target
try {
  await createAndSendOffer(...);
} catch (err) {
  next(err);  // errorHandler takes over — SessionExpiredError → 401, others → 500
}
```

**What enables this:** Services throw `SessionExpiredError` (which extends `AppError`), so `errorHandler` catches it and emits the correct 401+SESSION_EXPIRED response.

### Pattern 2: Service throws SessionExpiredError instead of raw Error

**Current (broken) in `steamSession.ts`:**
```typescript
// steamSession.ts line 624-626 — current
const error = new Error("Steam session expired or not configured. Please re-authenticate.");
(error as any).code = "SESSION_EXPIRED";
throw error;
```

**Target:**
```typescript
import { SessionExpiredError } from "../utils/errors.js";

throw new SessionExpiredError("Steam session expired or not configured. Please re-authenticate.");
```

### Pattern 3: steamSession.ts uses steamRequest() for Steam HTTP calls

**Current:** `validateSession()` and `extractSessionId()` use raw `axios.get()` directly. Session refresh in `refreshSession()` uses `steam-session` library (not axios — keep as-is).

**Target:** Replace the three raw axios calls in `steamSession.ts` with `steamRequest()`:
- `extractSessionId()` — GET steamcommunity.com with steamLoginSecure cookie
- `validateSession()` — GET steamcommunity.com/my/ with maxRedirects:0

Note: `extractSessionId` and `validateSession` do NOT need session-expiry error propagation (they return null/false on failure), but wrapping in steamRequest() adds retry/backoff and metrics tracking.

The `steamRequest()` signature for these calls:
```typescript
import { steamRequest } from "../utils/SteamClient.js";

// extractSessionId — no cookies needed, just steamLoginSecure in header
const resp = await steamRequest<string>({
  url: "https://steamcommunity.com/",
  cookies: { steamLoginSecure, sessionId: "" },
  followRedirects: true,
  validateStatus: () => true,
});

// validateSession — check redirect to /login
const resp = await steamRequest({
  url: "https://steamcommunity.com/my/",
  cookies: { steamLoginSecure: session.steamLoginSecure, sessionId: session.sessionId },
  followRedirects: false,
  validateStatus: () => true,
});
```

### Pattern 4: tradeOffers.ts — replace raw Error throws with typed errors

`tradeOffers.ts` has 11 throw sites using `(err as any).code = "SESSION_EXPIRED"`. Each must become `throw new SessionExpiredError(...)`. The `isSessionExpiredError()` helper function at line 97 also needs updating to check `instanceof SessionExpiredError` in addition to `.code` check (to catch errors from steamRequest via the SteamClient error type):

```typescript
function isSessionExpiredError(err: unknown): boolean {
  if (err instanceof SessionExpiredError) return true;
  // Also handle SteamClient's SteamSessionError (not an AppError subclass)
  if (err instanceof SteamSessionError) return true;
  // Fallback: duck-type check for legacy code
  return (err as any)?.code === "SESSION_EXPIRED";
}
```

### Pattern 5: Flutter end-to-end — already works, needs test

The Flutter side is already correctly implemented:
- `ApiClient` interceptor at `lib/core/api_client.dart` line 93: fires `sessionExpiredController` when response is 401 with `code == 'SESSION_EXPIRED'`
- `isSessionExpired()` helper checks statusCode 401 + data.code == 'SESSION_EXPIRED'
- The gap is that this path was never exercised because backend was returning 500 instead of 401

**Test needed:** An integration test asserting that when `steamSession.ts` throws `SessionExpiredError`, the route returns `{ error: "...", code: "SESSION_EXPIRED" }` with status 401 (not 500).

### Recommended Project Structure (unchanged)
```
backend/src/
├── utils/
│   ├── errors.ts         # AppError hierarchy — SessionExpiredError, RateLimitError, SteamError
│   └── SteamClient.ts    # steamRequest() — SteamSessionError, SteamRequestError (internal)
├── middleware/
│   └── errorHandler.ts   # Maps AppError subclasses to HTTP responses
├── services/
│   ├── steamSession.ts   # PHASE 18: throw SessionExpiredError, use steamRequest()
│   └── tradeOffers.ts    # PHASE 18: throw SessionExpiredError (11 sites)
└── routes/
    ├── trades.ts         # PHASE 18: remove manual err.code checks, use next(err)
    └── market.ts         # PHASE 18: remove manual err.code checks, use next(err)
```

### Anti-Patterns to Avoid

- **Raw Error + duck-typed code:** `(error as any).code = "SESSION_EXPIRED"` bypasses instanceof checks and the errorHandler
- **Inline res.status in catch blocks:** `res.status(401).json(...)` inside route catch blocks duplicates errorHandler logic and creates inconsistent response shapes
- **Catching typed errors and re-throwing as untyped:** Don't catch `SessionExpiredError` and `throw new Error(err.message)` — that erases the type
- **Making SteamClient errors extend AppError:** Keep the dual hierarchy — SteamClient errors are internal to SteamClient; services translate them to AppError subclasses

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP status mapping | Custom status switch/case per route | `errorHandler.ts` + `AppError` | Already built, maps 401/429/502 correctly |
| Retry/backoff on Steam HTTP | Custom retry loops in steamSession.ts | `steamRequest()` | Already built, tested, handles 429/5xx with exponential backoff |
| 401 detection in Flutter | Custom response.statusCode checks | `isSessionExpired()` helper + `sessionExpiredController` stream | Already built in ApiClient interceptor |

---

## Common Pitfalls

### Pitfall 1: SteamClient errors are not AppError subclasses
**What goes wrong:** `errorHandler` only catches `err instanceof AppError`. `SteamSessionError` and `SteamRequestError` from SteamClient.ts extend plain `Error`, so they'd fall through to the generic 500 handler.
**Why it happens:** SteamClient was written before the AppError hierarchy, or intentionally kept internal.
**How to avoid:** Services that call `steamRequest()` must catch `SteamSessionError` and re-throw as `SessionExpiredError`. Catch `SteamRequestError` and re-throw as `SteamError` (or `RateLimitError` if httpStatus is 429).
**Warning signs:** `errorHandler` logs `[UnhandledError]` for Steam-related errors in production.

### Pitfall 2: isSessionExpiredError() not updated
**What goes wrong:** After changing throws to `SessionExpiredError`, the `isSessionExpiredError()` duck-type check `err?.code === "SESSION_EXPIRED"` still works (SessionExpiredError.code === "SESSION_EXPIRED"), BUT `SteamSessionError` from `steamRequest()` has `.code = "SESSION_EXPIRED"` as a readonly property that satisfies the duck-type check already. So the check works by accident.
**How to avoid:** Still update to use `instanceof` checks for type safety and to be explicit about intent.

### Pitfall 3: Routes with multiple manual err.code checks
**What goes wrong:** After services throw typed errors, routes still have `if (err?.code === "SESSION_EXPIRED") { res.status(401)... }` guards. These still work but create duplicate response-building logic that diverges from errorHandler's response shape.
**How to avoid:** Remove all manual `err.code` checks from routes. Let `next(err)` propagate to errorHandler. The errorHandler already emits `{ error: message, code: code }`.

### Pitfall 4: tradeOffers.ts cancel/accept/decline with retry logic
**What goes wrong:** The retry-on-session-error logic in `tradeOffers.ts` (`isSessionExpiredError(err)` → force refresh → retry) must still work after the error type change.
**How to avoid:** Update `isSessionExpiredError()` to check both `instanceof SessionExpiredError` and `instanceof SteamSessionError`. The retry logic itself stays intact.

### Pitfall 5: steamSession.ts refreshSession uses steam-session library, not axios
**What goes wrong:** `refreshSession()` uses `loginSession.getWebCookies()` from the `steam-session` npm package — not a raw axios call. This cannot use `steamRequest()`.
**How to avoid:** Only replace the two raw axios calls (`extractSessionId`, `validateSession`). Leave the `steam-session` library calls alone.

---

## Code Examples

### Throwing SessionExpiredError (from errors.ts)
```typescript
// Source: backend/src/utils/errors.ts
import { SessionExpiredError, SteamError, RateLimitError } from "../utils/errors.js";
import { SteamSessionError, SteamRequestError } from "../utils/SteamClient.js";

// In steamSession.ts:
throw new SessionExpiredError("Steam session expired or not configured. Please re-authenticate.");

// In a service that calls steamRequest() — translate SteamClient errors:
try {
  await steamRequest({ url: "..." });
} catch (err) {
  if (err instanceof SteamSessionError) throw new SessionExpiredError(err.message);
  if (err instanceof SteamRequestError) {
    if (err.httpStatus === 429) throw new RateLimitError("Steam rate limited");
    throw new SteamError(err.message, err.httpStatus);
  }
  throw err;
}
```

### Route after cleanup — next(err) only
```typescript
// Source: backend/src/routes/trades.ts pattern
router.post("/", authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const offer = await createAndSendOffer(req.userId!, req.body);
    res.status(201).json(offer);
  } catch (err) {
    next(err);
  }
});
```

### errorHandler response shape (unchanged)
```typescript
// Source: backend/src/middleware/errorHandler.ts
// When SessionExpiredError thrown:
// → HTTP 401 { "error": "Steam session expired", "code": "SESSION_EXPIRED" }
// When SteamError thrown:
// → HTTP 502 { "error": "...", "code": "STEAM_ERROR" }
// When unknown Error thrown:
// → HTTP 500 { "error": "..." }  (no code field)
```

### Flutter isSessionExpired helper (unchanged — already correct)
```dart
// Source: lib/core/api_client.dart
bool isSessionExpired(dynamic e) {
  if (e is DioException && e.response?.statusCode == 401) {
    final data = e.response?.data;
    if (data is Map && data['code'] == 'SESSION_EXPIRED') return true;
  }
  return false;
}
```

### steamRequest() call replacing raw axios (pattern)
```typescript
// Source: backend/src/utils/SteamClient.ts — steamRequest() signature
const resp = await steamRequest({
  url: "https://steamcommunity.com/my/",
  cookies: {
    steamLoginSecure: session.steamLoginSecure,
    sessionId: session.sessionId,
  },
  followRedirects: false,
  validateStatus: () => true,
  maxRetries: 1,
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global try/catch with inline res.status | AppError + errorHandler middleware | Phase 14 (refactoring) | Routes should use next(err); most still don't |
| Raw axios calls in services | steamRequest() with retry/backoff | Phase 14 (refactoring) | steamSession.ts not yet migrated |
| Duck-typed `.code` errors | SessionExpiredError class | Phase 14 | Classes defined but not thrown by services |

**Deprecated/outdated:**
- `(error as any).code = "SESSION_EXPIRED"`: replaced by `throw new SessionExpiredError()`
- Inline `if (err?.code === "SESSION_EXPIRED") res.status(401).json(...)` in routes: replaced by `next(err)` + errorHandler

---

## Open Questions

1. **Should SteamClient errors extend AppError?**
   - What we know: They currently don't. errorHandler won't catch them.
   - What's unclear: Is this intentional? SteamClient was designed as a low-level utility; whether it should depend on app-level error types is a design choice.
   - Recommendation: Keep the two-level translation pattern (service catches SteamClient errors, re-throws as AppError subclasses). Do NOT make SteamClient depend on errors.ts to avoid coupling.

2. **tradeOffers.ts cancel function — SESSION_EXPIRED in cancel path**
   - What we know: cancel uses the SENDING account's session (not receiving). `cancelOffer()` has the same retry-on-session-error pattern.
   - What's unclear: The `getValidSession(accountId, forceRefresh)` function in tradeOffers.ts also throws a raw Error with `.code = "SESSION_EXPIRED"`. This must also be updated.
   - Recommendation: Update `getValidSession()` to throw `SessionExpiredError` directly.

3. **Flutter end-to-end test approach**
   - What we know: No test currently verifies that a 401+SESSION_EXPIRED response from the backend triggers `sessionExpiredController` in Flutter.
   - Recommendation: Add a backend route integration test (vitest + supertest) that mocks `ensureValidSession` to throw `SessionExpiredError` and asserts the response is `{ status: 401, body: { code: "SESSION_EXPIRED" } }`. Flutter side can be tested with a unit test mocking Dio to return a 401+SESSION_EXPIRED response.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (backend), Flutter test (frontend) |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx vitest run src/routes/__tests__/trades.test.ts src/routes/__tests__/market.test.ts src/utils/__tests__/SteamClient.test.ts` |
| Full suite command | `cd backend && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REFAC-03-gap | steamSession.ts uses steamRequest() — retry/backoff active | unit | `cd backend && npx vitest run src/utils/__tests__/SteamClient.test.ts` | ✅ (existing) |
| REFAC-03-gap | extractSessionId() uses steamRequest() not raw axios | unit | `cd backend && npx vitest run src/services/__tests__/steamSession.test.ts` | ❌ Wave 0 |
| REFAC-05-gap | SessionExpiredError thrown → route returns 401+SESSION_EXPIRED | integration | `cd backend && npx vitest run src/routes/__tests__/trades.test.ts` | ✅ (extend existing) |
| REFAC-05-gap | SessionExpiredError thrown → route returns 401+SESSION_EXPIRED (market) | integration | `cd backend && npx vitest run src/routes/__tests__/market.test.ts` | ✅ (extend existing) |
| REFAC-05-gap | Flutter ApiClient fires sessionExpiredController on 401+SESSION_EXPIRED | unit | `flutter test test/core/api_client_test.dart` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx vitest run src/routes/__tests__/trades.test.ts src/routes/__tests__/market.test.ts`
- **Per wave merge:** `cd backend && npx vitest run`
- **Phase gate:** Full backend suite green + Flutter test for session expired path before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/services/__tests__/steamSession.test.ts` — unit tests for extractSessionId/validateSession using steamRequest() — covers REFAC-03-gap
- [ ] `test/core/api_client_test.dart` — Flutter unit test verifying sessionExpiredController fires on 401+SESSION_EXPIRED — covers REFAC-05-gap end-to-end

---

## Affected Files Inventory

The planner needs to know the exact set of files to change:

### Backend — throw site changes (REFAC-05-gap)
| File | Lines | Change |
|------|-------|--------|
| `backend/src/services/steamSession.ts` | 624-626 | 1 throw site: raw Error → SessionExpiredError |
| `backend/src/services/tradeOffers.ts` | 114-116, 419, 425, 445, 509, 514, 530, 1018, 1023, 1039 | 11 throw sites: (err as any).code → SessionExpiredError |
| `backend/src/services/tradeOffers.ts` | 97-99 | `isSessionExpiredError()` — add instanceof checks |
| `backend/src/services/tradeOffers.ts` | 114 | `getValidSession()` — throw SessionExpiredError not raw Error |

### Backend — route cleanup (REFAC-05-gap)
| File | Pattern to Remove | Replacement |
|------|------------------|-------------|
| `backend/src/routes/trades.ts` | `if (err?.code === "SESSION_EXPIRED") res.status(401).json(...)` (5 occurrences) | `next(err)` |
| `backend/src/routes/market.ts` | inline SESSION_EXPIRED responses (3 occurrences: lines 259-263, 406, 450) | `next(err)` |

### Backend — steamRequest migration (REFAC-03-gap)
| File | Function | Change |
|------|----------|--------|
| `backend/src/services/steamSession.ts` | `extractSessionId()` | Replace raw `axios.get()` with `steamRequest()` |
| `backend/src/services/steamSession.ts` | `validateSession()` | Replace raw `axios.get()` with `steamRequest()` |

### Flutter — no changes needed
The Flutter side (`lib/core/api_client.dart`) already correctly handles 401+SESSION_EXPIRED. Only a test needs to be added.

---

## Sources

### Primary (HIGH confidence)
- `backend/src/utils/errors.ts` — Full AppError hierarchy: SessionExpiredError, RateLimitError, SteamError, etc.
- `backend/src/middleware/errorHandler.ts` — errorHandler mapping AppError → HTTP status
- `backend/src/utils/SteamClient.ts` — steamRequest() API, SteamSessionError/SteamRequestError definitions
- `backend/src/services/steamSession.ts` — 1 throw site (line 624-626), raw axios calls in extractSessionId/validateSession
- `backend/src/services/tradeOffers.ts` — 11 throw sites (isSessionExpiredError duck-type, raw Error throws)
- `backend/src/routes/trades.ts` — 5 manual err.code === "SESSION_EXPIRED" inline response handlers
- `backend/src/routes/market.ts` — 3 manual SESSION_EXPIRED inline response handlers
- `lib/core/api_client.dart` — Flutter sessionExpiredController, isSessionExpired() helper

### Secondary (MEDIUM confidence)
- `backend/src/utils/__tests__/SteamClient.test.ts` — confirms steamRequest() is fully tested
- `backend/src/routes/__tests__/trades.test.ts` — confirms test infrastructure for routes tests exists

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all involved code read directly from source
- Architecture: HIGH — the exact throw sites, file locations, and line numbers are confirmed from source
- Pitfalls: HIGH — the dual hierarchy issue verified by reading both SteamClient.ts and errors.ts

**Research date:** 2026-03-13
**Valid until:** Stable — this is internal code, not an external library
