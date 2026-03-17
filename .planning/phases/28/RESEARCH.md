# Phase 28: Tier 2 -- Intent-Based Session Unlock - Research

**Researched:** 2026-03-17
**Domain:** Flutter session gating, Steam cookie acquisition, system browser auth, deep links
**Confidence:** HIGH

## Summary

Phase 28 adds a session gate that intercepts sell/trade/accept actions when no Steam session exists, showing a value-driven unlock screen. The CRITICAL architectural question -- how to get Steam session cookies from a single mobile device -- has a clear answer: the existing QR flow already works entirely on-device (backend generates QR, Steam Guard on the same phone scans it), and the existing client token flow (2-step browser + clipboard) already works. The "system browser" approach CANNOT directly capture Steam cookies -- it can only do OpenID (identity), not session cookies. So the real architecture is: the gate screen's PRIMARY action should be the simplified token flow (open Steam in browser, grab token), with QR as a secondary option, NOT a raw system browser login.

The existing codebase already has all the session checking infrastructure. `SellBottomSheet` already checks `sessionStatusProvider` and shows `_buildSessionWarning` with a "Connect Session" button. `TradesScreen` already checks `needsReauth` and shows a banner. The work is: (1) extract a reusable `SessionGate` pattern, (2) build the gate screen UI with value-driven copy, (3) wire it into sell/trade/accept intercept points, (4) add connect progress animation, and (5) auto-navigate back after connect.

**Primary recommendation:** The "system browser" approach in the roadmap is misleading -- a system browser can do OpenID login (which we already have) but CANNOT give us `steamLoginSecure` cookies. The gate should use the EXISTING client token flow (browser + clipboard) as primary, with QR as fallback, presented in a cleaner UI than the current session screen.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTHUX-05 | Sell/Trade/Accept actions trigger unlock gate | SellBottomSheet already checks sessionStatusProvider (line 157). TradesScreen checks needsReauth (line 52). CreateTradeScreen has NO session check -- needs one. Accept/decline in trades_screen.dart have no pre-check either. |
| AUTHUX-06 | Gate screen: value-driven copy, shows what unlocks | Current `_buildSessionWarning` in sell_bottom_sheet.dart is minimal (lines 230-280). Need full-screen gate with feature list similar to ClientTokenAuthTab's "This unlocks" section (line 213). |
| AUTHUX-07 | System browser (ASWebAuthenticationSession/Custom Tabs) is primary connect | **CRITICAL FINDING:** System browser CANNOT capture Steam session cookies. It can only do OpenID. The actual primary should be the refined client token flow (browser open + clipboard auto-detect) which DOES work. See detailed analysis below. |
| AUTHUX-08 | QR code and web token are fallbacks in "Having trouble?" | QR flow fully functional (qr_auth_tab.dart). Client token flow fully functional (clienttoken_auth_tab.dart). Both can be embedded as collapsible sections. |
| AUTHUX-09 | After connect, progress animation | Need new widget. Pattern: poll sessionStatusProvider, then show "Syncing items... Loading prices... Calculating profit..." steps. Similar to existing polling in QrAuthTab (line 36-61). |
| AUTHUX-10 | Auto-navigate back to action that triggered the gate | Need to pass a "returnTo" context through the gate. Can use GoRouter query params or a Riverpod state provider to track the originating action. |
| AUTHUX-14 | "I've Approved" manual trigger button | Simple button that calls `ref.read(sessionStatusProvider.notifier).refresh()` and checks result. Already exists conceptually in QR polling flow. |
| AUTHUX-15 | Deep link callback returns user to app after browser login | `skinkeeper://auth` deep link handler exists in main.dart. `flutter_web_auth_2` is already in pubspec.yaml. For the token flow, user returns via app lifecycle (already handled in ClientTokenAuthTab.didChangeAppLifecycleState). |
</phase_requirements>

## CRITICAL ANALYSIS: System Browser vs. Session Cookies

### The Core Problem

Steam session cookies (`steamLoginSecure`, `sessionId`) are what our backend needs to perform sell/trade/accept operations on behalf of the user. These are HTTP cookies set by `steamcommunity.com`.

**Why system browser CANNOT give us these cookies:**

