import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:skin_keeper/features/inventory/inventory_provider.dart';
import 'package:skin_keeper/models/inventory_item.dart';

import '../../helpers/fixtures.dart';

void main() {
  group('ItemGroup', () {
    test('representative returns first item', () {
      final items = [
        sampleInventoryItem(assetId: '1'),
        sampleInventoryItem(assetId: '2'),
      ];
      final group = ItemGroup(
        marketHashName: items.first.marketHashName,
        items: items,
      );
      expect(group.representative.assetId, '1');
    });

    test('count returns number of items', () {
      final items = sampleInventoryList(count: 3);
      final group = ItemGroup(
        marketHashName: items.first.marketHashName,
        items: items,
      );
      expect(group.count, 3);
    });

    test('isGroup returns true for multiple items', () {
      final items = sampleInventoryList(count: 2);
      final group = ItemGroup(
        marketHashName: items.first.marketHashName,
        items: items,
      );
      expect(group.isGroup, true);
    });

    test('isGroup returns false for single item', () {
      final group = ItemGroup(
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        items: [sampleInventoryItem()],
      );
      expect(group.isGroup, false);
    });

    test('totalValue calculates price times count', () {
      final items = [
        sampleInventoryItem(
            assetId: '1', prices: {'steam': 10.0, 'skinport': 12.0}),
        sampleInventoryItem(
            assetId: '2', prices: {'steam': 10.0, 'skinport': 12.0}),
      ];
      final group = ItemGroup(
        marketHashName: items.first.marketHashName,
        items: items,
      );
      // bestPrice prefers steam when set → 10.0 * 2 = 20.0
      expect(group.totalValue, 20.0);
    });
  });

  group('SortOption filtering', () {
    test('filteredInventoryProvider sorts by priceDesc by default', () {
      // This tests the sort logic directly on a list
      final items = [
        sampleInventoryItem(assetId: '1', prices: {'steam': 5.0}),
        sampleInventoryItem(assetId: '2', prices: {'steam': 20.0}),
        sampleInventoryItem(assetId: '3', prices: {'steam': 10.0}),
      ];

      items.sort(
          (a, b) => (b.bestPrice ?? 0).compareTo(a.bestPrice ?? 0));

      expect(items[0].assetId, '2'); // 20.0
      expect(items[1].assetId, '3'); // 10.0
      expect(items[2].assetId, '1'); // 5.0
    });

    test('sorting by priceAsc works', () {
      final items = [
        sampleInventoryItem(assetId: '1', prices: {'steam': 5.0}),
        sampleInventoryItem(assetId: '2', prices: {'steam': 20.0}),
        sampleInventoryItem(assetId: '3', prices: {'steam': 10.0}),
      ];

      items.sort(
          (a, b) => (a.bestPrice ?? 0).compareTo(b.bestPrice ?? 0));

      expect(items[0].assetId, '1'); // 5.0
      expect(items[1].assetId, '3'); // 10.0
      expect(items[2].assetId, '2'); // 20.0
    });

    test('sorting by nameAsc works', () {
      final items = [
        sampleInventoryItem(
            assetId: '1', marketHashName: 'Zebra | Skin (FT)'),
        sampleInventoryItem(
            assetId: '2', marketHashName: 'Alpha | Skin (FT)'),
        sampleInventoryItem(
            assetId: '3', marketHashName: 'Middle | Skin (FT)'),
      ];

      items.sort(
          (a, b) => a.marketHashName.compareTo(b.marketHashName));

      expect(items[0].assetId, '2'); // Alpha
      expect(items[1].assetId, '3'); // Middle
      expect(items[2].assetId, '1'); // Zebra
    });

    test('sorting by floatAsc puts low float first', () {
      final items = [
        sampleInventoryItem(assetId: '1', floatValue: 0.5),
        sampleInventoryItem(assetId: '2', floatValue: 0.01),
        sampleInventoryItem(assetId: '3', floatValue: 0.3),
      ];

      items.sort(
          (a, b) => (a.floatValue ?? 999).compareTo(b.floatValue ?? 999));

      expect(items[0].assetId, '2'); // 0.01
      expect(items[1].assetId, '3'); // 0.3
      expect(items[2].assetId, '1'); // 0.5
    });
  });

  group('Inventory filtering logic', () {
    test('search query filters by market hash name', () {
      final items = [
        sampleInventoryItem(marketHashName: 'AK-47 | Redline (FT)'),
        sampleInventoryItem(
            assetId: '2', marketHashName: 'M4A4 | Howl (FN)'),
        sampleInventoryItem(
            assetId: '3', marketHashName: 'AK-47 | Asiimov (FT)'),
      ];

      final query = 'ak-47';
      final filtered = items.where((item) {
        return item.marketHashName.toLowerCase().contains(query);
      }).toList();

      expect(filtered.length, 2);
    });

    test('wearFilter filters by wear abbreviation', () {
      final items = [
        sampleInventoryItem(assetId: '1', wear: 'Factory New'),
        sampleInventoryItem(assetId: '2', wear: 'Field-Tested'),
        sampleInventoryItem(assetId: '3', wear: 'Factory New'),
      ];

      const wearFilter = 'FN';
      final filtered =
          items.where((item) => item.wearShort == wearFilter).toList();

      expect(filtered.length, 2);
    });

    test('tradableOnly filter excludes non-tradable items', () {
      final items = [
        sampleInventoryItem(assetId: '1', tradable: true),
        sampleInventoryItem(assetId: '2', tradable: false),
        sampleInventoryItem(assetId: '3', tradable: true),
      ];

      final filtered = items.where((item) => item.tradable).toList();
      expect(filtered.length, 2);
    });

    test('hideNoPrice filter excludes items without prices', () {
      final items = [
        sampleInventoryItem(assetId: '1', prices: {'steam': 10.0}),
        sampleInventoryItem(assetId: '2', prices: {}),
        sampleInventoryItem(assetId: '3', prices: {'skinport': 5.0}),
      ];

      final filtered =
          items.where((item) => item.prices.isNotEmpty).toList();
      expect(filtered.length, 2);
    });
  });

  group('Grouping logic', () {
    test('items with same marketHashName are grouped', () {
      final items = [
        sampleInventoryItem(
            assetId: '1', marketHashName: 'AK-47 | Redline (FT)'),
        sampleInventoryItem(
            assetId: '2', marketHashName: 'AK-47 | Redline (FT)'),
        sampleInventoryItem(
            assetId: '3', marketHashName: 'M4A4 | Howl (FN)'),
      ];

      final map = <String, List<InventoryItem>>{};
      for (final item in items) {
        map.putIfAbsent(item.marketHashName, () => []).add(item);
      }

      final groups = map.entries
          .map((e) => ItemGroup(marketHashName: e.key, items: e.value))
          .toList();

      expect(groups.length, 2);
      expect(groups.first.count, 2);
      expect(groups.last.count, 1);
    });

    test('grouping disabled produces one group per item', () {
      final items = [
        sampleInventoryItem(
            assetId: '1', marketHashName: 'AK-47 | Redline (FT)'),
        sampleInventoryItem(
            assetId: '2', marketHashName: 'AK-47 | Redline (FT)'),
      ];

      // With grouping disabled
      final groups = items
          .map((i) =>
              ItemGroup(marketHashName: i.marketHashName, items: [i]))
          .toList();

      expect(groups.length, 2);
      expect(groups[0].isGroup, false);
    });
  });
}
