import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:skin_keeper/core/analytics_service.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/features/purchases/tour/slides/slide_celebration.dart';
import 'package:skin_keeper/features/purchases/tour/slides/slide_personalized.dart';
import 'package:skin_keeper/features/purchases/tour/slides/slide_autosell_pitch.dart';
import 'package:skin_keeper/features/purchases/tour/slides/slide_feature_grid.dart';
import 'package:skin_keeper/features/purchases/tour/tour_models.dart';
import 'package:skin_keeper/features/purchases/tour/tour_provider.dart';
import 'package:skin_keeper/features/purchases/tour/tour_screen.dart';
import 'package:skin_keeper/widgets/pro_chip.dart';

/// Mounts [TourScreen] inside a minimal GoRouter app. The router includes a
/// stub `/auto-sell` and `/portfolio` so the slide-3/slide-4 navigation
/// branches resolve cleanly. The "previous shell screen" is mocked by an
/// empty home; tests push `/tour` via the [GoRouter] returned alongside.
class _Host {
  _Host(this.widget, this.router);
  final Widget widget;
  final GoRouter router;
}

_Host _buildHostApp({
  required AsyncValue<FeaturePreviewsData> previews,
  bool disableAnimations = true,
  required GlobalKey<NavigatorState> rootKey,
}) {
  final router = GoRouter(
    navigatorKey: rootKey,
    initialLocation: '/home',
    routes: [
      GoRoute(
        path: '/home',
        builder: (_, _) => const Scaffold(body: Center(child: Text('HOME'))),
      ),
      GoRoute(
        path: '/tour',
        parentNavigatorKey: rootKey,
        pageBuilder: (_, _) => const MaterialPage<void>(
          fullscreenDialog: true,
          child: TourScreen(),
        ),
      ),
      GoRoute(
        path: '/auto-sell',
        builder: (_, _) =>
            const Scaffold(body: Center(child: Text('AUTOSELL'))),
      ),
      GoRoute(
        path: '/alerts',
        builder: (_, _) =>
            const Scaffold(body: Center(child: Text('ALERTS'))),
      ),
      GoRoute(
        path: '/portfolio',
        builder: (_, _) =>
            const Scaffold(body: Center(child: Text('PORTFOLIO'))),
      ),
      GoRoute(
        path: '/transactions',
        builder: (_, _) =>
            const Scaffold(body: Center(child: Text('TRANSACTIONS'))),
      ),
    ],
  );

  final widget = ProviderScope(
    overrides: [
      // Hard-code the feature previews state so tests don't hit Dio.
      featurePreviewsProvider.overrideWith((ref) async {
        if (previews is AsyncError<FeaturePreviewsData>) {
          throw (previews as AsyncError).error;
        }
        return previews.requireValue;
      }),
    ],
    child: MediaQuery(
      data: MediaQueryData(disableAnimations: disableAnimations),
      child: MaterialApp.router(
        routerConfig: router,
        theme: AppTheme.darkTheme,
      ),
    ),
  );
  return _Host(widget, router);
}

/// Convenience: pump [TourScreen] and push the route from `/home`. Returns
/// the [AnalyticsTestRecorder] hooked up for the test so callers can assert.
Future<AnalyticsTestRecorder> _pumpTour(
  WidgetTester tester, {
  AsyncValue<FeaturePreviewsData>? previews,
  bool disableAnimations = true,
}) async {
  final recorder = AnalyticsTestRecorder();
  Analytics.testRecorder = recorder;
  final rootKey = GlobalKey<NavigatorState>();

  final host = _buildHostApp(
    previews: previews ?? AsyncData(FeaturePreviewsData.empty),
    disableAnimations: disableAnimations,
    rootKey: rootKey,
  );
  await tester.pumpWidget(host.widget);
  await tester.pumpAndSettle();

  host.router.push('/tour');
  await tester.pumpAndSettle();
  return recorder;
}

