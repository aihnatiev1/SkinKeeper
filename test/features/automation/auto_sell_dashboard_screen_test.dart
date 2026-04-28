import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:skin_keeper/core/analytics_service.dart';
import 'package:skin_keeper/core/feature_flags/feature_flags_provider.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/features/automation/data/auto_sell_repository.dart';
import 'package:skin_keeper/features/automation/models/auto_sell_stats.dart';
import 'package:skin_keeper/features/automation/screens/auto_sell_dashboard_screen.dart';
import 'package:skin_keeper/features/purchases/iap_service.dart';

class _MockRepo extends Mock implements AutoSellRepository {}

class _FakePremiumNotifier extends PremiumNotifier {
  _FakePremiumNotifier(this.initial);
  final bool initial;
  @override
  Future<bool> build() async => initial;
}

Widget _wrap({
  required _FakePremiumNotifier premium,
  required _MockRepo repo,
}) {
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => const AutoSellDashboardScreen()),
      GoRoute(
        path: '/auto-sell',
        builder: (_, _) =>
            const Scaffold(body: Text('list', key: Key('list'))),
      ),
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
      featureFlagsProvider
          .overrideWith((ref) async => const {'auto_sell': true}),
    ],
    child: MaterialApp.router(
      routerConfig: router,
      theme: AppTheme.darkTheme,
    ),
  );
}

AutoSellStats _stats({
  int activeRules = 4,
  int autoListRules = 2,
  int totalFires = 10,
  int listedCount = 8,
  double totalListedValue = 1247.85,
  List<RefusalReasonStat> reasons = const [],
  List<DailyHistoryPoint> history = const [],
  int periodDays = 30,
}) =>
    AutoSellStats(
      activeRules: activeRules,
      autoListRules: autoListRules,
      totalFires: totalFires,
      listedCount: listedCount,
      cancelledCount: 1,
      failedCount: 1,
      notifiedCount: 0,
      totalListedValueUsd: totalListedValue,
      avgPremiumOverTrigger: 0.5,
      topRefusalReasons: reasons,
      history: history,
      periodDays: periodDays,
    );

void main() {
  setUp(Analytics.resetLockedFeatureSession);

  testWidgets('premium user sees hero value, stat cards, success rate',
      (tester) async {
    final repo = _MockRepo();
    when(() => repo.getStats(days: any(named: 'days')))
        .thenAnswer((_) async => _stats());

    await tester.pumpWidget(
        _wrap(premium: _FakePremiumNotifier(true), repo: repo));
    // Allow the AsyncNotifier + FutureProvider to resolve. Animations on
    // the hero number use flutter_animate so we pump enough frames for
    // the slide+fade to land but don't pumpAndSettle (it'd hang on the
    // ongoing chart paint).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // Hero number — currency.format inserts a narrow no-break space (U+202F)
    // as the thousands separator, so the formatted string is "$1 247.85".
    expect(find.textContaining('247.85'), findsOneWidget);

    // Stat cards labels visible.
    expect(find.text('ACTIVE RULES'), findsOneWidget);
    expect(find.text('TOTAL FIRES'), findsOneWidget);
    expect(find.text('SUCCESS'), findsOneWidget);

    // Active rule count.
    expect(find.text('4'), findsOneWidget);
    // Success rate 8/10 = 80%.
    expect(find.text('80%'), findsOneWidget);

    // CTA at bottom — scroll to bring it into view first because the
    // outer ListView lazily builds children.
    await tester.scrollUntilVisible(
      find.text('Tune your rules'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Tune your rules'), findsOneWidget);
  });

  testWidgets('empty stats render gracefully — no NaN, no crash',
      (tester) async {
    final repo = _MockRepo();
    when(() => repo.getStats(days: any(named: 'days')))
        .thenAnswer((_) async => AutoSellStats.empty(30));

    await tester.pumpWidget(
        _wrap(premium: _FakePremiumNotifier(true), repo: repo));
    await tester.pumpAndSettle();

    // Success rate with zero fires renders as em-dash.
    expect(find.text('—'), findsOneWidget);
    // Refusal-reasons happy path copy.
    expect(find.text('No refusals — every fire went through cleanly.'),
        findsOneWidget);
    // Chart renders empty-state message instead of erroring.
    expect(find.text('No fires in this period'), findsOneWidget);
  });

  testWidgets('refusal-reason known code renders friendly title',
      (tester) async {
    final repo = _MockRepo();
    when(() => repo.getStats(days: any(named: 'days'))).thenAnswer(
      (_) async => _stats(
        reasons: const [
          RefusalReasonStat(reason: 'INSUFFICIENT_INVENTORY', count: 3),
        ],
      ),
    );

    await tester.pumpWidget(
        _wrap(premium: _FakePremiumNotifier(true), repo: repo));
    await tester.pumpAndSettle();

    expect(find.text('Item not in inventory'), findsOneWidget);
    expect(find.text('TOP REFUSAL REASONS'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
  });

  testWidgets('refusal-reason unknown code falls back to raw string',
      (tester) async {
    final repo = _MockRepo();
    when(() => repo.getStats(days: any(named: 'days'))).thenAnswer(
      (_) async => _stats(
        reasons: const [
          RefusalReasonStat(reason: 'BRAND_NEW_REASON', count: 1),
        ],
      ),
    );

    await tester.pumpWidget(
        _wrap(premium: _FakePremiumNotifier(true), repo: repo));
    await tester.pumpAndSettle();

    expect(find.text('BRAND_NEW_REASON'), findsOneWidget);
  });

  testWidgets('period chip tap re-fetches with new days', (tester) async {
    final repo = _MockRepo();
    when(() => repo.getStats(days: any(named: 'days')))
        .thenAnswer((_) async => _stats());

    await tester.pumpWidget(
        _wrap(premium: _FakePremiumNotifier(true), repo: repo));
    await tester.pumpAndSettle();

    // Initial fetch with default 30 days.
    verify(() => repo.getStats(days: 30)).called(1);

    // Tap the 7D chip.
    await tester.tap(find.text('7D'));
    await tester.pumpAndSettle();

    verify(() => repo.getStats(days: 7)).called(1);
  });

  testWidgets('free user sees gate (no real fetch)', (tester) async {
    final repo = _MockRepo();
    when(() => repo.getStats(days: any(named: 'days')))
        .thenAnswer((_) async => _stats());

    await tester.pumpWidget(
        _wrap(premium: _FakePremiumNotifier(false), repo: repo));
    await tester.pumpAndSettle();

    // Backend not called for non-premium users — the gate intercepts.
    verifyNever(() => repo.getStats(days: any(named: 'days')));
    // Gate renders unlock CTA.
    expect(find.text('Unlock with PRO'), findsOneWidget);
  });
}
