# Testing Patterns

**Analysis Date:** 2026-03-08

## Test Framework

**Runner:**
- `flutter_test` (Flutter SDK built-in) for the Dart/Flutter frontend
- Config: None (uses default Flutter test runner)
- **No test framework configured for the backend** (no Jest, Vitest, or Mocha in `backend/package.json`)

**Assertion Library:**
- `flutter_test` matchers (e.g., `expect`, `find`, `findsOneWidget`)

**Run Commands:**
```bash
flutter test                    # Run all Flutter tests
flutter test --coverage         # Run with coverage
# No backend test command exists
```

## Test File Organization

**Location:**
- Flutter tests: `test/` directory at project root (separate from source)
- Backend tests: **None exist**

**Naming:**
- Flutter: `{name}_test.dart` (e.g., `test/widget_test.dart`)

**Current State:**
```
test/
  widget_test.dart              # Single test file (scaffold only)
```

## Existing Test Coverage

**There is exactly one test file:** `test/widget_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:skin_tracker/main.dart';

void main() {
  testWidgets('App renders login screen', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: SkinTrackerApp()),
    );
    await tester.pumpAndSettle();

    expect(find.text('SkinTracker'), findsOneWidget);
  });
}
```

This test verifies the app boots and shows the "SkinTracker" text on the login screen. It wraps the app in `ProviderScope` (required for Riverpod).

## Test Structure

**Suite Organization:**
```dart
void main() {
  testWidgets('description', (WidgetTester tester) async {
    // Arrange: pump widget
    await tester.pumpWidget(const ProviderScope(child: SkinTrackerApp()));
    await tester.pumpAndSettle();

    // Assert
    expect(find.text('SkinTracker'), findsOneWidget);
  });
}
```

**Patterns observed:**
- `testWidgets` for widget tests (not `test` for unit tests)
- `pumpAndSettle()` to wait for all animations and async frames
- `ProviderScope` wrapping for Riverpod provider access

## Mocking

**Framework:** None configured

**No mocking patterns exist in the codebase.** To add tests, use these recommended approaches:

**For Riverpod providers (recommended):**
```dart
// Override providers in tests using ProviderScope overrides
await tester.pumpWidget(
  ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(mockApiClient),
      inventoryProvider.overrideWith(() => MockInventoryNotifier()),
    ],
    child: const MaterialApp(home: InventoryScreen()),
  ),
);
```

**For API client:**
- The `ApiClient` class at `lib/core/api_client.dart` wraps Dio
- Mock by overriding `apiClientProvider` with a fake that returns canned `Response` objects
- Alternatively, use Dio's `HttpClientAdapter` for request-level mocking

**For backend (if tests are added):**
- Mock `pool.query` from `backend/src/db/pool.ts`
- Mock `axios` calls in service files

## Fixtures and Factories

**Test Data:** None exist

**Recommended locations for new fixtures:**
- Flutter: `test/fixtures/` for JSON response samples
- Flutter: `test/helpers/` for widget test utilities and provider overrides

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
flutter test --coverage
# Generates lcov.info in coverage/
```

## Test Types

**Unit Tests:**
- Not present. Good candidates:
  - Model `fromJson` factories (`lib/models/inventory_item.dart`, `lib/models/price_data.dart`)
  - Computed getters on models (`bestPrice`, `displayName`, `weaponName`)
  - Filter/sort logic in `lib/features/inventory/inventory_provider.dart`

**Widget Tests:**
- One minimal test exists at `test/widget_test.dart`
- Good candidates for new widget tests:
  - `lib/features/inventory/widgets/item_card.dart` (renders item data correctly)
  - `lib/features/portfolio/portfolio_screen.dart` (displays values, chart)
  - `lib/features/transactions/transactions_screen.dart` (filter interactions)
  - `lib/widgets/app_shell.dart` (navigation)

**Integration Tests:**
- Not present
- No `integration_test/` directory

**E2E Tests:**
- Not present
- No Patrol, integration_test, or other E2E framework configured

**Backend Tests:**
- Not present
- No test runner, test scripts, or test files in `backend/`
- Good candidates:
  - Route handlers (with mocked DB pool)
  - Service functions in `backend/src/services/prices.ts` (price parsing, caching)
  - Fee calculation in `backend/src/services/market.ts` (`sellerReceivesToBuyerPays`)
  - Auth middleware in `backend/src/middleware/auth.ts`
  - Transaction parsing in `backend/src/services/transactions.ts`

## Adding New Tests

### Flutter Unit Test Template

```dart
// test/models/inventory_item_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:skin_tracker/models/inventory_item.dart';

void main() {
  group('InventoryItem', () {
    test('fromJson parses correctly', () {
      final json = {
        'asset_id': '123',
        'market_hash_name': 'AK-47 | Redline (Field-Tested)',
        'icon_url': 'some/icon/path',
        'wear': 'Field-Tested',
        'tradable': true,
        'prices': {'steam': 12.50, 'skinport': 11.99},
      };

      final item = InventoryItem.fromJson(json);

      expect(item.assetId, '123');
      expect(item.displayName, 'Redline');
      expect(item.weaponName, 'AK-47');
      expect(item.bestPrice, 11.99);
    });
  });
}
```

### Flutter Widget Test Template

```dart
// test/features/inventory/widgets/item_card_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skin_tracker/features/inventory/widgets/item_card.dart';
import 'package:skin_tracker/models/inventory_item.dart';

void main() {
  testWidgets('ItemCard displays item name and price', (tester) async {
    final item = InventoryItem(
      assetId: '1',
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      iconUrl: 'test',
      prices: {'steam': 15.00},
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ItemCard(item: item),
        ),
      ),
    );

    expect(find.text('Redline'), findsOneWidget);
    expect(find.text(r'$15.00'), findsOneWidget);
  });
}
```

### Provider Test Template

```dart
// test/features/inventory/inventory_provider_test.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skin_tracker/features/inventory/inventory_provider.dart';
import 'package:skin_tracker/models/inventory_item.dart';

void main() {
  group('filteredInventoryProvider', () {
    test('filters by search query', () {
      final container = ProviderContainer(
        overrides: [
          inventoryProvider.overrideWith(() => _FakeInventoryNotifier()),
          searchQueryProvider.overrideWith((ref) => 'ak-47'),
        ],
      );

      final result = container.read(filteredInventoryProvider);
      // assert filtered results
    });
  });
}
```

## Testing Gaps Summary

| Area | Files | Coverage | Priority |
|------|-------|----------|----------|
| Models (fromJson, getters) | `lib/models/*.dart` | None | High |
| Inventory filter/sort | `lib/features/inventory/inventory_provider.dart` | None | High |
| Auth flow | `lib/features/auth/steam_auth_service.dart` | None | Medium |
| Widget rendering | `lib/features/*/` screens | Near-zero (1 smoke test) | Medium |
| Backend routes | `backend/src/routes/*.ts` | None | High |
| Backend services | `backend/src/services/*.ts` | None | High |
| Fee calculations | `backend/src/services/market.ts` | None | Critical |
| SQL migration | `backend/src/db/migrate.ts` | None | Low |

---

*Testing analysis: 2026-03-08*
