import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/widgets/premium_gate.dart';

void main() {
  // Helper: wrap with GoRouter context (PremiumGate uses context.push)
  Widget createTestApp({required Widget child}) {
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => Scaffold(body: child),
        ),
        GoRoute(
          path: '/premium',
          builder: (_, __) => const Scaffold(body: Text('Premium Screen')),
        ),
      ],
    );
    return ProviderScope(
      child: MaterialApp.router(
        routerConfig: router,
        theme: AppTheme.darkTheme,
      ),
    );
  }

  // Use pump(duration) rather than pumpAndSettle — PremiumGate uses
  // flutter_animate with onPlay repeat which creates an infinite animation loop.
  Future<void> pumpWidget(WidgetTester tester, Widget app) async {
    await tester.pumpWidget(app);
    await tester.pump(const Duration(milliseconds: 300));
  }

  group('PremiumGate widget', () {
    testWidgets('shows child content for premium user', (tester) async {
      await pumpWidget(
        tester,
        createTestApp(
          child: PremiumGate(
            featureName: 'Trade History',
            isPremium: true,
            child: const Text('Premium Content'),
          ),
        ),
      );
      expect(find.text('Premium Content'), findsOneWidget);
      expect(find.text('PRO Feature'), findsNothing);
    });

    testWidgets('shows lock overlay for free user', (tester) async {
      await pumpWidget(
        tester,
        createTestApp(
          child: PremiumGate(
            featureName: 'Unlock trade history analytics',
            isPremium: false,
            child: const Text('Hidden Content'),
          ),
        ),
      );
      expect(find.text('PRO Feature'), findsOneWidget);
      expect(find.text('Unlock PRO'), findsOneWidget);
    });

    testWidgets('shows feature name in lock overlay', (tester) async {
      const featureName = 'Advanced analytics feature';
      await pumpWidget(
        tester,
        createTestApp(
          child: PremiumGate(
            featureName: featureName,
            isPremium: false,
            child: const Text('Hidden'),
          ),
        ),
      );
      expect(find.text(featureName), findsOneWidget);
    });

    testWidgets('shows premium icon for free user', (tester) async {
      await pumpWidget(
        tester,
        createTestApp(
          child: PremiumGate(
            featureName: 'Feature',
            isPremium: false,
            child: const Text('Hidden'),
          ),
        ),
      );
      expect(find.byIcon(Icons.workspace_premium_rounded), findsOneWidget);
    });
  });
}
