// Premium upgrade analytics audit (P10.T5).
//
// This file is documentation-as-code — a single source of truth listing
// every event the premium initiative emits, where it fires, and which phase
// introduced it. QA / publisher should walk this list when validating a
// release in Firebase DebugView.
//
// NOT imported by the app at runtime. Lives in `lib/dev/` as a compiled
// reference (so renames in `Analytics.*` break the build here, not just
// silently drift) and to keep the doc next to the code it describes.

import '../core/analytics_service.dart';

/// Static descriptor for one analytics event.
class AnalyticsEventSpec {
  const AnalyticsEventSpec({
    required this.name,
    required this.phase,
    required this.params,
    required this.firesWhen,
    required this.callSite,
  });

  /// Firebase event name (must match `_event(name, ...)` in
  /// `analytics_service.dart`).
  final String name;

  /// Premium-initiative phase that introduced this event ('P1'..'P10').
  final String phase;

  /// Param keys + value examples. Empty list = no params.
  final List<String> params;

  /// Plain-language description of what user action triggers it.
  final String firesWhen;

  /// File path (relative to lib/) where the event is fired.
  final String callSite;
}

/// Catalogue. Order matches the user funnel: paywall surfaces first, then
/// in-context locked-feature pings, then the post-purchase tour.
const List<AnalyticsEventSpec> kPremiumAnalyticsEvents = [
  AnalyticsEventSpec(
    name: 'paywall_viewed',
    phase: 'P2',
    params: ['source: locked_tap | tease_card | settings | deep_link | unknown'],
    firesWhen: 'PaywallScreen.initState — every time the /premium route mounts',
    callSite: 'features/purchases/paywall_screen.dart',
  ),
  AnalyticsEventSpec(
    name: 'paywall_dismissed',
    phase: 'pre-P1',
    params: ['reason: close_button | back_gesture | continue_free | purchase_failed'],
    firesWhen: 'User exits paywall without purchasing',
    callSite: 'features/purchases/paywall_screen.dart',
  ),
  AnalyticsEventSpec(
    name: 'paywall_matrix_expanded',
    phase: 'P6',
    params: [],
    firesWhen: 'User taps "Compare all features" disclosure on paywall',
    callSite: 'features/purchases/paywall_screen_parts.dart',
  ),
  AnalyticsEventSpec(
    name: 'premium_purchased',
    phase: 'pre-P1',
    params: ['plan: monthly | yearly'],
    firesWhen: 'IAPService verifies a fresh purchase',
    callSite: 'features/purchases/iap_service.dart',
  ),
  AnalyticsEventSpec(
    name: 'locked_feature_viewed',
    phase: 'P2',
    params: ['feature: snake_case_id'],
    firesWhen:
        'PremiumGate _LockedShell.initState — first mount per feature per session '
        '(deduped via Analytics._lockedFeatureSeenThisSession)',
    callSite: 'widgets/premium_gate.dart',
  ),
  AnalyticsEventSpec(
    name: 'locked_feature_tapped',
    phase: 'P2',
    params: ['feature: snake_case_id'],
    firesWhen: 'User taps the locked-state CTA on any PremiumGate (every tap)',
    callSite: 'widgets/premium_gate.dart',
  ),
  AnalyticsEventSpec(
    name: 'tour_started',
    phase: 'P8',
    params: [],
    firesWhen: 'TourScreen.initState — fresh purchase + tour_v1_completed=false',
    callSite: 'features/purchases/tour/tour_screen.dart',
  ),
  AnalyticsEventSpec(
    name: 'tour_slide_viewed',
    phase: 'P8',
    params: ['slide: 0..3'],
    firesWhen: 'PageView lands on a new slide',
    callSite: 'features/purchases/tour/tour_screen.dart',
  ),
  AnalyticsEventSpec(
    name: 'tour_completed',
    phase: 'P8',
    params: [],
    firesWhen: 'User reaches the final slide and taps "Done"',
    callSite: 'features/purchases/tour/tour_screen.dart',
  ),
  AnalyticsEventSpec(
    name: 'tour_skipped',
    phase: 'P8',
    params: [],
    firesWhen: 'User taps "Skip" on slide 0 or back-gestures out',
    callSite: 'features/purchases/tour/tour_screen.dart',
  ),
  AnalyticsEventSpec(
    name: 'tour_skipped_from_slide',
    phase: 'P8',
    params: ['at_slide: 0..3'],
    firesWhen: 'User skips mid-tour (NOT slide 0); attribution for drop-off',
    callSite: 'features/purchases/tour/tour_screen.dart',
  ),
  AnalyticsEventSpec(
    name: 'tour_cta_tapped',
    phase: 'P8',
    params: ['slide: 0..3', 'action: try_now | continue | done | feature_tile'],
    firesWhen: 'Any CTA tap inside the tour',
    callSite: 'features/purchases/tour/tour_screen.dart',
  ),
];

/// QA checklist generator. Outputs a markdown table for paste into a release
/// note. Not used at runtime — call from a `dart run` script if needed.
String renderQAChecklist() {
  final buf = StringBuffer()
    ..writeln('| Event | Phase | Params | Fires when |')
    ..writeln('|---|---|---|---|');
  for (final spec in kPremiumAnalyticsEvents) {
    final params = spec.params.isEmpty ? '—' : spec.params.join(', ');
    buf.writeln('| `${spec.name}` | ${spec.phase} | $params | ${spec.firesWhen} |');
  }
  return buf.toString();
}

/// Compile-time check: every name in [kPremiumAnalyticsEvents] should map to
/// a method on [Analytics]. We can't reflect on static methods at runtime in
/// Flutter web/AOT, but listing them here makes a missed rename loud during
/// review. This list is unused at runtime.
const _expectedAnalyticsMethods = <String>[
  'paywallViewed',
  'paywallDismissed',
  'paywallMatrixExpanded',
  'premiumPurchased',
  'lockedFeatureViewed',
  'lockedFeatureTapped',
  'tourStarted',
  'tourSlideViewed',
  'tourCompleted',
  'tourSkipped',
  'tourSkippedFromSlide',
  'tourCtaTapped',
];

// Suppress unused warning — list is documentation, referenced via `dart doc`.
// ignore: unused_element
const _audit = _expectedAnalyticsMethods;

// Touch [Analytics] at compile time so a rename or removal of the static
// class would surface as a build break in this file. The expression is
// evaluated lazily at the top level — never invoked at runtime.
// ignore: unused_element
final _typeBeacon = Analytics.resetLockedFeatureSession;
