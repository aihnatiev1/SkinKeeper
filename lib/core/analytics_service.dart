import 'dart:developer' as dev;

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';

/// Centralized analytics + crash reporting. Call [init] once at startup.
///
/// Events follow a simple `noun_verb` naming convention:
///   sell_started, sell_completed, trade_created, alert_triggered, etc.
class Analytics {
  static final _analytics = FirebaseAnalytics.instance;
  static final _crashlytics = FirebaseCrashlytics.instance;

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
    await _analytics.setUserId(id: userId);
    if (userId != null) {
      await _crashlytics.setUserIdentifier(userId);
    }
  }

  static Future<void> setUserProperty(String name, String? value) async {
    await _analytics.setUserProperty(name: name, value: value);
  }

  // ─── Screens ───────────────────────────────────────────────────────

  static Future<void> screen(String name) async {
    await _analytics.logScreenView(screenName: name);
  }

  // ─── Auth Events ───────────────────────────────────────────────────

  static Future<void> login({required String method}) async {
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

  static Future<void> paywallViewed() async {
    await _event('paywall_viewed');
  }

  /// Tracks paywall exits — critical for conversion diagnosis.
  /// [reason]: 'close_button', 'back_gesture', 'continue_free', 'purchase_failed'.
  static Future<void> paywallDismissed({required String reason}) async {
    await _event('paywall_dismissed', {'reason': reason});
  }

  static Future<void> premiumPurchased({required String plan}) async {
    await _event('premium_purchased', {'plan': plan});
  }

  // ─── Inventory Events ──────────────────────────────────────────────

  static Future<void> inventoryRefreshed({required int itemCount}) async {
    await _event('inventory_refreshed', {'item_count': itemCount});
  }

  // ─── Error Logging ─────────────────────────────────────────────────

  static Future<void> recordError(dynamic error, StackTrace? stack, {String? reason}) async {
    await _crashlytics.recordError(error, stack, reason: reason ?? 'non-fatal');
  }

  // ─── Internal ──────────────────────────────────────────────────────

  static Future<void> _event(String name, [Map<String, Object>? params]) async {
    await _analytics.logEvent(name: name, parameters: params);
  }
}
