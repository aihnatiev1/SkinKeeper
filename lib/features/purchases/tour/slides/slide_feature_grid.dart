import 'package:flutter/material.dart';

import '../../../../core/theme.dart';
import 'slide_widgets.dart';

/// Slide 4 — feature grid + Done.
///
/// 2x2 tile grid covering the four PRO pillars. Tapping a tile closes the
/// tour and navigates to the relevant screen via [onTilePressed]. Done
/// closes the tour without navigation. Both paths mark the tour completed
/// (handled by [TourScreen]).
class SlideFeatureGrid extends StatelessWidget {
  const SlideFeatureGrid({
    super.key,
    required this.onDone,
    required this.onTilePressed,
  });

  final VoidCallback onDone;

  /// Called with one of: `auto_sell`, `smart_alerts`, `per_account_pl`,
  /// `export_history`. The screen resolver lives in [TourScreen].
  final void Function(String tileId) onTilePressed;

  static const _tiles = <_FeatureTile>[
    _FeatureTile(
      id: 'auto_sell',
      icon: Icons.bolt_rounded,
      title: 'Auto-sell',
      body: 'Set rules, sell automatically',
    ),
    _FeatureTile(
      id: 'smart_alerts',
      icon: Icons.notifications_active_rounded,
      title: 'Smart alerts',
      body: 'Push when price moves',
    ),
    _FeatureTile(
      id: 'per_account_pl',
      icon: Icons.bar_chart_rounded,
      title: 'Per-account P&L',
      body: 'Profit/loss by account',
    ),
    _FeatureTile(
      id: 'export_history',
      icon: Icons.file_download_rounded,
      title: 'Export & history',
      body: 'CSV export, full trade history',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 4),
            const Text(
              "You're all set.",
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: AppTheme.textPrimary,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Jump straight into a feature, or hit Done to start exploring.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 24),
            Expanded(
              child: GridView.count(
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.0,
                children: [
                  for (final t in _tiles)
                    _GridTileCard(
                      tile: t,
                      onTap: () => onTilePressed(t.id),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            TourPrimaryButton(label: 'Done', onTap: onDone),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _FeatureTile {
  const _FeatureTile({
    required this.id,
    required this.icon,
    required this.title,
    required this.body,
  });

  final String id;
  final IconData icon;
  final String title;
  final String body;
}

class _GridTileCard extends StatelessWidget {
  const _GridTileCard({required this.tile, required this.onTap});

  final _FeatureTile tile;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTheme.card,
          borderRadius: BorderRadius.circular(AppTheme.r16),
          border: Border.all(
            color: AppTheme.warning.withValues(alpha: 0.3),
            width: 1,
          ),
          boxShadow: [
            BoxShadow(
              color: AppTheme.warning.withValues(alpha: 0.05),
              blurRadius: 12,
              spreadRadius: -4,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppTheme.warning, AppTheme.warningLight],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(AppTheme.r10),
              ),
              child: Icon(tile.icon, color: Colors.white, size: 20),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tile.title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textPrimary,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  tile.body,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppTheme.textSecondary,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