void main() {
  // Test ergonomics: SharedPreferences in tests resolves to an in-memory
  // mock if `setMockInitialValues` is used. We reset before every test so
  // the `tour_v1_completed` flag never leaks across cases.
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  tearDown(() {
    Analytics.testRecorder = null;
  });

  group('TourScreen — mount + slide 0', () {
    testWidgets('mounts on slide 0 (celebration)', (tester) async {
      await _pumpTour(tester);

      expect(find.byType(SlideCelebration), findsOneWidget);
      expect(find.byType(ProChip), findsOneWidget);
      expect(find.text('Welcome to PRO'), findsOneWidget);
    });

    testWidgets('skip button is hidden on slide 0', (tester) async {
      await _pumpTour(tester);
      // Skip lives in the top bar — its absence is asserted by text find.
      expect(find.text('Skip'), findsNothing);
    });

    testWidgets(
      'analytics fire tour_started + tour_slide_viewed(0) on mount',
      (tester) async {
        final recorder = await _pumpTour(tester);
        expect(
          recorder.events.where((e) => e.name == 'tour_started'),
          hasLength(1),
        );
        final firstSlide = recorder.events
            .where((e) => e.name == 'tour_slide_viewed')
            .toList();
        expect(firstSlide, hasLength(1));
        expect(firstSlide.single.params, {'slide': 0});
      },
    );
  });

  group('TourScreen — slide 1 (personalized)', () {
    testWidgets('renders personalized stats on success', (tester) async {
      const data = FeaturePreviewsData(
        topItem: TopItemPreview(
          marketHashName: 'AK-47 | Redline (FT)',
          iconUrl: null,
          currentPriceUsd: 18.42,
          trend7d: '+12.3%',
        ),
        inventoryStats: InventoryStatsData(
          totalItems: 47,
          totalValueUsd: 342.55,
          uniqueItems: 21,
        ),
        trackedItemsCount: 6,
        alertsActive: 3,
        potentialAutoSellCandidates: 4,
      );
      await _pumpTour(tester, previews: const AsyncData(data));

      // Step from celebration → personalized.
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(find.byType(SlidePersonalized), findsOneWidget);
      expect(find.text('AK-47 | Redline (FT)'), findsOneWidget);
      expect(find.text('+12.3%'), findsOneWidget);
      // Auto-sell hook references the count. RichText splits into TextSpans
      // so the substring lives inside the larger paragraph TextSpan tree —
      // walk the RichText to assert on the combined plainText.
      final richTexts = tester
          .widgetList<RichText>(find.byType(RichText))
          .map((t) => t.text.toPlainText())
          .where((s) => s.contains('4 skin'))
          .toList();
      expect(richTexts, isNotEmpty);
      expect(richTexts.first, contains('ready for auto-sell'));
    });

    testWidgets(
      'falls back to generic copy when feature-previews errors',
      (tester) async {
        await _pumpTour(
          tester,
          previews: const AsyncError<FeaturePreviewsData>(
            'boom',
            StackTrace.empty,
          ),
        );
        await tester.tap(find.text('Continue'));
        await tester.pumpAndSettle();

        expect(find.byType(SlidePersonalized), findsOneWidget);
        // Fallback panel renders "Welcome aboard." + a description, neither
        // of which mention any user-specific data.
        expect(find.text('Welcome aboard.'), findsOneWidget);
      },
    );

    testWidgets('skip button appears starting from slide 1', (tester) async {
      await _pumpTour(tester);
      expect(find.text('Skip'), findsNothing);

      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(find.text('Skip'), findsOneWidget);
    });
  });

  group('TourScreen — slide 2 (auto-sell pitch)', () {
    testWidgets(
      'Try it now exits tour, navigates to /auto-sell, sets completed flag',
      (tester) async {
        final recorder = await _pumpTour(tester);

        await tester.tap(find.text('Continue'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Continue'));
        await tester.pumpAndSettle();

        expect(find.byType(SlideAutosellPitch), findsOneWidget);
        await tester.tap(find.text('Try it now'));
        await tester.pumpAndSettle();

        // Tour gone; user is on /auto-sell stub.
        expect(find.byType(TourScreen), findsNothing);
        expect(find.text('AUTOSELL'), findsOneWidget);

        // Completion flag persisted.
        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getBool(kTourCompletedKey), isTrue);

        // Analytics: tourCtaTapped(slide: 2, action: 'try_now').
        final ctaEvents = recorder.events
            .where((e) =>
                e.name == 'tour_cta_tapped' &&
                e.params['action'] == 'try_now')
            .toList();
        expect(ctaEvents, hasLength(1));
        expect(ctaEvents.single.params, {
          'slide': 2,
          'action': 'try_now',
        });
      },
    );
  });

  group('TourScreen — slide 3 (feature grid)', () {
    testWidgets(
      'Done sets completed flag, fires tourCompleted',
      (tester) async {
        final recorder = await _pumpTour(tester);

        await tester.tap(find.text('Continue'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Continue'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Continue'));
        await tester.pumpAndSettle();

        expect(find.byType(SlideFeatureGrid), findsOneWidget);
        await tester.tap(find.text('Done'));
        await tester.pumpAndSettle();

        // Tour popped — back to /home.
        expect(find.byType(TourScreen), findsNothing);
        expect(find.text('HOME'), findsOneWidget);

        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getBool(kTourCompletedKey), isTrue);

        expect(
          recorder.events.where((e) => e.name == 'tour_completed'),
          hasLength(1),
        );
      },
    );

    testWidgets(
      'tile tap navigates to feature screen + completes tour',
      (tester) async {
        final recorder = await _pumpTour(tester);

        await tester.tap(find.text('Continue'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Continue'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Continue'));
        await tester.pumpAndSettle();

        expect(find.text('Smart alerts'), findsOneWidget);
        await tester.tap(find.text('Smart alerts'));
        await tester.pumpAndSettle();

        expect(find.text('ALERTS'), findsOneWidget);
        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getBool(kTourCompletedKey), isTrue);

        // CTA event includes the tile id.
        final tileEvents = recorder.events
            .where((e) =>
                e.name == 'tour_cta_tapped' &&
                (e.params['action'] as String).startsWith('feature_tile'))
            .toList();
        expect(tileEvents, hasLength(1));
        expect(tileEvents.single.params['action'], 'feature_tile:smart_alerts');
      },
    );
  });

  group('TourScreen — skip flow', () {
    testWidgets(
      'skip from slide 1 → confirm → analytics fire + flag set',
      (tester) async {
        final recorder = await _pumpTour(tester);

        await tester.tap(find.text('Continue'));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Skip'));
        await tester.pumpAndSettle();

        // Cupertino dialog visible — confirm by tapping "Skip".
        // The dialog has a destructive 'Skip' action; the existing
        // `Skip` text in the top bar is now hidden behind the dialog
        // barrier, so the only visible 'Skip' is the dialog action.
        await tester.tap(find.text('Skip').last);
        await tester.pumpAndSettle();

        // Tour popped.
        expect(find.byType(TourScreen), findsNothing);

        // Two analytics events: tour_skipped + tour_skipped_from_slide(1).
        expect(
          recorder.events.where((e) => e.name == 'tour_skipped'),
          hasLength(1),
        );
        final fromSlide = recorder.events
            .where((e) => e.name == 'tour_skipped_from_slide')
            .toList();
        expect(fromSlide, hasLength(1));
        expect(fromSlide.single.params, {'at_slide': 1});

        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getBool(kTourCompletedKey), isTrue);
      },
    );

    testWidgets('skip can be cancelled via Continue tour', (tester) async {
      final recorder = await _pumpTour(tester);

      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Skip'));
      await tester.pumpAndSettle();

      // Cancel skip — tour stays mounted.
      await tester.tap(find.text('Continue tour'));
      await tester.pumpAndSettle();

      expect(find.byType(TourScreen), findsOneWidget);
      // No skip events fired.
      expect(
        recorder.events.where((e) => e.name == 'tour_skipped'),
        isEmpty,
      );
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool(kTourCompletedKey), isNull);
    });
  });

  group('TourCompletionService', () {
    testWidgets('isCompleted defaults to false; markCompleted persists',
        (tester) async {
      const service = TourCompletionService();
      expect(await service.isCompleted(), isFalse);

      await service.markCompleted();
      expect(await service.isCompleted(), isTrue);

      // reset() clears it.
      await service.reset();
      expect(await service.isCompleted(), isFalse);
    });
  });
}
