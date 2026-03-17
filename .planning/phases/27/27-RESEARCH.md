# Phase 27: Tier 1 — Zero Friction Entry - Research

**Researched:** 2026-03-17
**Domain:** Flutter auth flow, GoRouter navigation, Steam public API, Riverpod session state
**Confidence:** HIGH

## Summary

The current auth flow already has most of the infrastructure needed for zero-friction entry. The router (`lib/core/router.dart`) already routes authenticated users to `/portfolio` and does NOT force a session screen (lines 63-71 contain the comment "Session reauth is NOT forced"). The login screen (`lib/features/auth/login_screen.dart`) currently shows 3 tabs: Full Access (client token), Browser (OpenID), and QR Code. The backend `fetchSteamInventory` already supports fetching without session cookies -- it just skips context 16 (trade-banned items) and fetches context 2 (public inventory) only.

The main work is: (1) simplify the login screen to a single "Continue with Steam" CTA, (2) ensure the OpenID callback deep link lands on `/portfolio` not `/session`, (3) verify inventory refresh works gracefully without session cookies, and (4) confirm portfolio/prices/alerts providers don't block on session status.

**Primary recommendation:** This phase is mostly a Flutter UI simplification + removing unnecessary session gates. The backend already handles sessionless inventory fetching correctly.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTHUX-01 | Login screen shows only "Continue with Steam" button | Current login screen has 3 tabs (Full Access, Browser, QR). Need to replace with single CTA using existing `SteamAuthService.openSteamLogin()` + polling flow |
| AUTHUX-02 | After OpenID login, user goes directly to app (Portfolio) -- NO session screen | Router already routes to `/portfolio` after auth. Deep link handler (`_handleAuthToken` in main.dart:145) sets user state, which triggers router redirect to `/portfolio`. Session screen is NOT in the mandatory flow already. Verify no edge case sends user to `/session`. |
| AUTHUX-03 | Inventory shows read-only items via public Steam API without session | Backend `fetchSteamInventory` (steam.ts:180) already accepts optional cookies. When `undefined`, fetches context 2 only (public). `inventory/refresh` (inventory.ts:146-149) already passes `undefined` when no session exists. |
| AUTHUX-04 | Portfolio, prices, alerts all work without Steam session | Portfolio (`/portfolio/summary`) uses DB data + price_history -- no session needed. Alerts (`/alerts`) are JWT-only. Prices are fetched by background cron, not per-user session. All verified as session-independent. |
</phase_requirements>

## Current Auth Flow — Detailed Code Map

### 1. Login Screen (`lib/features/auth/login_screen.dart`)

**Current state:** 3-tab PageView (lines 106-121):
- Tab 0: `ClientTokenAuthTab` — 2-step token paste flow (most complex)
- Tab 1: Browser tab — OpenID via Safari (`_buildBrowserTab`, inline at line 171)
- Tab 2: `QrAuthTab` — QR code scan with Steam Guard

**What "Continue with Steam" means:**
- Uses `SteamAuthService.openSteamLogin()` (steam_auth_service.dart:74-95)
- Builds Steam OpenID URL, opens in external browser
- Callback: `${apiBaseUrl}/auth/steam/callback` which creates JWT and redirects via Universal Link
- App receives deep link `skinkeeper://auth?token=XXX` or `https://api.skinkeeper.store/auth/callback?token=XXX`
- Deep link handler in `main.dart:145` saves token, fetches `/auth/me`, sets `authStateProvider`

**Polling fallback (already exists):**
- Backend has `pendingLogins` map (auth.ts:28) and `/auth/steam/poll/:nonce` endpoint (auth.ts:37)
- But the current OpenID flow does NOT use polling — it relies on deep link/Universal Link callback
- For robustness, could add a "Continue" polling button (like the iOS Safari feedback pattern)

### 2. Post-Login Navigation (`lib/core/router.dart`)

**Lines 41-71 — redirect logic:**
```
1. Auth loading → /loading
2. User null → /login
3. User exists + on /login or /loading → /portfolio
4. No forced session redirect (comment on line 68-69)
```

**Key finding:** The router ALREADY does the right thing. After `authStateProvider` has a user, it redirects to `/portfolio`. There is no forced `/session` route.

