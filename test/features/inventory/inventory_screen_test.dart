import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:network_image_mock/network_image_mock.dart';
import 'package:skin_keeper/core/cache_service.dart';
import 'package:skin_keeper/features/inventory/inventory_provider.dart';
import 'package:skin_keeper/features/inventory/inventory_screen.dart';
import 'package:skin_keeper/features/inventory/sell_provider.dart';
import 'package:skin_keeper/features/portfolio/portfolio_pl_provider.dart';
import 'package:skin_keeper/models/inventory_item.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/test_app.dart';

void main() {
  late Directory tempDir;

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('hive_inv_screen_');
    await CacheService.initForTest(tempDir.path);
  });

  tearDownAll(() async {
    await tempDir.delete(recursive: true);
  });

  List<Override> buildOverrides({List<InventoryItem>? items}) {
    final sampleItems = items ?? sampleInventoryList(count: 4);
    return [
      inventoryProvider.overrideWith(() => _FakeInventoryNotifier(sampleItems)),
      itemPLFamilyProvider.overrideWith((ref, name) => null),
      sellOperationProvider.overrideWith(() => _FakeSellNotifier()),
      quickPriceProvider.overrideWith((ref, name) async => 1250),
    ];
  }

  // Pump enough to render but avoid infinite animation loops.
  // We use explicit pump durations instead of pumpAndSettle to avoid
  // blocking on flutter_animate's repeating animations.
  Future<void> pumpScreen(WidgetTester tester, Widget widget) async {
    await tester.pumpWidget(widget);
    // First frame — starts async providers
    await tester.pump();
    // Give providers time to resolve (AsyncNotifier.build is async)
    await tester.pump(const Duration(milliseconds: 100));
    // Advance past stagger animations from flutter_animate (300ms)
    await tester.pump(const Duration(milliseconds: 400));
  }

  group('InventoryScreen', () {
    testWidgets('renders without crashing', (tester) async {
      await mockNetworkImagesFor(() async {
        await pumpScreen(
          tester,
          createTestApp(
            child: const InventoryScreen(),
            overrides: buildOverrides(),
          ),
        );
        expect(find.byType(InventoryScreen), findsOneWidget);
      });
    });

    testWidgets('shows search icon button', (tester) async {
      await mockNetworkImagesFor(() async {
        await pumpScreen(
          tester,
          createTestApp(
            child: const InventoryScreen(),
            overrides: buildOverrides(),
          ),
        );
        expect(find.byIcon(Icons.search_rounded), findsOneWidget);
      });
    });

    testWidgets('tapping search opens text field', (tester) async {
      await mockNetworkImagesFor(() async {
        await pumpScreen(
          tester,
          createTestApp(
            child: const InventoryScreen(),
            overrides: buildOverrides(),
          ),
        );
        await tester.tap(find.byIcon(Icons.search_rounded).first);
        await tester.pump();
        expect(find.byType(TextField), findsOneWidget);
        // Pump past all animations to drain pending timers
        await tester.pump(const Duration(seconds: 1));
      });
    });

    testWidgets('shows grid view when inventory loaded', (tester) async {
      await mockNetworkImagesFor(() async {
        await pumpScreen(
          tester,
          createTestApp(
            child: const InventoryScreen(),
            overrides: buildOverrides(),
          ),
        );
        expect(find.byType(GridView), findsOneWidget);
      });
    });

    testWidgets('shows column count toggle button', (tester) async {
      await mockNetworkImagesFor(() async {
        await pumpScreen(
          tester,
          createTestApp(
            child: const InventoryScreen(),
            overrides: buildOverrides(),
          ),
        );
        // Grid columns toggle button should be present
        expect(find.byIcon(Icons.grid_view_rounded), findsOneWidget);
      });
    });
  });
}

// ─── Fake Notifiers ───────────────────────────────────────────────────

class _FakeInventoryNotifier extends InventoryNotifier {
  final List<InventoryItem> _items;
  _FakeInventoryNotifier(this._items);

  @override
  Future<List<InventoryItem>> build() async => _items;

  @override
  Future<void> refresh() async {}
}

class _FakeSellNotifier extends SellOperationNotifier {
  @override
  Future<SellOperation?> build() async => null;
}
