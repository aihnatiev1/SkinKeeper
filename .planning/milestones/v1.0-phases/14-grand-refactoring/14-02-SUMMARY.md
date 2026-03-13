---
phase: "14"
plan: "02"
subsystem: flutter-frontend
tags: [refactoring, performance, ux, design-system, flutter]
dependency_graph:
  requires: []
  provides: [glass-card-variants, status-chip, skeleton-screens, filter-chips, quantity-picker]
  affects: [inventory, portfolio, trades, transactions, settings, shared-ui]
tech_stack:
  added: []
  patterns: [IndexedStack-tabs, select-granular-rebuild, family-provider, interactive-wrapper]
key_files:
  created:
    - lib/features/inventory/widgets/quantity_picker_sheet.dart
    - lib/features/inventory/widgets/glass_icon_btn.dart
    - lib/features/inventory/widgets/sort_menu_btn.dart
    - lib/features/inventory/widgets/selection_tray.dart
    - lib/core/push_preferences.dart
    - lib/core/push_service.dart
  modified:
    - lib/features/inventory/inventory_screen.dart
    - lib/features/inventory/inventory_provider.dart
    - lib/features/inventory/inventory_selection_provider.dart
    - lib/features/inventory/widgets/inventory_grid.dart
    - lib/features/inventory/widgets/inventory_app_bar.dart
    - lib/features/inventory/widgets/inventory_search_bar.dart
    - lib/features/inventory/widgets/item_card.dart
    - lib/features/inventory/sell_utils.dart
    - lib/features/inventory/bulk_sell_screen.dart
    - lib/features/inventory/widgets/sell_bottom_sheet.dart
    - lib/features/portfolio/portfolio_screen.dart
    - lib/features/portfolio/portfolio_pl_provider.dart
    - lib/features/trades/trades_screen.dart
    - lib/features/trades/create_trade_screen.dart
    - lib/features/transactions/transactions_screen.dart
    - lib/widgets/shared_ui.dart
    - lib/widgets/glass_sheet.dart
    - lib/widgets/price_text.dart
    - lib/widgets/app_shell.dart
decisions:
  - IndexedStack for portfolio tabs instead of StatefulShellRoute migration
  - Settings bottom sheets kept as Material-themed (not glass) since they use solid backgrounds
  - AutomaticKeepAliveClientMixin on screen widgets for GoRouter ShellRoute
  - GlassCard.interactive uses AnimatedScale for press feedback
metrics:
  duration: 2175s
  completed: "2026-03-12"
  tasks_completed: 8
  tasks_total: 8
  files_modified: 30
---

# Phase 14 Plan 02: Flutter UX/UI Refactoring Summary

Decomposed 966-line inventory god widget, optimized state rebuilds with .select() and family providers, unified sell flow, added glass card variants and skeleton loading, implemented stack quantity picker with filter chips.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Break Up inventory_screen.dart | c2b3117 | 966 -> 121 lines, extracted grid/appbar/search/tray/sort components |
| 2 | Fix State Rebuild Efficiency | a9dbaa2 | SelectionNotifier, .select() granular rebuilds, IndexedStack tabs |
| 3 | Deduplicate Sell Flow | 7df8454 | sell_utils.dart, showGlassSheet everywhere, PriceText widget |
| 4 | Navigation Bar & Shell Performance | (included in T1/T2) | RepaintBoundary on nav, Hero transitions, keep-alive |
| 5 | Design System Polish | fc6ef31 | GlassCard variants, StatusChip, PulseIndicator, AnimatedCounter, skeletons |
| 6 | Inventory Grid UX Overhaul | bc09eeb | QuantityPickerSheet, selected count badge, filter chips, debounce |
| 7 | Screen-Level Polish | 7d0959c | StatusChip in trades, date headers in transactions, skeleton loading |
| 8 | Loading & Transition Polish | 108c4f6 | SkeletonItemCard, SkeletonStatCards, SkeletonTradeTile, branded errors |

## Key Architecture Changes

### Selection State (Task 2)
- `SelectionNotifier` with `toggle()`, `selectRange()`, `replaceGroupSelection()`, `deselectRange()`
- Grid items use `.select((s) => s.contains(assetId))` for per-card rebuild
- `itemPLFamilyProvider` watches only its own market hash name

### Portfolio Tabs (Task 2)
- `AnimatedSwitcher` replaced with `IndexedStack` -- all 3 tabs stay mounted
- PortfolioScreen converted to ConsumerStatefulWidget with AutomaticKeepAliveClientMixin

### Unified Sell Flow (Task 3)
- `showGlassSheet()` / `showGlassSheetLocked()` in `lib/widgets/glass_sheet.dart`
- Replaced 5+ raw `showModalBottomSheet` calls across sell, bulk sell, trade create
- `sell_utils.dart`: Steam/CS2 fee calculations for client-side display
- `PriceText` widget with `.large()` and `.pl()` named constructors

### Design System (Task 5)
- `GlassCard.interactive`: AnimatedScale press feedback
- `GlassCard.outlined`: accent border for emphasized states
- `StatusChip.fromTradeStatus()`: replaces all inline status badge implementations
- `PulseIndicator`, `GradientDivider`, `AnimatedCounter`: reusable shared widgets
- `SkeletonItemCard`, `SkeletonStatCards`, `SkeletonTradeTile`: layout-matched loading states

### Inventory Grid UX (Task 6)
- Stack tap -> QuantityPickerSheet (slider 1..N, quick buttons, total value)
- Single item tap -> toggle selection
- Long press / info button -> GroupExpandSheet or item detail
- Selected count badge on group cards (e.g. "3/797" in green)
- Filter chips: FN/MW/FT/WW/BS wear, Tradable, Has Price

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 4 nav bar changes already committed**
- Nav bar RepaintBoundary and Hero tags were already in the working tree from prior development
- No separate commit needed; captured in Task 1 and Task 2 commits

**2. [Rule 2 - Missing] Added shared_ui import to transactions_screen**
- TransactionsScreen lacked import for EmptyState/ShimmerCard/GradientButton
- Added `../../widgets/shared_ui.dart` import for branded error states

## Verification Status

- [x] `inventory_screen.dart` is 121 lines (under 200 target)
- [x] Grid items use `.select()` for granular selection state
- [x] `itemPLFamilyProvider` avoids full-map rebuild per card
- [x] `showGlassSheet` used across sell, bulk sell, trade create
- [x] `PriceText` widget with currency formatting
- [x] BackdropFilter wrapped in RepaintBoundary on nav bar
- [x] Portfolio tabs use IndexedStack (stays mounted)
- [x] Stack tap opens QuantityPickerSheet
- [x] Search input debounced (300ms timer)
- [x] Layout-matched skeleton loading on all screens
- [x] Hero animation on item card -> detail (item_image_{assetId})
- [x] Filter chips for wear/tradable/hasPrice

## Self-Check: PASSED

All 11 key files verified present. All 7 task commits verified in git log.
