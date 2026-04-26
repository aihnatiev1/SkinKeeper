import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/features/automation/data/auto_sell_repository.dart';
import 'package:skin_keeper/features/automation/models/auto_sell_rule.dart';
import 'package:skin_keeper/features/automation/screens/auto_sell_create_sheet.dart';
import 'package:skin_keeper/features/inventory/inventory_provider.dart';
import 'package:skin_keeper/models/inventory_item.dart';

class _MockRepo extends Mock implements AutoSellRepository {}

class _FakeInventoryNotifier extends InventoryNotifier {
  _FakeInventoryNotifier(this.items);
  final List<InventoryItem> items;
  @override
  Future<List<InventoryItem>> build() async => items;
}

InventoryItem _item(String name, {double? price = 12.34}) {
  return InventoryItem(
    assetId: 'asset_$name',
    marketHashName: name,
    iconUrl: '',
    tradable: true,
    rarity: 'Mil-Spec',
    rarityColor: '#000000',
    prices: {if (price != null) 'steam': price},
  );
}

Widget _wrap({required Widget child, required _MockRepo repo}) {
  return ProviderScope(
    overrides: [
      autoSellRepositoryProvider.overrideWithValue(repo),
      inventoryProvider.overrideWith(
        () => _FakeInventoryNotifier([
          _item('AK-47 | Redline (Field-Tested)'),
          _item('AWP | Asiimov (Field-Tested)'),
        ]),
      ),
    ],
    child: MaterialApp(
      theme: AppTheme.darkTheme,
      home: Scaffold(body: child),
    ),
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(AutoSellTriggerType.above);
    registerFallbackValue(AutoSellStrategy.fixed);
    registerFallbackValue(AutoSellMode.notifyOnly);
  });

  testWidgets('Step 1 → Next disabled until item picked', (tester) async {
    final repo = _MockRepo();
    await tester.pumpWidget(_wrap(
      repo: repo,
      child: const AutoSellCreateSheet(accountId: 1),
    ));
    await tester.pumpAndSettle();

    final nextBtn = find.widgetWithText(FilledButton, 'Next');
    expect(nextBtn, findsOneWidget);
    expect(
      (tester.widget<FilledButton>(nextBtn)).onPressed,
      isNull,
      reason: 'Next must be disabled before item is picked',
    );

    // Type a query and select.
    await tester.enterText(find.byType(TextField), 'Redline');
    await tester.pumpAndSettle();
    // Tap the suggestion tile that contains the matching item.
    await tester.tap(find.text('AK-47 | Redline (Field-Tested)').first);
    await tester.pumpAndSettle();

    final nextBtn2 = find.widgetWithText(FilledButton, 'Next');
    expect(
      (tester.widget<FilledButton>(nextBtn2)).onPressed,
      isNotNull,
      reason: 'Next must be enabled once an item is picked',
    );
  });

  testWidgets('Edit mode pre-fills and skips item picker', (tester) async {
    final repo = _MockRepo();
    final existing = AutoSellRule(
      id: 99,
      accountId: 1,
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      triggerType: AutoSellTriggerType.below,
      triggerPriceUsd: 12.50,
      sellPriceUsd: 12.00,
      sellStrategy: AutoSellStrategy.fixed,
      mode: AutoSellMode.notifyOnly,
      enabled: true,
      cooldownMinutes: 360,
      timesFired: 1,
      createdAt: DateTime(2026, 4, 1),
    );

    await tester.pumpWidget(_wrap(
      repo: repo,
      child: AutoSellCreateSheet(accountId: 1, existing: existing),
    ));
    await tester.pumpAndSettle();

    // Step 2 should be active immediately — trigger threshold pre-filled.
    expect(find.text('When should it fire?'), findsOneWidget);
    // Threshold pre-filled — TextField value comes from controller text.
    expect(find.text('12.50'), findsOneWidget);
    // Step counter says 2 of 3.
    expect(find.text('Step 2 of 3'), findsOneWidget);
  });
}
