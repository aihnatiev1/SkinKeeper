import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/analytics_service.dart';
import '../../../core/theme.dart';
import 'slides/slide_autosell_pitch.dart';
import 'slides/slide_celebration.dart';
import 'slides/slide_feature_grid.dart';
import 'slides/slide_personalized.dart';
import 'tour_models.dart';
import 'tour_provider.dart';

/// Post-purchase tour shell. Uses a [PageView] so the four slides share a
/// single [Scaffold] and skip/back logic stays in one place.
///
/// Lifecycle contract:
///  - On mount: `Analytics.tourStarted()` fires once, slide 0 becomes
///    visible and `tourSlideViewed(slide: 0)` fires.
///  - Every page change: `tourSlideViewed(slide: n)` fires once per slide.
///  - On Done (slide 4 primary): `tourCompleted` + flag set + pop.
///  - On any tile tap or "Try it now": `tourCtaTapped(action)` +
///    `tourCompleted` + flag set + navigate.
///  - On skip: confirmation dialog → `tourSkipped` +
///    `tourSkippedFromSlide` + flag set + pop.
class TourScreen extends ConsumerStatefulWidget {
  const TourScreen({super.key});

  @override
  ConsumerState<TourScreen> createState() => _TourScreenState();
}

class _TourScreenState extends ConsumerState<TourScreen> {
  final PageController _ctrl = PageController();
  int _index = 0;
  final Set<int> _viewedSlides = <int>{};
  bool _exiting = false;

  @override
  void initState() {
    super.initState();
    Analytics.tourStarted();
    _logSlideViewed(0);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _logSlideViewed(int index) {
    if (_viewedSlides.add(index)) {
      Analytics.tourSlideViewed(slide: index);
    }
  }

  Future<void> _markCompleted() async {
    await ref.read(tourCompletionServiceProvider).markCompleted();
  }

  void _onPageChanged(int index) {
    setState(() => _index = index);
    _logSlideViewed(index);
  }

  Future<void> _animateTo(int index) async {
    await _ctrl.animateToPage(
      index,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _exitTour() async {
    if (_exiting) return;
    _exiting = true;
    await _markCompleted();
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  Future<void> _navigateAndExit(String path) async {
    if (_exiting) return;
    _exiting = true;
    await _markCompleted();
    if (!mounted) return;
    // Pop the tour first (it's a fullscreen dialog) and then push the
    // destination using the root navigator. `context.go(path)` would also
    // work but we want the tour to leave a clean stack with the user landing
    // on the destination, not the previous shell screen.
    final router = GoRouter.of(context);
    Navigator.of(context).pop();
    router.go(path);
  }

  Future<void> _onSkipPressed() async {
    HapticFeedback.lightImpact();
    final shouldSkip = await _confirmSkip();
    if (shouldSkip != true) return;
    final atSlide = _index;
    Analytics.tourSkipped();
    Analytics.tourSkippedFromSlide(slide: atSlide);
    await _exitTour();
  }

  Future<bool?> _confirmSkip() {
    return showCupertinoDialog<bool>(
      context: context,
      builder: (dialogCtx) => CupertinoAlertDialog(
        title: const Text('Skip the tour?'),
        content: const Text(
          "You can always revisit features later from Settings.",
        ),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.of(dialogCtx).pop(false),
            child: const Text('Continue tour'),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.of(dialogCtx).pop(true),
            child: const Text('Skip'),
          ),
        ],
      ),
    );
  }

  void _onContinueFromCelebration() {
    Analytics.tourCtaTapped(slide: 0, action: 'continue');
    _animateTo(1);
  }

  void _onContinueFromPersonalized() {
    Analytics.tourCtaTapped(slide: 1, action: 'continue');
    _animateTo(2);
  }

  void _onContinueFromAutosell() {
    Analytics.tourCtaTapped(slide: 2, action: 'continue');
    _animateTo(3);
  }

  Future<void> _onTryNowFromAutosell() async {
    Analytics.tourCtaTapped(slide: 2, action: 'try_now');
    await _navigateAndExit('/auto-sell');
  }

  Future<void> _onDoneFromGrid() async {
    Analytics.tourCtaTapped(slide: 3, action: 'done');
    Analytics.tourCompleted();
    await _exitTour();
  }

  Future<void> _onTilePressed(String tileId) async {
    Analytics.tourCtaTapped(slide: 3, action: 'feature_tile:$tileId');
    Analytics.tourCompleted();
    final path = switch (tileId) {
      'auto_sell' => '/auto-sell',
      'smart_alerts' => '/alerts',
      'per_account_pl' => '/portfolio',
      'export_history' => '/transactions',
      _ => '/portfolio',
    };
    await _navigateAndExit(path);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: Stack(
        children: [
          // Subtle radial backdrop — anchors the tour visually as a single
          // experience instead of feeling like a regular screen.
          const Positioned.fill(child: _TourBackdrop()),
          SafeArea(
            child: Column(
              children: [
                _TopBar(
                  showSkip: _index >= 1,
                  onSkip: _onSkipPressed,
                  index: _index,
                  totalSlides: TourSlide.values.length,
                ),
                Expanded(
                  child: PageView(
                    controller: _ctrl,
                    onPageChanged: _onPageChanged,
                    children: [
                      SlideCelebration(
                        onContinue: _onContinueFromCelebration,
                      ),
                      SlidePersonalized(
                        onContinue: _onContinueFromPersonalized,
                      ),
                      SlideAutosellPitch(
                        onTryNow: _onTryNowFromAutosell,
                        onContinue: _onContinueFromAutosell,
                      ),
                      SlideFeatureGrid(
                        onDone: _onDoneFromGrid,
                        onTilePressed: _onTilePressed,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.showSkip,
    required this.onSkip,
    required this.index,
    required this.totalSlides,
  });

  final bool showSkip;
  final VoidCallback onSkip;
  final int index;
  final int totalSlides;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 4),
      child: Row(
        children: [
          // Page-progress dots — also serve as a "where am I" cue.
          for (int i = 0; i < totalSlides; i++) ...[
            _ProgressDot(active: i == index),
            if (i < totalSlides - 1) const SizedBox(width: 6),
          ],
          const Spacer(),
          if (showSkip)
            TextButton(
              onPressed: onSkip,
              style: TextButton.styleFrom(
                foregroundColor: AppTheme.textMuted,
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
              ),
              child: const Text(
                'Skip',
                style: TextStyle(
                  fontSize: 13,
                  color: AppTheme.textSecondary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            )
          else
            const SizedBox(height: 30),
        ],
      ),
    );
  }
}

class _ProgressDot extends StatelessWidget {
  const _ProgressDot({required this.active});
  final bool active;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: active ? 22 : 6,
      height: 6,
      decoration: BoxDecoration(
        color: active ? AppTheme.warning : AppTheme.borderLight,
        borderRadius: BorderRadius.circular(3),
      ),
    );
  }
}

class _TourBackdrop extends StatelessWidget {
  const _TourBackdrop();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(0, -0.6),
          radius: 1.2,
          colors: [
            AppTheme.warning.withValues(alpha: 0.08),
            AppTheme.bg,
          ],
          stops: const [0.0, 0.7],
        ),
      ),
    );
  }
}
