import 'dart:developer' as dev;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api_client.dart';

/// Feature flags consumer (P10.T2 / GitHub #18).
///
/// Hits `GET /api/users/feature-flags` and exposes a `Map<String, bool>` of
/// server-controlled toggles that gate premium features beyond just the
/// `premiumProvider` boolean. Flags are layered ABOVE premium — a feature
/// can be premium-gated AND flag-gated; both must pass to render.
///
/// Why two layers?
///   - `premiumProvider` answers "is this user PRO?" (entitlement)
///   - `featureFlagsProvider` answers "is this feature enabled at all?"
///     (kill switch / staged rollout / A/B test)
///
/// Concrete flags (matched to backend P10):
///   - `auto_sell` — gates `/auto-sell` screen; off → "Coming soon" placeholder
///   - `tour` — gates post-purchase tour; off → skip launch
///   - `smart_alerts` — gates AlertActionsSheet (Relist/Snooze); off → simple
///     tap-to-edit fallback
///
/// Caching: in-memory keep-alive for the session. Manual invalidation paths:
///   - 403 FEATURE_DISABLED interceptor (`featureDisabledController` →
///     `ref.invalidate(featureFlagsProvider)` in the app shell)
///   - auth state changes (login / logout / account switch)
/// We avoid a pinned auto-refresh timer because pending timers in unit tests
/// trip Flutter's `!timersPending` assertion. Manual invalidation is enough.
///
/// Failure modes (graceful degrade — NEVER crash):
///   - 401 / TOKEN_EXPIRED → return defaults (all false). User logged out is
///     handled by the auth flow elsewhere; we just don't crash the consumers.
///   - Network error → return defaults + log to dev console. The 403
///     interceptor (`isFeatureDisabled`) is the secondary safety net.
///   - Bad JSON → return defaults + log.
///
/// Defaults: ALL FLAGS DEFAULT TO `false`. Callers MUST opt in explicitly via
/// the `defaultValue` parameter on `featureFlagEnabled` if they want a
/// fail-open behaviour.

/// Last server-reported `version` string (sha256 prefix of the flag map). Held
/// outside the provider so re-fetches after invalidation can still consult it
/// — useful when we wire ETag validation in a later milestone. Public for
/// tests; production code shouldn't need to read this directly.
String? _lastVersion;

@visibleForTesting
String? get lastFeatureFlagVersion => _lastVersion;

@visibleForTesting
void resetFeatureFlagVersionForTest() {
  _lastVersion = null;
}

final featureFlagsProvider = FutureProvider<Map<String, bool>>((ref) async {
  // Cache flags for the lifetime of the auth session. Background refresh is
  // handled explicitly via `ref.invalidate(featureFlagsProvider)` from:
  //   - the 403 FEATURE_DISABLED interceptor (kill switch flipped)
  //   - the auth state listener (login / logout / account switch)
  //
  // Why not a 5-min auto-refresh timer? A pending `Timer` survives widget
  // disposal in unit tests and trips Flutter's pending-timer assertion.
  // Manual invalidation is sufficient for our use cases — the flags don't
  // need to converge faster than user-driven actions.
  ref.keepAlive();

  try {
    final api = ref.read(apiClientProvider);
    final res = await api.get('/users/feature-flags');
    final data = res.data;
    // Backend response shape: `{flags: {auto_sell: bool, ...}, version: "abc"}`.
    // We previously parsed the entire response as a flat map, which silently
    // dropped every flag (the `flags` key's value is a Map, not a bool, so the
    // type filter rejected it). Result: kill switches were dead. Fix: read
    // `data['flags']` and tolerate older / malformed shapes by falling back to
    // the empty-map default.
    if (data is! Map) {
      dev.log(
        'feature-flags: bad payload shape ${data.runtimeType}, using defaults',
        name: 'FeatureFlags',
      );
      return const <String, bool>{};
    }
    final rawFlags = data['flags'];
    if (rawFlags is! Map) {
      dev.log(
        'feature-flags: missing/invalid `flags` key (got ${rawFlags?.runtimeType}), using defaults',
        name: 'FeatureFlags',
      );
      return const <String, bool>{};
    }
    final flags = <String, bool>{};
    for (final entry in rawFlags.entries) {
      final key = entry.key;
      final value = entry.value;
      if (key is String && value is bool) {
        flags[key] = value;
      }
    }
    // Capture the server-provided version fingerprint for future ETag-style
    // cache validation. Stored on the provider's container scope as a side
    // effect — readers don't need it today, but invalidation logic can compare
    // against it later without a re-fetch.
    final version = data['version'];
    if (version is String && version.isNotEmpty) {
      _lastVersion = version;
    }
    dev.log(
      'feature-flags: loaded $flags (version=${_lastVersion ?? "none"})',
      name: 'FeatureFlags',
    );
    return flags;
  } catch (e) {
    // 401 / network / parse error all fall here. Return defaults so consumers
    // see a graceful "off" state instead of an error overlay. Crashlytics
    // already records the error via the dio interceptor for non-401s.
    dev.log('feature-flags: fetch failed ($e), using defaults',
        name: 'FeatureFlags');
    return const <String, bool>{};
  }
});

/// Convenience reader: returns the boolean value of [flag] from the resolved
/// [featureFlagsProvider], or [defaultValue] if the future hasn't resolved
/// (loading) or errored.
///
/// Usage from a `ConsumerWidget` build:
/// ```
/// final autoSellEnabled = ref.featureFlagEnabled('auto_sell');
/// ```
extension FeatureFlagRefX on WidgetRef {
  /// Synchronously evaluate [flag]. Returns [defaultValue] when the provider
  /// is still loading or has errored. Watching the underlying provider keeps
  /// the widget in sync as flags arrive.
  bool featureFlagEnabled(String flag, {bool defaultValue = false}) {
    final async = watch(featureFlagsProvider);
    return async.maybeWhen(
      data: (flags) => flags[flag] ?? defaultValue,
      orElse: () => defaultValue,
    );
  }
}

/// Same as [FeatureFlagRefX.featureFlagEnabled] but for `Ref` (used inside
/// providers/notifiers, not widgets).
extension FeatureFlagProviderRefX on Ref {
  bool featureFlagEnabled(String flag, {bool defaultValue = false}) {
    final async = watch(featureFlagsProvider);
    return async.maybeWhen(
      data: (flags) => flags[flag] ?? defaultValue,
      orElse: () => defaultValue,
    );
  }
}
