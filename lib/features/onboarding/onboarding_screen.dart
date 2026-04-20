import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/analytics_service.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
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
  final _ctrl = PageController();
  int _page = 0;

  static const _pages = [
    _PageData(
      image: 'assets/onboarding/dashboard.png',
      title: 'Portfolio & P/L Dashboard',
      subtitle: 'Track your total value and profit across all your skins in real time.',
    ),
    _PageData(
      image: 'assets/onboarding/inventory.png',
      title: 'Full Inventory Control',
      subtitle: 'Float values, stickers, charms. Sell directly or send trade offers.',
    ),
    _PageData(
      image: 'assets/onboarding/trades.png',
      title: 'Easy Trade Offers',
      subtitle: 'Send and accept trades without leaving the app. No Steam browser needed.',
    ),
    _PageData(
      image: 'assets/onboarding/multi_account.png',
      title: 'Multiple Steam Accounts',
      subtitle: 'Switch between accounts instantly. All inventory in one place.',
    ),
    _PageData(
      image: null, // premium slide uses icon instead
      title: 'Unlock PRO',
      subtitle: 'Multi-source prices, profit tracking, bulk sell, unlimited accounts.\nTry free for 7 days.',
      isPremiumSlide: true,
    ),
  ];

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
    if (_page < _pages.length - 1) {
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
                      'Skip',
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
                  itemCount: _pages.length,
                  itemBuilder: (_, i) => _OnboardingPage(data: _pages[i]),
                ),
              ),

              // Dots
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  _pages.length,
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
                child: _pages[_page].isPremiumSlide
                    ? Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          GradientButton(
                            label: 'Try PRO Free for 7 Days',
                            gradient: AppTheme.primaryGradient,
                            onPressed: () => _finish(showPaywall: true),
                          ),
                          const SizedBox(height: 10),
                          GestureDetector(
                            onTap: _finish,
                            child: Text(
                              'Maybe Later',
                              style: AppTheme.bodySmall.copyWith(
                                color: AppTheme.textDisabled,
                              ),
                            ),
                          ),
                        ],
                      )
                    : GradientButton(
                  label: _page == _pages.length - 2 ? 'Get Started' : 'Next',
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
                        'Skinport, CSFloat, DMarket prices',
                        'Portfolio profit & loss',
                        'Bulk sell to Steam Market',
                        'Unlimited Steam accounts',
                        'CSV/Excel export',
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
