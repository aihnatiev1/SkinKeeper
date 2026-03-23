# Phase 29 Plan 01: UX Polish -- Locked States, Nudges, Expired Copy & Connect Reward

Conditional session gate copy, locked-state banners on trades/sell/portfolio, lock icons on gated buttons, updated connect reward text.

## Changes

### 1. Expired Session Copy in Gate Screen
- `session_gate_screen.dart`: Added `_isExpiredSession` getter that checks `sessionStatusProvider` for expired/needsReauth status
- Title changes from "Enable Full Access" (first-time) to "Session Expired" (re-auth)
- Subtitle changes from "Steam requires this extra step..." to "Steam keeps sessions active for about 24 hours. Sign in again to continue trading."

### 2. Locked State Banners

**Trades tab** (`trades_screen.dart`):
- Added `hasSessionProvider` import and watch in `_PendingTab`
- When no session: shows lock icon circle, "Connect Steam to manage trades" heading, descriptive subtitle, and "Connect Steam" gradient button that calls `requireSession`
- Original empty state preserved for when session exists but no pending offers

**Selection tray** (`selection_tray.dart`):
- Added `hasSession` parameter (default `true` for backward compatibility)
- Quick Sell button: appends small lock icon (size 10) when no session
- Set Price button: appends small lock icon (size 10) when no session
- Buttons still functional -- they trigger the gate flow via `requireSession`
- `inventory_screen.dart` updated to pass `hasSession: ref.watch(hasSessionProvider)`

**Portfolio nudge** (`portfolio_screen.dart`):
- Added `_SessionNudgeBanner` ConsumerWidget between stat cards and tabs
- Shows only when `hasSessionProvider` is false AND user has inventory items
- Glass-styled card with lock_open icon, descriptive text, and chevron
- Tap triggers `requireSession`

### 3. Post-Connect Reward
- `connect_progress_overlay.dart`: Updated final step text from "You're all set!" to "Connected! You're all set." with the existing green celebratory styling

### 4. Lock Icon on Item Detail Sell Actions
- `item_detail_screen.dart`: Added `hasSessionProvider` watch in `_SellActions`
- Quick Sell button wrapped in Stack with positioned lock icon (size 12) in top-right when no session
- Button still functional via existing `requireSession` gate

## Files Modified
- `lib/features/auth/widgets/session_gate_screen.dart`
- `lib/features/auth/widgets/connect_progress_overlay.dart`
- `lib/features/trades/trades_screen.dart`
- `lib/features/inventory/widgets/selection_tray.dart`
- `lib/features/inventory/inventory_screen.dart`
- `lib/features/portfolio/portfolio_screen.dart`
- `lib/features/inventory/item_detail_screen.dart`

## Commit
- `0afbacc`: feat(ux-polish): locked states, nudges, expired copy & connect reward

## Deviations from Plan
None -- plan executed exactly as written.

## Verification
- `flutter analyze` passes with 0 errors (31 pre-existing warnings/infos unrelated to changes)
