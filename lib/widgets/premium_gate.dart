import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/analytics_service.dart';
import '../core/settings_provider.dart';
import '../core/theme.dart';
import '../features/purchases/iap_service.dart';
import 'pro_chip.dart';

/// Gates a feature behind PRO subscription.
///
/// v2 behaviour (PLAN §3-5):
/// - Self-sources `isPremium` from [premiumProvider] (no manual prop).
/// - Locked state: renders [child] blurred behind a dark glass overlay with
///   a [ProChip] + CTA. Tap → `/premium` with [paywallSource].
/// - Premium state: renders [child] directly (no wrappers, no overhead).
/// - `false → true` transition: 650ms unlock choreography (blur fade-out,
///   gold burst, content reveal). Animation fires at most once per transition
///   and is skipped entirely under `MediaQuery.disableAnimations`.
/// - Blur fallback: when [blurFallbackProvider] is `true` (low-end devices)
///   we render a semi-opaque gradient instead of [BackdropFilter] — zero
///   `BackdropFilter` in tree, useful when scrolling multiple gates.
///
/// The [child] must be side-effect-free during build: v2 lays it out both in
/// the locked state (for the blurred preview) and the premium state.
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

  /// Rendered as-is for PRO users, and as a blurred preview for free users.
  final Widget child;

  /// Human-readable name shown in the locked overlay (e.g. "Detailed P/L
  /// charts over time"). Does NOT go to analytics — use [featureId] for that.
  final String featureName;

  /// Stable analytics ID for this gate (e.g. `auto_sell`, `pl_charts`).
  /// snake_case, ≤ 40 chars to stay within Firebase Analytics limits.
  final String featureId;

  /// CTA label for the unlock button.
  final String lockedCtaLabel;

  /// Optional one-liner shown under [featureName] in the locked overlay.
  final String? lockedSubtitle;

  /// Paywall source threaded to `/premium` when the CTA is tapped.
  /// P2 reads this from `GoRouterState.extra` and forwards to
  /// `Analytics.paywallViewed`.
  final PaywallSource paywallSource;

  /// Optional fixed height for the preview pane. Useful when [child] has
  /// unbounded height (e.g. a `ListView`). Omit for natural sizing.
  final double? previewHeight;

  /// When `false`, premium activation swaps content with a 150ms flash
  /// instead of the 650ms choreography. Useful for screens where multiple
  /// gates unlock simultaneously.
  final bool enableUnlockAnimation;

  @override
  ConsumerState<PremiumGate> createState() => _PremiumGateState();
}

class _PremiumGateState extends ConsumerState<PremiumGate> {
  /// Tracks whether the *previous* build saw premium=true. First frame
  /// initialises to the current value so we never fire an unlock animation
  /// on mount — only on an actual `false → true` transition.
  bool? _wasPremium;

  /// Set to `true` when we detect a `false → true` transition while the
  /// gate is already mounted. Cleared after the overlay completes. Used so
  /// that if the widget rebuilds mid-animation we continue showing the
  /// overlay instead of abruptly swapping to the plain child.
  bool _pendingUnlock = false;

  @override
  Widget build(BuildContext context) {
    final isPremium = ref.watch(premiumProvider).valueOrNull ?? false;

    // Detect the `false → true` transition. `_wasPremium == null` means this
    // is the first build — lock that in without triggering animation.
    if (_wasPremium == null) {
      _wasPremium = isPremium;
    } else if (_wasPremium == false && isPremium == true) {
      _wasPremium = true;
      if (widget.enableUnlockAnimation) {
        _pendingUnlock = true;
      }
    } else if (_wasPremium != isPremium) {
      _wasPremium = isPremium;
    }

    if (isPremium && !_pendingUnlock) {
      // Hot path: premium user, no pending animation. Render child directly
      // with zero wrappers so `tester.widget<X>()` finds it without friction.
      return widget.child;
    }

    if (isPremium && _pendingUnlock) {
      return _UnlockOverlay(
        previewHeight: widget.previewHeight,
        onComplete: () {
          if (mounted) {
            setState(() => _pendingUnlock = false);
          }
        },
        child: widget.child,
      );
    }

    return _LockedShell(
      featureName: widget.featureName,
      featureId: widget.featureId,
      ctaLabel: widget.lockedCtaLabel,
      subtitle: widget.lockedSubtitle,
      paywallSource: widget.paywallSource,
      previewHeight: widget.previewHeight,
      child: widget.child,
    );
  }
}

// ─── Locked shell ──────────────────────────────────────────────────

