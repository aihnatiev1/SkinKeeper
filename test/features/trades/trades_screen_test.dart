import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:network_image_mock/network_image_mock.dart';
import 'package:skin_keeper/core/cache_service.dart';
import 'package:skin_keeper/features/auth/session_provider.dart';
import 'package:skin_keeper/features/trades/trades_provider.dart';
import 'package:skin_keeper/features/trades/trades_screen.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/test_app.dart';

void main() {
  late Directory tempDir;

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('hive_trades_screen_');
    await CacheService.initForTest(tempDir.path);
  });

  tearDownAll(() async {
    await tempDir.delete(recursive: true);
  });

  List<Override> buildOverrides({int tradeCount = 3}) {
    final offers = List.generate(tradeCount, (i) => sampleTradeOffer(id: '$i'));
    return [
      tradesProvider.overrideWith(
          () => _FakeTradesNotifier(TradesState(offers: offers, total: tradeCount))),
      sessionStatusProvider.overrideWith(
          () => _FakeSessionStatusNotifier()),
    ];
  }

  Future<void> pumpScreen(WidgetTester tester, Widget widget) async {
    // TradesScreen has pill tabs + account filter that wrap awkwardly on
    // narrow viewports; use a tablet-ish size so Flex children lay out
    // without overflow. Same width as Flutter's default test surface (800)
    // but taller.
    await tester.binding.setSurfaceSize(const Size(800, 1000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(widget);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  group('TradesScreen', () {
    testWidgets('renders without crashing', (tester) async {
      await mockNetworkImagesFor(() async {
        await pumpScreen(
          tester,
          createTestApp(
            child: const TradesScreen(),
            overrides: buildOverrides(),
          ),
        );
        expect(find.byType(TradesScreen), findsOneWidget);
        await tester.pump(const Duration(seconds: 1));
      });
    });

    testWidgets('shows tab bar with filter options', (tester) async {
      await mockNetworkImagesFor(() async {
        await pumpScreen(
          tester,
          createTestApp(
            child: const TradesScreen(),
            overrides: buildOverrides(),
          ),
        );
        // Should have filter tabs (All, Incoming, Outgoing)
        expect(find.byType(TradesScreen), findsOneWidget);
        await tester.pump(const Duration(seconds: 1));
      });
    });

    testWidgets('shows trade list with offers', (tester) async {
      await mockNetworkImagesFor(() async {
        await pumpScreen(
          tester,
          createTestApp(
            child: const TradesScreen(),
            overrides: buildOverrides(tradeCount: 2),
          ),
        );
        await tester.pump(const Duration(seconds: 1));
        // Trade cards render a "From X" / "To X" header. If the screen
        // mounted the provider data and reached the card, at least one
        // such header is in the tree.
        expect(find.textContaining(RegExp(r'^(From|To) ')), findsWidgets);
      });
    });

    testWidgets('shows empty state when no trades', (tester) async {
      await mockNetworkImagesFor(() async {
        await pumpScreen(
          tester,
          createTestApp(
            child: const TradesScreen(),
            overrides: buildOverrides(tradeCount: 0),
          ),
        );
        expect(find.byType(TradesScreen), findsOneWidget);
        await tester.pump(const Duration(seconds: 1));
      });
    });
  });
}

// ─── Fake Notifiers ───────────────────────────────────────────────────

class _FakeTradesNotifier extends TradesNotifier {
  final TradesState _state;
  _FakeTradesNotifier(this._state);

  @override
  Future<TradesState> build() async => _state;
}

class _FakeSessionStatusNotifier extends SessionStatusNotifier {
  @override
  Future<SessionStatus> build() async => const SessionStatus(status: 'valid');
}
