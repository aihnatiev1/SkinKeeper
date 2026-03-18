import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../core/theme.dart';
import '../../widgets/shared_ui.dart';
import 'deals_provider.dart';

class DealsScreen extends ConsumerWidget {
  const DealsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dealsAsync = ref.watch(dealsProvider);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppTheme.surfaceGradient),
        child: CustomScrollView(
          slivers: [
            // App Bar
            SliverAppBar(
              pinned: true,
              backgroundColor: AppTheme.bg.withValues(alpha: 0.9),
              title: const Text('Best Deals'),
              actions: [
                IconButton(
                  icon: const Icon(Icons.refresh_rounded, size: 22),
                  onPressed: () {
                    HapticFeedback.mediumImpact();
                    ref.invalidate(dealsProvider);
                  },
                ),
                const SizedBox(width: 4),
              ],
            ),

            // Info banner
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: AppTheme.glass(
                    borderColor: AppTheme.profit.withValues(alpha: 0.15),
                    radius: AppTheme.r12,
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline_rounded,
                          size: 18, color: AppTheme.profit.withValues(alpha: 0.7)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Buy on external markets, sell on Steam for profit. '
                          'Prices include Steam\'s 13% fee.',
                          style: AppTheme.caption.copyWith(
                            color: AppTheme.textSecondary,
                            height: 1.4,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Content
            dealsAsync.when(
              loading: () => SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, i) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: ShimmerCard(height: 100),
                    ),
                    childCount: 6,
                  ),
                ),
              ),
              error: (err, _) => SliverFillRemaining(
                hasScrollBody: false,
                child: _ErrorView(
                  message: err.toString(),
                  onRetry: () => ref.invalidate(dealsProvider),
                ),
              ),
              data: (deals) {
                if (deals.isEmpty) {
                  return SliverFillRemaining(
                    hasScrollBody: false,
                    child: EmptyState(
                      icon: Icons.compare_arrows_rounded,
                      title: 'No deals found',
                      subtitle: 'No profitable arbitrage opportunities right now.\nCheck back later!',
                    ),
                  );
                }

                return SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        final deal = deals[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _DealCard(deal: deal)
                              .animate()
                              .fadeIn(
                                duration: 300.ms,
                                delay: Duration(milliseconds: (50 * index).clamp(0, 300)),
                              )
                              .slideY(
                                begin: 0.05,
                                duration: 300.ms,
                                delay: Duration(milliseconds: (50 * index).clamp(0, 300)),
                                curve: Curves.easeOutCubic,
                              ),
                        );
                      },
                      childCount: deals.length,
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _DealCard extends StatelessWidget {
  final Deal deal;
  const _DealCard({required this.deal});

  Color _sourceColor(String source) => switch (source) {
        'skinport' => AppTheme.skinportGreen,
        'csfloat' => AppTheme.csfloatOrange,
        'dmarket' => AppTheme.dmarketPurple,
        _ => AppTheme.textSecondary,
      };

  String _sourceLabel(String source) => switch (source) {
        'skinport' => 'Skinport',
        'csfloat' => 'CSFloat',
        'dmarket' => 'DMarket',
        _ => source,
      };

  @override
  Widget build(BuildContext context) {
    final srcColor = _sourceColor(deal.buySource);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: AppTheme.glass(radius: AppTheme.r12),
      child: Row(
        children: [
          // Item icon
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(AppTheme.r8),
            ),
            child: deal.imageUrl != null
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(AppTheme.r8),
                    child: CachedNetworkImage(
                      imageUrl: deal.imageUrl!,
                      width: 52,
                      height: 52,
                      fit: BoxFit.contain,
                      errorWidget: (_, e, s) => const Icon(
                        Icons.image_not_supported_outlined,
                        size: 20,
                        color: AppTheme.textDisabled,
                      ),
                    ),
                  )
                : const Icon(
                    Icons.image_not_supported_outlined,
                    size: 20,
                    color: AppTheme.textDisabled,
                  ),
          ),
          const SizedBox(width: 12),

          // Item info + prices
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Item name
                Text(
                  deal.displayName,
                  style: AppTheme.body.copyWith(fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (deal.wear != null || deal.weaponName != deal.marketHashName)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      deal.wear != null
                          ? '${deal.weaponName} \u2022 ${deal.wear}'
                          : deal.weaponName,
                      style: AppTheme.caption,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),

                const SizedBox(height: 8),

                // Price flow: Buy -> Sell
                Row(
                  children: [
                    // Buy source
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: srcColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        _sourceLabel(deal.buySource),
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: srcColor,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '\$${deal.buyPrice.toStringAsFixed(2)}',
                      style: AppTheme.monoSmall,
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Icon(Icons.arrow_forward_rounded,
                          size: 12, color: AppTheme.textDisabled),
                    ),
                    // Sell on Steam
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppTheme.steamBlue.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'Steam',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.steamBlue,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '\$${deal.sellPrice.toStringAsFixed(2)}',
                      style: AppTheme.monoSmall.copyWith(
                        color: AppTheme.textPrimary,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(width: 8),

          // Profit badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppTheme.profit.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(AppTheme.r8),
              border: Border.all(
                color: AppTheme.profit.withValues(alpha: 0.2),
                width: 0.5,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '+\$${deal.profitUsd.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.profit,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  '+${deal.profitPct.toStringAsFixed(1)}%',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.profit.withValues(alpha: 0.7),
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

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline_rounded,
                size: 48, color: AppTheme.loss.withValues(alpha: 0.6)),
            const SizedBox(height: 16),
            Text('Failed to load deals',
                style: AppTheme.title, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(message,
                style: AppTheme.caption, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            GradientButton(
              label: 'Retry',
              icon: Icons.refresh_rounded,
              onPressed: onRetry,
              expanded: false,
            ),
          ],
        ),
      ),
    );
  }
}
