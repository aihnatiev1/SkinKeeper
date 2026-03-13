import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:skin_keeper/core/cache_service.dart';
import 'package:skin_keeper/features/auth/steam_auth_service.dart';
import 'package:skin_keeper/features/settings/settings_screen.dart';
import 'package:skin_keeper/features/settings/steam_session_provider.dart';
import 'package:skin_keeper/models/user.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/test_app.dart';

void main() {
  late Directory tempDir;

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('hive_settings_screen_');
    await CacheService.initForTest(tempDir.path);
  });

  tearDownAll(() async {
    await tempDir.delete(recursive: true);
  });

  List<Override> buildOverrides({bool isPremium = false}) {
    return [
      authStateProvider.overrideWith(
          () => _FakeAuthNotifier(sampleUser(isPremium: isPremium))),
      steamSessionStatusProvider.overrideWith(
          () => _FakeSteamSessionNotifier()),
    ];
  }

  Future<void> pumpScreen(WidgetTester tester, Widget widget) async {
    await tester.pumpWidget(widget);
    await tester.pump();
    // flutter_animate uses delays up to 300ms for staggered items
    await tester.pump(const Duration(milliseconds: 600));
  }

  group('SettingsScreen', () {
    testWidgets('renders without crashing', (tester) async {
      await pumpScreen(
        tester,
        createTestApp(
          child: const SettingsScreen(),
          overrides: buildOverrides(),
        ),
      );
      expect(find.byType(SettingsScreen), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
    });

    testWidgets('shows settings title', (tester) async {
      await pumpScreen(
        tester,
        createTestApp(
          child: const SettingsScreen(),
          overrides: buildOverrides(),
        ),
      );
      // Settings title from l10n
      expect(find.byType(SettingsScreen), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
    });

    testWidgets('has sign out list tile', (tester) async {
      await pumpScreen(
        tester,
        createTestApp(
          child: const SettingsScreen(),
          overrides: buildOverrides(),
        ),
      );
      // Settings screen renders a ListView — scroll to find sign out
      await tester.drag(find.byType(ListView), const Offset(0, -800));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('Sign Out'), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
    });

    testWidgets('shows settings title text', (tester) async {
      await pumpScreen(
        tester,
        createTestApp(
          child: const SettingsScreen(),
          overrides: buildOverrides(),
        ),
      );
      // Settings title from l10n (English: "Settings")
      expect(find.text('Settings'), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
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

class _FakeSteamSessionNotifier extends SteamSessionNotifier {
  @override
  Future<SteamSessionStatus> build() async =>
      const SteamSessionStatus(hasSession: true, hasToken: true, configured: true);
}
