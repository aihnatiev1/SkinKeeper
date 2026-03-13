---
phase: 19-named-portfolios
plan: 02
subsystem: flutter-portfolio
tags: [flutter, riverpod, portfolio, named-portfolios, ui]
dependency_graph:
  requires: [19-01]
  provides: [portfolio-flutter-ui, portfolio-selector, portfolio-crud-sheets]
  affects: [portfolio_screen, add_transaction_sheet, item_pl_list]
tech_stack:
  added: []
  patterns: [AsyncNotifierProvider, StateProvider, ConsumerStatefulWidget, showModalBottomSheet]
key_files:
  created: []
  modified:
    - lib/models/profit_loss.dart
    - lib/features/portfolio/portfolio_pl_provider.dart
    - lib/features/portfolio/manual_tx_provider.dart
    - lib/features/portfolio/portfolio_screen.dart
    - lib/features/portfolio/widgets/add_transaction_sheet.dart
    - lib/features/portfolio/widgets/item_pl_list.dart
decisions:
  - "Used color.toARGB32() instead of deprecated color.value for hex serialization"
  - "Placed _PortfolioSelectorBar inside Items tab above ItemPLList (tab index 2), not the P/L summary tab"
  - "Long-press on item row shows Log Transaction shortcut only (no delete) per plan's revised behavior"
metrics:
  duration: ~20min
  completed: "2026-03-13T20:04:00Z"
  tasks: 4
  files_modified: 6
---

# Phase 19 Plan 02: Named Portfolios Flutter Summary

Flutter UI for named portfolios: selector bar with CRUD sheets, provider-driven filtering, portfolio picker in AddTransactionSheet, and long-press shortcut on P/L item rows.

## Tasks Completed

| # | Name | Status | Commit |
|---|------|--------|--------|
| 1 | Portfolio model + portfoliosProvider + selectedPortfolioIdProvider | Done | a940acd |
| 2 | _PortfolioSelectorBar widget + integrate into PortfolioScreen | Done | a940acd |
| 3 | _CreatePortfolioSheet + _PortfolioOptionsSheet + _EditPortfolioSheet | Done | a940acd |
| 4 | Portfolio picker in AddTransactionSheet + long-press on item rows | Done | a940acd |

## What Was Built

### Portfolio Model (lib/models/profit_loss.dart)
- `Portfolio` class: `id (int)`, `name (String)`, `color (Color)`, `createdAt (DateTime)`
- `fromJson`: parses `#RRGGBB` hex strings to `Color`
- `colorHex` getter: serializes back to `#RRGGBB` using `toARGB32()`

### Provider Layer (lib/features/portfolio/portfolio_pl_provider.dart)
- `selectedPortfolioIdProvider`: `StateProvider<int?>` — null = All portfolios
- `portfoliosProvider`: `AsyncNotifierProvider<PortfoliosNotifier, List<Portfolio>>` — CRUD via `/api/portfolios`
- `PortfoliosNotifier`: `createPortfolio`, `updatePortfolio`, `deletePortfolio` methods
- `portfolioPLProvider._fetch()` now reads `selectedPortfolioIdProvider` and appends `?portfolioId=`
- `itemsPLProvider` now watches `selectedPortfolioIdProvider` and appends `?portfolioId=`

### Manual Transaction Service (lib/features/portfolio/manual_tx_provider.dart)
- `addTransaction` now accepts optional `int? portfolioId` parameter
- Included in POST body when non-null

### Portfolio Selector Bar (lib/features/portfolio/portfolio_screen.dart)
- `_PortfolioSelectorBar`: horizontal scrollable chip row
  - "All" chip (selected when `selectedPortfolioIdProvider == null`)
  - One chip per portfolio (selected when matching id)
  - "+" add button opens `_CreatePortfolioSheet`
  - Long-press on portfolio chip opens `_PortfolioOptionsSheet`
  - Chip tap sets `selectedPortfolioIdProvider` and resets `plTabProvider` to `PlTab.active`
- Integrated into `_ItemsTab.build()` above `ItemPLList`

### CRUD Sheets (lib/features/portfolio/portfolio_screen.dart)
- `_CreatePortfolioSheet`: text field + 6 preset color circles → `createPortfolio()`
- `_PortfolioOptionsSheet`: shows Edit/Delete options with confirmation dialog for delete
  - Delete resets `selectedPortfolioIdProvider` to null if deleted portfolio was active
- `_EditPortfolioSheet`: pre-filled form → `updatePortfolio()`
- Preset colors: indigo, green, amber, red, purple, cyan

### AddTransactionSheet (lib/features/portfolio/widgets/add_transaction_sheet.dart)
- Added `int? _portfolioId` field
- Portfolio picker row appears after source picker when portfolios exist
- Tapping picker opens modal with portfolio list or "None" option
- `portfolioId` passed to `addTransaction()`

### Item PL List (lib/features/portfolio/widgets/item_pl_list.dart)
- Long-press on sticky row opens bottom sheet
- Sheet shows "Log transaction" action pre-filled with item name + icon
- Uses `showGlassSheet` + `AddTransactionSheet(initialItemName:, initialIconUrl:)`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Deprecated Color.value usage**
- **Found during:** Task 1 verification (flutter analyze)
- **Issue:** `color.value.toRadixString(16)` uses deprecated `Color.value` property
- **Fix:** Replaced with `color.toARGB32().toRadixString(16)` in both `profit_loss.dart` and `portfolio_pl_provider.dart`
- **Files modified:** lib/models/profit_loss.dart, lib/features/portfolio/portfolio_pl_provider.dart
- **Commit:** a940acd

**2. [Rule 1 - Bug] Unused import in manual_tx_provider.dart**
- **Found during:** Task 1 verification
- **Issue:** `portfolio_pl_provider.dart` import was unused after refactor
- **Fix:** Removed the import
- **Files modified:** lib/features/portfolio/manual_tx_provider.dart
- **Commit:** a940acd

## Pre-existing Warnings (not introduced by this plan)
- `dart:ui` unnecessary import in `add_transaction_sheet.dart` (original file)
- Several unused imports/elements in `portfolio_screen.dart` and `portfolio_provider.dart`
- `l10n` unused local variable in `portfolio_screen.dart`

## Self-Check

### Files Exist
- `lib/models/profit_loss.dart` — FOUND
- `lib/features/portfolio/portfolio_pl_provider.dart` — FOUND
- `lib/features/portfolio/manual_tx_provider.dart` — FOUND
- `lib/features/portfolio/portfolio_screen.dart` — FOUND
- `lib/features/portfolio/widgets/add_transaction_sheet.dart` — FOUND
- `lib/features/portfolio/widgets/item_pl_list.dart` — FOUND

### Commits Exist
- a940acd — FOUND

### Flutter Analyze: PASSED (zero new errors)

## Self-Check: PASSED
