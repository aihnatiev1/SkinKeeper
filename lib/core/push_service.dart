import 'dart:developer' as dev;
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'api_client.dart';
import 'push_preferences.dart';

/// Top-level handler for background messages (must be top-level function).
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  dev.log('Background message: ${message.messageId}', name: 'Push');
}

class PushService {
  static FirebaseMessaging get _messaging => FirebaseMessaging.instance;

  /// Request permission + register FCM token with backend.
  static Future<void> init(ApiClient api, {PushPreferences? prefs}) async {
    // Ensure Firebase is initialized
    if (Firebase.apps.isEmpty) {
      dev.log('Firebase not initialized, skipping push init', name: 'Push');
      return;
    }

    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      dev.log('Push permission denied', name: 'Push');
      return;
    }

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

    // Foreground message handler
    FirebaseMessaging.onMessage.listen((message) {
      dev.log(
        'Foreground push: ${message.notification?.title}',
        name: 'Push',
      );
    });

    // Background handler
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
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
