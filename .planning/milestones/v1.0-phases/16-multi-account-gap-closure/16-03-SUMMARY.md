---
phase: 16
plan: "03"
subsystem: inventory-ui
tags: [multi-account, item-card, sell-sheet, account-badge]
dependency_graph:
  requires: [16-01, 16-02]
  provides: [account-badge-ui, sell-sheet-account-context]
  affects: [inventory-grid, item-card, sell-bottom-sheet]
tech_stack:
  added: []
  patterns: [riverpod-select, cached-network-image-avatar]
key_files:
  created: []
  modified:
    - lib/features/inventory/widgets/item_card.dart
    - lib/features/inventory/widgets/inventory_grid.dart
    - lib/features/inventory/widgets/sell_bottom_sheet.dart
decisions:
  - Used errorWidget (not errorBuilder) for CachedNetworkImage — matches package API
  - Named placeholder/errorWidget params to avoid unnecessary_underscores lint
metrics:
  duration: "~10 minutes"
  completed: "2026-03-13"
  tasks_completed: 2
  files_modified: 3
---

# Phase 16 Plan 03: Multi-Account UI — Item Card Badges + Sell Sheet

One-liner: Account avatar badges on item cards + cross-account warning banner in sell sheet with accountId in sell request payload.

## Completed

- ItemCard accepts `showAccountBadge` (default false) + `onAccountBadgeTap` params
- Account badge renders as 20x20 circular CachedNetworkImage avatar with initials fallback (_AccountInitial widget)
- Badge positioned bottom-left corner, styled with AppTheme.surface border + primary background
- InventoryGrid reads `accountCount` and `activeAccountId` from `authStateProvider` using `.select()` to avoid unnecessary rebuilds
- InventoryGrid passes `showBadge = (accountCount > 1)` to every ItemCard
- Badge tap calls `AccountsNotifier.setActive(item.accountId)` only when item belongs to non-active account
- SellBottomSheet._startSell() includes `accountId` in each item map when `item.accountId != null`
- SellBottomSheet reads `activeAccountId` from `authStateProvider` in build()
- SellBottomSheet shows `_buildSwitchAccountBanner` when `item.accountId != activeAccountId`
- Banner includes swap icon, explanatory text, and a "Switch" TextButton that pops the sheet and calls `AccountsNotifier.setActive()`

## Files Modified

- `lib/features/inventory/widgets/item_card.dart` — showAccountBadge param, badge Positioned widget, _AccountInitial helper
- `lib/features/inventory/widgets/inventory_grid.dart` — authStateProvider + accountsProvider imports, accountCount/showBadge reads, badge props passed to ItemCard
- `lib/features/inventory/widgets/sell_bottom_sheet.dart` — authStateProvider + accountsProvider imports, accountId in item map, isNonActiveAccount flag, _buildSwitchAccountBanner method, banner insertion in build()

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed CachedNetworkImage parameter name**
- **Found during:** Task 1 (flutter analyze)
- **Issue:** Plan specified `errorBuilder` but CachedNetworkImage uses `errorWidget`
- **Fix:** Changed to `errorWidget`
- **Files modified:** `item_card.dart`
- **Commit:** b2f083b

**2. [Rule 1 - Bug] Fixed wildcard parameter lint**
- **Found during:** Task 1 (flutter analyze)
- **Issue:** `(_, __)` and `(_, __, ___)` trigger `unnecessary_underscores` lint (info level)
- **Fix:** Named second/third params (`url`, `err`) to silence lint
- **Files modified:** `item_card.dart`
- **Commit:** b2f083b

## Human Verification Needed

1. **Account badge visible** — With 2+ linked accounts, each item card in the inventory grid should show a small circular badge in the bottom-left corner. The badge shows the account's Steam avatar (or an initial letter if avatar fails to load).

2. **Badge tap switches account** — Tapping the badge on an item that belongs to a non-active account should switch the active account. Items from the currently active account should have a non-tappable badge (or no-op tap).

3. **Sell sheet cross-account warning** — Selecting an item from a non-active account and opening the sell sheet should show an amber warning banner at the top: "This item belongs to another account. Switch accounts to sell it." with a "Switch" button.

4. **Switch button works** — Tapping "Switch" in the sell sheet banner should dismiss the sheet and switch the active account.

5. **Sell request includes accountId** — When selling, each item in the request payload includes `accountId` when `item.accountId` is non-null (verify in backend logs or network inspector).
