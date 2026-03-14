import 'package:flutter/material.dart';
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
    return _LockedOverlay(featureName: featureName);
  }
}

class _LockedOverlay extends StatelessWidget {
  final String featureName;
  const _LockedOverlay({required this.featureName});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(AppTheme.r16),
        border: Border.all(
          color: AppTheme.primary.withValues(alpha: 0.25),
          width: 1,
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: AppTheme.primary.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.lock_rounded,
              color: AppTheme.primary,
              size: 26,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            featureName,
            style: AppTheme.title,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'Available with SkinKeeper PRO',
            style: AppTheme.caption.copyWith(color: AppTheme.textMuted),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          GestureDetector(
            onTap: () => context.push('/premium'),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
                borderRadius: BorderRadius.circular(AppTheme.r12),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.primary.withValues(alpha: 0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: const Text(
                'Upgrade to PRO',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