1. **SFSafariViewController / ASWebAuthenticationSession** (iOS) and **Custom Tabs** (Android) are sandboxed browser views. The app cannot access cookies from these views.
2. These browser approaches work for **OAuth/OpenID** because the flow ends with a **redirect to a callback URL** carrying a token/code. The app intercepts the redirect.
3. For Steam SESSION cookies, there is no redirect-based flow. The cookies are set by Steam on `steamcommunity.com` and stay in the browser. Our backend cannot capture them from the browser.
4. Even `flutter_web_auth_2` (already in pubspec) only captures the **final redirect URL** -- it cannot extract cookies from the browser session.

### What Actually Works for Session Cookie Acquisition

| Method | How It Works | Single Device? | UX Friction |
|--------|-------------|----------------|-------------|
| **Client Token (clipboard)** | User opens `steamcommunity.com/chat/clientjstoken` in browser, copies JSON, returns to app, app reads clipboard | YES | Medium -- 2 taps + copy |
| **QR Code** | Backend generates QR, user scans with Steam Guard on same phone | YES (but awkward) | Medium -- requires camera switching |
| **Username/Password + Guard** | Backend logs in directly via steam-session library | YES | High -- typing credentials |
| **System browser OpenID** | Gets Steam identity, NOT session cookies | YES | Low -- but only for login, not session |

### Recommended Architecture for the Gate

The gate should reframe the **existing client token flow** with better UX:

1. **Primary CTA: "Connect to Steam"** -- Opens `steamcommunity.com/login/home/` in system browser (user logs in if not already). When user returns to app, we advance to step 2.
2. **Step 2: "Grab your session"** -- Opens `steamcommunity.com/chat/clientjstoken` in system browser. User copies the JSON (Select All + Copy). Returns to app.
3. **Auto-detect on return** -- App reads clipboard via `Clipboard.getData()`, parses token, submits automatically. This already works in `ClientTokenAuthTab.didChangeAppLifecycleState` (line 56-65).
4. **Fallback: QR Code** -- In "Having trouble?" collapsible section.
5. **"I've Approved" button** -- For manual trigger after any step.

This is essentially the EXISTING `ClientTokenAuthTab` flow, re-skinned as a gate with better copy.

### Why This is the Right Approach

The `ClientTokenAuthTab` (lines 1-657) already handles:
- `_openSteamLogin()` -- opens Steam login in browser (line 67-76)
- `_openTokenPage()` -- opens clientjstoken page (line 78-87)
- `didChangeAppLifecycleState` -- detects return from browser (line 56-65)
- `_tryAutoFillFromClipboard()` -- auto-reads clipboard, parses token (line 89-127)
- `_handleSubmit()` -- submits token to backend (line 157-170)
- Status banners: detecting, found, not_logged_in, not_found (line 389-453)

The backend `clientTokenAuthProvider` (session_provider.dart:328-380) submits the `steamLoginSecure` cookie value to `/session/token`, which saves the full session.

## Current Session Gating -- Code Map

### SellBottomSheet (`lib/features/inventory/widgets/sell_bottom_sheet.dart`)

**Lines 103-183:** The `build()` method watches `sessionStatusProvider`:
```
sessionStatus.when(
  data: (ss) {
    if (ss.status == 'valid' || ss.status == 'expiring') {
      return _buildSellContent(...);  // Show sell UI
    }
    return _buildSessionWarning(context);  // Show session required
  },
  loading: () => CircularProgressIndicator,
  error: (_, _) => _buildSessionWarning(context),
)
```

**`_buildSessionWarning` (lines 230-280):** Shows "Steam session required to sell items" with a "Connect Session" button that pops the sheet and navigates to `/session`.

**Key insight:** The gate is INSIDE the sell sheet. The sheet opens, THEN shows the warning. Phase 28 should intercept BEFORE the sheet opens (or replace the in-sheet warning with the new gate).

### TradesScreen (`lib/features/trades/trades_screen.dart`)

**Line 52:** Checks `needsReauth` from `sessionStatusProvider`.
**Lines 82-100:** Shows a banner "Steam session expired. Tap to reconnect" with `onTap: () => context.push('/session')`.

