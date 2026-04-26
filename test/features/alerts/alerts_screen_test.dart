import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:skin_keeper/core/analytics_service.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/features/alerts/alerts_provider.dart';
import 'package:skin_keeper/features/alerts/alerts_screen.dart';
import 'package:skin_keeper/features/purchases/iap_service.dart';
import 'package:skin_keeper/models/alert.dart';
import 'package:skin_keeper/widgets/premium_gate.dart';
import 'package:skin_keeper/widgets/pro_chip.dart';

/// Hermetic premium notifier — flips programmatically, never touches network.
class _FakePremiumNotifier extends PremiumNotifier {
  _FakePremiumNotifier(this.initial);
  final bool initial;

  @override
  Future<bool> build() async => initial;
}

/// Empty alerts override so [AlertsScreen]'s tabs don't try to hit the API.
class _EmptyAlertsNotifier extends AlertsNotifier {
  @override
  Future<List<PriceAlert>> build() async => const [];
}

Widget _buildApp({required _FakePremiumNotifier premium}) {
  // GoRouter + ScreenStateBuilder rely on a real navigator stack and the
  // `/alerts/create` + `/premium` routes. We stub both so taps don't blow
  // up at navigation time.
  final router = GoRouter(
    initialLocation: '/alerts',
    routes: [
      GoRoute(
        path: '/alerts',
        builder: (_, _) => const AlertsScreen(),
      ),
      GoRoute(
        path: '/alerts/create',
        builder: (_, _) => const Scaffold(body: Text('CREATE_ALERT_ROUTE')),
      ),
      GoRoute(
        path: '/premium',
        builder: (_, _) => const Scaffold(body: Text('PAYWALL_ROUTE')),
      ),
      GoRoute(
        path: '/watchlist',
        builder: (_, _) => const Scaffold(body: Text('WATCHLIST_ROUTE')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      premiumProvider.overrideWith(() => premium),
      alertsProvider.overrideWith(_EmptyAlertsNotifier.new),
      alertHistoryProvider.overrideWith((ref) async => const []),
    ],
    child: MaterialApp.router(
      routerConfig: router,
      theme: AppTheme.darkTheme,
    ),
  );
}

void main() {
  // The `lockedFeatureViewed` dedupe set is module-global. Reset before
  // each test so re-mounted gates re-fire mount-time analytics, mirroring
  // real session boundaries.
  setUp(Analytics.resetLockedFeatureSession);

  group('AlertsScreen — PremiumGate v2 integration', () {
    testWidgets(
      'free user: locked CTA shown, Create Alert FAB cannot navigate',
      (tester) async {
        await tester.pumpWidget(
          _buildApp(premium: _FakePremiumNotifier(false)),
        );
        // Pump past the empty-state EntryAnimation (400ms fade+scale from
        // shared_ui/layout.dart). Without this, `flutter_animate` leaves
        // its restart Timer pending at teardown.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));

        // Locked state assertions: PRO chip + "Unlock with PRO" CTA visible.
        expect(find.byType(PremiumGate), findsOneWidget);
        expect(find.byType(ProChip), findsWidgets);
        expect(find.text('Unlock with PRO'), findsOneWidget);
        // The original FAB text is laid out in the gate's blurred preview
        // (PLAN §5: locked shell renders the child for visual continuity)
        // — what matters is that taps on it do NOT navigate. The locked
        // shell wraps the preview in `IgnorePointer`, redirecting taps
        // through the gate's outer GestureDetector to `/premium`.
        await tester.tap(find.text('Create Alert'), warnIfMissed: false);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));

        expect(find.text('CREATE_ALERT_ROUTE'), findsNothing);
        // Tap was absorbed by the gate's CTA → should land on the paywall.
        expect(find.text('PAYWALL_ROUTE'), findsOneWidget);
      },
    );

    testWidgets(
      'premium user: raw "Create Alert" FAB is rendered and tappable',
      (tester) async {
        await tester.pumpWidget(
          _buildApp(premium: _FakePremiumNotifier(true)),
        );
        await tester.pump();
        // 400ms empty-state animation + buffer.
        await tester.pump(const Duration(milliseconds: 500));

        // Premium state: gate renders child directly (PLAN §5: no extra
        // wrappers). ProChip belongs to the locked shell only — its absence
        // proves the gate passed through to the real CTA.
        expect(find.text('Create Alert'), findsOneWidget);
        expect(find.byType(ProChip), findsNothing);
        expect(find.text('Unlock with PRO'), findsNothing);

        // Tap is wired and routes to /alerts/create.
        await tester.tap(find.text('Create Alert'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        expect(find.text('CREATE_ALERT_ROUTE'), findsOneWidget);
      },
    );
  });
}
