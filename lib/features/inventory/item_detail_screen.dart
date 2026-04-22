import 'dart:developer' as dev;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:go_router/go_router.dart';

import '../../core/analytics_service.dart';
import '../../core/api_client.dart';
import '../../core/export_service.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../models/inventory_item.dart';
import '../../widgets/shared_ui.dart';
import 'widgets/best_buy_sell_summary.dart';
import 'widgets/price_comparison_table.dart' show PriceComparisonTable;
import 'widgets/marketplace_links.dart';
import 'widgets/pl_section.dart';
import 'widgets/price_history_chart.dart';
import 'widgets/sell_actions.dart';
import 'widgets/steam_market_depth.dart';
import 'widgets/sticker_display.dart';
import 'widgets/sticker_value_row.dart';
import 'widgets/wear_bar.dart';

class ItemDetailScreen extends ConsumerStatefulWidget {
  final InventoryItem item;

  const ItemDetailScreen({super.key, required this.item});

  @override
  ConsumerState<ItemDetailScreen> createState() => _ItemDetailScreenState();
}

class _ItemDetailScreenState extends ConsumerState<ItemDetailScreen> {
  List<PricePoint>? _history;
  bool _historyLoading = true;
  String? _historyError;

  late InventoryItem _item;
  ChartPeriod _period = ChartPeriod.month;

  @override
  void initState() {
    super.initState();
    _item = widget.item;
    Analytics.itemDetailViewed(
      itemName: widget.item.marketHashName,
      price: widget.item.steamPrice ?? widget.item.bestPrice ?? 0,
    );
    _fetchHistory();
  }


