import 'dart:developer' as dev;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../core/export_service.dart';
import '../auth/session_gate.dart';
import '../purchases/iap_service.dart';
import 'inventory_provider.dart';
import '../portfolio/widgets/add_transaction_sheet.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../models/inventory_item.dart';
import '../../widgets/shared_ui.dart';
import '../portfolio/portfolio_pl_provider.dart';
import 'sell_provider.dart';
import '../../widgets/glass_sheet.dart';
import 'widgets/fee_breakdown.dart';
import 'widgets/price_comparison_table.dart' show PriceComparisonTable, sourceColor, sourceDisplayName;
import 'widgets/price_history_chart.dart';
import 'widgets/sell_bottom_sheet.dart';
import 'widgets/sell_progress_sheet.dart';
import 'widgets/sticker_display.dart';
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
  bool _inspecting = false;

  @override
  void initState() {
    super.initState();
    _item = widget.item;
    _fetchHistory();
  }

  /// On-demand inspect: fetch float/stickers/charms via CSFloat API
  Future<void> _inspectItem() async {
    if (_inspecting) return;
    setState(() => _inspecting = true);
    try {
      final api = ref.read(apiClientProvider);
      final response = await api.get('/inventory/${_item.assetId}/inspect');
      final data = response.data as Map<String, dynamic>;
      if (mounted) {
        setState(() {
          _item = _item.withInspectData(
            floatValue: (data['floatValue'] as num).toDouble(),
            paintSeed: data['paintSeed'] as int? ?? 0,
            stickers: (data['stickers'] as List<dynamic>?)
                    ?.map((e) =>
                        StickerInfo.fromJson(e as Map<String, dynamic>))
                    .toList() ??
                [],
            charms: (data['charms'] as List<dynamic>?)
                    ?.map((e) =>
                        CharmInfo.fromJson(e as Map<String, dynamic>))
                    .toList() ??
                [],
          );
          _inspecting = false;
        });
        HapticFeedback.mediumImpact();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _inspecting = false);
        final is503 = e.toString().contains('503');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(is503
                ? 'CSFloat API rate-limited — try in 15 min'
                : 'Inspect unavailable — try later'),
            backgroundColor: AppTheme.loss,
          ),
        );
      }
    }
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

            // ── On-demand inspect button — disabled (CSFloat API unreliable) ──
            if (false && item.floatValue == null &&
                item.inspectLink != null &&
                !item.isNonWeapon)
              Padding(
                padding: const EdgeInsets.only(bottom: AppTheme.s12),
                child: GestureDetector(
                  onTap: _inspecting ? null : _inspectItem,
                  child: Container(
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(AppTheme.r12),
                      border: Border.all(
                        color: AppTheme.primary.withValues(alpha: 0.2),
                        width: 0.8,
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (_inspecting)
                          SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppTheme.primary,
                            ),
                          )
                        else
                          Icon(Icons.search_rounded,
                              size: 16, color: AppTheme.primary),
                        const SizedBox(width: 8),
                        Text(
                          _inspecting ? 'Inspecting...' : 'Inspect Float & Stickers',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
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
                      _StickerValueRow(
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
                child: _SteamMarketDepth(depth: item.steamDepth!, currency: currency),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 225.ms),

            // ── Best Buy / Best Sell summary ──
            _BestBuySellSummary(item: item, currency: currency)
                .animate()
                .fadeIn(duration: 400.ms, delay: 250.ms),

            // ── Buff Bid/Ask Spread ──
            if (item.prices.containsKey('buff') && item.prices.containsKey('buff_bid'))
              Padding(
                padding: const EdgeInsets.only(top: AppTheme.s8),
                child: _BuffSpreadWidget(
                  ask: item.prices['buff']!,
                  bid: item.prices['buff_bid']!,
                  currency: currency,
                ),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 275.ms),

            const SizedBox(height: AppTheme.s16),

            // ── Sell actions ──
            _SellActions(item: item)
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
              _MarketplaceLinks(
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
            _PLSection(
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

class _PLSection extends ConsumerWidget {
  final String marketHashName;
  final String? iconUrl;

  const _PLSection({required this.marketHashName, this.iconUrl});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final plMap = ref.watch(itemPLMapProvider);
    final currency = ref.watch(currencyProvider);
    final itemPL = plMap[marketHashName];

    return GlassCard(
      padding: const EdgeInsets.all(AppTheme.s16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('PROFIT', style: AppTheme.label),
              const Spacer(),
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  showGlassSheet(
                    context,
                    _AddPurchaseSheet(
                      marketHashName: marketHashName,
                      iconUrl: iconUrl,
                      ref: ref,
                    ),
                  );
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(AppTheme.r8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.add_rounded, size: 14, color: AppTheme.primary),
                      const SizedBox(width: 4),
                      Text(
                        'Add Purchase',
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
            ],
          ),
          if (itemPL != null) ...[
            const SizedBox(height: AppTheme.s12),
            _plRow('Avg Buy Price', currency.format(itemPL.avgBuyPrice)),
            _plRow('Current Price', currency.format(itemPL.currentPrice)),
            _plRow('Holding', '${itemPL.currentHolding} items'),
            Divider(height: 20, color: AppTheme.divider),
            _plRow(
              'Unrealized Profit',
              currency.formatWithSign(itemPL.unrealizedProfit),
              valueColor: AppTheme.plColor(itemPL.unrealizedProfitCents),
            ),
            _plRow(
              'Realized Profit',
              currency.formatWithSign(itemPL.realizedProfit),
              valueColor: AppTheme.plColor(itemPL.realizedProfitCents),
            ),
            Divider(height: 20, color: AppTheme.divider),
            _plRow(
              'Total Bought',
              '${itemPL.totalQuantityBought} @ avg ${currency.format(itemPL.avgBuyPrice)}',
            ),
            _plRow(
              'Total Sold',
              '${itemPL.totalQuantitySold} earned ${currency.format(itemPL.totalEarned)}',
            ),
          ] else ...[
            const SizedBox(height: AppTheme.s12),
            Center(
              child: Text(
                'No purchase data yet.\nAdd what you paid to track profit.',
                textAlign: TextAlign.center,
                style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _plRow(String label, String value, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: AppTheme.caption),
          Text(
            value,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: valueColor ?? AppTheme.textPrimary,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Add Purchase Bottom Sheet ──────────────────────────────────────

class _AddPurchaseSheet extends StatefulWidget {
  final String marketHashName;
  final String? iconUrl;
  final WidgetRef ref;

  const _AddPurchaseSheet({
    required this.marketHashName,
    this.iconUrl,
    required this.ref,
  });

  @override
  State<_AddPurchaseSheet> createState() => _AddPurchaseSheetState();
}

class _AddPurchaseSheetState extends State<_AddPurchaseSheet> {
  final _priceController = TextEditingController();
  String _type = 'buy';
  String _source = 'manual';
  DateTime _date = DateTime.now();
  bool _saving = false;

  static const _sources = [
    ('manual', 'Manual'),
    ('csfloat', 'CSFloat'),
    ('skinport', 'Skinport'),
    ('dmarket', 'DMarket'),
    ('buff', 'Buff'),
    ('trade', 'Trade'),
    ('drop', 'Drop / Case'),
    ('other', 'Other'),
  ];

  @override
  void dispose() {
    _priceController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final priceText = _priceController.text.trim();
    if (priceText.isEmpty) return;

    final price = double.tryParse(priceText.replaceAll(',', '.'));
    if (price == null || price <= 0) return;

    setState(() => _saving = true);

    try {
      final api = widget.ref.read(apiClientProvider);
      await api.post('/transactions/manual', data: {
        'marketHashName': widget.marketHashName,
        'priceCents': (price * 100).round(),
        'type': _type,
        'date': _date.toIso8601String(),
        'source': _source,
        'iconUrl': widget.iconUrl,
      });

      // Refresh P/L data
      widget.ref.invalidate(itemsPLProvider);
      widget.ref.invalidate(portfolioPLProvider);

      HapticFeedback.mediumImpact();
      if (mounted) context.pop();
    } on DioException catch (e) {
      if (e.response?.statusCode == 403 &&
          (e.response?.data as Map<String, dynamic>?)?['error'] == 'premium_required') {
        if (mounted) {
          context.pop(); // close sheet
          context.push('/premium');
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Failed to save'),
            backgroundColor: AppTheme.loss,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Failed to save'),
            backgroundColor: AppTheme.loss,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2012),
      lastDate: DateTime.now(),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: ColorScheme.dark(
            primary: AppTheme.primary,
            surface: AppTheme.card,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      margin: EdgeInsets.only(bottom: bottom),
      decoration: const BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppTheme.textDisabled,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Title
              Text('Add Transaction', style: AppTheme.h3, textAlign: TextAlign.center),
              const SizedBox(height: 4),
              Text(
                widget.marketHashName,
                style: AppTheme.caption,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 20),

              // Buy / Sell toggle
              Row(
                children: [
                  _TypeChip(
                    label: 'Buy',
                    selected: _type == 'buy',
                    color: AppTheme.profit,
                    onTap: () => setState(() => _type = 'buy'),
                  ),
                  const SizedBox(width: 8),
                  _TypeChip(
                    label: 'Sell',
                    selected: _type == 'sell',
                    color: AppTheme.loss,
                    onTap: () => setState(() => _type = 'sell'),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Price input
              TextField(
                controller: _priceController,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                autofocus: true,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textPrimary,
                ),
                decoration: InputDecoration(
                  prefixText: '\$ ',
                  prefixStyle: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textMuted,
                  ),
                  hintText: '0.00',
                  hintStyle: TextStyle(color: AppTheme.textDisabled),
                  filled: true,
                  fillColor: AppTheme.bg,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                ),
              ),
              const SizedBox(height: 12),

              // Source chips
              Text('SOURCE', style: AppTheme.label),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: _sources.map((s) {
                  final selected = _source == s.$1;
                  return GestureDetector(
                    onTap: () => setState(() => _source = s.$1),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: selected
                            ? AppTheme.primary.withValues(alpha: 0.15)
                            : AppTheme.bg,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color:
                              selected ? AppTheme.primary : Colors.transparent,
                          width: 1,
                        ),
                      ),
                      child: Text(
                        s.$2,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: selected
                              ? AppTheme.primary
                              : AppTheme.textSecondary,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 12),

              // Date picker
              GestureDetector(
                onTap: _pickDate,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppTheme.bg,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.calendar_today_rounded,
                          size: 16, color: AppTheme.textMuted),
                      const SizedBox(width: 10),
                      Text(
                        '${_date.day.toString().padLeft(2, '0')}.${_date.month.toString().padLeft(2, '0')}.${_date.year}',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const Spacer(),
                      const Icon(Icons.chevron_right_rounded,
                          size: 18, color: AppTheme.textDisabled),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Save button
              GestureDetector(
                onTap: _saving ? null : _save,
                child: Container(
                  height: 50,
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.primary.withValues(alpha: 0.3),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Center(
                    child: _saving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                          )
                        : Text(
                            'Save ${_type == 'buy' ? 'Purchase' : 'Sale'}',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TypeChip extends StatelessWidget {
  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  const _TypeChip({
    required this.label,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.15) : AppTheme.bg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? color : Colors.transparent,
            width: 1.5,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: selected ? color : AppTheme.textMuted,
          ),
        ),
      ),
    );
  }
}

// ── Sell Actions ─────────────────────────────────────────────────

class _SellActions extends ConsumerWidget {
  final InventoryItem item;

  const _SellActions({required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quickPriceAsync = ref.watch(quickPriceProvider(QuickPriceRequest(
      marketHashName: item.marketHashName,
      fallbackPriceUsd: item.bestPrice ?? item.steamPrice,
    )));
    final currency = ref.watch(currencyProvider);
    final hasSession = ref.watch(hasSessionProvider);

    return GlassCard(
      padding: const EdgeInsets.all(AppTheme.s14),
      child: Column(
        children: [
          quickPriceAsync.when(
            data: (result) {
              final priceCents = result.sellerReceivesCents;
              final stale = result.stale;
              final priceStr = result.formatPrice(priceCents);
              return Column(
                children: [
                  if (stale)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppTheme.s10),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: AppTheme.loss.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppTheme.loss.withValues(alpha: 0.3)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.warning_amber_rounded,
                                color: AppTheme.loss, size: 16),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Price may be outdated',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.loss,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  FeeBreakdown(sellerReceivesCents: priceCents, walletSymbol: result.currencySymbol),
                  const SizedBox(height: AppTheme.s10),
                  // Sell buttons — clean row
                  Row(
                    children: [
                      // Quick Sell
                      Expanded(
                        child: SizedBox(
                          height: 44,
                          child: ElevatedButton(
                            onPressed: () async {
                              if (!await requireSession(context, ref)) return;
                              if (!context.mounted) return;
                              if (stale) {
                                HapticFeedback.selectionClick();
                                showGlassSheet(context, SellBottomSheet(items: [item]));
                                return;
                              }
                              HapticFeedback.mediumImpact();
                              final items = [
                                {
                                  'assetId': item.assetId,
                                  'marketHashName': item.marketHashName,
                                  'priceCents': 0,
                                  if (item.accountId != null) 'accountId': item.accountId,
                                },
                              ];
                              if (context.mounted) {
                                showGlassSheetLocked(context, const SellProgressSheet());
                              }
                              await ref.read(sellOperationProvider.notifier)
                                  .startQuickSell(items, accountId: item.accountId);
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: stale ? AppTheme.surface : AppTheme.primary,
                              foregroundColor: stale ? AppTheme.textSecondary : Colors.white,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(AppTheme.r12),
                              ),
                            ),
                            child: Text(
                              stale ? 'Set Price & Sell' : 'Quick Sell $priceStr',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      // Custom price
                      SizedBox(
                        height: 44,
                        child: OutlinedButton(
                          onPressed: () async {
                            if (!await requireSession(context, ref)) return;
                            if (!context.mounted) return;
                            HapticFeedback.selectionClick();
                            showGlassSheet(context, SellBottomSheet(items: [item]));
                          },
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppTheme.textSecondary,
                            side: const BorderSide(color: AppTheme.borderLight),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(AppTheme.r12),
                            ),
                          ),
                          child: const Text('Custom', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                        ),
                      ),
                    ],
                  ),
                ],
              );
            },
            loading: () => const ShimmerBox(height: 48),
            error: (_, _) => GradientButton(
              label: 'Sell Item',
              icon: Icons.sell_rounded,
              onPressed: () {
                showGlassSheet(context, SellBottomSheet(items: [item]));
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ── Log Purchase Button ──────────────────────────────────────────
class _LogPurchaseButton extends ConsumerWidget {
  final InventoryItem item;

  const _LogPurchaseButton({required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        final isPremium = ref.read(premiumProvider).valueOrNull ?? false;
        if (!isPremium) {
          context.push('/premium');
          return;
        }
        showGlassSheet(
          context,
          AddTransactionSheet(
            initialItemName: item.marketHashName,
            initialIconUrl: item.iconUrl,
          ),
        );
      },
      child: Container(
        height: 44,
        decoration: BoxDecoration(
          color: AppTheme.profit.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(AppTheme.r12),
          border: Border.all(
            color: AppTheme.profit.withValues(alpha: 0.2),
            width: 0.8,
          ),
        ),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.add_shopping_cart_rounded,
                size: 16, color: AppTheme.profit),
            SizedBox(width: 8),
            Text(
              'Add What You Paid',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppTheme.profit,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Marketplace Links (with prices) ──────────────────────────────
class _MarketplaceLinks extends StatelessWidget {
  final Map<String, String> links;
  final Map<String, double> prices;
  final CurrencyInfo currency;
  final String? originName;
  final IconData? originIcon;

  const _MarketplaceLinks({
    required this.links,
    required this.prices,
    required this.currency,
    this.originName,
    this.originIcon,
  });

  // source key in links → (label, color, icon, price source key)
  static const _linkConfig = <String, (String, Color, IconData, String)>{
    'buff': ('Buff163', AppTheme.buffYellow, Icons.storefront_rounded, 'buff'),
    'skinport': ('Skinport', AppTheme.skinportGreen, Icons.shopping_bag_rounded, 'skinport'),
    'csfloat': ('CSFloat', AppTheme.csfloatOrange, Icons.waves_rounded, 'csfloat'),
    'steam': ('Steam', AppTheme.steamBlue, Icons.store_rounded, 'steam'),
  };

  @override
  Widget build(BuildContext context) {
    final available = links.entries
        .where((e) => _linkConfig.containsKey(e.key))
        .toList();
    if (available.isEmpty) return const SizedBox.shrink();

    return Container(
      decoration: AppTheme.glass(),
      padding: const EdgeInsets.fromLTRB(
        AppTheme.s16,
        AppTheme.s14,
        AppTheme.s16,
        AppTheme.s14,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('MARKETPLACE', style: AppTheme.label),
              const Spacer(),
              // Origin inline if available
              if (originName != null)
                Flexible(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(originIcon ?? Icons.inventory_2_rounded, size: 12, color: AppTheme.textMuted),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          originName!,
                          style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppTheme.s10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: available.map((entry) {
                final config = _linkConfig[entry.key]!;
                final (label, color, icon, priceKey) = config;
                final price = prices[priceKey];
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _MarketButton(
                    label: label,
                    color: color,
                    icon: icon,
                    url: entry.value,
                    price: price,
                    currency: currency,
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _MarketButton extends StatelessWidget {
  final String label;
  final Color color;
  final IconData icon;
  final String url;
  final double? price;
  final CurrencyInfo currency;

  const _MarketButton({
    required this.label,
    required this.color,
    required this.icon,
    required this.url,
    required this.currency,
    this.price,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(AppTheme.r8),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
            if (price != null && price! > 0) ...[
              const SizedBox(width: 6),
              Text(
                currency.format(price!),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: color.withValues(alpha: 0.7),
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Best Buy / Best Sell Summary ─────────────────────────────────
class _BestBuySellSummary extends StatelessWidget {
  final InventoryItem item;
  final CurrencyInfo currency;

  const _BestBuySellSummary({required this.item, required this.currency});

  @override
  Widget build(BuildContext context) {
    // Cheapest external source (where to buy)
    final external = item.prices.entries
        .where((e) =>
            e.key != 'steam' &&
            e.key != 'csgotrader' &&
            e.key != 'buff_bid' &&
            e.value > 0)
        .toList();
    if (external.isEmpty) return const SizedBox.shrink();

    external.sort((a, b) => a.value.compareTo(b.value));
    final cheapest = external.first;

    // Best sell = Steam after 13% fee
    final steamPrice = item.steamPrice;
    final afterFees = steamPrice != null ? steamPrice * 0.87 : null;

    // Profit calculation
    final profit = afterFees != null ? afterFees - cheapest.value : null;
    final profitPct = profit != null && cheapest.value > 0
        ? (profit / cheapest.value * 100)
        : null;

    final buyColor = sourceColor(cheapest.key);

    return Padding(
      padding: const EdgeInsets.only(top: AppTheme.s10),
      child: Container(
        decoration: AppTheme.glass(),
        padding: const EdgeInsets.all(AppTheme.s14),
        child: Column(
          children: [
            // Cheapest buy
            Row(
              children: [
                Icon(Icons.shopping_cart_outlined,
                    size: 14, color: buyColor.withValues(alpha: 0.7)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Cheapest Buy', style: TextStyle(
                    fontSize: 12, color: AppTheme.textSecondary,
                  )),
                ),
                Container(
                  width: 6, height: 6,
                  decoration: BoxDecoration(color: buyColor, shape: BoxShape.circle),
                ),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    sourceDisplayName(cheapest.key),
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: buyColor),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  currency.format(cheapest.value),
                  style: const TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w700,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
            // Sell on Steam (after fees)
            if (afterFees != null) ...[
              const SizedBox(height: AppTheme.s8),
              Row(
                children: [
                  Icon(Icons.sell_outlined,
                      size: 14, color: AppTheme.steamBlue.withValues(alpha: 0.7)),
                  const SizedBox(width: 8),
                  Text('Sell Steam', style: TextStyle(
                    fontSize: 12, color: AppTheme.textSecondary,
                  )),
                  Text(' (−13%)', style: TextStyle(
                    fontSize: 10, color: AppTheme.textDisabled,
                  )),
                  const Spacer(),
                  Text(
                    currency.format(afterFees),
                    style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w700,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ],
            // Potential profit
            if (profit != null && profit > 0) ...[
              const Divider(height: 20, color: AppTheme.divider),
              Row(
                children: [
                  Icon(Icons.trending_up_rounded,
                      size: 14, color: AppTheme.profit),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('Potential', style: TextStyle(
                      fontSize: 12, color: AppTheme.textSecondary,
                    )),
                  ),
                  Flexible(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            '+${currency.format(profit)}',
                            style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.profit,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                          ),
                          if (profitPct != null) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppTheme.profit.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                '+${profitPct.toStringAsFixed(1)}%',
                                style: TextStyle(
                                  fontSize: 10, fontWeight: FontWeight.w700,
                                  color: AppTheme.profit,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Buff Bid/Ask Spread ──────────────────────────────────────────
class _BuffSpreadWidget extends StatelessWidget {
  final double ask;
  final double bid;
  final CurrencyInfo currency;

  const _BuffSpreadWidget({
    required this.ask,
    required this.bid,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    if (ask <= 0 || bid <= 0) return const SizedBox.shrink();

    final spread = ((ask - bid) / ask * 100);
    final spreadColor = spread < 3
        ? AppTheme.profit
        : spread < 8
            ? AppTheme.warning
            : AppTheme.loss;

    return Container(
      decoration: AppTheme.glass(),
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.s14,
        vertical: AppTheme.s10,
      ),
      child: Row(
        children: [
          Container(
            width: 6, height: 6,
            decoration: const BoxDecoration(
              color: AppTheme.buffYellow,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text('Buff', style: TextStyle(
            fontSize: 12, fontWeight: FontWeight.w600,
            color: AppTheme.buffYellow,
          )),
          const SizedBox(width: 10),
          // Bid + Ask — flexible to avoid overflow
          Expanded(
            child: Row(
              children: [
                Text('Buy ', style: TextStyle(fontSize: 10, color: AppTheme.textDisabled)),
                Flexible(
                  child: Text(currency.format(bid), style: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w600,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ), overflow: TextOverflow.ellipsis),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: Text('/', style: TextStyle(
                    fontSize: 12, color: AppTheme.textDisabled,
                  )),
                ),
                Text('Sell ', style: TextStyle(fontSize: 10, color: AppTheme.textDisabled)),
                Flexible(
                  child: Text(currency.format(ask), style: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w600,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ), overflow: TextOverflow.ellipsis),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Spread badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
            decoration: BoxDecoration(
              color: spreadColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              '${spread.toStringAsFixed(1)}%',
              style: TextStyle(
                fontSize: 10, fontWeight: FontWeight.w700,
                color: spreadColor,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Sticker Value + Overpay Row ──────────────────────────────────
class _StickerValueRow extends StatelessWidget {
  final double stickerValue;
  final double? bestPrice;
  final CurrencyInfo currency;

  const _StickerValueRow({
    required this.stickerValue,
    required this.currency,
    this.bestPrice,
  });

  @override
  Widget build(BuildContext context) {
    // Calculate overpay percentage: sticker value / base item price
    final overpayPct = bestPrice != null && bestPrice! > 0
        ? (stickerValue / bestPrice! * 100)
        : null;
    final isHighOverpay = overpayPct != null && overpayPct > 50;

    return Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        // Sticker value badge
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppTheme.s10,
            vertical: AppTheme.s6,
          ),
          decoration: BoxDecoration(
            color: AppTheme.warning.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(AppTheme.r6),
            border: Border.all(
              color: AppTheme.warning.withValues(alpha: 0.2),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.auto_awesome,
                  size: 14, color: AppTheme.warning.withValues(alpha: 0.8)),
              const SizedBox(width: 6),
              Text(
                'Sticker Value: ${currency.format(stickerValue)}',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.warning.withValues(alpha: 0.9),
                ),
              ),
            ],
          ),
        ),
        // Overpay indicator (if sticker value > 50% of item price)
        if (isHighOverpay)
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppTheme.s10,
              vertical: AppTheme.s6,
            ),
            decoration: BoxDecoration(
              color: AppTheme.profit.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(AppTheme.r6),
              border: Border.all(
                color: AppTheme.profit.withValues(alpha: 0.2),
              ),
            ),
            child: Text(
              'Sticker Overpay: ${overpayPct!.round()}%',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppTheme.profit,
              ),
            ),
          ),
      ],
    );
  }
}

// ── Steam Market Depth ───────────────────────────────────────────
class _SteamMarketDepth extends StatelessWidget {
  final SteamDepth depth;
  final CurrencyInfo currency;

  const _SteamMarketDepth({required this.depth, required this.currency});

  String _formatCount(int n) {
    if (n >= 10000) return '${(n / 1000).toStringAsFixed(1)}K';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return n.toString();
  }

  @override
  Widget build(BuildContext context) {
    final totalOrders = depth.buyOrderCount + depth.sellListingCount;
    final buyFraction = totalOrders > 0
        ? depth.buyOrderCount / totalOrders
        : 0.5;

    return Container(
      decoration: AppTheme.glass(),
      padding: const EdgeInsets.all(AppTheme.s14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Text('STEAM MARKET DEPTH', style: AppTheme.label),
          const SizedBox(height: AppTheme.s10),

          // Buy orders vs Sell listings counts
          Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(children: [
                    TextSpan(
                      text: 'Buy Orders  ',
                      style: TextStyle(fontSize: 11, color: AppTheme.textDisabled),
                    ),
                    TextSpan(
                      text: _formatCount(depth.buyOrderCount),
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700,
                        color: Color(0xFF10B981)), // green
                    ),
                  ]),
                ),
              ),
              Expanded(
                child: Text.rich(
                  TextSpan(children: [
                    TextSpan(
                      text: 'Listings  ',
                      style: TextStyle(fontSize: 11, color: AppTheme.textDisabled),
                    ),
                    TextSpan(
                      text: _formatCount(depth.sellListingCount),
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700,
                        color: Color(0xFFEF4444)), // red
                    ),
                  ]),
                  textAlign: TextAlign.right,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),

          // Proportional bar (green = buy orders, red = sell listings)
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: SizedBox(
              height: 6,
              child: Row(
                children: [
                  Expanded(
                    flex: (buyFraction * 100).round().clamp(1, 99),
                    child: Container(color: const Color(0xFF10B981).withValues(alpha: 0.6)),
                  ),
                  Container(width: 1, color: AppTheme.bg),
                  Expanded(
                    flex: ((1 - buyFraction) * 100).round().clamp(1, 99),
                    child: Container(color: const Color(0xFFEF4444).withValues(alpha: 0.6)),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 6),

          // Bid / Ask prices
          Row(
            children: [
              Text('Bid ', style: TextStyle(fontSize: 11, color: AppTheme.textDisabled)),
              Text(
                currency.format(depth.highestBid),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                  fontFeatures: [FontFeature.tabularFigures()]),
              ),
              const Spacer(),
              Text('Ask ', style: TextStyle(fontSize: 11, color: AppTheme.textDisabled)),
              Text(
                currency.format(depth.lowestAsk),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                  fontFeatures: [FontFeature.tabularFigures()]),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // 24h Volume + Median
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppTheme.steamBlue.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(AppTheme.r6),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.show_chart_rounded, size: 13,
                    color: AppTheme.steamBlue.withValues(alpha: 0.6)),
                const SizedBox(width: 6),
                Text(
                  '24h Volume: ${_formatCount(depth.volume24h)}',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                    color: AppTheme.steamBlue.withValues(alpha: 0.8)),
                ),
                if (depth.medianPrice > 0) ...[
                  Text(
                    '  ·  Median: ${currency.format(depth.medianPrice)}',
                    style: TextStyle(fontSize: 11,
                      color: AppTheme.steamBlue.withValues(alpha: 0.6)),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Drops From (Collection / Crate) ──────────────────────────────
class _DropsFromSection extends StatelessWidget {
  final InventoryItem item;

  const _DropsFromSection({required this.item});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: AppTheme.glass(),
      padding: const EdgeInsets.all(AppTheme.s14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('ORIGIN', style: AppTheme.label),
          const SizedBox(height: AppTheme.s10),
          // Collection
          if (item.collection != null)
            _OriginRow(
              icon: Icons.collections_bookmark_rounded,
              label: item.collection!.name,
              color: const Color(0xFF8B5CF6),
            ),
          // Crates
          for (final crate in item.crates) ...[
            if (item.collection != null || item.crates.indexOf(crate) > 0)
              const SizedBox(height: AppTheme.s6),
            _OriginRow(
              icon: Icons.inventory_2_rounded,
              label: crate.name,
              color: const Color(0xFFF59E0B),
            ),
          ],
        ],
      ),
    );
  }
}

class _OriginRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _OriginRow({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(AppTheme.r6),
          ),
          child: Icon(icon, size: 14, color: color),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