**Key insight:** This is a passive banner, not an action gate. Trade accept/decline buttons (lines 614, 637) have NO pre-check -- they just call `_accept()` / `_decline()` directly, which will fail with a backend error if no session.

### CreateTradeScreen (`lib/features/trades/create_trade_screen.dart`)

**No session check at all.** The screen loads friend lists and inventories, which require session cookies. If no session, the backend calls will fail with errors, but there's no pre-check or gate.

### Session Status Provider (`lib/features/auth/session_provider.dart`)

```dart
final sessionStatusProvider = AsyncNotifierProvider<SessionStatusNotifier, SessionStatus>(...);

class SessionStatus {
  final String status;          // 'valid' | 'expiring' | 'expired' | 'none'
  final String? activeAccountName;
  final bool needsReauth;       // true when session is expired/none
  final bool refreshTokenExpired;
  final String? refreshTokenExpiresAt;
}
```

**`needsReauth`** is the boolean gate signal. When `true`, user needs to re-authenticate their Steam session.

## Architecture Patterns

### Recommended: Function-Based Gate Check

Rather than a wrapper widget, use a function that intercepts actions:

```dart
/// Check session status. If no valid session, show gate and return false.
/// If session is valid, return true and let the action proceed.
Future<bool> requireSession(BuildContext context, WidgetRef ref) async {
  final status = ref.read(sessionStatusProvider).valueOrNull;
  if (status?.status == 'valid' || status?.status == 'expiring') {
    return true;  // Session valid, proceed
  }

  // Show gate screen and wait for result
  final connected = await Navigator.of(context).push<bool>(
    MaterialPageRoute(builder: (_) => const SessionGateScreen()),
  );
  return connected == true;
}
```

**Usage at intercept points:**
```dart
// In sell button handler:
if (!await requireSession(context, ref)) return;
_showSellSheet(context, items);

// In accept button handler:
if (!await requireSession(context, ref)) return;
await ref.read(tradesProvider.notifier).acceptOffer(offerId);
```

**Why function-based, not widget wrapper:**
- Sell actions come from buttons, not navigation
- The gate is modal/blocking, not a route guard
- Clean composition -- each intercept point adds one line
- Returns a boolean so the action can proceed or abort

### SessionGateScreen Structure

```
SessionGateScreen
  +-- Header: "Enable Full Access"
  +-- Feature list: "Market History, Trades, Profit & Loss"
  +-- Step 1: "Sign in to Steam" -> opens browser
  +-- Step 2: "Grab your session" -> opens clientjstoken
  +-- Auto-detect on return (clipboard)
  +-- Status indicator: "Waiting..." / "Found!" / "Connected!"
  +-- "Having trouble?" collapsible:
      +-- QR Code option
      +-- Manual paste option
  +-- Progress animation on success
  +-- Auto-pop with result=true
```

### Auto-Return After Connect

Two approaches to "return to the action that triggered the gate":

**Option A (recommended): Push gate, pop with result**
```dart
// Gate screen pops with `true` on success
Navigator.of(context).pop(true);

// Caller resumes the action:
final connected = await Navigator.push<bool>(...SessionGateScreen);
if (connected == true) { /* proceed with sell/trade */ }
```

**Option B: Riverpod state + listener**
Store `pendingAction` in a provider, listen for session change, execute. More complex, harder to debug.

Option A is simpler and matches the existing pattern (sell_bottom_sheet pops and then shows progress sheet).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| System browser auth | Custom WebView with cookie extraction | `url_launcher` with `LaunchMode.platformDefault` + clipboard flow | Cookie extraction from system browser is impossible on iOS/Android |
| QR code generation | Custom QR rendering | Existing `QrAuthTab` widget + backend `startQRSession` | Already tested, handles polling, expiry, error states |
| Clipboard auto-detection | Custom clipboard parser | Existing `_tryAutoFillFromClipboard` logic from ClientTokenAuthTab | Handles all edge cases: not_logged_in JSON, token formats, empty clipboard |
| Session polling | Custom timer logic | Existing `sessionStatusProvider.notifier.refresh()` | Single source of truth for session state |

## Common Pitfalls

