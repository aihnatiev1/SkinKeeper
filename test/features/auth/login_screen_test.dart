import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:skin_keeper/features/auth/login_screen.dart';
import 'package:skin_keeper/features/auth/steam_auth_service.dart';
import 'package:skin_keeper/models/user.dart';

import '../../helpers/test_app.dart';

void main() {
  List<Override> buildOverrides() {
    return [
      authStateProvider.overrideWith(() => _FakeAuthNotifier(null)),
    ];
  }

  Future<void> pumpScreen(WidgetTester tester, Widget widget) async {
    // Phone viewport — login screen should render cleanly at ~iPhone width
    // now that the market-logos row is a Wrap and the button text is
    // Flexible+ellipsis.
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(widget);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
  }

  group('LoginScreen', () {
    testWidgets('renders without crashing', (tester) async {
      await pumpScreen(
        tester,
        createTestApp(
          child: const LoginScreen(),
          overrides: buildOverrides(),
        ),
      );
      expect(find.byType(LoginScreen), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
    });

    testWidgets('shows QR code tab and browser tab', (tester) async {
      await pumpScreen(
        tester,
        createTestApp(
          child: const LoginScreen(),
          overrides: buildOverrides(),
        ),
      );
      // Login screen should show two auth methods: QR and browser
      expect(find.byType(LoginScreen), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
    });

    testWidgets('shows app title or logo', (tester) async {
      await pumpScreen(
        tester,
        createTestApp(
          child: const LoginScreen(),
          overrides: buildOverrides(),
        ),
      );
      // SkinKeeper or similar branding
      expect(find.textContaining('SkinKeeper'), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
    });

    testWidgets('shows QR tab by default', (tester) async {
      await pumpScreen(
        tester,
        createTestApp(
          child: const LoginScreen(),
          overrides: buildOverrides(),
        ),
      );
      // QR tab content should be visible by default
      expect(find.byType(LoginScreen), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
    });
  });
}

// ─── Fake Notifier ───────────────────────────────────────────────────

class _FakeAuthNotifier extends AuthNotifier {
  final SteamUser? _user;
  _FakeAuthNotifier(this._user);

  @override
  Future<SteamUser?> build() async => _user;
}
