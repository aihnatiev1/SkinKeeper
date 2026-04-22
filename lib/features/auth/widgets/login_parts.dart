import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme.dart';

class LoginFeaturePills extends StatelessWidget {
  const LoginFeaturePills({super.key});

  @override
  Widget build(BuildContext context) {
    const features = [
      ('Live prices', Icons.trending_up_rounded, Color(0xFF10B981)),
      ('Portfolio P/L', Icons.pie_chart_rounded, Color(0xFF6366F1)),
      ('Trade & sell', Icons.swap_horiz_rounded, Color(0xFFF59E0B)),
      ('Price alerts', Icons.notifications_active_rounded, Color(0xFFEF4444)),
      ('Bulk sell', Icons.sell_rounded, Color(0xFF8B5CF6)),
      ('Multi-account', Icons.people_rounded, Color(0xFF06B6D4)),
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          for (var i = 0; i < features.length; i += 3)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  for (var j = i; j < i + 3 && j < features.length; j++) ...[
                    if (j > i) const SizedBox(width: 6),
                    Expanded(
                      child: _LoginFeatureChip(
                        label: features[j].$1,
                        icon: features[j].$2,
                        color: features[j].$3,
                        index: j,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          const SizedBox(height: 20),
          Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 6,
            runSpacing: 6,
            children: [
              const Text('Steam', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.textMuted)),
              const _LoginDot(),
              const Text('Skinport', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.textMuted)),
              const _LoginDot(),
              const Text('CSFloat', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.textMuted)),
              const _LoginDot(),
              const Text('DMarket', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.textMuted)),
            ],
          ).animate().fadeIn(duration: 400.ms, delay: 800.ms),
          const SizedBox(height: 12),
          Text(
            'Free to use \u2022 No ads',
            style: TextStyle(fontSize: 11, color: AppTheme.textDisabled),
          ).animate().fadeIn(duration: 400.ms, delay: 900.ms),
          const SizedBox(height: 16),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 6,
            children: const [
              _LoginPlatformBadge(icon: Icons.language_rounded, label: 'Web', url: 'https://app.skinkeeper.store'),
              _LoginPlatformBadge(icon: Icons.desktop_windows_rounded, label: 'Desktop', url: 'https://skinkeeper.store/download'),
              _LoginPlatformBadge(icon: Icons.extension_rounded, label: 'Extension', url: 'https://chromewebstore.google.com/detail/skinkeeper-%E2%80%94-cs2-inventor/lbihgifhfhpeahokiegleeknffkihbpd'),
            ],
          ).animate().fadeIn(duration: 400.ms, delay: 1000.ms),
        ],
      ),
    );
  }
}

class _LoginPlatformBadge extends StatelessWidget {
  final IconData icon;
  final String label;
  final String url;

  const _LoginPlatformBadge({
    required this.icon,
    required this.label,
    required this.url,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: AppTheme.primary.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppTheme.primary.withValues(alpha: 0.15)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 12, color: AppTheme.primaryLight),
            const SizedBox(width: 5),
            Text(
              label,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.primaryLight),
            ),
          ],
        ),
      ),
    );
  }
}

class _LoginDot extends StatelessWidget {
  const _LoginDot();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Text('\u2022', style: TextStyle(fontSize: 8, color: AppTheme.textDisabled)),
    );
  }
}

class _LoginFeatureChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final int index;

  const _LoginFeatureChip({
    required this.label,
    required this.icon,
    required this.color,
    required this.index,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.12)),
      ),
      child: Column(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(height: 4),
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms, delay: Duration(milliseconds: 400 + index * 60))
        .scale(begin: const Offset(0.9, 0.9), end: const Offset(1, 1));
  }
}

class LoginPollingStatus extends StatelessWidget {
  final VoidCallback onCheckNow;

  const LoginPollingStatus({super.key, required this.onCheckNow});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppTheme.textMuted,
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'Waiting for Steam login...',
                style: TextStyle(
                  fontSize: 13,
                  color: AppTheme.textMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: onCheckNow,
            child: Text(
              'Completed login? Tap to continue',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: AppTheme.primary.withValues(alpha: 0.8),
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms);
  }
}

class LoginTimeoutStatus extends StatelessWidget {
  final VoidCallback onRetry;

  const LoginTimeoutStatus({super.key, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: GestureDetector(
        onTap: onRetry,
        child: const Text(
          'Login timed out. Tap to try again.',
          style: TextStyle(
            fontSize: 13,
            color: AppTheme.textMuted,
          ),
        ),
      ),
    ).animate().fadeIn(duration: 300.ms);
  }
}

class LoginSecurityNote extends StatelessWidget {
  const LoginSecurityNote({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text(
        'You sign in directly to Steam. We never see your password.',
        style: TextStyle(
          fontSize: 12,
          color: Colors.white.withValues(alpha: 0.3),
        ),
      ),
    ).animate().fadeIn(duration: 500.ms, delay: 800.ms);
  }
}
