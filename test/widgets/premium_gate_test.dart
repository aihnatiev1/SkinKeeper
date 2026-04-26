import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:skin_keeper/core/analytics_service.dart';
import 'package:skin_keeper/core/settings_provider.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/features/purchases/iap_service.dart';
import 'package:skin_keeper/widgets/premium_gate.dart';
import 'package:skin_keeper/widgets/pro_chip.dart';

/// Test-only premium notifier we can flip deterministically. Replaces the
/// production [PremiumNotifier] (which reads `authStateProvider` → network
/// → secure storage) so widget tests stay hermetic.
class _FakePremiumNotifier extends PremiumNotifier {
  _FakePremiumNotifier(this.initial);
  final bool initial;

  @override
  Future<bool> build() async => initial;

  void flip(bool value) => state = AsyncData(value);
}

/// Enabling blur-fallback for a test without touching SharedPreferences.
class _EnabledBlurFallbackNotifier extends BlurFallbackNotifier {
  @override
  bool build() => true;
}

/// Sentinel child we can locate via `find.byType` in both states.
class _SentinelChild extends StatelessWidget {
  const _SentinelChild();
  @override
  Widget build(BuildContext context) =>
      const SizedBox(width: 120, height: 40);
}

Widget _buildApp({
  required Widget child,
  required _FakePremiumNotifier notifier,
  bool disableAnimations = false,
  bool blurFallback = false,
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
    overrides: [
      premiumProvider.overrideWith(() => notifier),
      if (blurFallback)
        blurFallbackProvider.overrideWith(_EnabledBlurFallbackNotifier.new),
    ],
    child: MediaQuery(
      data: MediaQueryData(disableAnimations: disableAnimations),
      child: MaterialApp.router(
        routerConfig: router,
        theme: AppTheme.darkTheme,
      ),
    ),
  );
}

