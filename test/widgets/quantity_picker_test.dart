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
        // Explicit pump durations — pumpAndSettle hangs on flutter_animate
        // repeating animations in this sheet.
        await tester.pump(const Duration(milliseconds: 300));
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
        // Explicit pump durations — pumpAndSettle hangs on flutter_animate
        // repeating animations in this sheet.
        await tester.pump(const Duration(milliseconds: 300));
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
        // Explicit pump durations — pumpAndSettle hangs on flutter_animate
        // repeating animations in this sheet.
        await tester.pump(const Duration(milliseconds: 300));
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
        // Explicit pump durations — pumpAndSettle hangs on flutter_animate
        // repeating animations in this sheet.
        await tester.pump(const Duration(milliseconds: 300));
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
        // QuantityPickerSheet calls Navigator.pop() on confirm. To give
        // that pop somewhere to go, push the sheet as a modal inside a
        // normal MaterialApp Navigator, then trigger the show via a tap.
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Builder(
                builder: (ctx) => Center(
                  child: ElevatedButton(
                    onPressed: () => showModalBottomSheet<void>(
                      context: ctx,
                      builder: (_) => QuantityPickerSheet(
                        group: group,
                        onConfirm: (ids) => confirmedIds = ids,
                      ),
                    ),
                    child: const Text('open'),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('open'));
        // Modal bottom sheet entrance animation is ~250ms in Material.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        // Tap confirm with default quantity (1). warnIfMissed=false so
        // we don't fail if the button is briefly offscreen during the
        // keep-alive-during-pop transition.
        await tester.tap(find.text('Select 1'), warnIfMissed: false);
        await tester.pump(const Duration(milliseconds: 400));
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
        // Explicit pump durations — pumpAndSettle hangs on flutter_animate
        // repeating animations in this sheet.
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.text('All (10)'), findsOneWidget);
      });
    });
  });
}
