import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme.dart';
import '../tour_provider.dart';
import 'slide_widgets.dart';

/// Slide 2 — personalized stats from `/purchases/feature-previews`.
///
/// Renders:
///  - Top item card (image + name + USD price + 7d trend chip)
///  - Inventory totals (item count, total USD value)
///  - Watchlist + active alerts row
///  - Auto-sell hook line ("X skins ready for auto-sell")
///
/// Loading: shows a skeleton placeholder. Error / timeout: degrades to a
/// generic welcome panel without personalization but never blocks the user.
class SlidePersonalized extends ConsumerWidget {
  const SlidePersonalized({super.key, required this.onContinue});

  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncPreviews = ref.watch(featurePreviewsProvider);

    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 12),
            const Text(
              'Your inventory, supercharged',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: AppTheme.textPrimary,
                letterSpacing: -0.3,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              "Here's what PRO unlocks based on your account.",
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: AppTheme.textSecondary,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 28),
            Expanded(
              child: SingleChildScrollView(
                child: asyncPreviews.when(
                  loading: _SkeletonState.new,
                  error: (_, _) => const _FallbackState(),
                  data: (data) => data == FeaturePreviewsData.empty &&
                          data.topItem == null &&
                          data.inventoryStats.totalItems == 0
                      ? const _FallbackState()
                      : _PersonalizedContent(data: data),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TourPrimaryButton(label: 'Continue', onTap: onContinue),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _PersonalizedContent extends StatelessWidget {
  const _PersonalizedContent({required this.data});
  final FeaturePreviewsData data;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (data.topItem != null) ...[
          _TopItemCard(item: data.topItem!),
          const SizedBox(height: 14),
        ],
        _InventoryStatsCard(stats: data.inventoryStats),
        const SizedBox(height: 14),
        _WatchlistRow(
          tracked: data.trackedItemsCount,
          alerts: data.alertsActive,
        ),
        const SizedBox(height: 18),
        _AutoSellHookLine(count: data.potentialAutoSellCandidates),
      ],
    );
  }
}

class _TopItemCard extends StatelessWidget {
  const _TopItemCard({required this.item});
  final TopItemPreview item;

  @override
  Widget build(BuildContext context) {
    final trend = item.trend7d;
    final isUp = trend != null && trend.startsWith('+');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(AppTheme.r16),
        border: Border.all(
          color: AppTheme.warning.withValues(alpha: 0.35),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.warning.withValues(alpha: 0.06),
            blurRadius: 16,
            spreadRadius: -4,
          ),
        ],
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.r10),
            child: SizedBox(
              width: 64,
              height: 64,
              child: item.iconUrl != null && item.iconUrl!.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: item.iconUrl!,
                      fit: BoxFit.contain,
                      placeholder: (_, _) => const ColoredBox(
                        color: AppTheme.surface,
                      ),
                      errorWidget: (_, _, _) => const ColoredBox(
                        color: AppTheme.surface,
                        child: Icon(
                          Icons.image_outlined,
                          color: AppTheme.textDisabled,
                          size: 24,
                        ),
                      ),
                    )
                  : Container(
                      color: AppTheme.surface,
                      child: const Icon(
                        Icons.image_outlined,
                        color: AppTheme.textDisabled,
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'YOUR TOP ITEM',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.warning,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  item.marketHashName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Text(
                      '\$${item.currentPriceUsd.toStringAsFixed(2)}',
                      style: AppTheme.priceLarge.copyWith(fontSize: 18),
                    ),
                    if (trend != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: (isUp ? AppTheme.profit : AppTheme.loss)
                              .withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(AppTheme.r6),
                        ),
                        child: Text(
                          trend,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color:
                                isUp ? AppTheme.profit : AppTheme.loss,
                            fontFeatures: const [
                              FontFeature.tabularFigures(),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InventoryStatsCard extends StatelessWidget {
  const _InventoryStatsCard({required this.stats});
  final InventoryStatsData stats;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: AppTheme.glass(),
      child: Row(
        children: [
          Expanded(
            child: _StatTile(
              label: 'Items',
              value: stats.totalItems.toString(),
            ),
          ),
          Container(
            width: 1,
            height: 36,
            color: AppTheme.divider,
          ),
          Expanded(
            child: _StatTile(
              label: 'Total value',
              value: '\$${_formatCompactUsd(stats.totalValueUsd)}',
              accent: true,
            ),
          ),
          Container(
            width: 1,
            height: 36,
            color: AppTheme.divider,
          ),
          Expanded(
            child: _StatTile(
              label: 'Unique',
              value: stats.uniqueItems.toString(),
            ),
          ),
        ],
      ),
    );
  }
}

String _formatCompactUsd(double v) {
  if (v >= 10000) return '${(v / 1000).toStringAsFixed(1)}k';
  return v.toStringAsFixed(2);
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.label,
    required this.value,
    this.accent = false,
  });

  final String label;
  final String value;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: accent ? 20 : 18,
            fontWeight: FontWeight.w800,
            color: accent ? AppTheme.warning : AppTheme.textPrimary,
            fontFeatures: const [FontFeature.tabularFigures()],
            height: 1.2,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.w600,
            color: AppTheme.textMuted,
            letterSpacing: 1.2,
          ),
        ),
      ],
    );
  }
}

class _WatchlistRow extends StatelessWidget {
  const _WatchlistRow({required this.tracked, required this.alerts});
  final int tracked;
  final int alerts;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: AppTheme.glass(),
      child: Row(
        children: [
          const Icon(
            Icons.notifications_active_rounded,
            size: 20,
            color: AppTheme.warningLight,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'You watch',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppTheme.textMuted,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$tracked tracked  •  $alerts active alert${alerts == 1 ? '' : 's'}',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
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

class _AutoSellHookLine extends StatelessWidget {
  const _AutoSellHookLine({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    // Even when count == 0 we still show a hook line — generic but motivating.
    final hasCandidates = count > 0;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: RichText(
        textAlign: TextAlign.center,
        text: TextSpan(
          style: const TextStyle(
            fontSize: 14,
            color: AppTheme.textSecondary,
            height: 1.5,
          ),
          children: hasCandidates
              ? [
                  const TextSpan(
                      text: 'Based on your inventory, you have '),
                  TextSpan(
                    text: '$count skin${count == 1 ? '' : 's'} ready for auto-sell.',
                    style: const TextStyle(
                      color: AppTheme.warning,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ]
              : const [
                  TextSpan(
                      text: 'Your auto-sell rules will fire the moment your '),
                  TextSpan(
                    text: 'price triggers cross.',
                    style: TextStyle(
                      color: AppTheme.warning,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
        ),
      ),
    );
  }
}

// ─── Loading / fallback states ─────────────────────────────────────

class _SkeletonState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SkeletonBox(height: 90, radius: AppTheme.r16),
        const SizedBox(height: 14),
        _SkeletonBox(height: 70, radius: AppTheme.r16),
        const SizedBox(height: 14),
        _SkeletonBox(height: 56, radius: AppTheme.r16),
      ],
    );
  }
}

class _SkeletonBox extends StatelessWidget {
  const _SkeletonBox({required this.height, required this.radius});
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: AppTheme.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

class _FallbackState extends StatelessWidget {
  const _FallbackState();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: AppTheme.glass(),
      child: Column(
        children: [
          const Icon(
            Icons.bolt_rounded,
            size: 32,
            color: AppTheme.warning,
          ),
          const SizedBox(height: 10),
          const Text(
            'Welcome aboard.',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'PRO is active. Personalized stats will appear here once your '
            'inventory finishes syncing.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              color: AppTheme.textSecondary,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}
