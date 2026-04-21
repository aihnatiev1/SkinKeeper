import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:network_image_mock/network_image_mock.dart';
import 'package:skin_keeper/features/inventory/widgets/item_card.dart';

import '../helpers/fixtures.dart';
import '../helpers/test_app.dart';

// Helper to pump enough frames for widget to render without infinite animation
Future<void> pumpCard(WidgetTester tester, Widget card) async {
  await tester.pumpWidget(
    createTestScaffold(
      body: SizedBox(
        width: 160,
        height: 220,
        child: card,
      ),
    ),
  );
  // Use pump with duration to avoid infinite animation loops from CachedNetworkImage
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  group('ItemCard widget', () {
    testWidgets('renders item price', (tester) async {
      final item = sampleInventoryItem(prices: {'steam': 12.50});
      await mockNetworkImagesFor(() async {
        await pumpCard(tester, ItemCard(item: item));
        expect(find.text('\$12.50'), findsOneWidget);
      });
    });

    testWidgets('shows wear pill when item has wear', (tester) async {
      final item = sampleInventoryItem(wear: 'Field-Tested');
      await mockNetworkImagesFor(() async {
        await pumpCard(tester, ItemCard(item: item));
        expect(find.text('FT'), findsOneWidget);
      });
    });

    testWidgets('shows group count badge when groupCount provided', (tester) async {
      final item = sampleInventoryItem();
      await mockNetworkImagesFor(() async {
        await pumpCard(tester, ItemCard(item: item, groupCount: 5));
        expect(find.text('x5'), findsOneWidget);
      });
    });

    testWidgets('shows selected/total badge when selectedCount and groupCount provided', (tester) async {
      final item = sampleInventoryItem();
      await mockNetworkImagesFor(() async {
        await pumpCard(tester, ItemCard(item: item, groupCount: 10, selectedCount: 3));
        expect(find.text('3/10'), findsOneWidget);
      });
    });

    testWidgets('shows checkmark overlay when isSelected', (tester) async {
      final item = sampleInventoryItem();
      await mockNetworkImagesFor(() async {
        await pumpCard(tester, ItemCard(item: item, isSelected: true));
        expect(find.byIcon(Icons.check), findsOneWidget);
      });
    });

    testWidgets('does not show checkmark when not selected', (tester) async {
      final item = sampleInventoryItem();
      await mockNetworkImagesFor(() async {
        await pumpCard(tester, ItemCard(item: item, isSelected: false));
        expect(find.byIcon(Icons.check), findsNothing);
      });
    });

    testWidgets('calls onTap when tapped', (tester) async {
      final item = sampleInventoryItem();
      var tapped = false;
      await mockNetworkImagesFor(() async {
        await pumpCard(tester, ItemCard(item: item, onTap: () => tapped = true));
        await tester.tap(find.byType(GestureDetector).first);
        await tester.pump();
        expect(tapped, true);
      });
    });

    testWidgets('calls onLongPress when long pressed', (tester) async {
      final item = sampleInventoryItem();
      var longPressed = false;
      await mockNetworkImagesFor(() async {
        await pumpCard(tester, ItemCard(item: item, onLongPress: () => longPressed = true));
        await tester.longPress(find.byType(GestureDetector).first);
        await tester.pump();
        expect(longPressed, true);
      });
    });

    testWidgets('shows trade ban lock icon for non-tradable item', (tester) async {
      final item = sampleTradeBannedItem();
      await mockNetworkImagesFor(() async {
        await pumpCard(tester, ItemCard(item: item));
        expect(find.byIcon(Icons.lock_rounded), findsOneWidget);
      });
    });
  });
}