**The `/session` route (line 77):** `GoRoute(path: '/session', builder: (_, _) => const LoginScreen())` — it reuses LoginScreen. This is only pushed by `_showSessionExpiredDialog` in main.dart:185-194, which fires on `SESSION_EXPIRED` API errors (not on login).

### 3. Deep Link Auth Flow (`lib/main.dart:118-166`)

```
_handleDeepLink → checks for skinkeeper://auth?token=XXX
→ _handleAuthToken(token)
  → api.saveToken(token)
  → api.get('/auth/me')
  → authStateProvider.setUser(user)
  → invalidate inventoryProvider, portfolioProvider
  → Router redirect fires → lands on /portfolio
```

**This flow already achieves AUTHUX-02.** No session screen is involved.

### 4. Session Status Provider (`lib/features/auth/session_provider.dart`)

- `sessionStatusProvider` fetches `/session/status`
- Returns `SessionStatus` with `status`, `needsReauth`, `refreshTokenExpired`
- Watched by: trades_screen.dart, transactions_screen.dart, sell_bottom_sheet.dart, router.dart
- Router only uses it for `refreshListenable` (notifies on needsReauth change), but does NOT redirect based on it

### 5. Backend Inventory Without Session

**`fetchSteamInventory` (backend/src/services/steam.ts:180-210):**
```typescript
export async function fetchSteamInventory(
  steamId: string,
  cookies?: { steamLoginSecure: string; sessionId: string }
): Promise<ParsedInventoryItem[]> {
  // When cookies undefined: fetches context 2 only (public)
  // When cookies present: fetches context 2 + context 16 (trade-banned)
  const contexts = cookies ? ["2", "16"] : ["2"];
  // ...
}
```

**`/api/inventory/refresh` (backend/src/routes/inventory.ts:144-149):**
```typescript
const session = await SteamSessionService.getSession(account.id);
const items = await fetchSteamInventory(
  account.steam_id,
  session ? { steamLoginSecure: session.steamLoginSecure, sessionId: session.sessionId } : undefined
);
```

**Already handles the no-session case.** Items from context 2 (regular inventory) are public and visible. Only context 16 (trade-banned/cooldown items) requires cookies.

### 6. Providers That Are Session-Independent (AUTHUX-04 verified)

| Provider | Backend Route | Session Required? | Notes |
|----------|---------------|-------------------|-------|
| `portfolioProvider` | `/portfolio/summary` | NO — uses DB data + prices | JWT only (authMiddleware) |
| `alertsProvider` | `/alerts` | NO | JWT only |
| `inventoryProvider` | `/inventory` | NO — reads from DB | JWT only; DB populated by refresh |
| `inventoryProvider.refresh()` | `/inventory/refresh` | NO — gracefully degrades | Skips context 16 without session |
| Prices (cron) | N/A | NO | Background job, no user session |

### 7. Providers That DO Need Session (for reference — Phase 28 scope)

| Provider/Action | Why Session Needed |
|-----------------|-------------------|
| Sell (`/market/sell`) | Posts to Steam Market API |
| Quick Sell (`/market/quick-sell`) | Same |
| Trades accept/decline/cancel | Steam trade API |
| Trade send | Steam trade API |
| Transaction sync (`/transactions/sync`) | Scrapes Steam market history HTML |

## Architecture Patterns

### What Needs to Change

#### Login Screen Redesign (AUTHUX-01)
- Replace 3-tab PageView with single "Continue with Steam" button
- Use the existing `SteamAuthService.openSteamLogin()` + polling pattern
- Polling already exists: backend has `/auth/steam/poll/:nonce`, but the OpenID flow uses a `nonce` query param appended to `openid.return_to`
- Need to: generate nonce client-side, append to return URL, then poll `/auth/steam/poll/:nonce`
- Alternative: Keep current Universal Link flow (works today), just simplify the UI

**Recommended approach:** Use the existing browser OpenID flow with Universal Link callback (already works). Simplify UI to one big CTA. Add a "Continue" button for cases where Universal Link doesn't fire (existing pattern from iOS feedback).

#### Post-Login Route (AUTHUX-02)
- **Already works.** The deep link handler saves JWT, sets auth state, router redirects to `/portfolio`.
- Only change: Remove the `/session` route definition or make it not reachable from login flow. Currently `/session` maps to `LoginScreen()` anyway (router.dart:77), so it's a no-op.
- The `_showSessionExpiredDialog` (main.dart:185) pushes `/session` — this should remain for Phase 28 (intent-based unlock).

