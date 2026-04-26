import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:skin_keeper/core/push_service.dart';
import 'package:skin_keeper/features/auth/steam_auth_service.dart';
import 'package:skin_keeper/features/automation/providers/auto_sell_providers.dart';
import 'package:skin_keeper/models/user.dart';

/// Test seam: stand up an [authStateProvider] override that resolves to a
/// fake [SteamUser] with the given [userId]. Pass `null` to simulate an
/// unauthenticated session (cold start before login).
List<Override> _authOverride(int? userId) {
  return [
    authStateProvider.overrideWith(() => _FakeAuthNotifier(userId)),
  ];
}

class _FakeAuthNotifier extends AuthNotifier {
  _FakeAuthNotifier(this._userId);

  final int? _userId;

  @override
  Future<SteamUser?> build() async {
    if (_userId == null) return null;
    return SteamUser(
      userId: _userId,
      steamId: 'steam_$_userId',
      displayName: 'Test User $_userId',
      avatarUrl: '',
    );
  }
}

/// Push routing tests cover the *only* logic the service owns that doesn't
/// require a real FCM channel: payload-shape detection and provider mutation.
///
/// We don't try to test `FirebaseMessaging.onMessage`, `onMessageOpenedApp`,
/// or `getInitialMessage` — those are platform streams that need the native
/// channel mocked, and the value of doing so is tiny vs the upkeep cost.
/// `_maybeHandleAutoSellPayload` is exposed via `debugHandleMessage` for the
/// same reason.
void main() {
  group('PushService — auto-sell cancel routing', () {
    late ProviderContainer container;

    setUp(() async {
      // Default: signed-in user with id=123. Tests that need a different user
      // (or an unauthenticated session) build their own container.
      container = ProviderContainer(overrides: _authOverride(123));
      PushService.debugSetContainer(container);
      // Drive the AsyncNotifier's build() to completion so reads in tests see
      // the resolved value rather than the initial AsyncLoading.
      await container.read(authStateProvider.future);
    });

    tearDown(() => container.dispose());

    test(
      'foreground push with category=AUTO_SELL_CANCEL sets pending trigger',
      () {
        const msg = RemoteMessage(
          data: {
            'type': 'auto_sell_cancel_window',
            'category': 'AUTO_SELL_CANCEL',
            'ruleId': '7',
            'executionId': '42',
            'marketHashName': 'AK-47 | Redline (Field-Tested)',
          },
        );

        expect(container.read(pendingExecutionTrigger), isNull);
        final claimed = PushService.debugHandleMessage(msg);
        expect(claimed, isTrue);
        expect(container.read(pendingExecutionTrigger), 42);
      },
    );

    test(
      'cold-start path: same payload routes to the same provider',
      () {
        // Cold-start handling is `getInitialMessage` -> `_handleNotificationTap`
        // -> `_maybeHandleAutoSellPayload`. From the provider's perspective it
        // is identical to the foreground branch — same payload, same trigger.
        const msg = RemoteMessage(
          data: {
            'category': 'AUTO_SELL_CANCEL',
            'executionId': '99',
          },
        );
        final claimed = PushService.debugHandleMessage(msg);
        expect(claimed, isTrue);
        expect(container.read(pendingExecutionTrigger), 99);
      },
    );

    test(
      'accepts type=auto_sell_cancel_window without explicit category',
      () {
        const msg = RemoteMessage(
          data: {
            'type': 'auto_sell_cancel_window',
            'executionId': '11',
          },
        );
        final claimed = PushService.debugHandleMessage(msg);
        expect(claimed, isTrue);
        expect(container.read(pendingExecutionTrigger), 11);
      },
    );

    test(
      'integer executionId (server may switch payload types) is parsed',
      () {
        const msg = RemoteMessage(
          data: {
            'category': 'AUTO_SELL_CANCEL',
            'executionId': 314,
          },
        );
        final claimed = PushService.debugHandleMessage(msg);
        expect(claimed, isTrue);
        expect(container.read(pendingExecutionTrigger), 314);
      },
    );

    test(
      'unrelated push (price_alert) is not claimed and trigger stays null',
      () {
        const msg = RemoteMessage(
          data: {
            'type': 'price_alert',
            'alertId': '5',
          },
        );
        final claimed = PushService.debugHandleMessage(msg);
        expect(claimed, isFalse);
        expect(container.read(pendingExecutionTrigger), isNull);
      },
    );

    test(
      'malformed AUTO_SELL_CANCEL push without executionId is ignored',
      () {
        const msg = RemoteMessage(
          data: {
            'category': 'AUTO_SELL_CANCEL',
            // executionId missing
          },
        );
        final claimed = PushService.debugHandleMessage(msg);
        expect(claimed, isFalse);
        expect(container.read(pendingExecutionTrigger), isNull);
      },
    );

    test(
      'unparseable executionId is treated as missing (defensive)',
      () {
        const msg = RemoteMessage(
          data: {
            'category': 'AUTO_SELL_CANCEL',
            'executionId': 'not-a-number',
          },
        );
        final claimed = PushService.debugHandleMessage(msg);
        expect(claimed, isFalse);
        expect(container.read(pendingExecutionTrigger), isNull);
      },
    );
  });

  // ── CRIT-4: payload userId verification ───────────────────────────────────
  // Cold-start race: a queued APNs/FCM push for user A can arrive after the
  // device has been signed into user B. Without this gate the cancel modal
  // would surface user A's auto-sell row to user B, leaking metadata and
  // letting the wrong session cancel a stranger's listing.
  group('PushService — payload userId verification', () {
    Future<ProviderContainer> setupAuth(int? userId) async {
      final container = ProviderContainer(overrides: _authOverride(userId));
      PushService.debugSetContainer(container);
      // Drive AsyncNotifier.build() so reads see resolved state, not loading.
      await container.read(authStateProvider.future);
      return container;
    }

    test('mismatched userId is dropped silently and trigger stays null', () async {
      // Signed in as user 123; push targets user 999.
      final container = await setupAuth(123);
      addTearDown(container.dispose);

      const msg = RemoteMessage(
        data: {
          'category': 'AUTO_SELL_CANCEL',
          'executionId': '42',
          'userId': '999',
          'marketHashName': 'AK-47 | Redline (FT)',
        },
      );
      final claimed = PushService.debugHandleMessage(msg);
      expect(claimed, isFalse,
          reason: 'cross-user push must not be claimed');
      expect(container.read(pendingExecutionTrigger), isNull,
          reason: 'mismatched userId must not surface the cancel modal');
    });

    test('matching userId fires trigger as before', () async {
      final container = await setupAuth(123);
      addTearDown(container.dispose);

      const msg = RemoteMessage(
        data: {
          'category': 'AUTO_SELL_CANCEL',
          'executionId': '42',
          'userId': '123',
        },
      );
      final claimed = PushService.debugHandleMessage(msg);
      expect(claimed, isTrue);
      expect(container.read(pendingExecutionTrigger), 42);
    });

    test('integer userId in payload is parsed (forward-compat)', () async {
      final container = await setupAuth(123);
      addTearDown(container.dispose);

      const msg = RemoteMessage(
        data: {
          'category': 'AUTO_SELL_CANCEL',
          'executionId': 7,
          'userId': 123,
        },
      );
      final claimed = PushService.debugHandleMessage(msg);
      expect(claimed, isTrue);
      expect(container.read(pendingExecutionTrigger), 7);
    });

    test('auth not ready (no signed-in user) defers cold-start push', () async {
      // Cold start: container created before login. Slow-poll inside the
      // CancelWindowMounter is the recovery path once auth resolves.
      final container = await setupAuth(null);
      addTearDown(container.dispose);

      const msg = RemoteMessage(
        data: {
          'category': 'AUTO_SELL_CANCEL',
          'executionId': '42',
          'userId': '123',
        },
      );
      final claimed = PushService.debugHandleMessage(msg);
      expect(claimed, isFalse);
      expect(container.read(pendingExecutionTrigger), isNull);
    });

    test('legacy payload without userId still fires (rollout safety)', () async {
      // Pre-fix backend builds may not include `userId` for a brief window.
      // We don't want to drop the feature mid-rollout, so we log a warning
      // and proceed. New backend always sends `userId`.
      final container = await setupAuth(123);
      addTearDown(container.dispose);

      const msg = RemoteMessage(
        data: {
          'category': 'AUTO_SELL_CANCEL',
          'executionId': '42',
          // no userId
        },
      );
      final claimed = PushService.debugHandleMessage(msg);
      expect(claimed, isTrue);
      expect(container.read(pendingExecutionTrigger), 42);
    });

    test('oversized marketHashName does not crash the handler', () async {
      final container = await setupAuth(123);
      addTearDown(container.dispose);

      // 500-char attack payload. We don't read the sanitized name from the
      // payload (mounter pulls it from the execution row), but we want to
      // confirm the handler doesn't choke on outliers.
      final huge = '${'A' * 500}  (FT)';
      final msg = RemoteMessage(
        data: {
          'category': 'AUTO_SELL_CANCEL',
          'executionId': '42',
          'userId': '123',
          'marketHashName': huge,
        },
      );
      final claimed = PushService.debugHandleMessage(msg);
      expect(claimed, isTrue);
      expect(container.read(pendingExecutionTrigger), 42);
    });
  });
}
