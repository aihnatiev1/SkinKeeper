import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import '../core/theme.dart';

class PremiumGate extends StatelessWidget {
  final Widget child;
  final String featureName;
  final bool isPremium;

  const PremiumGate({
    super.key,
    required this.child,
    required this.featureName,
    required this.isPremium,
  });

  @override
  Widget build(BuildContext context) {
    if (isPremium) return child;

    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 280),
      child: Stack(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.r16),
            child: ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
              child: IgnorePointer(child: child),
            ),
          ),
          Positioned.fill(
          child: Container(
            decoration: BoxDecoration(
              color: AppTheme.bg.withValues(alpha: 0.7),
              borderRadius: BorderRadius.circular(AppTheme.r16),
            ),
            child: Center(
              child: Container(
                margin: const EdgeInsets.all(AppTheme.s16),
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.s24,
                  vertical: AppTheme.s16,
                ),
                decoration: AppTheme.glassElevated(glowColor: AppTheme.primary),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Animated lock icon
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        gradient: AppTheme.primaryGradient,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: AppTheme.primary.withValues(alpha: 0.3),
                            blurRadius: 16,
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.workspace_premium_rounded,
                        size: 24,
                        color: Colors.white,
                      ),
                    )
                        .animate(onPlay: (c) => c.repeat(reverse: true))
                        .scale(
                          begin: const Offset(1, 1),
                          end: const Offset(1.05, 1.05),
                          duration: 2000.ms,
                          curve: Curves.easeInOut,
                        ),
                    const SizedBox(height: AppTheme.s16),
                    const Text(
                      'PRO Feature',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: AppTheme.s6),
                    Text(
                      featureName,
                      textAlign: TextAlign.center,
                      style: AppTheme.bodySmall,
                    ),
                    const SizedBox(height: AppTheme.s20),
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.mediumImpact();
                        context.push('/premium');
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppTheme.s24,
                          vertical: AppTheme.s10,
                        ),
                        decoration: BoxDecoration(
                          gradient: AppTheme.primaryGradient,
                          borderRadius: BorderRadius.circular(AppTheme.r24),
                          boxShadow: [
                            BoxShadow(
                              color: AppTheme.primary.withValues(alpha: 0.4),
                              blurRadius: 12,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: const Text(
                          'Unlock PRO',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        ],
      ),
    );
  }
}
