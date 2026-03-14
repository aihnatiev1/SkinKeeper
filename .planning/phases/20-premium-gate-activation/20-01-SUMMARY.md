---
phase: 20-premium-gate-activation
plan: 01
subsystem: premium
tags: [premium, gates, iap, flutter, backend]
dependency_graph:
  requires: [19-02]
  provides: [premium-gates-active]
  affects: [inventory, portfolio, alerts, transactions, settings]
tech_stack:
  added: []
  patterns: [requirePremium middleware, premiumProvider reactive derivation, gatedInventoryProvider]
key_files:
  created: []
  modified:
    - lib/features/purchases/iap_service.dart
    - lib/widgets/premium_gate.dart
    - lib/features/settings/linked_accounts_screen.dart
    - lib/features/inventory/inventory_provider.dart
    - lib/features/inventory/inventory_screen.dart
    - lib/features/transactions/transactions_screen.dart
    - backend/src/routes/alerts.ts
    - backend/src/routes/portfolio.ts
    - backend/src/routes/export.ts
    - backend/src/routes/__tests__/alerts.test.ts
    - backend/src/routes/__tests__/portfolio.test.ts
decisions:
  - "[20-01]: premiumProvider derives isPremium from authStateProvider.valueOrNull?.isPremium — no separate API call needed"
  - "[20-01]: Bulk sell gate placed in InventoryScreen callbacks (not SellBottomSheet) — avoids showing sheet at all for free users"
  - "[20-01]: Route is /premium not /paywall — plan had /paywall but router only registers /premium"
  - "[20-01]: /pl and /pl/items and /pl/history all get requirePremium re-enabled — all P/L routes are premium"
  - "[20-01]: Test mocks updated to provide is_premium query response before count query for POST /api/alerts"
metrics:
  duration: ~480s
  completed_date: "2026-03-14"
  tasks_completed: 9
  files_changed: 11
---

# Phase 20 Plan 01: Premium Gate Activation Summary

JWT auth derived premium state wired to Flutter UI gates and backend requirePremium middleware re-enabled across all premium routes.

## What Was Built

All premium gates that were disabled with `// TODO: re-enable` comments are now active:

- **T1**: `PremiumNotifier.build()` watches `authStateProvider` and returns `user?.isPremium ?? false` — reactive, updates when user re-authenticates
- **T2**: `PremiumGate` widget now renders `_LockedOverlay` for free users (lock icon, "Available with SkinKeeper PRO" caption, gradient "Upgrade to PRO" button navigating to `/premium`)
- **T3**: `_LinkAccountButton` re-activates `blocked = !isPremium && accountCount >= 1` check and immediately pushes `/premium` instead of navigating to link-account
- **T4**: `gatedInventoryProvider` strips non-Steam prices for free users by constructing a new `InventoryItem` with only the `steam` key preserved; `groupedInventoryProvider` now watches `gatedInventoryProvider` instead of `filteredInventoryProvider`
- **T5**: CSV export button in transactions screen checks `premiumProvider` before showing the export sheet; free users are pushed to `/premium`
- **T6**: Bulk sell gate added in `InventoryScreen.onSell` and `onQuickSell` — `selectedItems.length > 1 && !isPremium` redirects to `/premium`
- **T7**: `POST /api/alerts` now queries `is_premium` first, sets `maxAlerts = isPremium ? 20 : 5`; free users hitting 5 get 403 `premium_required`; GET `/api/alerts/history` has `requirePremium` re-enabled
- **T8**: `requirePremium` re-enabled on `GET /api/portfolio/pl`, `/pl/items`, and `/pl/history`
- **T9**: `requirePremium` re-enabled on `GET /api/export/csv`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Router uses /premium not /paywall**
- **Found during:** T2
- **Issue:** Plan specified `context.push('/paywall')` but the GoRouter in `router.dart` only registers `/premium` (no `/paywall` route exists)
- **Fix:** All pushes use `context.push('/premium')` throughout
- **Files modified:** `premium_gate.dart`, `linked_accounts_screen.dart`, `inventory_screen.dart`, `transactions_screen.dart`

**2. [Rule 1 - Bug] InventoryItem has no copyWith**
- **Found during:** T4
- **Issue:** Plan said to use `item.copyWith(prices: steamOnly)` but `InventoryItem` has no `copyWith` method (only `withInspectData`)
- **Fix:** Constructed full `InventoryItem(...)` manually with all fields copied and `prices: steamOnly`

**3. [Rule 1 - Bug] Test mock ordering broken by new premium query in POST /api/alerts**
- **Found during:** Verification (npm test)
- **Issue:** `alerts.test.ts` "creates alert successfully" and "returns 400 when user hits 20 alert limit" tests mocked only count query but now the handler queries `is_premium` first, consuming the first mock
- **Fix:** Added `mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: true }] })` before count mock; also added new test for free user hitting 5-alert limit returning 403

**4. [Rule 1 - Bug] portfolio.test requirePremium blocking /pl/history test**
- **Found during:** Verification (npm test)
- **Issue:** `portfolio.test.ts` "returns P/L history snapshots" test expected 200 but now `requirePremium` queries `pool.query` for `is_premium` before the route handler runs, getting empty rows and returning 403
- **Fix:** Added `mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: true }] })` before the route handler mock

## Self-Check: PASSED

All files exist. Commit bf14469 confirmed. Backend tests: 234 passed. Flutter analyze: 0 errors.