#### Inventory Public Fetch (AUTHUX-03)
- **Backend already handles this.** `fetchSteamInventory` with no cookies fetches public inventory.
- One gap: After OpenID login, the backend creates user + steam_account but does NOT trigger an inventory refresh. The Flutter client calls `/inventory/refresh` when `inventoryProvider` builds (via `_refreshInBackground`).
- Since the user has no session cookies at this point, the refresh will fetch public inventory only — which is correct for read-only view.
- **Potential issue:** If the user's Steam inventory is private, public fetch returns 0 items. This is a Steam setting, not our bug. Should show a helpful message.

#### Portfolio/Prices/Alerts (AUTHUX-04)
- **Already works.** All use JWT auth only, no session cookies needed.
- Portfolio reads from `inventory_items` DB table (populated by refresh) + `price_history` (populated by cron).
- One timing issue: On first login, inventory hasn't been refreshed yet, so portfolio shows 0 value until first refresh completes. The existing cache-first + background refresh pattern handles this gracefully.

### Recommended Project Structure Changes

```
lib/features/auth/
├── login_screen.dart         # REWRITE — single CTA "Continue with Steam"
├── steam_auth_service.dart   # MINOR — add nonce to OpenID URL for polling
├── steam_session_screen.dart # KEEP — will be used by Phase 28 gate screen
├── session_provider.dart     # NO CHANGE
└── widgets/
    ├── qr_auth_tab.dart            # KEEP (Phase 28 fallback)
    ├── clienttoken_auth_tab.dart   # KEEP (Phase 28 fallback)
    ├── credentials_auth_tab.dart   # KEEP (Phase 28 fallback)
    └── session_status_widget.dart  # NO CHANGE
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenID authentication | Custom OpenID client | Existing `SteamAuthService.openSteamLogin()` + backend verification | Already working, battle-tested |
| Deep link handling | Custom URL scheme parser | Existing `app_links` + `_handleDeepLink` in main.dart | Already handles auth callback correctly |
| Session-less inventory | New API endpoint | Existing `/inventory/refresh` with optional session | Already passes `undefined` when no session |
| Polling for auth result | Custom WebSocket | Existing `/auth/steam/poll/:nonce` pattern | Already implemented in backend |

## Common Pitfalls

### Pitfall 1: Private Steam Inventory
**What goes wrong:** User logs in via OpenID, inventory refresh returns 0 items because their Steam profile/inventory is set to private.
**Why it happens:** Public Steam inventory API returns empty for private profiles.
**How to avoid:** Show a clear message: "Your Steam inventory is set to private. Make it public in Steam settings to see your items." Include a link to Steam privacy settings.
**Warning signs:** `items.length === 0` after refresh with a valid steam_id.

### Pitfall 2: Universal Link Not Firing on iOS
**What goes wrong:** After Steam login in Safari, the Universal Link doesn't open the app — user sees the HTML fallback page.
**Why it happens:** iOS Universal Links are fragile (same-domain restrictions, user must have app installed, etc).
**How to avoid:** Already handled — the callback page has `skinkeeper://auth` custom scheme fallback + "Tap here to open SkinKeeper" link. Additionally, add a polling-based fallback so the app detects login even without deep link.
**Warning signs:** User stays in Safari after login.

### Pitfall 3: Race Between Auth State and Inventory Fetch
**What goes wrong:** `inventoryProvider` builds before auth state is fully set, causing 401.
**Why it happens:** Provider invalidation + router redirect + API call happen near-simultaneously.
**How to avoid:** `inventoryProvider` is inside a `ShellRoute` that only renders when user is authenticated (router redirect ensures this). The auth interceptor in `api_client.dart` adds JWT from secure storage, not from auth state.
**Warning signs:** 401 errors on first inventory fetch.

### Pitfall 4: Removing Session Screen Breaks Existing Users
**What goes wrong:** Users who currently rely on session screen for re-auth can't find it.
**Why it happens:** Phase 27 removes session screen from mandatory flow, but users still need it for session features.
**How to avoid:** Don't remove the session screen entirely — just remove it from the login flow. It should remain accessible from settings or when sell/trade actions require it (Phase 28).

## Code Examples