  Future<void> _fetchHistory() async {
    try {
      final api = ref.read(apiClientProvider);
      final encoded = Uri.encodeComponent(widget.item.marketHashName);
      final response =
          await api.get('/prices/$encoded/history', queryParameters: {
        'days': _period.days,
      });
      final data = response.data as Map<String, dynamic>;
      final historyList = data['history'] as List<dynamic>;
      if (mounted) {
        setState(() {
          _history = historyList
              .map((e) => PricePoint.fromJson(e as Map<String, dynamic>))
              .toList();
          _historyLoading = false;
        });
      }
    } catch (e) {
      dev.log('Failed to load price history: $e', name: 'ItemDetail');
      if (mounted) {
        setState(() {
          _historyError = e.toString();
          _historyLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    final currency = ref.watch(currencyProvider);
    final rarityColor = item.rarityColor != null
        ? Color(int.parse('FF${item.rarityColor!.replaceAll('#', '')}', radix: 16))
        : AppTheme.textDisabled;

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 16, 8, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 20, color: AppTheme.textSecondary),
                    onPressed: () => context.pop(),
                  ),
                  Expanded(
                    child: Text(
                      item.displayName,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -0.3,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.notifications_active_outlined,
                      size: 20,
                      color: AppTheme.textSecondary,
                    ),
                    tooltip: 'Set Alert',
                    onPressed: () {
                      HapticFeedback.lightImpact();
                      context.push('/alerts/create', extra: item.marketHashName);
                    },
                  ),
                ],
              ),
            ),
            Expanded(child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppTheme.s16,
          AppTheme.s8,
          AppTheme.s16,
          AppTheme.s32 + 80,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Hero image ──
            Center(
              child: Hero(
                tag: 'item_image_${item.assetId}',
                child: SizedBox(
                  width: 220,
                  height: 220,
                  child: item.fullIconUrl.isNotEmpty
                            ? CachedNetworkImage(
                                imageUrl: item.fullIconUrl,
                                fit: BoxFit.contain,
                                placeholder: (_, _) => const Center(
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: AppTheme.textDisabled,
                                  ),
                                ),
                                errorWidget: (_, _, _) => const Icon(
                                  Icons.image_not_supported_rounded,
                                  size: 48,
                                  color: AppTheme.textDisabled,
                                ),
                              )
                            : const Icon(
                                Icons.image_not_supported_rounded,
                                size: 48,
                                color: AppTheme.textDisabled,
                              ),
                ),
              ),
            )
                .animate()
                .fadeIn(duration: 500.ms)
                .scale(
                  begin: const Offset(0.95, 0.95),
                  duration: 500.ms,
                  curve: Curves.easeOutCubic,
                ),

            const SizedBox(height: AppTheme.s20),

            // ── Item name ──
            Text(
              item.displayName,
              textAlign: TextAlign.center,
              style: AppTheme.h2,
            )
                .animate()
                .fadeIn(duration: 400.ms, delay: 100.ms),

            // Doppler badge
            if (item.isDoppler && item.dopplerPhase != null) ...[
              const SizedBox(height: AppTheme.s8),
              Center(
                child: AppBadge(
                  text: item.dopplerPhase!,
                  color: item.dopplerColor ?? AppTheme.textDisabled,
                ),
              ),
            ],

            const SizedBox(height: AppTheme.s4),
            Text(
              item.weaponName,
              textAlign: TextAlign.center,
              style: AppTheme.subtitle,
            ),

            // ── Collection badge ──
            if (item.collection != null) ...[
              const SizedBox(height: AppTheme.s8),
              Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.textDisabled.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(AppTheme.r6),
                    border: Border.all(
                      color: AppTheme.textDisabled.withValues(alpha: 0.15),
                    ),
                  ),
                  child: Text(
                    item.collection!.name,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textSecondary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 150.ms),
            ],

            const SizedBox(height: AppTheme.s12),

            // ── Wear badge + paint seed ──
            if (item.wear != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppTheme.s12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    AppBadge(
                      text: item.wear!,
                      color: rarityColor,
                    ),
                    if (item.floatValue != null) ...[
                      const SizedBox(width: AppTheme.s10),
                      AppBadge(
                        text: item.floatValue!.toStringAsFixed(7),
                        color: AppTheme.textSecondary,
                      ),
                    ],
                    if (item.paintSeed != null) ...[
                      const SizedBox(width: AppTheme.s10),
                      AppBadge(
                        text: 'Seed ${item.paintSeed}',
                        color: AppTheme.textMuted,
                      ),
                    ],
                  ],
                ),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 200.ms),

            // ── Wear bar ──
            if (item.floatValue != null)
              GlassCard(
                padding: const EdgeInsets.all(AppTheme.s14),
                margin: const EdgeInsets.only(bottom: AppTheme.s12),
                child: WearBar(
                  floatValue: item.floatValue!,
                  minFloat: item.minFloat,
                  maxFloat: item.maxFloat,
                ),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 250.ms),

            // ── Stickers & Charms ──
            if (item.stickers.isNotEmpty || item.charms.isNotEmpty) ...[
              GlassCard(
                padding: const EdgeInsets.all(AppTheme.s14),
                margin: const EdgeInsets.only(bottom: AppTheme.s12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    StickersAndCharmsDisplay(
                      stickers: item.stickers,
                      charms: item.charms,
                    ),
                    if (item.stickerValue != null && item.stickerValue! > 0) ...[
                      const SizedBox(height: AppTheme.s10),
                      StickerValueRow(
                        stickerValue: item.stickerValue!,
                        bestPrice: item.bestPrice,
                        currency: currency,
                      ),
                    ],
                  ],
                ),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 300.ms),
            ],

            // ── Steam price ──
            if (item.steamPrice != null)
              GlassCard(
                elevated: true,
                padding: const EdgeInsets.symmetric(vertical: AppTheme.s16),
                child: Column(
                  children: [
                    Text('STEAM PRICE', style: AppTheme.label),
                    const SizedBox(height: AppTheme.s6),
                    AnimatedNumber(
                      value: item.steamPrice!,
                      style: AppTheme.priceLarge,
                      formatter: (v) => currency.format(v),
                    ),
                  ],
                ),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 200.ms),

            // ── Steam Market Depth ──
            if (item.steamDepth != null && item.steamDepth!.volume24h > 0)
              Padding(
                padding: const EdgeInsets.only(top: AppTheme.s8),
                child: SteamMarketDepth(depth: item.steamDepth!, currency: currency),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 225.ms),

            // ── Best Buy / Best Sell summary ──
            BestBuySellSummary(item: item, currency: currency)
                .animate()
                .fadeIn(duration: 400.ms, delay: 250.ms),

            // ── Buff Bid/Ask Spread ──
            if (item.prices.containsKey('buff') && item.prices.containsKey('buff_bid'))
              Padding(
                padding: const EdgeInsets.only(top: AppTheme.s8),
                child: BuffSpreadWidget(
                  ask: item.prices['buff']!,
                  bid: item.prices['buff_bid']!,
                  currency: currency,
                ),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 275.ms),

            const SizedBox(height: AppTheme.s16),

            // ── Sell actions ──
            SellActions(item: item)
                .animate()
                .fadeIn(duration: 400.ms, delay: 300.ms),

            const SizedBox(height: AppTheme.s16),

            // ── Cross-market prices ──
            PriceComparisonTable(prices: item.prices, currency: currency)
                .animate()
                .fadeIn(duration: 400.ms, delay: 350.ms),

            // ── Marketplace links (with prices) ──
            if (item.marketplaceLinks != null && item.marketplaceLinks!.isNotEmpty) ...[
              const SizedBox(height: AppTheme.s12),
              MarketplaceLinks(
                links: item.marketplaceLinks!,
                prices: item.prices,
                currency: currency,
                originName: item.crates.isNotEmpty ? item.crates.first.name : item.collection?.name,
                originIcon: item.crates.isNotEmpty ? Icons.inventory_2_rounded : (item.collection != null ? Icons.collections_bookmark_rounded : null),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 375.ms),
            ],

            const SizedBox(height: AppTheme.s16),

            // ── P/L section ──
            PLSection(
              marketHashName: item.marketHashName,
              iconUrl: item.iconUrl,
            )
                .animate()
                .fadeIn(duration: 400.ms, delay: 425.ms),

            const SizedBox(height: AppTheme.s16),

            // ── Price history chart ──
            if (_historyLoading)
              const ShimmerCard(height: 240)
            else if (_historyError != null)
              GlassCard(
                child: SizedBox(
                  height: 200,
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.error_outline_rounded,
                            size: 32, color: AppTheme.loss),
                        const SizedBox(height: AppTheme.s8),
                        Text(
                          'Failed to load price history',
                          style: AppTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
              )
            else
              Column(
                children: [
                  PriceHistoryChart(
                    history: _history ?? [],
                    period: _period,
                    currency: currency,
                    onPeriodChanged: (p) {
                      setState(() {
                        _period = p;
                        _historyLoading = true;
                        _historyError = null;
                      });
                      _fetchHistory();
                    },
                  ),
                  const SizedBox(height: AppTheme.s8),
                  Align(
                    alignment: Alignment.centerRight,
                    child: GestureDetector(
                      onTap: () => exportPriceHistory(
                        context,
                        ref,
                        days: _period.days,
                      ),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppTheme.primary.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(AppTheme.r8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.file_download_outlined,
                                size: 14, color: AppTheme.primary),
                            const SizedBox(width: 4),
                            Text(
                              'Export CSV',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.primary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              )
                  .animate()
                  .fadeIn(duration: 500.ms, delay: 450.ms),

          ],
        ),
      )),
          ],
        ),
      ),
    );
  }
}

// ── P/L Section ──────────────────────────────────────────────────