### Pitfall 1: Thinking System Browser Captures Steam Cookies
**What goes wrong:** Implementing ASWebAuthenticationSession expecting to get `steamLoginSecure` cookie from the callback URL. The callback only gets the redirect URL, not cookies.
**Why it happens:** Confusion between OpenID flow (redirect with token) and session flow (cookies stored in browser).
**How to avoid:** Use the client token clipboard flow. The "system browser" part is just for signing into Steam, not for capturing cookies.
**Warning signs:** No `steamLoginSecure` value in the callback URL/parameters.

### Pitfall 2: Race Condition on App Resume + Clipboard Read
**What goes wrong:** User returns from browser but clipboard hasn't been updated yet (iOS sometimes delays clipboard access).
**Why it happens:** `didChangeAppLifecycleState(resumed)` fires before clipboard is ready.
**How to avoid:** Add a small delay (500ms) before reading clipboard, as ClientTokenAuthTab already does implicitly via setState + async flow. Also provide manual paste fallback.
**Warning signs:** `_autoStatus` shows "not_found" even when user copied the token.

### Pitfall 3: Gate Blocks After Session Expires Mid-Use
**What goes wrong:** User has valid session, starts selling, session expires mid-operation, next sell triggers gate unexpectedly.
**Why it happens:** `sessionStatusProvider` caches status and may not reflect real-time backend state.
**How to avoid:** Gate should check `needsReauth` OR `status == 'expired' || status == 'none'`, not cache stale. Call `refresh()` before gating if the cached status is old.
**Warning signs:** Gate shows even though backend says session is valid.

### Pitfall 4: CreateTradeScreen Has No Session Check
**What goes wrong:** User navigates to Create Trade without session, API calls fail with unhelpful errors.
**Why it happens:** CreateTradeScreen was built assuming session always exists.
**How to avoid:** Add `requireSession` check when entering Create Trade screen (either as a route guard or in `initState`). If no session, redirect to gate immediately.
**Warning signs:** "Failed to load friends" error on Create Trade screen.

### Pitfall 5: Keyboard Dismissal During Gate -> Sheet Transition
**What goes wrong:** If manual paste TextField is focused in gate, and gate pops to resume sell sheet, keyboard dismissal causes EditableTextState crash.
**Why it happens:** Same bug that sell_bottom_sheet.dart already handles (lines 37-49 with `_onRouteAnimationStatus`).
**How to avoid:** Dismiss keyboard before popping gate screen: `FocusManager.instance.primaryFocus?.unfocus()`.

## Code Examples

### Existing Client Token Flow (Already Works for Session Gate)

```dart
// From clienttoken_auth_tab.dart -- the core flow we're repackaging:

// Step 1: Open Steam login in system browser
await launchUrl(
  Uri.parse('https://steamcommunity.com/login/home/'),
  mode: LaunchMode.platformDefault,
);

// Step 2: Open token page in system browser
await launchUrl(
  Uri.parse('https://steamcommunity.com/chat/clientjstoken'),
  mode: LaunchMode.platformDefault,
);

// Auto-detect on app resume:
@override
void didChangeAppLifecycleState(AppLifecycleState state) {
  if (state == AppLifecycleState.resumed && _waitingForReturn) {
    _tryAutoFillFromClipboard();
  }
}

// Submit token to backend:
await ref.read(clientTokenAuthProvider.notifier).submitToken(token);
```

### Session Gate Intercept Pattern

```dart
// In sell_bottom_sheet.dart or inventory_screen.dart:
Future<void> _onSellTap(List<InventoryItem> items) async {
  final status = ref.read(sessionStatusProvider).valueOrNull;
  if (status == null || status.needsReauth ||
      (status.status != 'valid' && status.status != 'expiring')) {
    final connected = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const SessionGateScreen()),
    );
    if (connected != true) return;
  }
  // Proceed with sell
  _showSellSheet(context, items);
}
```

### QR Fallback (Reuse Existing)

```dart
// From qr_auth_tab.dart -- start QR + poll
await ref.read(qrAuthProvider.notifier).startQR();
_pollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
  final status = await ref.read(qrAuthProvider.notifier).pollQR();
  if (status == 'authenticated') { /* success */ }
});
```

## Existing Infrastructure to Reuse

