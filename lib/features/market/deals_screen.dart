import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/analytics_service.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../core/widgets/screen_state_builder.dart';
import '../inventory/widgets/price_comparison_table.dart' show sourceColor;
import '../../widgets/shared_ui.dart';
import 'deals_provider.dart';

class DealsScreen extends ConsumerStatefulWidget {
  const DealsScreen({super.key});

  @override
  ConsumerState<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends ConsumerState<DealsScreen> {
  @override
  void initState() {
    super.initState();
    Analytics.screen('deals');
  }

  @override
  Widget build(BuildContext context) {
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
            SliverScreenStateBuilder<List<Deal>>(
              state: dealsAsync,
              isEmpty: (deals) => deals.isEmpty,
              onRetry: () => ref.invalidate(dealsProvider),
              emptyIcon: Icons.compare_arrows_rounded,
              emptyTitle: 'No deals found',
              emptySubtitle:
                  'No profitable arbitrage opportunities right now.\nCheck back later!',
              loadingSliver: SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, i) => const Padding(
                      padding: EdgeInsets.only(bottom: 10),
                      child: ShimmerCard(height: 100),
                    ),
                    childCount: 6,
                  ),
                ),
              ),
              sliverBuilder: (deals) => SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final deal = deals[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _DealCard(
                                deal: deal,
                                currency: ref.watch(currencyProvider))
                            .animate()
                            .fadeIn(
                              duration: 300.ms,
                              delay: Duration(
                                  milliseconds:
                                      (50 * index).clamp(0, 300)),
                            )
                            .slideY(
                              begin: 0.05,
                              duration: 300.ms,
                              delay: Duration(
                                  milliseconds:
                                      (50 * index).clamp(0, 300)),
                              curve: Curves.easeOutCubic,
                            ),
                      );
                    },
                    childCount: deals.length,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DealCard extends StatelessWidget {
  final Deal deal;
  final CurrencyInfo currency;
  const _DealCard({required this.deal, required this.currency});

  Color _sourceColor(String source) => sourceColor(source);

  String _sourceLabel(String source) => switch (source) {
        'skinport' => 'Skinport',
        'csfloat' => 'CSFloat',
        'dmarket' => 'DMarket',
        'buff' => 'Buff163',
        'bitskins' => 'BitSkins',
        'csmoney' => 'CS.Money',
        'youpin' => 'YouPin',
        'lisskins' => 'Lisskins',
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
                      currency.format(deal.buyPrice),
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
                      currency.format(deal.sellPrice),
                      style: AppTheme.monoSmall.copyWith(
                        color: AppTheme.textPrimary,
                      ),
                    ),
                  ],
                ),
                // Buff bid alternative sell target
                if (deal.buffBidPrice != null && deal.buffBidPrice! > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(
                      children: [
                        Container(
                          width: 4, height: 4,
                          decoration: const BoxDecoration(
                            color: AppTheme.buffYellow,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'Buff bid ${currency.format(deal.buffBidPrice!)}',
                          style: TextStyle(
                            fontSize: 9,
                            color: AppTheme.buffYellow.withValues(alpha: 0.7),
                          ),
                        ),
                      ],
                    ),
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
                  currency.formatWithSign(deal.profitUsd),
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

          // Buy button
          if (deal.buyUrl != null) ...[
            const SizedBox(width: 6),
            GestureDetector(
              onTap: () => launchUrl(
                Uri.parse(deal.buyUrl!),
                mode: LaunchMode.externalApplication,
              ),
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: srcColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(AppTheme.r8),
                  border: Border.all(
                    color: srcColor.withValues(alpha: 0.3),
                    width: 0.5,
                  ),
                ),
                child: Icon(
                  Icons.open_in_new_rounded,
                  size: 16,
                  color: srcColor,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