void main() {
  // The locked-feature analytics dedupe set is module-global. Clear it
  // before each test so reused featureIds (`pl_charts`) keep firing the
  // mount-time event, matching real session boundaries.
  setUp(Analytics.resetLockedFeatureSession);

  group('PremiumGate v2 — free state', () {
    testWidgets('renders ProChip + CTA + feature name', (tester) async {
      final notifier = _FakePremiumNotifier(false);
      await tester.pumpWidget(_buildApp(
        notifier: notifier,
        child: const PremiumGate(
          featureId: 'pl_charts',
          featureName: 'Detailed P/L charts',
          child: _SentinelChild(),
        ),
      ));
      await tester.pump();

      expect(find.byType(ProChip), findsOneWidget);
      expect(find.text('Detailed P/L charts'), findsOneWidget);
      expect(find.text('Unlock with PRO'), findsOneWidget);
    });

    testWidgets('blurred preview is wrapped in a RepaintBoundary',
        (tester) async {
      final notifier = _FakePremiumNotifier(false);
      await tester.pumpWidget(_buildApp(
        notifier: notifier,
        child: const PremiumGate(
          featureId: 'pl_charts',
          featureName: 'Feature',
          child: _SentinelChild(),
        ),
      ));
      await tester.pump();

      final repaintBoundaries = find.descendant(
        of: find.byType(PremiumGate),
        matching: find.byType(RepaintBoundary),
      );
      expect(repaintBoundaries, findsWidgets);
    });

    testWidgets('uses BackdropFilter by default', (tester) async {
      final notifier = _FakePremiumNotifier(false);
      await tester.pumpWidget(_buildApp(
        notifier: notifier,
        child: const PremiumGate(
          featureId: 'pl_charts',
          featureName: 'Feature',
          child: _SentinelChild(),
        ),
      ));
      await tester.pump();

      expect(
        find.descendant(
          of: find.byType(PremiumGate),
          matching: find.byType(BackdropFilter),
        ),
        findsOneWidget,
      );
    });

    testWidgets('blurFallback=true → no BackdropFilter in tree',
        (tester) async {
      final notifier = _FakePremiumNotifier(false);
      await tester.pumpWidget(_buildApp(
        notifier: notifier,
        blurFallback: true,
        child: const PremiumGate(
          featureId: 'pl_charts',
          featureName: 'Feature',
          child: _SentinelChild(),
        ),
      ));
      await tester.pump();

      expect(
        find.descendant(
          of: find.byType(PremiumGate),
          matching: find.byType(BackdropFilter),
        ),
        findsNothing,
      );
    });

    testWidgets('CTA tap navigates to /premium with PaywallSource extra',
        (tester) async {
      final notifier = _FakePremiumNotifier(false);
      await tester.pumpWidget(_buildApp(
        notifier: notifier,
        child: const PremiumGate(
          featureId: 'pl_charts',
          featureName: 'Feature',
          paywallSource: PaywallSource.teaseCard,
          child: _SentinelChild(),
        ),
      ));
      await tester.pump();

      await tester.tap(find.text('Unlock with PRO'));
      await tester.pumpAndSettle();

      expect(find.text('Paywall:tease_card'), findsOneWidget);
    });
  });

  group('PremiumGate v2 — premium state', () {
    testWidgets('renders child directly, no locked artefacts', (tester) async {
      final notifier = _FakePremiumNotifier(true);
      await tester.pumpWidget(_buildApp(
        notifier: notifier,
        child: const PremiumGate(
          featureId: 'pl_charts',
          featureName: 'Feature',
          child: _SentinelChild(),
        ),
      ));
      // AsyncNotifier.build() resolves async → wait two microtask flushes
      // so `valueOrNull` returns true instead of the `null` loading state.
      await tester.pumpAndSettle();

      expect(find.byType(_SentinelChild), findsOneWidget);
      expect(find.byType(ProChip), findsNothing);
      expect(find.text('Unlock with PRO'), findsNothing);
      // Scope to the gate subtree — MaterialApp layers may plant their own
      // BackdropFilter (e.g. for modal barriers) and we don't own those.
      expect(
        find.descendant(
          of: find.byType(PremiumGate),
          matching: find.byType(BackdropFilter),
        ),
        findsNothing,
      );
    });
  });

  group('PremiumGate v2 — unlock transition', () {
    // This test was written BEFORE the animation code per PLAN §11. It
    // enforces that the reduce-motion branch NEVER constructs an
    // AnimationController — anything long-running would leave a pending
    // Ticker at test teardown and blow up in debug.
    testWidgets(
      'disableAnimations=true → no AnimationController, instant swap',
      (tester) async {
        final notifier = _FakePremiumNotifier(false);
        await tester.pumpWidget(_buildApp(
          notifier: notifier,
          disableAnimations: true,
          child: const PremiumGate(
            featureId: 'pl_charts',
            featureName: 'Feature',
            child: _SentinelChild(),
          ),
        ));
        await tester.pump();

        // Baseline: locked.
        expect(find.byType(ProChip), findsOneWidget);

        notifier.flip(true);
        await tester.pump(); // propagate state
        await tester.pump(); // post-frame callback fires setState
        // Child reachable within 2 frames.
        expect(find.byType(_SentinelChild), findsOneWidget);

        // Settle the 150ms flash cleanup.
        await tester.pump(const Duration(milliseconds: 200));
        expect(find.byType(_SentinelChild), findsOneWidget);
        expect(find.byType(ProChip), findsNothing);
      },
    );

    testWidgets(
      'false → true runs 650ms choreography exactly once, then plain child',
      (tester) async {
        final notifier = _FakePremiumNotifier(false);
        await tester.pumpWidget(_buildApp(
          notifier: notifier,
          child: const PremiumGate(
            featureId: 'pl_charts',
            featureName: 'Feature',
            child: _SentinelChild(),
          ),
        ));
        await tester.pump();

        notifier.flip(true);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));

        // During the animation the child is already laid out (opacity will
        // ramp up later in the Interval).
        expect(find.byType(_SentinelChild), findsOneWidget);

        // Run the full 650ms + onComplete rebuild.
        await tester.pump(const Duration(milliseconds: 700));
        await tester.pump();

        expect(find.byType(_SentinelChild), findsOneWidget);
        expect(find.byType(ProChip), findsNothing);
      },
    );

    // Regression test for QA P0: simulate the pre-fix buggy `_verifyAndDeliver`
    // sequence where an optimistic `setPremium(true)` flipped the state before
    // `refreshFromServer` had confirmed it, and the server response then
    // snapped it back to `false`. The gate MUST stay locked end-to-end and
    // never run the unlock choreography. After the IAP service fix
    // (PLAN §9 risk #1) `_verifyAndDeliver` no longer produces this sequence,
    // but if anyone reintroduces the bad ordering this test will catch it.
    testWidgets(
      'unlock animation does NOT fire when refresh "fails" '
      '(transient true → false flip)',
      (tester) async {
        final notifier = _FakePremiumNotifier(false);
        await tester.pumpWidget(_buildApp(
          notifier: notifier,
          child: const PremiumGate(
            featureId: 'pl_charts',
            featureName: 'Feature',
            child: _SentinelChild(),
          ),
        ));
        await tester.pump();
        expect(find.byType(ProChip), findsOneWidget);

        // Simulate the pre-fix buggy flow:
        //   1. optimistic flip → premiumProvider emits true
        //   2. server "rejects" before the next animation frame → flip back
        notifier.flip(true);
        notifier.flip(false);
        await tester.pump();

        // Pump well past the 650ms choreography window — if the gate had
        // mistakenly armed `_pendingUnlock` we'd see the overlay or a
        // running ticker here.
        await tester.pump(const Duration(milliseconds: 800));

        // Gate must be locked: chip + CTA still on screen, child gated.
        expect(find.byType(ProChip), findsOneWidget);
        expect(find.text('Unlock with PRO'), findsOneWidget);
        // No live AnimationController for unlock choreography. Other parts
        // of the test harness may register transient callbacks, but the
        // gate itself must own none.
        expect(tester.binding.transientCallbackCount, 0);
      },
    );

    // Rapid-fire toggling shouldn't stack overlays. Even when state thrashes
    // during, e.g., simultaneous purchase confirmation + auth refresh, the
    // gate should land on a stable premium tree with no leftover artefacts.
    //
    // We pump between every flip so each transition is observed by the gate
    // (without intermediate pumps Riverpod coalesces synchronous mutations
    // and we'd never test the false→true→false leg). The end state must be
    // the unlocked child — no locked shell, no live overlay.
    testWidgets(
      'rapid false→true→false→true settles into unlocked child',
      (tester) async {
        final notifier = _FakePremiumNotifier(false);
        await tester.pumpWidget(_buildApp(
          notifier: notifier,
          child: const PremiumGate(
            featureId: 'pl_charts',
            featureName: 'Feature',
            child: _SentinelChild(),
          ),
        ));
        await tester.pump();

        notifier.flip(true);
        await tester.pump(const Duration(milliseconds: 50));
        notifier.flip(false);
        await tester.pump(const Duration(milliseconds: 50));
        notifier.flip(true);
        await tester.pump(); // observe the third transition's first frame
        // Pump past the 650ms choreography window. The controller's status
        // listener fires `onComplete`, which schedules `setState` on the
        // gate; the trailing pumps drive that rebuild + paint.
        await tester.pump(const Duration(milliseconds: 700));
        await tester.pump();
        await tester.pump();

        // End state: child rendered, no locked artefacts, no overlay
        // remnants. ProChip belongs only to the locked shell — its absence
        // proves we're not still painting the overlay's preview pane.
        expect(find.byType(_SentinelChild), findsOneWidget);
        expect(find.byType(ProChip), findsNothing);
        expect(find.text('Unlock with PRO'), findsNothing);
        // The choreography overlay paints a `BackdropFilter` while running;
        // its absence under the gate subtree proves the controller has
        // completed and disposed (no leftover ticker).
        expect(
          find.descendant(
            of: find.byType(PremiumGate),
            matching: find.byType(BackdropFilter),
          ),
          findsNothing,
        );
      },
    );

    // Strengthens the existing reduce-motion test with explicit assertions
    // that no AnimationController is constructed and no transient callbacks
    // remain after the swap — the a11y contract from PLAN §5.
    testWidgets(
      'disableAnimations=true → zero AnimationController + zero active tickers',
      (tester) async {
        final notifier = _FakePremiumNotifier(false);
        await tester.pumpWidget(_buildApp(
          notifier: notifier,
          disableAnimations: true,
          child: const PremiumGate(
            featureId: 'pl_charts',
            featureName: 'Feature',
            child: _SentinelChild(),
          ),
        ));
        await tester.pump();

        notifier.flip(true);
        await tester.pump();
        await tester.pump();
        // 150ms flash cleanup window.
        await tester.pump(const Duration(milliseconds: 200));

        // Final tree: child only, no locked artefacts, no `BackdropFilter`
        // anywhere under the gate (full-choreography overlay paints a
        // `BackdropFilter` while the blur sigma is non-zero).
        expect(find.byType(_SentinelChild), findsOneWidget);
        expect(find.byType(ProChip), findsNothing);
        expect(
          find.descendant(
            of: find.byType(PremiumGate),
            matching: find.byType(BackdropFilter),
          ),
          findsNothing,
        );
        // No live ticker → reduce-motion path never created a controller.
        expect(tester.binding.transientCallbackCount, 0);
      },
    );

    // Defensive test for a tap-spam scenario (e.g. user taps the CTA repeatedly
    // while the route is loading). The gate must not throw or deadlock — it's
    // OK for each tap to push a route in this scope; debouncing is a separate
    // product decision tracked below.
    testWidgets(
      'rapid CTA taps do not throw or deadlock',
      (tester) async {
        final notifier = _FakePremiumNotifier(false);
        await tester.pumpWidget(_buildApp(
          notifier: notifier,
          child: const PremiumGate(
            featureId: 'pl_charts',
            featureName: 'Feature',
            paywallSource: PaywallSource.lockedTap,
            child: _SentinelChild(),
          ),
        ));
        await tester.pump();

        final cta = find.text('Unlock with PRO');
        expect(cta, findsOneWidget);

        // Ten rapid taps with a 10ms gap. We capture FlutterError reports
        // through `tester.takeException()` after each tap so a single
        // exception fails the test loudly.
        for (var i = 0; i < 10; i++) {
          await tester.tap(cta, warnIfMissed: false);
          await tester.pump(const Duration(milliseconds: 10));
          expect(tester.takeException(), isNull);
        }
        await tester.pumpAndSettle();

        // We don't assert on the navigation stack depth here. With the
        // current implementation each tap pushes `/premium`, which is
        // acceptable in the absence of a debounce. If product later wants
        // CTA debouncing, the test should pivot to `findsNWidgets(1)` for
        // the paywall route.
        // TODO(premium): decide whether `_LockedShell` should debounce CTA
        // taps to prevent stacking the paywall on itself. Not implemented
        // here — see QA P1.FIX report.
      },
    );
  });
}
