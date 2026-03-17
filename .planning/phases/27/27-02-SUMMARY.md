---
phase: 27-zero-friction-entry
plan: 02
subsystem: flutter-auth
tags: [login, openid, polling, ux]
dependency_graph:
  requires: []
  provides: [login-screen-redesign, nonce-polling, has-session-provider]
  affects: [auth-flow, inventory-display]
tech_stack:
  added: []
  patterns: [nonce-polling-fallback, feature-pills-ui]
key_files:
  created: []
  modified:
    - lib/features/auth/login_screen.dart
    - lib/features/auth/steam_auth_service.dart
    - lib/features/inventory/inventory_provider.dart
decisions:
  - "Polling is fallback only — deep link handler in main.dart remains primary auth path"
  - "isLinking mode preserved for account linking flow (uses openSteamLinkLogin, no polling)"
  - "hasSessionProvider checks valid/expiring status for future sell/trade UI gating"
metrics:
  duration: 147s
  completed: "2026-03-17"
---

# Phase 27 Plan 02: Flutter Login Redesign + Nonce Polling Summary

Single-CTA login screen with Steam OpenID nonce-based polling fallback and hasSessionProvider for session-gated UI

## What Was Done

### Task 1: Redesign login screen + add nonce polling to auth service

**SteamAuthService enhancements (steam_auth_service.dart):**
- Added `_generateNonce()` for secure random hex nonce generation
- Added `openSteamLoginWithPolling()` — opens Steam OpenID with nonce in return_to URL, returns nonce for polling
- Added `pollSteamLogin(nonce, api)` — polls `/auth/steam/poll/:nonce` endpoint, returns JWT token on success
- Existing `openSteamLogin()` and `openSteamLinkLogin()` preserved unchanged

**Login screen rewrite (login_screen.dart):**
- Removed 3-tab PageView (Full Access / Browser / QR Code)
- New layout: logo + title + tagline + feature pills + single "Continue with Steam" CTA + security note
- Feature pills: "Real-time prices", "Portfolio tracking", "Price alerts" as styled chips
- Steam button: dark blue (0xFF1B2838) with border (0xFF2A475E), full width, height 56
- Polling state: "Waiting for Steam login..." spinner + "Completed login? Tap to continue" link
- Timeout after 60s (20 polls at 3s): "Login timed out. Tap to try again."
- Deep link guard: polling stops if authStateProvider already has a user (idempotent)
- isLinking mode: shows "Link Account" header, "Link with Steam" button text, uses openSteamLinkLogin
- Back button shown when canPop is true
- flutter_animate for entry animations on all sections
- Removed imports: clienttoken_auth_tab, qr_auth_tab, session_provider (NOT deleted — needed for Phase 28)

### Task 2: Add hasSessionProvider to inventory_provider

- Added `hasSessionProvider` — reads from `sessionStatusProvider`, returns true if status is 'valid' or 'expiring'
- Ready for Phase 28/29 to gate sell/trade UI buttons
- Inventory display continues to work without session (reads from DB)

### Task 3: Human Checkpoint (not executed)

Task 3 is a `checkpoint:human-verify` requiring manual verification of the login flow on a real device. The user should:
1. Run the app and verify the redesigned login screen layout
2. Tap "Continue with Steam" and complete the full login flow
3. Verify landing on /portfolio (not session screen) after login
4. Check inventory, portfolio, and alerts all load without session

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused import warning**
- **Found during:** Task 1 verification
- **Issue:** `shared_ui.dart` import was unused — `friendlyError` resolves from `api_client.dart` directly
- **Fix:** Removed the unused import
- **Files modified:** lib/features/auth/login_screen.dart
- **Commit:** 7165a6e

## Commits

| Task | Commit  | Description                                               |
|------|---------|-----------------------------------------------------------|
| 1+2  | 7165a6e | feat(27-02): redesign login screen with single Steam CTA  |

## Self-Check: PASSED

- All 3 modified files exist on disk
- Commit 7165a6e found in git log
- `pollSteamLogin` present in steam_auth_service.dart
- `hasSessionProvider` present in inventory_provider.dart
- "Continue with Steam" present in login_screen.dart
