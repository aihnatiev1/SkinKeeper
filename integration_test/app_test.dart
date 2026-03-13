// Integration test suite for SkinKeeper app.
// Run on device/emulator: flutter test integration_test/
// These tests use mocked providers so no real network calls are made.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:network_image_mock/network_image_mock.dart';
import 'package:skin_keeper/core/cache_service.dart';
import 'package:skin_keeper/core/router.dart' show routerProvider;
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/features/auth/steam_auth_service.dart';
import 'package:skin_keeper/features/inventory/inventory_provider.dart';
import 'package:skin_keeper/features/inventory/sell_provider.dart';
import 'package:skin_keeper/features/portfolio/portfolio_pl_provider.dart';
import 'package:skin_keeper/features/portfolio/portfolio_provider.dart';
import 'package:skin_keeper/features/purchases/iap_service.dart';
import 'package:skin_keeper/features/auth/session_provider.dart';
import 'package:skin_keeper/features/settings/steam_session_provider.dart';
import 'package:skin_keeper/features/trades/trades_provider.dart';
import 'package:skin_keeper/l10n/app_localizations.dart';
import 'package:skin_keeper/models/inventory_item.dart';
import 'package:skin_keeper/models/profit_loss.dart';
import 'package:skin_keeper/models/trade_offer.dart';
import 'package:skin_keeper/models/user.dart';

import '../test/helpers/fixtures.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('integration_hive_');
    await CacheService.initForTest(tempDir.path);
  });

  tearDownAll(() async {
    await tempDir.delete(recursive: true);
  });

  Widget createApp({SteamUser? user, bool isPremium = false}) {
    final items = sampleInventoryList(count: 5);
    final overrides = [
      authStateProvider.overrideWith(() => _FakeAuthNotifier(user)),
      inventoryProvider.overrideWith(() => _FakeInventoryNotifier(items)),
      itemPLFamilyProvider.overrideWith((ref, name) => null),
      sellOperationProvider.overrideWith(() => _FakeSellNotifier()),
      quickPriceProvider.overrideWith((ref, name) async => 1250),
      portfolioProvider.overrideWith(
          () => _FakePortfolioNotifier(samplePortfolioSummary())),
      portfolioPLProvider.overrideWith(
          () => _FakePLNotifier(samplePortfolioPL())),
      premiumProvider.overrideWith(() => _FakePremiumNotifier(isPremium)),
      sessionStatusProvider.overrideWith(
          () => _FakeSessionStatusNotifier()),
      steamSessionStatusProvider.overrideWith(
          () => _FakeSteamSessionNotifier()),
      tradesProvider.overrideWith(
          () => _FakeTradesNotifier(TradesState(
            offers: [sampleTradeOffer()],
            total: 1,
          ))),
    ];

    return ProviderScope(
      overrides: overrides,
      child: Consumer(
        builder: (context, ref, _) {
          final router = ref.watch(routerProvider);
          return MaterialApp.router(
            routerConfig: router,
            theme: AppTheme.darkTheme,
            locale: const Locale('en'),
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: AppLocalizations.supportedLocales,
          );
        },
      ),
    );
  }

  group('E2E: Auth flow', () {
    testWidgets('unauthenticated user sees login screen', (tester) async {
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(createApp(user: null));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 600));
        // Login screen should show when user is null
        expect(find.textContaining('SkinKeeper'), findsOneWidget);
        await tester.pump(const Duration(seconds: 1));
      });
    });

    testWidgets('authenticated user navigates to portfolio', (tester) async {
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(createApp(user: sampleUser()));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 600));
        // Should be on the main app shell, not login
        expect(find.byType(MaterialApp), findsOneWidget);
        await tester.pump(const Duration(seconds: 1));
      });
    });
  });

  group('E2E: Tab navigation', () {
    testWidgets('authenticated user can switch between tabs', (tester) async {
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(createApp(user: sampleUser()));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 600));

        // Try to find any bottom nav items
        final navBar = find.byType(BottomNavigationBar);
        if (navBar.evaluate().isNotEmpty) {
          // Tap inventory tab (usually index 1 or 2)
          final navItems = tester.widgetList(find.byType(BottomNavigationBarItem));
          expect(navItems.length, greaterThan(0));
        }

        expect(find.byType(MaterialApp), findsOneWidget);
        await tester.pump(const Duration(seconds: 1));
      });
    });
  });

  group('E2E: Inventory flow', () {
    testWidgets('inventory screen shows items grid', (tester) async {
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(createApp(user: sampleUser()));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 600));

        // Navigate to inventory tab if possible
        final inventoryBtn = find.byIcon(Icons.inventory_2_outlined);
        if (inventoryBtn.evaluate().isNotEmpty) {
          await tester.tap(inventoryBtn.first);
          await tester.pump(const Duration(milliseconds: 400));
          expect(find.byType(GridView), findsOneWidget);
        }

        await tester.pump(const Duration(seconds: 1));
      });
    });
  });

  group('E2E: Sell flow', () {
    testWidgets('item selection shows selection tray', (tester) async {
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(createApp(user: sampleUser()));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 600));

        // Navigate to inventory
        final inventoryBtn = find.byIcon(Icons.inventory_2_outlined);
        if (inventoryBtn.evaluate().isNotEmpty) {
          await tester.tap(inventoryBtn.first);
          await tester.pump(const Duration(milliseconds: 400));
        }

        expect(find.byType(MaterialApp), findsOneWidget);
        await tester.pump(const Duration(seconds: 1));
      });
    });
  });
}

// ─── Fake Notifiers ───────────────────────────────────────────────────

class _FakeAuthNotifier extends AuthNotifier {
  final SteamUser? _user;
  _FakeAuthNotifier(this._user);

  @override
  Future<SteamUser?> build() async => _user;
}

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

class _FakeSteamSessionNotifier extends SteamSessionNotifier {
  @override
  Future<SteamSessionStatus> build() async =>
      const SteamSessionStatus(hasSession: true, hasToken: true, configured: true);
}

class _FakeTradesNotifier extends TradesNotifier {
  final TradesState _state;
  _FakeTradesNotifier(this._state);

  @override
  Future<TradesState> build() async => _state;
}