class _LockedShell extends ConsumerStatefulWidget {
  const _LockedShell({
    required this.child,
    required this.featureName,
    required this.featureId,
    required this.ctaLabel,
    required this.subtitle,
    required this.paywallSource,
    required this.previewHeight,
  });

  final Widget child;
  final String featureName;
  final String featureId;
  final String ctaLabel;
  final String? subtitle;
  final PaywallSource paywallSource;
  final double? previewHeight;

  @override
  ConsumerState<_LockedShell> createState() => _LockedShellState();
}

class _LockedShellState extends ConsumerState<_LockedShell> {
  @override
  void initState() {
    super.initState();
    // Fires once per featureId per session — Analytics owns the dedupe set
    // so multiple gates for the same feature on the same screen don't
    // double-log. Reset on auth state change (handled in app shell).
    Analytics.lockedFeatureViewed(feature: widget.featureId);
  }

  void _onTap() {
    HapticFeedback.lightImpact();
    // Every tap fires — taps on a locked CTA are always intentional.
    Analytics.lockedFeatureTapped(feature: widget.featureId);
    context.push('/premium', extra: widget.paywallSource);
  }

  @override
  Widget build(BuildContext context) {
    final blurFallback = ref.watch(blurFallbackProvider);

    final preview = RepaintBoundary(
      child: widget.previewHeight != null
          ? SizedBox(height: widget.previewHeight, child: widget.child)
          : widget.child,
    );

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _onTap,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // IgnorePointer so blurred child doesn't steal taps from the CTA.
          IgnorePointer(child: preview),
          Positioned.fill(
            child: blurFallback
                ? _SolidFallbackLayer()
                : _BlurLayer(),
          ),
          _LockedContent(
            featureName: widget.featureName,
            ctaLabel: widget.ctaLabel,
            subtitle: widget.subtitle,
            onTap: _onTap,
          ),
        ],
      ),
    );
  }
}

class _BlurLayer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppTheme.bg.withValues(alpha: 0.55),
                AppTheme.bg.withValues(alpha: 0.75),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SolidFallbackLayer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // No BackdropFilter — cheap to raster on low-end GPUs. 2px gold border
    // compensates for the missing blur-frost cue that the content is locked.
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppTheme.bg.withValues(alpha: 0.82),
            AppTheme.bgSecondary.withValues(alpha: 0.9),
          ],
        ),
        border: Border.all(
          color: AppTheme.warning.withValues(alpha: 0.35),
          width: 2,
        ),
        borderRadius: BorderRadius.circular(AppTheme.r16),
      ),
    );
  }
}

class _LockedContent extends StatelessWidget {
  const _LockedContent({
    required this.featureName,
    required this.ctaLabel,
    required this.subtitle,
    required this.onTap,
  });

  final String featureName;
  final String ctaLabel;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const ProChip(size: ProChipSize.large),
          const SizedBox(height: 14),
          Text(
            featureName,
            style: AppTheme.title,
            textAlign: TextAlign.center,
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 6),
            Text(
              subtitle!,
              style: AppTheme.caption.copyWith(color: AppTheme.textSecondary),
              textAlign: TextAlign.center,
            ),
          ],
          const SizedBox(height: 18),
          _UnlockCta(label: ctaLabel, onTap: onTap),
        ],
      ),
    );
  }
}

