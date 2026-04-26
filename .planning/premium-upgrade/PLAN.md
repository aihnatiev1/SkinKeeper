# PLAN.md — Premium Upgrade Initiative — Phases P1 + P2

> **Owner:** flutter-dev (execution), architect (plan authority)
> **Phases in scope:** P1 PremiumGate v2 (1.5d), P2 Analytics expansion (0.5d)
> **Out of scope:** P3 backend, P4 auto-sell UI, P5-P7 smart alerts, P8 tour, Scheduler (dropped)
> **Status:** Ready for execution

---

## 0. Research Findings (grounded in current codebase)

Artifacts inspected:
- `lib/widgets/premium_gate.dart` — current v1 impl
- `lib/core/analytics_service.dart` — `Analytics` static class, Firebase-backed, `_event()` helper
- `lib/features/purchases/iap_service.dart` — `premiumProvider` (AsyncNotifier<bool>), `PremiumNotifier.setPremium()`, `refreshFromServer()`
- `lib/core/theme.dart` — `AppTheme.primaryGradient`, `AppTheme.primary` (purple), `AppTheme.warning` (gold #F59E0B)
- `lib/core/router.dart` — `/premium` route → `PaywallScreen`
- `lib/features/purchases/paywall_screen.dart` — `Analytics.paywallViewed()` called in `initState` (no source param yet)

**Key findings:**

1. **Current `PremiumGate` API:** `{Widget child, String featureName, bool isPremium}`. `isPremium` is passed manually. Replaces content entirely when locked (no preview slot, no blur, no analytics).
2. **`invalidatePremiumCache()` does NOT exist.** Current activation path: `premiumProvider.notifier.setPremium(true)` + `ref.invalidate(authStateProvider)`. **Gap:** define as thin wrapper in P1 scope so P3/P4 have a stable name.
3. **Analytics has `paywallViewed()` with NO params and `paywallDismissed({reason})`.** Extend `paywallViewed` with optional `source` (backward compatible).
4. **PremiumGate v1 call-sites:** inspection of alerts/watchlist/tradeup/deals/settings/paywall screens shows **0 direct `PremiumGate` usages**. Widget exists but isn't yet integrated. Migration cost ≈ 0. v2 must land with at least one integration example (Alerts Create CTA).
5. **Reduce-motion detection:** `MediaQuery.of(context).disableAnimations` (iOS "Reduce Motion" + Android "Remove animations"). NOT `accessibleNavigation` (screen readers).
6. **Low-end device detection:** no infra wired. Use manual feature flag (SharedPreferences `blur_fallback_enabled`, default false). Remote Config later.
7. **Firebase Analytics constraints:** event name ≤ 40 chars, param ≤ 40 chars, string value ≤ 100 chars, max 25 params per event. All planned names fit.

---

## 1. Task Breakdown (atomic, hours)

### Phase 1 — PremiumGate v2 (total: 12h = 1.5d)

| # | Task | Est | Depends on |
|---|------|-----|------------|
| P1.1 | Scaffold: `lib/widgets/pro_chip.dart`, rewrite `lib/widgets/premium_gate.dart` | 0.5h | — |
| P1.2 | `ProChip` (stateless, gold gradient, 3 size variants) + golden tests | 1.5h | P1.1 |
| P1.3 | `PremiumGate` v2 shell: preview slot, locked-overlay, `ConsumerWidget` binding to `premiumProvider` | 2h | P1.1 |
| P1.4 | Blur layer: `BackdropFilter` + `ImageFilter.blur(18,18)` in `RepaintBoundary`; respects `blurFallbackEnabled` | 1h | P1.3 |
| P1.5 | Unlock choreography (650ms): blur fade-out 0-300, gold burst 200-500, content reveal 350-650 | 2.5h | P1.3, P1.4 |
| P1.6 | Reduce-motion branch: `if (disableAnimations)` → instant swap + 150ms static flash | 0.5h | P1.5 |
| P1.7 | `invalidatePremiumCache(WidgetRef ref)` helper in `iap_service.dart` — awaits `refreshFromServer()` + invalidates `authStateProvider` | 0.5h | — |
| P1.8 | Wire unlock trigger: gate listens to `premiumProvider`, fires animation ONLY on `false → true` AND future resolved | 1.5h | P1.5, P1.7 |
| P1.9 | Tap-to-paywall: `context.push('/premium', extra: PaywallSource.lockedTap)` + haptic | 0.25h | P1.3 |
| P1.10 | Widget tests: free state, premium state, unlock transition, reduce-motion, blur fallback | 1.5h | P1.8 |
| P1.11 | Integrate v2 into Alerts screen (Create Alert CTA) as reference | 0.75h | P1.3 |

### Phase 2 — Analytics Expansion (total: 4h = 0.5d)

| # | Task | Est | Depends on |
|---|------|-----|------------|
| P2.1 | `PaywallSource` enum (`lockedTap`, `teaseCard`, `settings`, `deepLink`, `unknown`) + `analyticsValue` getter | 0.25h | — |
| P2.2 | Extend `Analytics.paywallViewed({PaywallSource? source})` — backward compatible | 0.25h | P2.1 |
| P2.3 | `lockedFeatureViewed({feature})` + `lockedFeatureTapped({feature})` | 0.25h | — |
| P2.4 | Tour event stubs (for P8): `tourStarted`, `tourSlideViewed({slide})`, `tourCompleted`, `tourSkipped`, `tourSkippedFromSlide({slide})` | 0.5h | — |
| P2.5 | Wire `lockedFeatureViewed` into `PremiumGate.initState` (free users, debounced per feature per session) | 0.5h | P1.3, P2.3 |
| P2.6 | Wire `lockedFeatureTapped` into gate onTap | 0.25h | P1.9, P2.3 |
| P2.7 | `PaywallScreen.initState` accepts source via `GoRouterState.extra` | 0.5h | P2.2 |
| P2.8 | `/premium` route extracts `PaywallSource` from `state.extra`, default `deepLink` | 0.25h | P2.1, P2.7 |
| P2.9 | Unit tests for Analytics methods (Firebase mocked) | 1h | P2.3, P2.4 |
| P2.10 | Manual QA: fire every new event in debug, verify in Firebase DebugView | 0.25h | all |

**Combined total: 16h (2d).** 0.5d buffer lives at initiative level.

---

## 2. File-level Changes

### New files
| Path | Purpose |
|------|---------|
| `lib/widgets/pro_chip.dart` | `ProChip` gold gradient badge |
| `test/widgets/premium_gate_test.dart` | v2 widget tests |
| `test/widgets/pro_chip_test.dart` | Chip render + golden |
| `test/core/analytics_locked_feature_test.dart` | Analytics unit tests |

### Edited files
| Path | Change |
|------|--------|
| `lib/widgets/premium_gate.dart` | **Full rewrite** (v1 → v2) |
| `lib/core/analytics_service.dart` | `PaywallSource` enum, new events, extend `paywallViewed` |
| `lib/features/purchases/iap_service.dart` | Add `invalidatePremiumCache(WidgetRef)`; refactor `_verifyAndDeliver` to use it |
| `lib/features/purchases/paywall_screen.dart` | Accept `source`, forward to `paywallViewed` |
| `lib/core/router.dart` | `/premium`: extract `PaywallSource` from `state.extra` |
| `lib/features/alerts/alerts_screen.dart` | Wrap Create Alert CTA in `PremiumGate` |
| `lib/core/settings_provider.dart` | Add `blurFallbackProvider` (SharedPreferences bool, dev-toggle) |

### Not touched
- Feature screens beyond Alerts (P3/P4 integrate per feature)
- Paywall internal layout (no redesign here)
- Push/notifications, any backend

---

## 3. API Signatures

### `ProChip` (new)

```dart
class ProChip extends StatelessWidget {
  const ProChip({
    super.key,
    this.size = ProChipSize.medium,
    this.label = 'PRO',
    this.icon,
  });

  final ProChipSize size;
  final String label;
  final IconData? icon;
}

enum ProChipSize { small, medium, large }
```

Visual contract: gold gradient `#F59E0B → #FBBF24`, 1px inner gold-tinted border, radius `r8`, padding 6/10/14, letter-spacing 1.2, weight 700, uppercase.

### `PremiumGate` v2 (rewrite)

```dart
class PremiumGate extends ConsumerStatefulWidget {
  const PremiumGate({
    super.key,
    required this.child,
    required this.featureName,
    required this.featureId,
    this.lockedCtaLabel = 'Unlock with PRO',
    this.lockedSubtitle,
    this.paywallSource = PaywallSource.lockedTap,
    this.previewHeight,
    this.enableUnlockAnimation = true,
  });

  final Widget child;
  final String featureName;
  final String featureId;
  final String lockedCtaLabel;
  final String? lockedSubtitle;
  final PaywallSource paywallSource;
  final double? previewHeight;
  final bool enableUnlockAnimation;
}
```

**Breaking:** removed `isPremium` (gate self-sources). **New required:** `featureId`.

### `invalidatePremiumCache` (new helper)

```dart
Future<void> invalidatePremiumCache(WidgetRef ref) async {
  final notifier = ref.read(premiumProvider.notifier);
  await notifier.refreshFromServer();
  ref.invalidate(authStateProvider);
}
```

Contract: **returns only after premium state is fresh from backend.**

### Analytics additions

```dart
enum PaywallSource {
  lockedTap, teaseCard, settings, deepLink, unknown;

  String get analyticsValue => switch (this) {
    PaywallSource.lockedTap => 'locked_tap',
    PaywallSource.teaseCard => 'tease_card',
    PaywallSource.settings  => 'settings',
    PaywallSource.deepLink  => 'deep_link',
    PaywallSource.unknown   => 'unknown',
  };
}

static Future<void> paywallViewed({PaywallSource? source});
static Future<void> lockedFeatureViewed({required String feature});
static Future<void> lockedFeatureTapped({required String feature});
static Future<void> tourStarted();
static Future<void> tourSlideViewed({required int slide});
static Future<void> tourCompleted();
static Future<void> tourSkipped();
static Future<void> tourSkippedFromSlide({required int slide});
```

Event payload contract:

| Event | Params |
|-------|--------|
| `paywall_viewed` | `source: string` (always present post-P2, `unknown` fallback) |
| `locked_feature_viewed` | `feature: string` (stable ID) |
| `locked_feature_tapped` | `feature: string` |
| `tour_started` | — |
| `tour_slide_viewed` | `slide: int` (0-indexed) |
| `tour_completed` | — |
| `tour_skipped` | — |
| `tour_skipped_from_slide` | `at_slide: int` |

---

## 4. Data Flow

### Locked state (free)
```
premiumProvider → PremiumGate (isPremium=false)
  → Stack: [child in RepaintBoundary + BackdropFilter.blur + darkening]
           [center: ProChip + title + subtitle + CTA]
  → initState: Analytics.lockedFeatureViewed(feature: featureId)
  → CTA tap:
      Analytics.lockedFeatureTapped(feature: featureId)
      HapticFeedback.lightImpact()
      context.push('/premium', extra: paywallSource)
  → PaywallScreen.initState: Analytics.paywallViewed(source: source)
```

### Unlock (after purchase)
```
IAPService._verifyAndDeliver() succeeds
  → await invalidatePremiumCache(ref)
  → premiumProvider emits true
  → PremiumGate.ref.listen detects false → true
  → sets _pendingUnlock = true, post-frame:
      AnimationController.forward() [650ms]
        phase 1 (0-300ms):   blur sigma 18 → 0
        phase 2 (200-500ms): radial gold burst opacity 0 → 1 → 0, scale 0.6 → 1.2
        phase 3 (350-650ms): child opacity 0 → 1, scale 0.96 → 1.0
  → on complete: remove overlay, render child directly
  → if MediaQuery.disableAnimations:
      skip controller, hard-swap in 1 frame + 150ms static gold flash
```

### Blur fallback (low-end)
```
settingsProvider.blurFallbackEnabled == true
  → skip BackdropFilter
  → render semi-opaque dark gradient (bg @ 0.82) + 2px gold border
  → all other UX identical
```

---

## 5. Acceptance Criteria

### Phase 1
- [ ] Free user: X blurred + chip + CTA; Premium: `tester.widget<X>()` finds X directly (no extra widgets)
- [ ] Unlock animation runs exactly once per `false → true` transition, 650ms ±30ms
- [ ] Animation does NOT fire if `refreshFromServer()` throws or returns `false`
- [ ] `MediaQuery.disableAnimations = true`: zero `AnimationController` created, transition ≤ 1 frame + 150ms flash
- [ ] `blurFallbackEnabled = true`: zero `BackdropFilter` in tree
- [ ] `RepaintBoundary` wraps blurred preview
- [ ] CTA tap pushes `/premium` with correct `PaywallSource`
- [ ] `ProChip` golden tests pass for 3 sizes
- [ ] Alerts reference integration shows gate in free, unblurred in premium

### Phase 2
- [ ] `paywallViewed()` no-arg still compiles, logs `source: 'unknown'`
- [ ] `paywallViewed(source: teaseCard)` logs `paywall_viewed` with `source: 'tease_card'`
- [ ] `lockedFeatureViewed` fires once per gate mount per session per `featureId` (in-memory Set dedupe)
- [ ] `lockedFeatureTapped` fires on every tap
- [ ] All 5 tour event methods exist, callable, correct event names
- [ ] `/premium` route: missing extra → `deepLink`
- [ ] Firebase DebugView manual: every event <5s

---

## 6. Test Plan

### Automated
| File | Covers |
|------|--------|
| `test/widgets/pro_chip_test.dart` | Label, size variants, gold gradient, icon |
| `test/widgets/premium_gate_test.dart` | Free/Premium states, tap, unlock animation, reduce-motion, blur fallback, analytics dedupe |
| `test/core/analytics_locked_feature_test.dart` | Signatures compile, event names/params match (mocked Firebase) |
| `test/goldens/pro_chip_{small,medium,large}.png` | Visual regression |

### Manual QA
- iOS Reduce Motion ON → no animation
- iOS Reduce Motion OFF → 650ms choreography smooth
- Android low-end (Pixel 3a) + `blurFallbackEnabled` → no scroll jank
- Firebase DebugView: trigger each new event, screenshot
- Sandbox purchase: buy PRO → unlock animation on visible gate → `locked_feature_viewed` stops for that feature

### Perf smoke
- Profile mode, 10 gates in scroll → 60fps
- <55fps → enable fallback flag (decision signal for P3 default)

---

## 7. Dependencies on Future Phases

### P3 Backend
- May add fields to `/purchases/status` — `invalidatePremiumCache` awaits `refreshFromServer()`, new fields propagate
- P3 MUST NOT change `premiumProvider`'s `bool` shape without coordination

### P4 Auto-sell UI
- Wraps config screen in `PremiumGate(featureId: 'auto_sell', featureName: 'Auto-sell', paywallSource: PaywallSource.lockedTap)`
- **Contract:** auto-sell screen must render fully laid-out form as `child`, not placeholder — this is the whole point of preview slot

### P5-P7 Smart alerts
- Same gate pattern. `featureId: 'smart_alerts'`
- Tease cards: `paywallViewed(source: teaseCard)` before pushing `/premium`

### P8 Tour
- Triggered from `_verifyAndDeliver` success AFTER `invalidatePremiumCache` resolves
- Tour event stubs land in P2 — P8 just calls them
- Launch point: listen `premiumProvider` in app shell; `false → true` AND `onboardingCompleted` → push `/tour`
- **Mitigation against collision with gate animation:** delay tour push by 800ms so active gate choreography completes first

---

## 8. Migration Plan (v1 → v2)

### Breaking changes
1. `PremiumGate` lost `isPremium` prop
2. `PremiumGate` gained required `featureId`

### Migration steps
1. Run `grep -rn "PremiumGate(" lib/`
2. Expected: **0 call-sites.** Land v2 directly.
3. If non-zero:
   - Remove `isPremium: xyz` (delete line)
   - Add `featureId: 'stable_snake_case_id'`
   - Remove dead `premiumProvider` watches that only forwarded to gate
4. `dart analyze` clean
5. Widget test suite green

### Rollback
- Tag commit `premium-gate-v1` before rewrite
- If v2 breaks: revert single file + Alerts integration (2-file revert)
- Analytics is additive-only → no revert needed

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Unlock animation fires before backend confirms → content re-locks | Medium | High | `invalidatePremiumCache` awaits `refreshFromServer`; `_pendingUnlock` guard |
| `BackdropFilter` tanks Android mid-range scroll | Medium | Medium | `RepaintBoundary` + fallback flag |
| `lockedFeatureViewed` spams (gate rebuilds) | High | Medium | In-memory `Set<String>` dedupe per session, reset on auth change |
| `disableAnimations` ignored → a11y complaint | Low | High | Widget test asserts zero `AnimationController` in that branch |
| P4 assumes `child` builds twice safely | Medium | Low | Dartdoc: `child` must be side-effect-free in build; heavy work in initState/providers |

---

## 10. Delivery Checklist (flutter-dev self-check)

- [ ] `dart analyze` clean
- [ ] `flutter test` green (incl. new golden)
- [ ] `build_runner` clean if `.g.dart` touched
- [ ] Manual QA (§6) completed, annotated in PR
- [ ] Firebase DebugView screenshots for every new event
- [ ] No `TODO(P3)`/`TODO(P4)` left over
- [ ] `CLAUDE.md` Current Priorities updated

---

## 11. Handoff Notes for flutter-dev

- Start with `grep -rn "PremiumGate" lib/` + `grep -rn "premiumProvider" lib/` — confirm migration surface
- Land `ProChip` first (isolated, easy review, unblocks PR)
- Wire `invalidatePremiumCache` early (P1.7) — 30min task de-risks P1.8
- Write reduce-motion widget test BEFORE animation code (enforces behavior)
- Do NOT inline unlock animation in `build()` — extract to private `_UnlockOverlay` with its own `AnimationController`
- Gold burst: use `RadialGradient` + `TweenSequence`, NOT custom painter
- When done → `qa` for test review. `publisher` NOT needed (no store changes).
