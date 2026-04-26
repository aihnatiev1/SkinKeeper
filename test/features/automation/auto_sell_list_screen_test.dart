import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:skin_keeper/core/analytics_service.dart';
import 'package:skin_keeper/core/feature_flags/feature_flags_provider.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/features/automation/data/auto_sell_repository.dart';
import 'package:skin_keeper/features/automation/models/auto_sell_rule.dart';
import 'package:skin_keeper/features/automation/screens/auto_sell_list_screen.dart';
import 'package:skin_keeper/features/automation/widgets/auto_sell_rule_card.dart';
import 'package:skin_keeper/features/purchases/iap_service.dart';
import 'package:skin_keeper/widgets/pro_chip.dart';

class _MockRepo extends Mock implements AutoSellRepository {}

class _FakePremiumNotifier extends PremiumNotifier {
  _FakePremiumNotifier(this.initial);
  final bool initial;
  @override
  Future<bool> build() async => initial;
}

Widget _wrap({
  required Widget child,
  required _FakePremiumNotifier premium,
  required _MockRepo repo,
}) {
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => child),
      GoRoute(
        path: '/premium',
        builder: (_, _) =>
            const Scaffold(body: Text('Paywall', key: Key('paywall'))),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      premiumProvider.overrideWith(() => premium),
      autoSellRepositoryProvider.overrideWithValue(repo),
      // P10: gate the auto-sell screen behind a feature flag. Stub it to
      // `true` here so existing premium/free-state tests continue to render
      // the real screen — separate tests cover the disabled path.
      featureFlagsProvider
          .overrideWith((ref) async => const {'auto_sell': true}),
    ],
    child: MaterialApp.router(
      routerConfig: router,
      theme: AppTheme.darkTheme,
    ),
  );
}

AutoSellRule _rule(int id, {bool enabled = true}) => AutoSellRule(
      id: id,
      accountId: 1,
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      triggerType: AutoSellTriggerType.above,
      triggerPriceUsd: 15,
      sellPriceUsd: 14.99,
      sellStrategy: AutoSellStrategy.fixed,
      mode: AutoSellMode.notifyOnly,
      enabled: enabled,
      cooldownMinutes: 360,
      timesFired: 0,
      createdAt: DateTime(2026, 4, 20),
    );

void main() {
  setUp(Analytics.resetLockedFeatureSession);

  testWidgets('free user sees gate with fake preview rules', (tester) async {
    final repo = _MockRepo();
    when(() => repo.getRules()).thenAnswer((_) async => []);

    await tester.pumpWidget(_wrap(
      child: const AutoSellListScreen(),
      premium: _FakePremiumNotifier(false),
      repo: repo,
    ));
    await tester.pump();

    // Locked shell paints the ProChip + CTA.
    expect(find.byType(ProChip), findsOneWidget);
    expect(find.text('Unlock with PRO'), findsOneWidget);

    // Fake preview should be visible behind the blur — at least one
    // sample rule card with the "AK-47 | Redline" text the preview seeds.
    expect(find.byType(AutoSellRuleCard), findsWidgets);

    // No counter chip (counter is premium-only).
    expect(find.textContaining(' of 10'), findsNothing);
  });

  testWidgets('premium user sees real rules + counter chip', (tester) async {
    final repo = _MockRepo();
    when(() => repo.getRules()).thenAnswer((_) async => [
          _rule(1),
          _rule(2),
        ]);

    await tester.pumpWidget(_wrap(
      child: const AutoSellListScreen(),
      premium: _FakePremiumNotifier(true),
      repo: repo,
    ));
    await tester.pumpAndSettle();

    expect(find.byType(ProChip), findsNothing);
    expect(find.text('Unlock with PRO'), findsNothing);
    expect(find.byType(AutoSellRuleCard), findsNWidgets(2));
    expect(find.text('2 of 10'), findsOneWidget);
  });

  testWidgets('premium user with empty list sees empty state', (tester) async {
    final repo = _MockRepo();
    when(() => repo.getRules()).thenAnswer((_) async => const []);

    await tester.pumpWidget(_wrap(
      child: const AutoSellListScreen(),
      premium: _FakePremiumNotifier(true),
      repo: repo,
    ));
    // Don't pumpAndSettle — EmptyState fires a flutter_animate timeline that
    // never settles in test land; pump enough frames for the AsyncNotifier
    // future to resolve and the empty state to mount.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('No rules yet'), findsOneWidget);
    expect(find.text('Create your first auto-sell rule'), findsOneWidget);
    expect(find.byType(AutoSellRuleCard), findsNothing);

    // Drain the EmptyState fade timeline so test teardown sees no pending
    // timers. 500ms is comfortably above its 400ms animation.
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('rule card shows trigger summary and mode chip', (tester) async {
    final repo = _MockRepo();
    when(() => repo.getRules()).thenAnswer((_) async => [_rule(1)]);

    await tester.pumpWidget(_wrap(
      child: const AutoSellListScreen(),
      premium: _FakePremiumNotifier(true),
      repo: repo,
    ));
    await tester.pumpAndSettle();

    expect(find.text('Sell when price > \$15.00'), findsOneWidget);
    expect(find.text('NOTIFY'), findsOneWidget);
  });

  // P10: feature flag kill switch. When `auto_sell` is OFF the screen renders
  // the "Coming soon" placeholder for ALL users — free and PRO alike — and
  // skips the PremiumGate entirely so users don't see a confusing paywall
  // for a feature that's been turned off server-side.
  testWidgets('feature flag OFF renders Coming soon for free user',
      (tester) async {
    final repo = _MockRepo();
    when(() => repo.getRules()).thenAnswer((_) async => []);

    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (_, _) => const AutoSellListScreen()),
    ]);

    await tester.pumpWidget(ProviderScope(
      overrides: [
        premiumProvider.overrideWith(() => _FakePremiumNotifier(false)),
        autoSellRepositoryProvider.overrideWithValue(repo),
        featureFlagsProvider
            .overrideWith((ref) async => const {'auto_sell': false}),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        theme: AppTheme.darkTheme,
      ),
    ));
    await tester.pumpAndSettle();

    // No gate, no chip, no preview cards — placeholder only.
    expect(find.text('Auto-sell coming soon'), findsOneWidget);
    expect(find.byType(ProChip), findsNothing);
    expect(find.byType(AutoSellRuleCard), findsNothing);
  });

  testWidgets('feature flag OFF renders Coming soon for premium user too',
      (tester) async {
    final repo = _MockRepo();
    when(() => repo.getRules()).thenAnswer((_) async => [_rule(1), _rule(2)]);

    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (_, _) => const AutoSellListScreen()),
    ]);

    await tester.pumpWidget(ProviderScope(
      overrides: [
        premiumProvider.overrideWith(() => _FakePremiumNotifier(true)),
        autoSellRepositoryProvider.overrideWithValue(repo),
        featureFlagsProvider
            .overrideWith((ref) async => const {'auto_sell': false}),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        theme: AppTheme.darkTheme,
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Auto-sell coming soon'), findsOneWidget);
    expect(find.byType(AutoSellRuleCard), findsNothing);
    // No counter chip either — header doesn't render the rule count when
    // the feature is killed.
    expect(find.textContaining(' of 10'), findsNothing);
  });
}
