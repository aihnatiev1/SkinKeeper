import 'dart:developer' as dev;
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'api_client.dart';
import 'push_preferences.dart';
import 'router.dart';

/// Top-level handler for background messages (must be top-level function).
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  dev.log('Background message: ${message.messageId}', name: 'Push');
}

class PushService {
  static FirebaseMessaging get _messaging => FirebaseMessaging.instance;
  static ApiClient? _api;
  static bool _permissionRequested = false;

  /// Set up message handlers only (no permission dialog).
  /// Call once after login.
  static Future<void> initHandlers(ApiClient api) async {
    _api = api;

    if (Firebase.apps.isEmpty) {
      dev.log('Firebase not initialized, skipping push init', name: 'Push');
      return;
    }

    // Foreground message handler
    FirebaseMessaging.onMessage.listen((message) {
      dev.log(
        'Foreground push: ${message.notification?.title}',
        name: 'Push',
      );
    });

    // Background handler
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    // Handle notification tap when app is in background/terminated
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    // Check if app was opened from a notification (cold start)
    final initial = await _messaging.getInitialMessage();
    if (initial != null) _handleNotificationTap(initial);

    // If permission was already granted before, register token silently
    final settings = await _messaging.getNotificationSettings();
    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {
      await _obtainAndRegisterToken(api);
    }
  }

  /// Request push permission and register FCM token.
  /// Safe to call multiple times — shows system dialog only once per install.
  static Future<void> requestPermissionAndRegister({PushPreferences? prefs}) async {
    final api = _api;
    if (api == null || Firebase.apps.isEmpty) return;
    if (_permissionRequested) return;
    _permissionRequested = true;

    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      dev.log('Push permission denied', name: 'Push');
      return;
    }

    await _obtainAndRegisterToken(api, prefs: prefs);
  }

  static Future<void> _obtainAndRegisterToken(ApiClient api, {PushPreferences? prefs}) async {
    // Get APNs token first on iOS (required before FCM token)
    if (Platform.isIOS) {
      final apns = await _messaging.getAPNSToken();
      if (apns == null) {
        dev.log('APNs token not available yet', name: 'Push');
      }
    }

    final token = await _messaging.getToken();
    if (token != null) {
      await _registerToken(api, token, prefs);
    }

    // Listen for token refresh
    _messaging.onTokenRefresh.listen((newToken) {
      _registerToken(api, newToken, prefs);
    });
  }

  /// Route to the correct screen based on push notification data payload.
  static void _handleNotificationTap(RemoteMessage message) {
    final data = message.data;
    final type = data['type'] as String?;
    dev.log('Notification tap: type=$type', name: 'Push');

    try {
      switch (type) {
        case 'price_alert':
          _router?.go('/alerts');
        case 'trade_incoming':
        case 'trade_accepted':
        case 'trade_declined':
        case 'trade_cancelled':
          final offerId = data['offerId'] as String?;
          if (offerId != null) {
            _router?.go('/trades/$offerId');
          } else {
            _router?.go('/trades');
          }
        case 'sell_completed':
          _router?.go('/inventory');
        default:
          _router?.go('/portfolio');
      }
    } catch (e) {
      dev.log('Failed to route from notification: $e', name: 'Push');
    }
  }

  static GoRouter? _router;

  /// Set router reference for notification-based navigation. Call once from app init.
  static void setRouter(WidgetRef ref) {
    _router = ref.read(routerProvider);
  }

  /// Re-sync push preferences to backend (call after toggling a preference).
  static Future<void> syncPreferences(
      ApiClient api, PushPreferences prefs) async {
    if (Firebase.apps.isEmpty) return;
    try {
      final token = await _messaging.getToken();
      if (token != null) {
        await _registerToken(api, token, prefs);
      }
    } catch (e) {
      dev.log('Failed to sync push prefs: $e', name: 'Push');
    }
  }

  static Future<void> _registerToken(
      ApiClient api, String token, PushPreferences? prefs) async {
    try {
      final platform = Platform.isIOS ? 'ios' : 'android';
      await api.post('/alerts/device', data: {
        'fcm_token': token,
        'platform': platform,
        if (prefs != null) 'push_prefs': prefs.toJson(),
      });
      dev.log('FCM token registered ($platform)', name: 'Push');
    } catch (e) {
      dev.log('Failed to register FCM token: $e', name: 'Push');
    }
  }

  /// Unregister current device token (e.g. on logout).
  static Future<void> unregister(ApiClient api) async {
    try {
      final token = await _messaging.getToken();
      if (token != null) {
        await api.delete('/alerts/device', data: {'fcm_token': token});
        dev.log('FCM token unregistered', name: 'Push');
      }
    } catch (e) {
      dev.log('Failed to unregister FCM token: $e', name: 'Push');
    }
  }
}
