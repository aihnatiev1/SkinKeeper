---
phase: 28-intent-session-unlock
plan: 02
subsystem: auth-ux
tags: [session-gate, sell, trade, requireSession]
dependency_graph:
  requires: [28-01]
  provides: [session-gated-sell, session-gated-trade]
  affects: [inventory-screen, item-detail, sell-sheet, trades-screen, create-trade]
tech_stack:
  added: []
  patterns: [requireSession-guard, session-gate-on-entry]
key_files:
  modified:
    - lib/features/inventory/inventory_screen.dart
    - lib/features/inventory/item_detail_screen.dart
    - lib/features/inventory/widgets/sell_bottom_sheet.dart
    - lib/features/trades/trades_screen.dart
    - lib/features/trades/create_trade_screen.dart
decisions:
  - "SellBottomSheet keeps sessionStatus.when wrapper for mid-sheet expiry, but uses minimal TextButton prompt instead of full warning with navigation"
  - "CreateTradeScreen uses addPostFrameCallback + _hasSession bool to gate entry, pops back if user dismisses gate"
metrics:
  duration: 285s
  completed: "2026-03-17T19:23:52Z"
---

# Phase 28 Plan 02: Wire requireSession to Sell/Trade Actions Summary

Session gate wired to all sell/trade intercept points -- Quick Sell, Custom Sell, bulk sell, accept/decline/cancel trade, and CreateTradeScreen entry.

## What Was Done

### Task 1: Wire requireSession to inventory sell actions and clean up SellBottomSheet
**Commit:** 810bacc

- **inventory_screen.dart**: Made `_showSellSheet` async, added `requireSession` + mounted check before showing sheet. Added `requireSession` + mounted check at top of `_quickSell` before haptic/price fetch.
- **item_detail_screen.dart**: Wrapped Quick Sell `onTap` with `requireSession` + `context.mounted` check before sell operation. Wrapped Custom Sell `onTap` the same way before showing SellBottomSheet.
- **sell_bottom_sheet.dart**: Replaced `_buildSessionWarning` (full error card with GoRouter navigation to /session) with a minimal "Session expired. Close and retry." TextButton for mid-sheet expiry. Removed `go_router` import. Kept `sessionStatus.when` wrapper to still detect expiring/expired states while sheet is open.

### Task 2: Wire requireSession to trade actions and CreateTradeScreen entry
**Commit:** 4397e63

- **trades_screen.dart**: Added `requireSession` + `context.mounted` check at the top of `_accept`, `_decline`, and `_cancel` methods in `_TradeOfferTile`.
- **create_trade_screen.dart**: Added `_hasSession` bool field and `initState` with `addPostFrameCallback` that calls `requireSession`. If user dismisses gate, `context.pop()` returns to previous screen. Build returns loading spinner until session confirmed.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

All 5 modified files pass `flutter analyze` with zero new warnings (only pre-existing unused element warnings).