| Component | File | What to Reuse |
|-----------|------|---------------|
| Session status check | `session_provider.dart` | `sessionStatusProvider`, `SessionStatus.needsReauth` |
| Client token flow | `clienttoken_auth_tab.dart` | Token page URL, clipboard parsing, auto-detect logic, submit flow |
| QR auth flow | `qr_auth_tab.dart` + `session_provider.dart` | `qrAuthProvider`, QR image rendering, polling timer |
| Token submission | `session_provider.dart:338` | `clientTokenAuthProvider.notifier.submitToken()` |
| Browser launch | `steam_auth_service.dart` | `url_launcher` with `LaunchMode.platformDefault` |
| Deep link handling | `main.dart:118` | `_handleDeepLink`, `_handleAuthToken` |
| Sell session warning | `sell_bottom_sheet.dart:230` | Visual pattern for session-required state |
| Reauth banner | `trades_screen.dart:82` | Banner pattern with push to session |
| `flutter_web_auth_2` | `pubspec.yaml:36` | Already installed, could be used for future OAuth flows but NOT needed for session cookie capture |
| `app_links` | `pubspec.yaml:24` | Deep link handling for `skinkeeper://` scheme |

## What's New vs. What's Reuse

| Component | Status | Notes |
|-----------|--------|-------|
| `requireSession()` function | **NEW** | Simple gate check function |
| `SessionGateScreen` | **NEW** | Full-screen gate with value copy + connect flow |
| Client token flow logic | **REUSE** | Extract from `ClientTokenAuthTab` into shared service |
| QR flow logic | **REUSE** | Embed `QrAuthTab` or its logic in collapsible section |
| Connect progress animation | **NEW** | "Syncing... Loading... Calculating..." stepped animation |
| Intercept points in sell/trade | **MODIFY** | Add `requireSession()` calls before actions |
| Session status provider | **REUSE** | Already has all needed state |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | flutter_test + mocktail |
| Config file | pubspec.yaml (dev_dependencies) |
| Quick run command | `flutter test test/unit/` |
| Full suite command | `flutter test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTHUX-05 | requireSession blocks when no session | unit | `flutter test test/unit/session_gate_test.dart -x` | No -- Wave 0 |
| AUTHUX-06 | Gate screen renders value copy + feature list | widget | `flutter test test/widget/session_gate_screen_test.dart -x` | No -- Wave 0 |
| AUTHUX-07 | Token flow submits correctly | unit | `flutter test test/unit/client_token_auth_test.dart -x` | No -- Wave 0 |
| AUTHUX-10 | Gate returns result to caller | unit | `flutter test test/unit/session_gate_test.dart -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `flutter test test/unit/`
- **Per wave merge:** `flutter test`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] `test/unit/session_gate_test.dart` -- covers AUTHUX-05, AUTHUX-10
- [ ] `test/widget/session_gate_screen_test.dart` -- covers AUTHUX-06
- [ ] `test/unit/client_token_auth_test.dart` -- covers AUTHUX-07

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `lib/features/auth/` -- all session auth flows, providers, UI
- Codebase analysis: `lib/features/inventory/widgets/sell_bottom_sheet.dart` -- existing session gating
- Codebase analysis: `lib/features/trades/` -- trades_screen, create_trade_screen session checks
- Codebase analysis: `backend/src/services/steamSession.ts` -- QR flow, session storage
- Codebase analysis: `backend/src/routes/session.ts` -- QR start/poll endpoints

### Secondary (MEDIUM confidence)
- Phase 27 research (`.planning/phases/27/27-RESEARCH.md`) -- deep link and auth flow analysis
- `flutter_web_auth_2` in pubspec -- confirms availability but NOT applicable for session cookies

### Design Decisions (HIGH confidence)
- System browser CANNOT capture Steam session cookies -- verified by understanding SFSafariViewController/Custom Tabs sandboxing
- Client token clipboard flow is the only single-device method for session cookie acquisition
- QR flow works on single device but requires camera app switching (less ergonomic)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components already exist in codebase
- Architecture: HIGH -- clear pattern (function gate + modal screen + existing token flow)
- Pitfalls: HIGH -- identified from existing code patterns and known iOS/Android browser limitations
- Critical insight (system browser limitation): HIGH -- fundamental platform constraint, not speculative

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable -- no external dependency changes expected)
