import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:network_image_mock/network_image_mock.dart';
import 'package:skin_keeper/features/inventory/widgets/item_badges.dart';
import 'package:skin_keeper/features/inventory/widgets/item_card.dart';
import 'package:skin_keeper/features/inventory/widgets/item_card_footer.dart'
    show TradeBanBadgeColor;
import 'package:skin_keeper/models/inventory_item.dart';

import '../../../helpers/fixtures.dart';
import '../../../helpers/test_app.dart';

Future<void> _pumpInScaffold(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(
    createTestScaffold(
      body: Center(child: child),
    ),
  );
  await tester.pump(const Duration(milliseconds: 100));
}

Future<void> _pumpCard(WidgetTester tester, InventoryItem item) async {
  await tester.pumpWidget(
    createTestScaffold(
      body: SizedBox(
        width: 180,
        height: 240,
        child: ItemCard(item: item),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  group('DopplerPhasePill', () {
    testWidgets('renders phase text', (tester) async {
      await _pumpInScaffold(
        tester,
        const DopplerPhasePill(phase: 'Phase 2', color: Colors.cyan),
      );
      expect(find.text('Phase 2'), findsOneWidget);
    });

    testWidgets('renders without explicit color (falls back to muted)',
        (tester) async {
      await _pumpInScaffold(
        tester,
        const DopplerPhasePill(phase: 'P1'),
      );
      expect(find.text('P1'), findsOneWidget);
    });
  });

  group('DopplerPhaseGem', () {
    testWidgets('renders for Ruby phase with red color', (tester) async {
      const ruby = Color(0xFFE74C3C);
      await _pumpInScaffold(
        tester,
        const DopplerPhaseGem(phase: 'Ruby', color: ruby, size: 14),
      );
      // Gem renders as a Container with a circle decoration — confirm size.
      final gem = tester.getSize(find.byType(DopplerPhaseGem));
      expect(gem.width, 14);
      expect(gem.height, 14);
    });
  });

  group('RareBadge', () {
    testWidgets('Ruby reason renders red label', (tester) async {
      await _pumpInScaffold(tester, const RareBadge(reason: 'Ruby'));
      expect(find.text('RUBY'), findsOneWidget);
    });

    testWidgets('Blue Gem reason renders blue label', (tester) async {
      await _pumpInScaffold(tester, const RareBadge(reason: 'Blue Gem'));
      expect(find.text('BLUE GEM'), findsOneWidget);
    });

    testWidgets('falls back to amber color for unknown reason', (tester) async {
      await _pumpInScaffold(tester, const RareBadge(reason: 'Custom'));
      expect(find.text('CUSTOM'), findsOneWidget);
    });
  });

  group('StickerThumb', () {
    testWidgets('renders sticker name in tooltip', (tester) async {
      const sticker = StickerInfo(
        slot: 0,
        stickerId: 1,
        name: 'Crown (Foil)',
        wear: 0.0,
        image: '',
      );
      await mockNetworkImagesFor(() async {
        await _pumpInScaffold(tester, const StickerThumb(sticker: sticker));
        // Tooltip widget exists with sticker name in message.
        final tooltip = tester.widget<Tooltip>(find.byType(Tooltip));
        expect(tooltip.message, contains('Crown (Foil)'));
        // Pristine sticker (wear = 0) -> NOT scraped, no Opacity wrapper.
        expect(find.byType(Opacity), findsNothing);
      });
    });

    testWidgets('shows scrape % in tooltip for scraped sticker',
        (tester) async {
      const sticker = StickerInfo(
        slot: 1,
        stickerId: 2,
        name: 'Holo Boston',
        wear: 0.5, // 50% scraped
        image: '',
      );
      await mockNetworkImagesFor(() async {
        await _pumpInScaffold(tester, const StickerThumb(sticker: sticker));
        final tooltip = tester.widget<Tooltip>(find.byType(Tooltip));
        expect(tooltip.message, contains('Holo Boston'));
        expect(tooltip.message, contains('Scrape 50%'));
      });
    });

    testWidgets('applies opacity overlay when wear > scrape threshold',
        (tester) async {
      const sticker = StickerInfo(
        slot: 0,
        stickerId: 3,
        name: 'Test',
        wear: 0.2,
        image: '',
      );
      await mockNetworkImagesFor(() async {
        await _pumpInScaffold(tester, const StickerThumb(sticker: sticker));
        final opacities = tester
            .widgetList<Opacity>(find.byType(Opacity))
            .map((w) => w.opacity)
            .toList();
        // The sticker icon is wrapped in Opacity(0.5) when scraped.
        expect(opacities, contains(0.5));
      });
    });

    testWidgets('falls back to "Sticker" tooltip when name empty',
        (tester) async {
      const sticker = StickerInfo(
        slot: 0,
        stickerId: 0,
        name: '',
        image: '',
      );
      await mockNetworkImagesFor(() async {
        await _pumpInScaffold(tester, const StickerThumb(sticker: sticker));
        final tooltip = tester.widget<Tooltip>(find.byType(Tooltip));
        expect(tooltip.message, equals('Sticker'));
      });
    });
  });

  group('TradeBanBadge color tiers', () {
    test('<=2 days left -> red', () {
      expect(TradeBanBadgeColor.forDaysLeft(0), const Color(0xFFEF4444));
      expect(TradeBanBadgeColor.forDaysLeft(1), const Color(0xFFEF4444));
      expect(TradeBanBadgeColor.forDaysLeft(2), const Color(0xFFEF4444));
    });

    test('3 days left -> orange (mid)', () {
      expect(TradeBanBadgeColor.forDaysLeft(3), const Color(0xFFFB923C));
    });

    test('>=4 days left -> gold', () {
      expect(TradeBanBadgeColor.forDaysLeft(4), const Color(0xFFF59E0B));
      expect(TradeBanBadgeColor.forDaysLeft(7), const Color(0xFFF59E0B));
    });

    test('null -> red (defensive default)', () {
      expect(TradeBanBadgeColor.forDaysLeft(null), const Color(0xFFEF4444));
    });
  });

  group('ItemCard badge integration', () {
    testWidgets('rare doppler shows phase gem (no pill)', (tester) async {
      // Ruby Karambit Doppler — paint_index 415.
      final item = sampleDopplerItem();
      await mockNetworkImagesFor(() async {
        await _pumpCard(tester, item);
        // Gem renders for rare dopplers (Ruby/Sapphire/Black Pearl/Emerald).
        expect(find.byType(DopplerPhaseGem), findsOneWidget);
      });
    });

    testWidgets('non-rare doppler shows phase pill', (tester) async {
      // Phase 2 — paint_index 419.
      final item = sampleDopplerItem(paintIndex: 419);
      await mockNetworkImagesFor(() async {
        await _pumpCard(tester, item);
        expect(find.byType(DopplerPhasePill), findsOneWidget);
        expect(find.text('Phase 2'), findsOneWidget);
      });
    });

    testWidgets('hides trade-ban lock when ban already expired',
        (tester) async {
      // Tradable=false but tradeBanUntil already in the past.
      final item = sampleInventoryItem(
        tradable: false,
        tradeBanUntil: DateTime.now().toUtc().subtract(const Duration(hours: 1)),
      );
      await mockNetworkImagesFor(() async {
        await _pumpCard(tester, item);
        // Lock icon should NOT render — ban window has elapsed.
        expect(find.byIcon(Icons.lock_rounded), findsNothing);
      });
    });

    testWidgets('clamps stickers row to 4 max', (tester) async {
      final stickers = List.generate(
        6,
        (i) => StickerInfo(
          slot: i,
          stickerId: 1000 + i,
          name: 'S$i',
          wear: 0,
          image: '',
        ),
      );
      final item = sampleInventoryItem(stickers: stickers);
      await mockNetworkImagesFor(() async {
        await _pumpCard(tester, item);
        // Even with 6 stickers in the model, only 4 thumbs render on the card.
        expect(find.byType(StickerThumb), findsNWidgets(4));
      });
    });

    testWidgets('renders no stickers when list is empty (no crash)',
        (tester) async {
      final item = sampleInventoryItem(stickers: const []);
      await mockNetworkImagesFor(() async {
        await _pumpCard(tester, item);
        expect(find.byType(StickerThumb), findsNothing);
      });
    });
  });

  group('Demo flag', () {
    test('isShowAllBadgesDemo defaults to false', () {
      expect(isShowAllBadgesDemo, isFalse);
      // isBadgeDemoEnabled also defaults false (false even in debug because
      // the flag itself is off).
      expect(isBadgeDemoEnabled, isFalse);
    });
  });
}
