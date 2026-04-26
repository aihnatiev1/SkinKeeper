import 'dart:developer' as dev;
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/steam_auth_service.dart';
import '../features/automation/providers/auto_sell_providers.dart';
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
      // Foreground auto-sell pushes still need to surface the cancel modal
      // immediately — the slow poll (10s) is too coarse for a 60s window.
      _maybeHandleAutoSellPayload(message);
    });

    // Background handler
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    // Handle notification tap when app is in background/terminated
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    // Check if app was opened from a notification (cold start). Defer the
    // dispatch by one frame so providers (incl. `pendingExecutionTrigger`)
    // are mounted and listeners (CancelWindowMounter) have run their initial
    // build before we set state.
    final initial = await _messaging.getInitialMessage();
    if (initial != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _handleNotificationTap(initial);
      });
    }

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
    final category = data['category'] as String?;
    dev.log('Notification tap: type=$type category=$category', name: 'Push');

    // Auto-sell cancel-window pushes (P3 §2.4): backend sends `data` only,
    // no native action buttons. Surface the in-app cancel modal by setting
    // `pendingExecutionTrigger` to the executionId — `CancelWindowMounter`
    // (mounted in app shell) listens and pops the dialog.
    if (_maybeHandleAutoSellPayload(message)) {
      // Make sure the user lands on a screen where the mounter is alive.
      // The shell mounter wraps every authed route, but if we're sitting on
      // /login or /splash we need to bounce to a real screen first.
      try {
        _router?.go('/portfolio');
      } catch (e) {
        dev.log('Failed to route auto-sell push: $e', name: 'Push');
      }
      return;
    }

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

  /// If [message] carries an auto-sell cancel-window payload, dispatch it to
  /// [pendingExecutionTrigger] and return true. Returns false for non-matching
  /// payloads so the caller can fall through to default routing.
  ///
  /// Backend contract (see `backend/src/services/autoSellEngine.ts`
  /// `sendCancelWindowPush`): the data map carries `type`,
  /// `category=AUTO_SELL_CANCEL`, `ruleId` (stringified int), `executionId`
  /// (stringified int), `userId` (stringified int), and `marketHashName`.
  ///
  /// We accept either `category=='AUTO_SELL_CANCEL'` (forward-compat with
  /// future native action handling) or `type=='auto_sell_cancel_window'`.
  ///
  /// **Security: payload userId must match the signed-in user.** A delayed
  /// push (e.g. APNs queued for an offline device) can land after a
  /// logout/login swap. Without this check the cancel modal would pop with
  /// another user's auto-sell context. We compare `payload.userId` against
  /// the resolved [authStateProvider]; mismatches are dropped silently with
  /// a debug log. If auth hasn't resolved yet (cold start), we drop too —
  /// the slow-poll path inside `CancelWindowMounter` will pick the row up
  /// once the session is ready, scoped to the actual logged-in user.
  static bool _maybeHandleAutoSellPayload(RemoteMessage message) {
    final data = message.data;
    final category = data['category'] as String?;
    final type = data['type'] as String?;
    final isAutoSellCancel =
        category == 'AUTO_SELL_CANCEL' || type == 'auto_sell_cancel_window';
    if (!isAutoSellCancel) return false;

    final raw = data['executionId'];
    final execId = raw is int
        ? raw
        : (raw is String ? int.tryParse(raw) : null);
    if (execId == null) {
      dev.log(
        'auto_sell_cancel push missing executionId: $data',
        name: 'Push',
      );
      return false;
    }

    final container = _container;
    if (container == null) {
      dev.log(
        'auto_sell_cancel push received before container wired',
        name: 'Push',
      );
      return false;
    }

    // ── userId verification ──
    // Payload sends `userId` as a stringified int (FCM data values must be
    // strings). Tolerate the int form too in case a future relay sends raw.
    final rawUserId = data['userId'];
    final payloadUserId = rawUserId is int
        ? rawUserId
        : (rawUserId is String ? int.tryParse(rawUserId) : null);
    final currentUserId = _readCurrentUserId(container);

    if (payloadUserId != null && currentUserId != null) {
      if (payloadUserId != currentUserId) {
        dev.log(
          'auto_sell_cancel push dropped: payload userId=$payloadUserId '
          'does not match signed-in user=$currentUserId',
          name: 'Push',
        );
        return false;
      }
    } else if (payloadUserId != null && currentUserId == null) {
      // Auth state still loading on cold start (or user logged out). Don't
      // pop a modal we can't attribute — the slow poll will recover once
      // auth resolves.
      dev.log(
        'auto_sell_cancel push deferred: auth state not ready '
        '(payload userId=$payloadUserId)',
        name: 'Push',
      );
      return false;
    } else if (payloadUserId == null) {
      // Older backend that hasn't shipped `userId` yet — log a warning but
      // continue, since blocking everything would break the feature mid-rollout.
      dev.log(
        'auto_sell_cancel push missing userId — proceeding without verification',
        name: 'Push',
      );
    }

    // ── Sanitize marketHashName before it enters provider state ──
    // Flutter's `Text` widget already escapes by default, but we trim here
    // anyway: (1) strip control chars in case backend sends raw item names,
    // (2) cap length so a malicious / corrupt payload can't blow up dialog
    // layout. The mounter reads marketHashName off the execution row from
    // the API, not from the push, so this is a belt-and-suspenders measure.
    final rawName = data['marketHashName'];
    if (rawName is String) {
      final sanitized = _sanitizeMarketHashName(rawName);
      if (sanitized != rawName) {
        dev.log(
          'auto_sell_cancel: marketHashName sanitized '
          '(${rawName.length}->${sanitized.length} chars)',
          name: 'Push',
        );
      }
    }

    try {
      container.read(pendingExecutionTrigger.notifier).state = execId;
      dev.log('auto_sell_cancel triggered for exec $execId', name: 'Push');
      return true;
    } catch (e) {
      dev.log('Failed to set pending exec trigger: $e', name: 'Push');
      return false;
    }
  }

  /// Resolve the signed-in user's `users.id` from the auth provider. Returns
  /// `null` if the auth state is still loading, errored, or signed out — the
  /// caller decides whether to drop or proceed in that case.
  static int? _readCurrentUserId(ProviderContainer container) {
    try {
      final auth = container.read(authStateProvider);
      final user = auth.valueOrNull;
      return user?.userId;
    } catch (e) {
      dev.log('Failed to read auth state: $e', name: 'Push');
      return null;
    }
  }

  /// Trim and sanitize a `marketHashName` for display. Drops C0 control chars
  /// (incl. ANSI escapes / null bytes) and caps at 100 chars to bound dialog
  /// width. CS2 names top out around 60 chars in practice; 100 is generous.
  static String _sanitizeMarketHashName(String input) {
    // Strip C0 controls (0x00–0x1F) and DEL (0x7F).
    final cleaned = input.replaceAll(RegExp(r'[\x00-\x1F\x7F]'), '');
    if (cleaned.length <= 100) return cleaned;
    return cleaned.substring(0, 100);
  }

  static GoRouter? _router;
  static ProviderContainer? _container;

  /// Set router + provider container references for notification-based
  /// navigation and provider mutation. Call once from app init after the
  /// `ProviderScope` is up.
  ///
  /// [container] is captured so cold-start / background handlers can reach
  /// providers (e.g. [pendingExecutionTrigger]) without holding a
  /// [WidgetRef].
  static void setRouter(WidgetRef ref, {required ProviderContainer container}) {
    _router = ref.read(routerProvider);
    _container = container;
  }

  /// Test-only seam: lets unit tests inject a [ProviderContainer] without
  /// going through a full widget tree.
  @visibleForTesting
  static void debugSetContainer(ProviderContainer container) {
    _container = container;
  }

  /// Test-only seam: directly fan a [RemoteMessage] into the same handler
  /// that `onMessage` / `onMessageOpenedApp` use. Returns whether the message
  /// was claimed by the auto-sell branch.
  @visibleForTesting
  static bool debugHandleMessage(RemoteMessage message) {
    return _maybeHandleAutoSellPayload(message);
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
