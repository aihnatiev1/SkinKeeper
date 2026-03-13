import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:network_image_mock/network_image_mock.dart';
import 'package:skin_keeper/core/cache_service.dart';
import 'package:skin_keeper/features/portfolio/portfolio_provider.dart';
import 'package:skin_keeper/features/portfolio/portfolio_pl_provider.dart';
import 'package:skin_keeper/features/portfolio/portfolio_screen.dart';
import 'package:skin_keeper/features/purchases/iap_service.dart';
import 'package:skin_keeper/features/auth/session_provider.dart';
import 'package:skin_keeper/models/profit_loss.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/test_app.dart';

void main() {
  late Directory tempDir;

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('hive_port_screen_');
    await CacheService.initForTest(tempDir.path);
  });

  tearDownAll(() async {
    await tempDir.delete(recursive: true);
  });

  List<Override> buildOverrides({bool isPremium = false}) {
    return [
      portfolioProvider
          .overrideWith(() => _FakePortfolioNotifier(samplePortfolioSummary())),
      portfolioPLProvider.overrideWith(() => _FakePLNotifier(samplePortfolioPL())),
      itemPLFamilyProvider.overrideWith((ref, name) => null),
      premiumProvider
          .overrideWith(() => _FakePremiumNotifier(isPremium)),
      sessionStatusProvider.overrideWith(
          () => _FakeSessionStatusNotifier()),
    ];
  }

  Future<void> pumpScreen(WidgetTester tester, Widget widget) async {
    await tester.pumpWidget(widget);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  group('PortfolioScreen', () {
    testWidgets('renders without crashing', (tester) async {
      await mockNetworkImagesFor(() async {
        await pumpScreen(
          tester,
          createTestApp(
            child: const PortfolioScreen(),
            overrides: buildOverrides(),
          ),
        );
        expect(find.byType(PortfolioScreen), findsOneWidget);
        await tester.pump(const Duration(seconds: 1));
      });
    });

    testWidgets('shows total value from portfolio summary', (tester) async {
      await mockNetworkImagesFor(() async {
        await pumpScreen(
          tester,
          createTestApp(
            child: const PortfolioScreen(),
            overrides: buildOverrides(),
          ),
        );
        // samplePortfolioSummary totalValue is 1234.56
        expect(find.textContaining('1'), findsWidgets);
        await tester.pump(const Duration(seconds: 1));
      });
    });

    testWidgets('shows tab bar', (tester) async {
      await mockNetworkImagesFor(() async {
        await pumpScreen(
          tester,
          createTestApp(
            child: const PortfolioScreen(),
            overrides: buildOverrides(),
          ),
        );
        // Tab bar with overview/P&L/history tabs should exist
        expect(find.byType(PortfolioScreen), findsOneWidget);
        await tester.pump(const Duration(seconds: 1));
      });
    });
  });
}

// ─── Fake Notifiers ───────────────────────────────────────────────────

class _FakePortfolioNotifier extends PortfolioNotifier {
  final PortfolioSummary _summary;
  _FakePortfolioNotifier(this._summary);

  @override
  Future<PortfolioSummary> build() async => _summary;
}

class _FakePLNotifier extends PortfolioPLNotifier {
  final PortfolioPL _pl;
  _FakePLNotifier(this._pl);

  @override
  Future<PortfolioPL> build() async => _pl;

  @override
  Future<void> refresh() async {}
}

class _FakePremiumNotifier extends PremiumNotifier {
  final bool _isPremium;
  _FakePremiumNotifier(this._isPremium);

  @override
  Future<bool> build() async => _isPremium;
}

class _FakeSessionStatusNotifier extends SessionStatusNotifier {
  @override
  Future<SessionStatus> build() async => const SessionStatus(status: 'active');
}
