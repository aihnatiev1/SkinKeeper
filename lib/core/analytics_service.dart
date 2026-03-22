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
