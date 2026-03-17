---
phase: 28-intent-session-unlock
plan: 01
subsystem: auth
tags: [session-gate, requireSession, token-flow, qr-fallback, connect-animation]
dependency_graph:
  requires: [sessionStatusProvider, clientTokenAuthProvider, qrAuthProvider, hasSessionProvider]
  provides: [requireSession, SessionGateScreen, ConnectProgressOverlay]
  affects: [sell-flow, trade-flow, market-history]
tech_stack:
  added: []
  patterns: [intent-based-gating, clipboard-auto-detect, lifecycle-observer]
key_files:
  created:
    - lib/features/auth/session_gate.dart
    - lib/features/auth/widgets/session_gate_screen.dart
    - lib/features/auth/widgets/connect_progress_overlay.dart
  modified: []
decisions:
  - "Duplicated _StepCard and token helpers from ClientTokenAuthTab (private classes cannot be shared)"
  - "QR fallback uses ExpansionTile with polling timer scoped to expanded state"
  - "ConnectProgressOverlay is a regular widget (not OverlayEntry) shown as Scaffold body swap"
metrics:
  duration: 197s
  completed: "2026-03-17T19:16:01Z"
---

# Phase 28 Plan 01: Session Gate Infrastructure Summary

**Session gate with requireSession() function, token-primary UI, QR fallback, and connect progress animation**

## What Was Built

### requireSession() gate function (`session_gate.dart`)
- Checks `hasSessionProvider` -- returns true immediately if session valid/expiring
- Pushes `SessionGateScreen` as fullscreenDialog MaterialPageRoute when no session
- Returns bool result from gate screen (true on connect, false on dismiss)

### SessionGateScreen (`session_gate_screen.dart`)
- Full-screen ConsumerStatefulWidget with WidgetsBindingObserver for lifecycle clipboard detection
- Value proposition header with subtitle explaining Steam's security requirement
- Feature chips in Wrap layout: "Sell Items", "Trade", "Market History", "Profit & Loss"
- 2-step token flow with _StepCard widgets (duplicated from ClientTokenAuthTab)
- Auto-clipboard detection on app resume: parses JSON `{steamid, token}` or raw steamLoginSecure format
- Status banners for detecting/found/not_logged_in/not_found states
- Manual paste fallback with monospace TextField and Connect button
- Collapsible QR fallback section ("Have another device?") with:
  - QR generation via qrAuthProvider.startQR()
  - 5-second polling via Timer.periodic
  - Expired state with refresh button
  - Error state with retry button
- Listens to both clientTokenAuthProvider and qrAuthProvider for auth success
- On success: refreshes sessionStatusProvider, swaps to ConnectProgressOverlay, then pops with true
- Keyboard unfocus before pop to prevent EditableTextState crash
- Does NOT set sessionLinkModeProvider (session reconnect, not account linking)

### ConnectProgressOverlay (`connect_progress_overlay.dart`)
- 3-step animated progress: "Syncing your session...", "Loading inventory...", "You're all set!"
- 600ms Timer.periodic between steps
- flutter_animate fadeIn + slideY on each step row
- CircularProgressIndicator while active, green check icon when done
- Dark overlay background with glassmorphic card (AppTheme.glassElevated)
- Auto-calls onComplete after 400ms pause on final step

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- All 3 files pass `flutter analyze` with no issues
- No existing tests to regress (test/unit/ directory does not exist)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | d25518b | requireSession() gate function + ConnectProgressOverlay |
| 2 | 4c8fd15 | SessionGateScreen with token primary + QR fallback |
