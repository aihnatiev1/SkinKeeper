import 'package:flutter_test/flutter_test.dart';
import 'package:skin_keeper/core/analytics_service.dart';

/// P2 unit tests — verify event names + params for newly-added analytics
/// methods. Firebase isn't initialized in this test harness, so the
/// `Firebase.apps.isNotEmpty` guard inside `_event` short-circuits the
/// real call. The test-only [AnalyticsTestRecorder] hook captures every
/// fired event so we can assert on it without a Firebase mock.
void main() {
  late AnalyticsTestRecorder recorder;

  setUp(() {
    recorder = AnalyticsTestRecorder();
    Analytics.testRecorder = recorder;
    Analytics.resetLockedFeatureSession();
  });

  tearDown(() {
    Analytics.testRecorder = null;
    Analytics.resetLockedFeatureSession();
  });

  group('paywallViewed — backward compatibility', () {
    test('no-arg call logs source: unknown', () async {
      await Analytics.paywallViewed();

      expect(recorder.events, hasLength(1));
      expect(recorder.events.single.name, 'paywall_viewed');
      expect(recorder.events.single.params, {'source': 'unknown'});
    });

    test('null source logs source: unknown', () async {
      await Analytics.paywallViewed(source: null);

      expect(recorder.events.single.params, {'source': 'unknown'});
    });

    test('every PaywallSource maps to its analyticsValue', () async {
      for (final source in PaywallSource.values) {
        recorder.clear();
        await Analytics.paywallViewed(source: source);
        expect(recorder.events.single.name, 'paywall_viewed');
        expect(recorder.events.single.params, {'source': source.analyticsValue});
      }
    });

    test('teaseCard logs source: tease_card (snake_case)', () async {
      await Analytics.paywallViewed(source: PaywallSource.teaseCard);
      expect(recorder.events.single.params, {'source': 'tease_card'});
    });
  });

  group('lockedFeatureViewed — dedupe per session', () {
    test('first call fires event with correct name + param', () async {
      await Analytics.lockedFeatureViewed(feature: 'pl_charts');

      expect(recorder.events, hasLength(1));
      expect(recorder.events.single.name, 'locked_feature_viewed');
      expect(recorder.events.single.params, {'feature': 'pl_charts'});
    });

    test('second call with same feature is suppressed', () async {
      await Analytics.lockedFeatureViewed(feature: 'pl_charts');
      await Analytics.lockedFeatureViewed(feature: 'pl_charts');
      await Analytics.lockedFeatureViewed(feature: 'pl_charts');

      expect(recorder.events, hasLength(1));
    });

    test('different features are tracked independently', () async {
      await Analytics.lockedFeatureViewed(feature: 'pl_charts');
      await Analytics.lockedFeatureViewed(feature: 'auto_sell');
      await Analytics.lockedFeatureViewed(feature: 'smart_alerts');

      expect(recorder.events, hasLength(3));
      expect(
        recorder.events.map((e) => e.params['feature']),
        ['pl_charts', 'auto_sell', 'smart_alerts'],
      );
    });

    test('resetLockedFeatureSession allows the same feature to fire again',
        () async {
      await Analytics.lockedFeatureViewed(feature: 'pl_charts');
      Analytics.resetLockedFeatureSession();
      await Analytics.lockedFeatureViewed(feature: 'pl_charts');

      expect(recorder.events, hasLength(2));
      expect(recorder.events[0].params, {'feature': 'pl_charts'});
      expect(recorder.events[1].params, {'feature': 'pl_charts'});
    });
  });

  group('lockedFeatureTapped — every tap fires', () {
    test('logs event with feature param', () async {
      await Analytics.lockedFeatureTapped(feature: 'auto_sell');

      expect(recorder.events.single.name, 'locked_feature_tapped');
      expect(recorder.events.single.params, {'feature': 'auto_sell'});
    });

    test('repeated taps fire repeatedly (no dedupe)', () async {
      await Analytics.lockedFeatureTapped(feature: 'auto_sell');
      await Analytics.lockedFeatureTapped(feature: 'auto_sell');
      await Analytics.lockedFeatureTapped(feature: 'auto_sell');

      expect(recorder.events, hasLength(3));
      for (final e in recorder.events) {
        expect(e.name, 'locked_feature_tapped');
        expect(e.params, {'feature': 'auto_sell'});
      }
    });
  });

  group('Tour event stubs (P8)', () {
    test('tourStarted logs tour_started with no params', () async {
      await Analytics.tourStarted();

      expect(recorder.events.single.name, 'tour_started');
      expect(recorder.events.single.params, isEmpty);
    });

    test('tourSlideViewed logs slide param', () async {
      await Analytics.tourSlideViewed(slide: 2);

      expect(recorder.events.single.name, 'tour_slide_viewed');
      expect(recorder.events.single.params, {'slide': 2});
    });

    test('tourCompleted logs tour_completed', () async {
      await Analytics.tourCompleted();

      expect(recorder.events.single.name, 'tour_completed');
      expect(recorder.events.single.params, isEmpty);
    });

    test('tourSkipped logs tour_skipped', () async {
      await Analytics.tourSkipped();

      expect(recorder.events.single.name, 'tour_skipped');
      expect(recorder.events.single.params, isEmpty);
    });

    test('tourSkippedFromSlide logs at_slide param', () async {
      await Analytics.tourSkippedFromSlide(slide: 3);

      expect(recorder.events.single.name, 'tour_skipped_from_slide');
      expect(recorder.events.single.params, {'at_slide': 3});
    });

    test('tourCtaTapped logs slide + action params', () async {
      await Analytics.tourCtaTapped(slide: 2, action: 'try_now');

      expect(recorder.events.single.name, 'tour_cta_tapped');
      expect(recorder.events.single.params, {
        'slide': 2,
        'action': 'try_now',
      });
    });
  });
}
