import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme.dart';

class PaywallHeader extends StatelessWidget {
  final VoidCallback onClose;

  const PaywallHeader({super.key, required this.onClose});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded,
                size: 20, color: AppTheme.textSecondary),
            onPressed: onClose,
          ),
          const Expanded(
            child: Text(
              'SKINKEEPER PRO',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppTheme.textDisabled,
                letterSpacing: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class PaywallHero extends StatelessWidget {
  const PaywallHero({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Icon(Icons.workspace_premium, size: 56, color: AppTheme.warning)
            .animate()
            .fadeIn(duration: 400.ms)
            .scale(begin: const Offset(0.8, 0.8), end: const Offset(1, 1)),
        const SizedBox(height: 16),
        const Text(
          'Unlock Full Power',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ).animate().fadeIn(duration: 400.ms, delay: 100.ms),
        const SizedBox(height: 8),
        const Text(
          'Get detailed analytics and premium features',
          style: TextStyle(
            fontSize: 14,
            color: AppTheme.textSecondary,
          ),
        ).animate().fadeIn(duration: 400.ms, delay: 150.ms),
      ],
    );
  }
}

class PaywallActiveBadge extends StatelessWidget {
  const PaywallActiveBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(AppTheme.r16),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_circle, color: Colors.white, size: 20),
          SizedBox(width: 8),
          Text(
            'PRO Active',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.9, 0.9), end: const Offset(1, 1));
  }
}

class PaywallFeatureList extends StatelessWidget {
  const PaywallFeatureList({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: AppTheme.glass(),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              children: [
                const Expanded(child: SizedBox.shrink()),
                SizedBox(
                  width: 44,
                  child: Center(
                    child: Text(
                      'Free',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ),
                ),
                SizedBox(
                  width: 44,
                  child: Center(
                    child: Text(
                      'PRO',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.warning,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const _FeatureRow(feature: 'Steam price tracking', free: true, pro: true),
          const _FeatureRow(feature: 'Inventory management', free: true, pro: true),
          const _FeatureRow(feature: 'Trade history sync', free: true, pro: true),
          const _FeatureRow(feature: 'Up to 5 price alerts', free: true, pro: true),
          const _FeatureRow(feature: 'Up to 2 Steam accounts', free: true, pro: true),
          const Divider(height: 24),
          const _FeatureRow(feature: 'Multi-source pricing', free: false, pro: true),
          const _FeatureRow(feature: 'Portfolio profit & charts', free: false, pro: true),
          const _FeatureRow(feature: 'Per-item profit breakdown', free: false, pro: true),
          const _FeatureRow(feature: 'Up to 20 price alerts', free: false, pro: true),
          const _FeatureRow(feature: 'Bulk sell items', free: false, pro: true),
          const _FeatureRow(feature: 'Unlimited accounts', free: false, pro: true),
          const _FeatureRow(feature: 'CSV/Excel export', free: false, pro: true),
        ],
      ),
    );
  }
}

class _FeatureRow extends StatelessWidget {
  final String feature;
  final bool free;
  final bool pro;

  const _FeatureRow({required this.feature, required this.free, required this.pro});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              feature,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
          SizedBox(
            width: 44,
            child: Center(
              child: Icon(
                free ? Icons.check_circle : Icons.remove_circle_outline,
                size: 18,
                color: free ? AppTheme.profit : AppTheme.textDisabled,
              ),
            ),
          ),
          SizedBox(
            width: 44,
            child: Center(
              child: Icon(
                pro ? Icons.check_circle : Icons.remove_circle_outline,
                size: 18,
                color: AppTheme.warning,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class PaywallLegalFooter extends StatelessWidget {
  const PaywallLegalFooter({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Text(
          'Free trial available for yearly plan. No charge during trial period. '
          'Cancel anytime before trial ends. After trial, \$34.99/year auto-renews '
          'unless cancelled at least 24 hours before the end of the current period. '
          'Payment will be charged to your Apple ID account. '
          'Manage subscriptions in Settings > Apple ID > Subscriptions.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 10,
            color: AppTheme.textMuted,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            GestureDetector(
              onTap: () => launchUrl(Uri.parse('https://api.skinkeeper.store/legal/privacy'),
                  mode: LaunchMode.externalApplication),
              child: const Text('Privacy Policy',
                  style: TextStyle(fontSize: 10, color: AppTheme.textDisabled, decoration: TextDecoration.underline)),
            ),
            const Text('  •  ', style: TextStyle(fontSize: 10, color: AppTheme.textDisabled)),
            GestureDetector(
              onTap: () => launchUrl(Uri.parse('https://api.skinkeeper.store/legal/terms'),
                  mode: LaunchMode.externalApplication),
              child: const Text('Terms of Service',
                  style: TextStyle(fontSize: 10, color: AppTheme.textDisabled, decoration: TextDecoration.underline)),
            ),
          ],
        ),
      ],
    );
  }
}
