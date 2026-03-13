---
phase: 16-multi-account-gap-closure
plan: "02"
subsystem: flutter-data-layer
tags: [multi-account, inventory, premium-gate, deep-link]
dependency_graph:
  requires: [16-01]
  provides: [multi-account-inventory-fetch, premium-gate-exception, account-linked-deep-link, account-avatar-url-field]
  affects: [inventory_provider, inventory_item, accounts_provider, main, linked_accounts_screen]
tech_stack:
  added: []
  patterns: [PremiumRequiredException, DioException-403-handling, deep-link-invalidation]
key_files:
  created: []
  modified:
    - lib/features/inventory/inventory_provider.dart
    - lib/models/inventory_item.dart
    - lib/features/settings/accounts_provider.dart
    - lib/main.dart
    - lib/features/settings/linked_accounts_screen.dart
decisions:
  - "_LinkAccountButton updated to call startLinkAccount() directly (browser OAuth flow) instead of navigating to /session?linkMode=true (QR flow) — consistent with backend /auth/accounts/link endpoint"
metrics:
  duration: "~10 minutes"
  completed: "2026-03-13"
  tasks_completed: 2
  files_modified: 5
---

# Phase 16 Plan 02: Flutter Data Layer — Multi-Account Summary

**One-liner:** Wired multi-account Flutter data layer: all-accounts inventory fetch, PremiumRequiredException on 403, account-linked deep link refresh, and accountAvatarUrl field on InventoryItem.

## Completed

- `inventory_provider._accountQuery` now returns `{}` (fetches all accounts, no filter)
- Removed `_activeAccountId` getter and now-unused `steam_auth_service` import from inventory_provider
- `InventoryItem.accountAvatarUrl` field added, maps from `account_avatar_url` JSON key; updated constructor, `fromJson`, and `withInspectData`
- `PremiumRequiredException` class defined in `accounts_provider.dart` (implements Exception, descriptive toString)
- `startLinkAccount()` catches `DioException` with status 403 + `error == 'premium_required'` and throws `PremiumRequiredException`; rethrows other errors
- `_handleDeepLink` in `main.dart` handles `account-linked` host — invalidates `accountsProvider` and `inventoryProvider`; handler placed before `auth` handler
- `_LinkAccountButton` in `linked_accounts_screen.dart` now calls `startLinkAccount()`, opens the returned URL in browser via `launchUrl`, catches `PremiumRequiredException` to push `/premium`, catches other errors to show a snackbar

## Files Modified

- `lib/features/inventory/inventory_provider.dart` — `_accountQuery` simplified to `=> {}`, removed `_activeAccountId` getter and unused import
- `lib/models/inventory_item.dart` — added `accountAvatarUrl` field (constructor, fromJson, withInspectData)
- `lib/features/settings/accounts_provider.dart` — added `PremiumRequiredException` class, added `package:dio/dio.dart` import, updated `startLinkAccount()` with 403 handling
- `lib/main.dart` — added `account-linked` deep link handler + imports for `accountsProvider` and `inventoryProvider`
- `lib/features/settings/linked_accounts_screen.dart` — added `url_launcher` import, updated `_LinkAccountButton.onTap` to use `startLinkAccount()` flow

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed now-unused import after getter deletion**
- **Found during:** Task 1
- **Issue:** After removing `_activeAccountId` getter, `import '../auth/steam_auth_service.dart'` in `inventory_provider.dart` became unused, which would cause an analyzer warning
- **Fix:** Removed the unused import
- **Files modified:** `lib/features/inventory/inventory_provider.dart`
- **Commit:** 4848666

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 4848666 | feat(16-02): drop accountId filter in inventory provider + add accountAvatarUrl to model |
| 2 | 33556ed | feat(16-02): 403 premium gate, account-linked deep link, linked accounts button |

## Self-Check: PASSED

- `lib/features/inventory/inventory_provider.dart` — exists, `_accountQuery => {}` confirmed
- `lib/models/inventory_item.dart` — exists, `accountAvatarUrl` field confirmed
- `lib/features/settings/accounts_provider.dart` — exists, `PremiumRequiredException` confirmed
- `lib/main.dart` — exists, `account-linked` handler confirmed
- `lib/features/settings/linked_accounts_screen.dart` — exists, `startLinkAccount()` call confirmed
- Commits 4848666 and 33556ed verified in git log
- `flutter analyze` on all 5 files: No issues found
- Backend tests: 221 passed (23 test files)
