import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
      icon: Icons.trending_up_rounded,
      iconColor: AppTheme.accent,
      title: 'Track CS2 Skin Prices',
      subtitle:
          'Real-time prices from Steam, Skinport, CSFloat, and DMarket \u2014 all in one app.',
    ),
    _PageData(
      icon: Icons.inventory_2_rounded,
      iconColor: AppTheme.primary,
      title: 'Manage Your Inventory',
      subtitle:
          'View float values, stickers, charms. Sell items directly or send trade offers to friends.',
    ),
    _PageData(
      icon: Icons.show_chart_rounded,
      iconColor: AppTheme.profit,
      title: 'Profit & Loss Analytics',
      subtitle:
          'Track every buy and sell. See your total portfolio value and profit over time.',
    ),
    _PageData(
      icon: Icons.notifications_active_rounded,
      iconColor: AppTheme.warning,
      title: 'Price Alerts & Export',
      subtitle:
          'Get notified when prices change. Export your data to CSV. Upgrade to PRO for full power.',
    ),
  ];

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

  void _finish() async {
    HapticFeedback.mediumImpact();
    await markOnboardingComplete();
    ref.invalidate(onboardingCompleteProvider);
    if (mounted) {
      if (context.canPop()) {
        context.pop();
      } else {
        context.go('/portfolio');
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
                  onTap: _finish,
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
                  onPageChanged: (i) => setState(() => _page = i),
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
                child: GradientButton(
                  label: _page == _pages.length - 1 ? 'Get Started' : 'Next',
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
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;

  const _PageData({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
  });
}

class _OnboardingPage extends StatelessWidget {
  final _PageData data;

  const _OnboardingPage({required this.data});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppTheme.s40),
      child: Column(
        children: [
          const Spacer(flex: 3),
          // Animated icon with glow
          Stack(
            alignment: Alignment.center,
            children: [
              // Outer glow ring
              Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: data.iconColor.withValues(alpha: 0.08),
                    width: 1,
                  ),
                ),
              ),
              Container(
                width: 116,
                height: 116,
                decoration: BoxDecoration(
                  color: data.iconColor.withValues(alpha: 0.08),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: data.iconColor.withValues(alpha: 0.2),
                    width: 1,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: data.iconColor.withValues(alpha: 0.25),
                      blurRadius: 60,
                      spreadRadius: -4,
                    ),
                  ],
                ),
                child: Icon(data.icon, size: 52, color: data.iconColor),
              ),
            ],
          )
              .animate()
              .fadeIn(duration: 500.ms)
              .scale(
                begin: const Offset(0.85, 0.85),
                duration: 500.ms,
                curve: Curves.easeOutBack,
              ),

          const SizedBox(height: AppTheme.s32),

          Text(
            data.title,
            textAlign: TextAlign.center,
            style: AppTheme.h2,
          )
              .animate()
              .fadeIn(duration: 400.ms, delay: 150.ms)
              .slideY(begin: 0.15, duration: 400.ms, curve: Curves.easeOutCubic),

          const SizedBox(height: AppTheme.s14),

          Text(
            data.subtitle,
            textAlign: TextAlign.center,
            style: AppTheme.subtitle.copyWith(height: 1.5),
          )
              .animate()
              .fadeIn(duration: 400.ms, delay: 300.ms),
          const Spacer(flex: 4),
        ],
      ),
    );
  }
}
