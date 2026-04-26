import 'dart:developer' as dev;

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';

/// Centralized analytics + crash reporting. Call [init] once at startup.
///
/// Events follow a simple `noun_verb` naming convention:
///   sell_started, sell_completed, trade_created, alert_triggered, etc.
///
/// Every public method is a no-op when Firebase isn't initialized, so
/// widget tests can invoke them without a Firebase mock harness. Prod
/// always has Firebase initialized before any screen mounts.
/// Surface from which the paywall was opened. Used for conversion funnel
/// analysis.
///
/// P1 introduced the enum shape so `PremiumGate` and paywall routing can
/// thread a typed value end-to-end. P2 wires it through:
/// `Analytics.paywallViewed(source: …)` logs `source: <analyticsValue>`
/// and the `/premium` route extracts the value from `GoRouterState.extra`.
enum PaywallSource {
  lockedTap,
  teaseCard,
  settings,
  deepLink,
  unknown;

  String get analyticsValue => switch (this) {
        PaywallSource.lockedTap => 'locked_tap',
        PaywallSource.teaseCard => 'tease_card',
        PaywallSource.settings => 'settings',
        PaywallSource.deepLink => 'deep_link',
        PaywallSource.unknown => 'unknown',
      };
}

class Analytics {
  static bool get _firebaseReady => Firebase.apps.isNotEmpty;
  static FirebaseAnalytics get _analytics => FirebaseAnalytics.instance;
  static FirebaseCrashlytics get _crashlytics => FirebaseCrashlytics.instance;

  /// Initialize Crashlytics error handlers. Call after Firebase.initializeApp().
  static Future<void> init() async {
    // Catch Flutter framework errors
    FlutterError.onError = (details) {
      _crashlytics.recordFlutterFatalError(details);
      // Also log to console in debug
      if (kDebugMode) FlutterError.presentError(details);
    };

    // Catch async errors not caught by Flutter framework
    PlatformDispatcher.instance.onError = (error, stack) {
      _crashlytics.recordError(error, stack, fatal: true);
      return true;
    };

    // Disable in debug to keep console clean
    await _crashlytics.setCrashlyticsCollectionEnabled(!kDebugMode);
    await _analytics.setAnalyticsCollectionEnabled(!kDebugMode);

    dev.log('Analytics + Crashlytics initialized', name: 'Analytics');
  }

  // ─── User Identity ─────────────────────────────────────────────────

  static Future<void> setUserId(String? userId) async {
    if (!_firebaseReady) return;
    await _analytics.setUserId(id: userId);
    if (userId != null) {
      await _crashlytics.setUserIdentifier(userId);
    }
  }

  static Future<void> setUserProperty(String name, String? value) async {
    if (!_firebaseReady) return;
    await _analytics.setUserProperty(name: name, value: value);
  }

  // ─── Screens ───────────────────────────────────────────────────────

  static Future<void> screen(String name) async {
    if (!_firebaseReady) return;
    await _analytics.logScreenView(screenName: name);
  }

  // ─── Auth Events ───────────────────────────────────────────────────

  static Future<void> login({required String method}) async {
    if (!_firebaseReady) return;
    await _analytics.logLogin(loginMethod: method);
  }

  static Future<void> accountLinked() async {
    await _event('account_linked');
  }

  // ─── Onboarding Events ─────────────────────────────────────────────

  static Future<void> onboardingStarted() async {
    await _event('onboarding_started');
  }

  static Future<void> onboardingSlide({required int slide}) async {
    await _event('onboarding_slide', {'slide': slide});
  }

  static Future<void> onboardingCompleted() async {
    await _event('onboarding_completed');
  }

  static Future<void> onboardingSkipped({required int atSlide}) async {
    await _event('onboarding_skipped', {'at_slide': atSlide});
  }

  // ─── Session Events ───────────────────────────────────────────────

  static Future<void> sessionConnected({required String method}) async {
    await _event('session_connected', {'method': method});
  }