### Current OpenID Flow (Already Working)
```dart
// lib/features/auth/steam_auth_service.dart:74-95
Future<void> openSteamLogin() async {
  final returnTo = '${AppConstants.apiBaseUrl}/auth/steam/callback';
  // ... builds OpenID params ...
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}
```

### Current Router Redirect (Already Correct)
```dart
// lib/core/router.dart:41-71
redirect: (context, state) {
  final auth = ref.read(authStateProvider);
  final user = auth.valueOrNull;
  if (user == null) return '/login';  // Not logged in → login
  if (isOnLogin || isOnLoading) return '/portfolio';  // Logged in → portfolio
  // Session reauth is NOT forced
  return null;
}
```

### Backend Inventory Without Session (Already Works)
```typescript
// backend/src/routes/inventory.ts:144-149
const session = await SteamSessionService.getSession(account.id);
const items = await fetchSteamInventory(
  account.steam_id,
  session ? { steamLoginSecure: session.steamLoginSecure, sessionId: session.sessionId } : undefined
);
// When session is null, fetchSteamInventory fetches context 2 only (public)
```

## What Actually Needs to Change

### Flutter Changes (Plan 27-02)

1. **`lib/features/auth/login_screen.dart`** — Complete rewrite
   - Remove 3-tab PageView
   - Single screen: app branding + "Continue with Steam" button
   - Uses existing `SteamAuthService.openSteamLogin()` with nonce-based polling
   - Optional: "Having trouble?" expandable with manual token paste

2. **`lib/features/auth/steam_auth_service.dart`** — Minor addition
   - Add nonce generation to `openSteamLogin()` so we can poll
   - Add `pollSteamLogin(nonce)` method that calls `/auth/steam/poll/:nonce`
   - Or: rely entirely on Universal Link (already works) + "Continue" button as fallback

3. **`lib/core/router.dart`** — Minimal change
   - `/session` route can stay (used by session expired dialog, will be gate in Phase 28)
   - No redirect changes needed — already correct

4. **`lib/main.dart`** — No change needed
   - `_showSessionExpiredDialog` stays — will evolve to gate in Phase 28
   - Deep link handling already routes to portfolio after auth

### Backend Changes (Plan 27-01)

1. **Verify `/inventory/refresh` without session** — Already works, just needs testing
2. **Ensure OpenID callback supports nonce for polling** — Already implemented (auth.ts:117-123)
3. **No new endpoints needed**

### Files NOT to Change
- `steam_session_screen.dart` — Will become the gate screen in Phase 28
- `qr_auth_tab.dart`, `clienttoken_auth_tab.dart` — Fallbacks for Phase 28
- `session_provider.dart` — Still needed for session status checks
- Backend session routes — Untouched for this phase

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Flutter test + backend jest |
| Config file | `backend/jest.config.ts`, `pubspec.yaml` |
| Quick run command | `cd backend && npx jest --testPathPattern=auth` |
| Full suite command | `cd backend && npx jest` |

### Phase Requirements Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTHUX-01 | Login screen shows single CTA | manual-only | Visual verification | N/A |
| AUTHUX-02 | Post-login routes to portfolio | unit | `flutter test test/router_test.dart` | Wave 0 |
| AUTHUX-03 | Inventory loads without session | integration | `cd backend && npx jest --testPathPattern=inventory` | Partial |
| AUTHUX-04 | Portfolio/alerts work without session | integration | `cd backend && npx jest --testPathPattern="portfolio\|alerts"` | Partial |

### Wave 0 Gaps
- None critical — existing test infrastructure covers backend routes. Flutter login screen rewrite is primarily UI and should be manually verified.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `lib/core/router.dart` — router redirect logic
- Codebase inspection: `lib/features/auth/login_screen.dart` — current login UI
- Codebase inspection: `lib/main.dart` — deep link handler
- Codebase inspection: `backend/src/routes/auth.ts` — OpenID callback, polling
- Codebase inspection: `backend/src/routes/inventory.ts` — session-optional refresh
- Codebase inspection: `backend/src/services/steam.ts` — `fetchSteamInventory` with optional cookies

## Metadata

**Confidence breakdown:**
- Auth flow understanding: HIGH — full code path traced from login to portfolio
- Session-less inventory: HIGH — code explicitly handles undefined cookies
- Portfolio/alerts independence: HIGH — all use JWT auth only
- Login screen redesign: HIGH — straightforward UI simplification using existing services

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable codebase, no external deps changing)
