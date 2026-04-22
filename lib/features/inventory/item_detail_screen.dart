import 'dart:developer' as dev;

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
import 'item_detail_screen_parts.dart';
import 'widgets/best_buy_sell_summary.dart';
import 'widgets/price_comparison_table.dart' show PriceComparisonTable;
import 'widgets/marketplace_links.dart';
import 'widgets/pl_section.dart';
import 'widgets/price_history_chart.dart';
import 'widgets/sell_actions.dart';
import 'widgets/steam_market_depth.dart';

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
            ItemDetailHeaderBar(
              title: item.displayName,
              onBack: () => context.pop(),
              onAlert: () {
                HapticFeedback.lightImpact();
                context.push('/alerts/create', extra: item.marketHashName);
              },
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
            ItemDetailHeroImage(
              imageUrl: item.fullIconUrl,
              assetId: item.assetId,
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
            ItemDetailTitleBlock(item: item)
                .animate()
                .fadeIn(duration: 400.ms, delay: 100.ms),

            const SizedBox(height: AppTheme.s12),

            // ── Wear badge + paint seed ──
            if (item.wear != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppTheme.s12),
                child: ItemDetailWearBadgeRow(
                  item: item,
                  rarityColor: rarityColor,
                ),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 200.ms),

            // ── Wear bar ──
            if (item.floatValue != null)
              ItemDetailWearBarCard(item: item)
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 250.ms),

            // ── Stickers & Charms ──
            if (item.stickers.isNotEmpty || item.charms.isNotEmpty) ...[
              ItemDetailStickersSection(item: item, currency: currency)
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 300.ms),
            ],

            // ── Steam price ──
            if (item.steamPrice != null)
              ItemDetailSteamPriceCard(
                steamPrice: item.steamPrice!,
                currency: currency,
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
              const ItemDetailChartErrorCard()
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
                  ItemDetailExportCsvButton(
                    onTap: () => exportPriceHistory(
                      context,
                      ref,
                      days: _period.days,
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
