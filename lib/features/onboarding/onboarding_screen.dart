import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/analytics_service.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/shared_ui.dart';

const _kOnboardingComplete = 'onboarding_completed';

Future<bool> isOnboardingComplete() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getBool(_kOnboardingComplete) ?? false;
}

Future<void> markOnboardingComplete() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(_kOnboardingComplete, true);
}

Future<void> resetOnboarding() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.remove(_kOnboardingComplete);
}

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  static const int _pageCount = 5;

  final _ctrl = PageController();
  int _page = 0;

  List<_PageData> _pages(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return [
      _PageData(
        image: 'assets/onboarding/dashboard.png',
        title: l10n.onbDashTitle,
        subtitle: l10n.onbDashSub,
      ),
      _PageData(
        image: 'assets/onboarding/inventory.png',
        title: l10n.onbInventoryTitle,
        subtitle: l10n.onbInventorySub,
      ),
      _PageData(
        image: 'assets/onboarding/trades.png',
        title: l10n.onbTradesTitle,
        subtitle: l10n.onbTradesSub,
      ),
      _PageData(
        image: 'assets/onboarding/multi_account.png',
        title: l10n.onbAccountsTitle,
        subtitle: l10n.onbAccountsSub,
      ),
      _PageData(
        image: null, // premium slide uses icon instead
        title: l10n.onbProTitle,
        subtitle: l10n.onbProSub,
        isPremiumSlide: true,
      ),
    ];
  }

  @override
  void initState() {
    super.initState();
    Analytics.onboardingStarted();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _next() {
    HapticFeedback.lightImpact();
    if (_page < _pageCount - 1) {
      _ctrl.nextPage(
        duration: 400.ms,
        curve: Curves.easeOutCubic,
      );
    } else {
      _finish();
    }
  }

  void _finish({bool showPaywall = false}) async {
    HapticFeedback.mediumImpact();
    Analytics.onboardingCompleted();
    await markOnboardingComplete();
    ref.invalidate(onboardingCompleteProvider);
    if (mounted) {
      if (context.canPop()) {
        context.pop();
      } else {
        context.go('/portfolio');
      }
      if (showPaywall) {
        context.push('/premium');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pages = _pages(context);
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: AppTheme.surfaceGradient,
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Skip button
              Align(
                alignment: Alignment.topRight,
                child: GestureDetector(
                  onTap: () { Analytics.onboardingSkipped(atSlide: _page); _finish(); },
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 20, 8),
                    child: Text(
                      l10n.onbBtnSkip,
                      style: AppTheme.bodySmall.copyWith(
                        color: AppTheme.textDisabled,
                      ),
                    ),
                  ),
                ),
              ),

              // Pages
              Expanded(
                child: PageView.builder(
                  controller: _ctrl,
                  onPageChanged: (i) {
                    setState(() => _page = i);
                    Analytics.onboardingSlide(slide: i);
                  },
                  itemCount: pages.length,
                  itemBuilder: (_, i) => _OnboardingPage(data: pages[i]),
                ),
              ),

              // Dots
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  pages.length,
                  (i) => AnimatedContainer(
                    duration: 250.ms,
                    curve: Curves.easeOutCubic,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: i == _page ? 28 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      gradient: i == _page ? AppTheme.primaryGradient : null,
                      color: i != _page
                          ? AppTheme.textDisabled.withValues(alpha: 0.3)
                          : null,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: AppTheme.s32),

              // Button
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppTheme.s32),
                child: pages[_page].isPremiumSlide
                    ? Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          GradientButton(
                            label: l10n.onbBtnTryPro,
                            gradient: AppTheme.primaryGradient,
                            onPressed: () => _finish(showPaywall: true),
                          ),
                          const SizedBox(height: 10),
                          GestureDetector(
                            onTap: _finish,
                            child: Text(
                              l10n.onbBtnMaybeLater,
                              style: AppTheme.bodySmall.copyWith(
                                color: AppTheme.textDisabled,
                              ),
                            ),
                          ),
                        ],
                      )
                    : GradientButton(
                  label: _page == pages.length - 2
                      ? l10n.onbBtnGetStarted
                      : l10n.onbBtnNext,
                  gradient: AppTheme.primaryGradient,
                  onPressed: _next,
                ),
              ),

              const SizedBox(height: AppTheme.s40),
            ],
          ),
        ),
      ),
    );
  }
}

class _PageData {
  final String? image;
  final String title;
  final String subtitle;
  final bool isPremiumSlide;

  const _PageData({
    required this.image,
    required this.title,
    required this.subtitle,
    this.isPremiumSlide = false,
  });
}

class _OnboardingPage extends StatelessWidget {
  final _PageData data;

  const _OnboardingPage({required this.data});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      children: [
        // Screenshot or premium icon — upper 60% of slide
        Expanded(
          flex: 6,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 0),
            child: data.isPremiumSlide
                ? Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 100,
                        height: 100,
                        decoration: BoxDecoration(
                          gradient: AppTheme.primaryGradient,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.workspace_premium,
                            size: 56, color: Colors.white),
                      ),
                      const SizedBox(height: 24),
                      for (final feature in [
                        l10n.onbProBullet1,
                        l10n.onbProBullet2,
                        l10n.onbProBullet3,
                        l10n.onbProBullet4,
                        l10n.onbProBullet5,
                      ])
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.check_circle,
                                  size: 16, color: AppTheme.profit),
                              const SizedBox(width: 8),
                              Text(feature,
                                  style: const TextStyle(
                                      fontSize: 14, color: AppTheme.textPrimary)),
                            ],
                          ),
                        ),
                    ],
                  )
                : ClipRRect(
                    borderRadius: BorderRadius.circular(20),
                    child: Image.asset(
                      data.image!,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => Container(
                        decoration: BoxDecoration(
                          color: AppTheme.surface,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Center(
                          child: Icon(Icons.image_outlined,
                              size: 64, color: AppTheme.textDisabled),
                        ),
                      ),
                    ),
                  ),
          ),
        ),

        // Text — lower 40%
        Expanded(
          flex: 4,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppTheme.s32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  data.title,
                  textAlign: TextAlign.center,
                  style: AppTheme.h2,
                ),
                const SizedBox(height: AppTheme.s14),
                Text(
                  data.subtitle,
                  textAlign: TextAlign.center,
                  style: AppTheme.subtitle.copyWith(height: 1.5),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
