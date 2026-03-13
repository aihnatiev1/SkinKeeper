import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:network_image_mock/network_image_mock.dart';
import 'package:skin_keeper/features/inventory/inventory_provider.dart';
import 'package:skin_keeper/features/inventory/widgets/quantity_picker_sheet.dart';

import '../helpers/fixtures.dart';
import '../helpers/test_app.dart';

void main() {
  group('QuantityPickerSheet widget', () {
    ItemGroup makeGroup(int count) => ItemGroup(
          marketHashName: 'AK-47 | Redline (Field-Tested)',
          items: List.generate(
            count,
            (i) => sampleInventoryItem(assetId: '${10000 + i}'),
          ),
        );

    testWidgets('shows max quantity label', (tester) async {
      final group = makeGroup(5);
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(
          createTestScaffold(
            body: QuantityPickerSheet(
              group: group,
              onConfirm: (_) {},
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('x5 available'), findsOneWidget);
      });
    });

    testWidgets('starts at quantity 1', (tester) async {
      final group = makeGroup(5);
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(
          createTestScaffold(
            body: QuantityPickerSheet(
              group: group,
              onConfirm: (_) {},
            ),
          ),
        );
        await tester.pumpAndSettle();
        // The quantity display is the large "1" text
        expect(find.text('1'), findsWidgets);
        // The confirm button shows "Select 1"
        expect(find.text('Select 1'), findsOneWidget);
      });
    });

    testWidgets('increment button increases quantity', (tester) async {
      final group = makeGroup(5);
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(
          createTestScaffold(
            body: QuantityPickerSheet(
              group: group,
              onConfirm: (_) {},
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byIcon(Icons.add_rounded));
        await tester.pump();
        expect(find.text('Select 2'), findsOneWidget);
      });
    });

    testWidgets('decrement button decreases quantity', (tester) async {
      final group = makeGroup(5);
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(
          createTestScaffold(
            body: QuantityPickerSheet(
              group: group,
              onConfirm: (_) {},
            ),
          ),
        );
        await tester.pumpAndSettle();
        // Increment first
        await tester.tap(find.byIcon(Icons.add_rounded));
        await tester.pump();
        expect(find.text('Select 2'), findsOneWidget);
        // Now decrement
        await tester.tap(find.byIcon(Icons.remove_rounded));
        await tester.pump();
        expect(find.text('Select 1'), findsOneWidget);
      });
    });

    testWidgets('confirm calls onConfirm with correct asset IDs', (tester) async {
      final group = makeGroup(3);
      List<String>? confirmedIds;
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(
          createTestScaffold(
            body: QuantityPickerSheet(
              group: group,
              onConfirm: (ids) => confirmedIds = ids,
            ),
          ),
        );
        await tester.pumpAndSettle();
        // Tap confirm with default quantity (1)
        await tester.tap(find.text('Select 1'));
        await tester.pump();
        expect(confirmedIds, isNotNull);
        expect(confirmedIds!.length, 1);
        expect(confirmedIds!.first, group.items.first.assetId);
      });
    });

    testWidgets('all quick-select button shown when group > 3', (tester) async {
      final group = makeGroup(10);
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(
          createTestScaffold(
            body: QuantityPickerSheet(
              group: group,
              onConfirm: (_) {},
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('All (10)'), findsOneWidget);
      });
    });
  });
}
