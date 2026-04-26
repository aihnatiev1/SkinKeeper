import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:skin_keeper/core/api_client.dart';
import 'package:skin_keeper/core/feature_flags/feature_flags_provider.dart';

import '../../helpers/mocks.dart';

/// Build the wrapped `{flags, version}` shape the backend actually returns.
/// Tests should always go through this helper instead of stubbing flat maps —
/// matching the real wire format catches parsing regressions like the one
/// CRIT-1 introduced (where a flat-map mock made the broken parser look fine).
Map<String, dynamic> wrapFlags(Map<String, dynamic> flags, {String version = 'test-v1'}) {
  return {'flags': flags, 'version': version};
}

void main() {
  setUp(resetFeatureFlagVersionForTest);

  group('featureFlagsProvider', () {
    late MockApiClient api;

    setUp(() {
      api = MockApiClient();
    });

    test('parses well-formed wrapped {flags, version} payload', () async {
      stubApiGet(api, '/users/feature-flags', wrapFlags(<String, dynamic>{
        'auto_sell': true,
        'tour': false,
        'smart_alerts': true,
      }, version: 'abc123'));

      final container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
      ]);
      addTearDown(container.dispose);

      final flags = await container.read(featureFlagsProvider.future);
      expect(flags['auto_sell'], isTrue);
      expect(flags['tour'], isFalse);
      expect(flags['smart_alerts'], isTrue);
      // Version cached for future ETag-style validation.
      expect(lastFeatureFlagVersion, 'abc123');
    });

    test('CRIT-1 regression: auto_sell=false correctly parsed (was eaten by old flat-map parser)', () async {
      // Before the fix, the provider parsed the entire response as a flat map,
      // so `flags['auto_sell']` was never reached — every flag silently became
      // `false`. The kill-switch test "looked passing" only because the
      // default fall-through agreed with `false`. This test would have failed
      // for `auto_sell: true` against the broken parser; we keep both signs
      // here to lock the contract.
      stubApiGet(api, '/users/feature-flags', wrapFlags(<String, dynamic>{
        'auto_sell': false,
        'tour': true,
      }));

      final container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
      ]);
      addTearDown(container.dispose);

      final flags = await container.read(featureFlagsProvider.future);
      expect(flags['auto_sell'], isFalse,
          reason: 'auto_sell=false must be explicitly parsed, not defaulted');
      expect(flags['tour'], isTrue);
    });

    test('skips non-bool entries silently (defensive)', () async {
      stubApiGet(api, '/users/feature-flags', wrapFlags(<String, dynamic>{
        'auto_sell': true,
        'rollout_pct': 42, // garbage type — should be ignored
        'enabled': 'yes', // string instead of bool — ignored
      }));

      final container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
      ]);
      addTearDown(container.dispose);

      final flags = await container.read(featureFlagsProvider.future);
      expect(flags, {'auto_sell': true});
    });

    test('returns empty map (defaults) on bad-shape payload (top-level list)', () async {
      // Backend hiccup returns a list instead of an object. Provider must
      // treat as defaults and not crash.
      stubApiGet(api, '/users/feature-flags', const <Map<String, bool>>[]);

      final container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
      ]);
      addTearDown(container.dispose);

      final flags = await container.read(featureFlagsProvider.future);
      expect(flags, isEmpty);
    });

    test('returns empty map when `flags` key missing (malformed object)', () async {
      // E.g. backend returns just {version: "..."} or {error: "..."} on a
      // partial failure. Provider must downgrade gracefully.
      stubApiGet(api, '/users/feature-flags', const <String, dynamic>{
        'version': 'orphan-v1',
      });

      final container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
      ]);
      addTearDown(container.dispose);

      final flags = await container.read(featureFlagsProvider.future);
      expect(flags, isEmpty);
    });

    test('returns empty map when `flags` is non-Map (string)', () async {
      stubApiGet(api, '/users/feature-flags', const <String, dynamic>{
        'flags': 'oops-not-a-map',
        'version': 'v1',
      });

      final container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
      ]);
      addTearDown(container.dispose);

      final flags = await container.read(featureFlagsProvider.future);
      expect(flags, isEmpty);
    });

    test('returns empty map on 401 (auth failure)', () async {
      when(() => api.get(
            '/users/feature-flags',
            queryParameters: any(named: 'queryParameters'),
          )).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/users/feature-flags'),
          response: Response(
            requestOptions: RequestOptions(path: '/users/feature-flags'),
            statusCode: 401,
            data: {'code': 'TOKEN_EXPIRED'},
          ),
          type: DioExceptionType.badResponse,
        ),
      );

      final container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
      ]);
      addTearDown(container.dispose);

      // Must not throw — graceful degrade.
      final flags = await container.read(featureFlagsProvider.future);
      expect(flags, isEmpty);
    });

    test('returns empty map on network error', () async {
      when(() => api.get(
            '/users/feature-flags',
            queryParameters: any(named: 'queryParameters'),
          )).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/users/feature-flags'),
          type: DioExceptionType.connectionError,
          message: 'No internet',
        ),
      );

      final container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
      ]);
      addTearDown(container.dispose);

      final flags = await container.read(featureFlagsProvider.future);
      expect(flags, isEmpty);
    });
  });

  group('FeatureFlagProviderRefX.featureFlagEnabled', () {
    late MockApiClient api;

    setUp(() {
      api = MockApiClient();
    });

    test('returns flag value when present', () async {
      stubApiGet(api, '/users/feature-flags', wrapFlags(<String, dynamic>{
        'auto_sell': true,
        'tour': false,
      }));

      final container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
      ]);
      addTearDown(container.dispose);

      // Wait for the future to resolve.
      await container.read(featureFlagsProvider.future);

      // Read via a synthetic Provider so we can hit the Ref extension.
      final readFlag = Provider<bool>((ref) {
        return ref.featureFlagEnabled('auto_sell');
      });
      final readFlagOff = Provider<bool>((ref) {
        return ref.featureFlagEnabled('tour');
      });
      expect(container.read(readFlag), isTrue);
      expect(container.read(readFlagOff), isFalse);
    });

    test('returns defaultValue when flag missing', () async {
      stubApiGet(api, '/users/feature-flags', wrapFlags(const <String, dynamic>{}));

      final container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
      ]);
      addTearDown(container.dispose);
      await container.read(featureFlagsProvider.future);

      final p = Provider<bool>((ref) =>
          ref.featureFlagEnabled('unknown_flag', defaultValue: true));
      final pFalse = Provider<bool>((ref) =>
          ref.featureFlagEnabled('unknown_flag'));
      expect(container.read(p), isTrue);
      expect(container.read(pFalse), isFalse);
    });

    test('returns defaultValue while loading (orElse path)', () async {
      // Stub a slow response — provider stays in `loading` state when read
      // synchronously without awaiting.
      when(() => api.get(
            '/users/feature-flags',
            queryParameters: any(named: 'queryParameters'),
          )).thenAnswer((_) async {
        await Future<void>.delayed(const Duration(seconds: 1));
        return mockResponse(wrapFlags(<String, dynamic>{'auto_sell': true}));
      });

      final container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
      ]);
      addTearDown(container.dispose);

      // Trigger load but don't await.
      // ignore: unawaited_futures
      container.read(featureFlagsProvider.future);

      final p = Provider<bool>(
          (ref) => ref.featureFlagEnabled('auto_sell', defaultValue: true));
      // Loading state → falls through to defaultValue.
      expect(container.read(p), isTrue);
    });
  });

  group('isFeatureDisabled', () {
    test('returns true for 403 with FEATURE_DISABLED code', () {
      // Backend canonical key is `flag` (see middleware/auth.ts), NOT `feature`.
      // Mock the actual wire shape so we'd catch any client-side drift.
      final dioError = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 403,
          data: {'code': 'FEATURE_DISABLED', 'flag': 'auto_sell'},
        ),
        type: DioExceptionType.badResponse,
      );
      expect(isFeatureDisabled(dioError), isTrue);
    });

    test('returns false for 403 with PREMIUM_REQUIRED (not flag-gated)', () {
      // Important separation: a 403 might be entitlement OR kill-switch. The
      // app handles them differently — entitlement → paywall, flag → toast.
      final dioError = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 403,
          data: {'code': 'PREMIUM_REQUIRED'},
        ),
        type: DioExceptionType.badResponse,
      );
      expect(isFeatureDisabled(dioError), isFalse);
      expect(isPremiumRequired(dioError), isTrue);
    });

    test('returns false for non-403 errors', () {
      final dioError = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 500,
          data: {'code': 'FEATURE_DISABLED'}, // wrong status
        ),
        type: DioExceptionType.badResponse,
      );
      expect(isFeatureDisabled(dioError), isFalse);
    });

    test('returns false for non-DioException', () {
      expect(isFeatureDisabled(Exception('x')), isFalse);
      expect(isFeatureDisabled(null), isFalse);
    });
  });
}