  static Future<void> sessionExpired() async {
    await _event('session_expired');
  }

  static Future<void> accountSwitched() async {
    await _event('account_switched');
  }

  // ─── Navigation / Engagement ──────────────────────────────────────

  static Future<void> inventoryViewed({required int itemCount, required double totalValue}) async {
    await _event('inventory_viewed', {'item_count': itemCount, 'total_value': totalValue});
  }

  static Future<void> itemDetailViewed({required String itemName, required double price}) async {
    await _event('item_detail_viewed', {'item_name': itemName, 'price': price});
  }

  static Future<void> portfolioViewed({required double totalValue, int? portfolioId}) async {
    await _event('portfolio_viewed', {
      'total_value': totalValue,
      'portfolio_id': ?portfolioId,
    });
  }

  static Future<void> tradeOfferViewed({required String status, required int itemCount}) async {
    await _event('trade_offer_viewed', {'status': status, 'item_count': itemCount});
  }

  static Future<void> dealsViewed({required int dealCount}) async {
    await _event('deals_viewed', {'deal_count': dealCount});
  }

  static Future<void> watchlistViewed({required int itemCount}) async {
    await _event('watchlist_viewed', {'item_count': itemCount});
  }

  // ─── Feature Adoption ─────────────────────────────────────────────

  static Future<void> watchlistItemAdded() async {
    await _event('watchlist_item_added');
  }

  static Future<void> portfolioCreated() async {
    await _event('portfolio_created');
  }

  static Future<void> csvExported({required String type}) async {
    await _event('csv_exported', {'type': type});
  }

  static Future<void> bulkSellStarted({required int itemCount}) async {
    await _event('bulk_sell_started', {'item_count': itemCount});
  }

  // ─── Sell Events ───────────────────────────────────────────────────

  static Future<void> sellStarted({required int itemCount, required String source}) async {
    await _event('sell_started', {'item_count': itemCount, 'source': source});
  }

  static Future<void> sellCompleted({required int succeeded, required int failed}) async {
    await _event('sell_completed', {'succeeded': succeeded, 'failed': failed});
  }

  // ─── Trade Events ──────────────────────────────────────────────────

  static Future<void> tradeCreated({required int itemCount}) async {
    await _event('trade_created', {'item_count': itemCount});
  }

  static Future<void> tradeAccepted() async {
    await _event('trade_accepted');
  }

  // ─── Alert Events ──────────────────────────────────────────────────

  static Future<void> alertCreated({required String condition}) async {
    await _event('alert_created', {'condition': condition});
  }

  // ─── Premium Events ────────────────────────────────────────────────

  /// Logs `paywall_viewed` with `source: <enum.analyticsValue>`.
  ///
  /// Backward compatible: callers may omit [source]; we log
  /// `source: 'unknown'` so the funnel always carries this dimension.
  static Future<void> paywallViewed({PaywallSource? source}) async {
    final value = (source ?? PaywallSource.unknown).analyticsValue;
    await _event('paywall_viewed', {'source': value});
  }

  /// Tracks paywall exits — critical for conversion diagnosis.
  /// [reason]: 'close_button', 'back_gesture', 'continue_free', 'purchase_failed'.
  static Future<void> paywallDismissed({required String reason}) async {
    await _event('paywall_dismissed', {'reason': reason});
  }

  static Future<void> premiumPurchased({required String plan}) async {
    await _event('premium_purchased', {'plan': plan});
  }

  /// Logs `paywall_matrix_expanded` when the free-vs-PRO comparison matrix
  /// is expanded from its collapsed disclosure on the rewritten paywall.
  /// Funnel signal: lower expand-rate vs `paywall_viewed` confirms that the
  /// hero + value props carry the value prop without needing the matrix.
  static Future<void> paywallMatrixExpanded() async {
    await _event('paywall_matrix_expanded');
  }

  // ─── Locked-feature funnel ────────────────────────────────────────