class _UnlockCta extends StatelessWidget {
  const _UnlockCta({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [AppTheme.warning, AppTheme.warningLight],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(AppTheme.r12),
          boxShadow: [
            BoxShadow(
              color: AppTheme.warning.withValues(alpha: 0.35),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.bolt_rounded, size: 16, color: Colors.white),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Unlock overlay (650ms choreography) ───────────────────────────

/// Transitional widget shown during `false → true` unlock.
///
/// Branches on `MediaQuery.disableAnimations` BEFORE constructing any
/// [AnimationController] — a11y contract is "zero AnimationController
/// created" in reduce-motion mode. The fast-path swaps to [_FlashFallback]
/// which uses a single `Future.delayed` + `setState`.
class _UnlockOverlay extends StatefulWidget {
  const _UnlockOverlay({
    required this.child,
    required this.previewHeight,
    required this.onComplete,
  });

  final Widget child;
  final double? previewHeight;
  final VoidCallback onComplete;

  @override
  State<_UnlockOverlay> createState() => _UnlockOverlayState();
}

class _UnlockOverlayState extends State<_UnlockOverlay> {
  bool? _reduceMotion;

  @override
  Widget build(BuildContext context) {
    final disableAnimations = MediaQuery.of(context).disableAnimations;

    // Decide which path once, on first build after we can read MediaQuery.
    // Flipping modes mid-animation isn't a supported scenario.
    _reduceMotion ??= disableAnimations;

    if (_reduceMotion == true) {
      return _FlashFallback(
        onComplete: widget.onComplete,
        child: widget.child,
      );
    }

    return _FullChoreography(
      previewHeight: widget.previewHeight,
      onComplete: widget.onComplete,
      child: widget.child,
    );
  }
}

/// Reduce-motion fast path: render child immediately, overlay a 150ms gold
/// flash so the transition still feels acknowledged, then clean up.
///
/// Zero [AnimationController] — uses `AnimatedOpacity` + `Future.delayed`.
class _FlashFallback extends StatefulWidget {
  const _FlashFallback({required this.child, required this.onComplete});

  final Widget child;
  final VoidCallback onComplete;

  @override
  State<_FlashFallback> createState() => _FlashFallbackState();
}

class _FlashFallbackState extends State<_FlashFallback> {
  bool _showFlash = true;

  @override
  void initState() {
    super.initState();
    // Next frame: fade flash out; 150ms later: notify completion.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() => _showFlash = false);
      Future.delayed(const Duration(milliseconds: 150), () {
        if (mounted) widget.onComplete();
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        if (_showFlash)
          Positioned.fill(
            child: IgnorePointer(
              child: AnimatedOpacity(
                opacity: _showFlash ? 0.4 : 0.0,
                duration: const Duration(milliseconds: 150),
                child: Container(
                  decoration: BoxDecoration(
                    color: AppTheme.warningLight.withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(AppTheme.r16),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Full 650ms unlock choreography — runs only when reduce-motion is OFF.
///
/// Phase map:
///   0–300ms:   blur sigma 18 → 0
///   200–500ms: radial gold burst (opacity 0 → 1 → 0, scale 0.6 → 1.2)
///   350–650ms: content opacity 0 → 1, scale 0.96 → 1.0
class _FullChoreography extends StatefulWidget {
  const _FullChoreography({
    required this.child,
    required this.previewHeight,
    required this.onComplete,
  });

  final Widget child;
  final double? previewHeight;
  final VoidCallback onComplete;

  @override
  State<_FullChoreography> createState() => _FullChoreographyState();
}

class _FullChoreographyState extends State<_FullChoreography>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _blurSigma;
  late final Animation<double> _burstOpacity;
  late final Animation<double> _burstScale;
  late final Animation<double> _contentOpacity;
  late final Animation<double> _contentScale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 650),
    );

    // Interval timing (PLAN §4):
    _blurSigma = Tween<double>(begin: 18, end: 0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.46, curve: Curves.easeOut),
      ),
    );

    _burstOpacity = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0), weight: 50),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.0), weight: 50),
    ]).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.31, 0.77, curve: Curves.easeInOut),
      ),
    );

    _burstScale = Tween<double>(begin: 0.6, end: 1.2).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.31, 0.77, curve: Curves.easeOutCubic),
      ),
    );

    _contentOpacity = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.54, 1.0, curve: Curves.easeOut),
      ),
    );

    _contentScale = Tween<double>(begin: 0.96, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.54, 1.0, curve: Curves.easeOutCubic),
      ),
    );

    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed && mounted) {
        widget.onComplete();
      }
    });
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final preview = widget.previewHeight != null
        ? SizedBox(height: widget.previewHeight, child: widget.child)
        : widget.child;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Stack(
          alignment: Alignment.center,
          children: [
            Opacity(
              opacity: _contentOpacity.value,
              child: Transform.scale(
                scale: _contentScale.value,
                child: preview,
              ),
            ),
            if (_blurSigma.value > 0.01)
              Positioned.fill(
                child: IgnorePointer(
                  child: ClipRect(
                    child: BackdropFilter(
                      filter: ImageFilter.blur(
                        sigmaX: _blurSigma.value,
                        sigmaY: _blurSigma.value,
                      ),
                      child: Container(
                        color: AppTheme.bg
                            .withValues(alpha: _blurSigma.value / 18 * 0.6),
                      ),
                    ),
                  ),
                ),
              ),
            if (_burstOpacity.value > 0.01)
              IgnorePointer(
                child: Transform.scale(
                  scale: _burstScale.value,
                  child: Opacity(
                    opacity: _burstOpacity.value,
                    child: Container(
                      width: 180,
                      height: 180,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            AppTheme.warningLight.withValues(alpha: 0.9),
                            AppTheme.warning.withValues(alpha: 0.4),
                            AppTheme.warning.withValues(alpha: 0.0),
                          ],
                          stops: const [0.0, 0.5, 1.0],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
