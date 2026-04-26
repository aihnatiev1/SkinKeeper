import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:skin_keeper/core/analytics_service.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/features/purchases/iap_service.dart';
import 'package:skin_keeper/widgets/pro_chip.dart';
import 'package:skin_keeper/widgets/tease_card.dart';

/// Test-only premium notifier — same pattern as `premium_gate_test.dart`.
class _FakePremiumNotifier extends PremiumNotifier {
  _FakePremiumNotifier(this.initial);
  final bool initial;

  @override
  Future<bool> build() async => initial;

  void flip(bool value) => state = AsyncData(value);
}

Widget _buildApp({
  required _FakePremiumNotifier notifier,
  required Widget child,
}) {
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => Scaffold(body: child)),
      GoRoute(
        path: '/premium',
        builder: (_, state) => Scaffold(
          body: Text(
            'Paywall:${(state.extra as PaywallSource?)?.analyticsValue ?? 'none'}',
          ),
        ),
      ),
    ],
  );

  return ProviderScope(
    overrides: [premiumProvider.overrideWith(() => notifier)],
    child: MaterialApp.router(
      routerConfig: router,
      theme: AppTheme.darkTheme,
    ),
  );
}

void main() {
  group('TeaseCard', () {
    testWidgets('renders for free users with headline + ProChip',
        (tester) async {
      final notifier = _FakePremiumNotifier(false);
      await tester.pumpWidget(_buildApp(
        notifier: notifier,
        child: const TeaseCard(
          headline: 'Smart alerts on this list',
          subtitle: 'Get push notifications.',
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Smart alerts on this list'), findsOneWidget);
      expect(find.text('Get push notifications.'), findsOneWidget);
      expect(find.byType(ProChip), findsOneWidget);
    });

    testWidgets('hides for premium users (no headline, no chip)',
        (tester) async {
      final notifier = _FakePremiumNotifier(true);
      await tester.pumpWidget(_buildApp(
        notifier: notifier,
        child: const TeaseCard(
          headline: 'Smart alerts on this list',
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Smart alerts on this list'), findsNothing);
      expect(find.byType(ProChip), findsNothing);
    });

    testWidgets('hides while premium status is loading (no flash)',
        (tester) async {
      final notifier = _FakePremiumNotifier(false);
      await tester.pumpWidget(_buildApp(
        notifier: notifier,
        child: const TeaseCard(headline: 'Premium feature'),
      ));
      // First frame, before async build resolves: provider is in loading
      // state. The card must NOT render — flashing a paywall pitch in
      // someone's face during a 200ms auth load looks broken.
      expect(find.text('Premium feature'), findsNothing);
    });

    testWidgets(
      'tap navigates to /premium with PaywallSource.teaseCard',
      (tester) async {
        final notifier = _FakePremiumNotifier(false);
        await tester.pumpWidget(_buildApp(
          notifier: notifier,
          child: const TeaseCard(headline: 'Tap me'),
        ));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Tap me'));
        await tester.pumpAndSettle();

        // The dummy paywall route stamps the source value into its body —
        // confirms the `extra` was propagated end-to-end.
        expect(find.text('Paywall:tease_card'), findsOneWidget);
      },
    );

    testWidgets('renders custom icon when provided', (tester) async {
      final notifier = _FakePremiumNotifier(false);
      await tester.pumpWidget(_buildApp(
        notifier: notifier,
        child: const TeaseCard(
          headline: 'Test',
          icon: Icons.notifications_active_outlined,
        ),
      ));
      await tester.pumpAndSettle();

      expect(
        find.byIcon(Icons.notifications_active_outlined),
        findsOneWidget,
      );
    });

    testWidgets('flipping premium=true at runtime hides the card',
        (tester) async {
      final notifier = _FakePremiumNotifier(false);
      await tester.pumpWidget(_buildApp(
        notifier: notifier,
        child: const TeaseCard(headline: 'Reactive'),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Reactive'), findsOneWidget);

      notifier.flip(true);
      await tester.pump();

      expect(find.text('Reactive'), findsNothing);
    });
  });
}