  /// In-memory dedupe set: ensures `lockedFeatureViewed` fires at most once
  /// per `featureId` per session (a session = process lifetime, or until
  /// [resetLockedFeatureSession] is called on auth-state change).
  ///
  /// Lives on the analytics class — not in any widget — so multiple gates
  /// for the same feature on the same screen don't double-log.
  static final Set<String> _lockedFeatureSeenThisSession = <String>{};

  /// Logs `locked_feature_viewed` once per [feature] per session.
  /// Subsequent calls with the same [feature] are silently skipped until
  /// [resetLockedFeatureSession] is invoked (e.g. on auth state change).
  static Future<void> lockedFeatureViewed({required String feature}) async {
    if (!_lockedFeatureSeenThisSession.add(feature)) return;
    await _event('locked_feature_viewed', {'feature': feature});
  }

  /// Logs `locked_feature_tapped` on every tap. NOT debounced — taps on a
  /// locked CTA are always intentional and we want raw counts.
  static Future<void> lockedFeatureTapped({required String feature}) async {
    await _event('locked_feature_tapped', {'feature': feature});
  }

  /// Clears the per-session dedupe set. Call when auth state changes
  /// (login / logout / account switch) so the new session sees fresh views.
  static void resetLockedFeatureSession() {
    _lockedFeatureSeenThisSession.clear();
  }

  // ─── Tour Events (stubs for P8) ───────────────────────────────────

  static Future<void> tourStarted() async {
    await _event('tour_started');
  }

  static Future<void> tourSlideViewed({required int slide}) async {
    await _event('tour_slide_viewed', {'slide': slide});
  }

  static Future<void> tourCompleted() async {
    await _event('tour_completed');
  }

  static Future<void> tourSkipped() async {
    await _event('tour_skipped');
  }

  static Future<void> tourSkippedFromSlide({required int slide}) async {
    await _event('tour_skipped_from_slide', {'at_slide': slide});
  }

  /// Logs a CTA tap inside the tour. [action] is a stable analytics key
  /// (`try_now`, `continue`, `done`, `feature_tile`). [slide] is 0-indexed.
  /// Used by P8 to attribute conversion to specific slides + actions.
  static Future<void> tourCtaTapped({
    required int slide,
    required String action,
  }) async {
    await _event('tour_cta_tapped', {'slide': slide, 'action': action});
  }

  // ─── Inventory Events ──────────────────────────────────────────────

  static Future<void> inventoryRefreshed({required int itemCount}) async {
    await _event('inventory_refreshed', {'item_count': itemCount});
  }

  // ─── Error Logging ─────────────────────────────────────────────────

  static Future<void> recordError(dynamic error, StackTrace? stack, {String? reason}) async {
    if (!_firebaseReady) return;
    await _crashlytics.recordError(error, stack, reason: reason ?? 'non-fatal');
  }

  // ─── Internal ──────────────────────────────────────────────────────

  /// Test-only event recorder. When non-null, every `_event` call is also
  /// recorded here (in addition to Firebase, which is a no-op in tests).
  /// Lets unit tests assert event names + params without a Firebase mock.
  @visibleForTesting
  static AnalyticsTestRecorder? testRecorder;

  static Future<void> _event(String name, [Map<String, Object>? params]) async {
    testRecorder?.record(name, params);
    if (!_firebaseReady) return;
    await _analytics.logEvent(name: name, parameters: params);
  }
}

/// Test-only recorder. Install via `Analytics.testRecorder = ...` in
/// `setUp` and inspect [events] in your assertions.
@visibleForTesting
class AnalyticsTestRecorder {
  final List<RecordedEvent> events = <RecordedEvent>[];

  void record(String name, Map<String, Object>? params) {
    events.add(RecordedEvent(name, params == null
        ? const <String, Object>{}
        : Map.unmodifiable(params)));
  }

  void clear() => events.clear();
}

@visibleForTesting
class RecordedEvent {
  const RecordedEvent(this.name, this.params);
  final String name;
  final Map<String, Object> params;

  @override
  String toString() => 'RecordedEvent($name, $params)';
}
