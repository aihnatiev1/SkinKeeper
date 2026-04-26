import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:skin_keeper/core/analytics_service.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/features/purchases/paywall_screen_parts.dart';

/// Hosts a single paywall sub-widget for hermetic testing — no providers,
/// no router, no IAP. The full [PaywallScreen] mount is intentionally
/// avoided here because it instantiates `iapServiceProvider`, which in turn
/// listens on the in_app_purchase plugin and can't run inside flutter_test.
Widget _host(
  Widget child, {
  bool disableAnimations = false,
}) {
  return MaterialApp(
    theme: AppTheme.darkTheme,
    home: MediaQuery(
      data: MediaQueryData(disableAnimations: disableAnimations),
      child: Scaffold(
        backgroundColor: AppTheme.bg,
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: child,
        ),
      ),
    ),
  );
}

void main() {
  // Several paywall sub-widgets call `Analytics.*`. The recorder lets
  // tests assert event firing without a Firebase mock.
  late AnalyticsTestRecorder recorder;
  setUp(() {
    recorder = AnalyticsTestRecorder();
    Analytics.testRecorder = recorder;
  });
  tearDown(() {
    Analytics.testRecorder = null;
  });

  group('PaywallHero', () {
    testWidgets('renders new outcome-led copy', (tester) async {
      await tester.pumpWidget(_host(const PaywallHero()));
      // Drive time past the 2.2s chart controller + the longest
      // `flutter_animate` delay (1.7s for the FIRED pill) so no timers
      // remain pending at teardown.
      await tester.pump(const Duration(milliseconds: 2400));
      await tester.pumpAndSettle();

      expect(find.text('Sell at the peak.'), findsOneWidget);
      expect(
        find.textContaining('Auto-sell rules fire'),
        findsOneWidget,
      );
    });

    testWidgets('reduce-motion: no crash, content still renders',
        (tester) async {
      await tester.pumpWidget(
        _host(const PaywallHero(), disableAnimations: true),
      );
      // With `disableAnimations: true`, the hero must paint a static
      // chart line + fired pill on the first frame and not schedule any
      // controllers. A single pump is enough.
      await tester.pump();

      expect(find.text('Sell at the peak.'), findsOneWidget);
      // The "FIRED" pill must be present even without animation —
      // otherwise reduce-motion users miss the value-prop punch line.
      expect(find.text('FIRED'), findsOneWidget);
      // No exceptions raised during the static paint pass.
      expect(tester.takeException(), isNull);
    });
  });

  group('PaywallValueProps', () {
    testWidgets(
      'renders all three value props (auto-sell, smart alerts, P&L) '
      'as the primary content',
      (tester) async {
        await tester.pumpWidget(_host(const PaywallValueProps()));
        await tester.pump();

        expect(find.text('Auto-sell rules'), findsOneWidget);
        expect(find.text('Smart alerts'), findsOneWidget);
        expect(find.text('Per-account P&L'), findsOneWidget);

        // Bodies — partial substring matches keep the test resilient to
        // copy tweaks while still asserting the critical phrasing.
        expect(
          find.textContaining('60-second cancel window'),
          findsOneWidget,
        );
        expect(
          find.textContaining('no Steam grinding'),
          findsOneWidget,
        );
        expect(
          find.textContaining('Steam account'),
          findsOneWidget,
        );
      },
    );
  });

  group('PaywallMatrixDisclosure', () {
    testWidgets('collapsed by default — matrix rows not rendered',
        (tester) async {
      await tester.pumpWidget(_host(const PaywallMatrixDisclosure()));
      await tester.pump();

      // Disclosure label is visible.
      expect(find.text('Compare all features'), findsOneWidget);
      // But collapsed state hides the matrix rows.
      expect(find.text('Steam price tracking'), findsNothing);
      expect(find.text('Auto-sell rules'), findsNothing);
    });

    testWidgets('tap expands matrix and fires paywall_matrix_expanded once',
        (tester) async {
      await tester.pumpWidget(_host(const PaywallMatrixDisclosure()));
      await tester.pump();

      await tester.tap(find.text('Compare all features'));
      // AnimatedSize + AnimatedRotation play out in 220ms.
      await tester.pump(const Duration(milliseconds: 250));

      // Matrix is now visible.
      expect(find.text('Steam price tracking'), findsOneWidget);
      expect(find.text('Auto-sell rules'), findsOneWidget);

      // Exactly one analytics event.
      final expandEvents =
          recorder.events.where((e) => e.name == 'paywall_matrix_expanded');
      expect(expandEvents.length, 1);

      // Toggling closed then open again does NOT log a duplicate
      // expansion — the flag de-dupes per mount.
      await tester.tap(find.text('Compare all features'));
      await tester.pump(const Duration(milliseconds: 250));
      await tester.tap(find.text('Compare all features'));
      await tester.pump(const Duration(milliseconds: 250));

      final stillOne =
          recorder.events.where((e) => e.name == 'paywall_matrix_expanded');
      expect(stillOne.length, 1);
    });
  });
}
