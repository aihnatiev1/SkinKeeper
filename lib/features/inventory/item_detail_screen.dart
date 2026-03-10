import 'dart:developer' as dev;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../portfolio/widgets/add_transaction_sheet.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../models/inventory_item.dart';
import '../../widgets/shared_ui.dart';
import '../portfolio/portfolio_pl_provider.dart';
import 'sell_provider.dart';
import 'widgets/fee_breakdown.dart';
import 'widgets/price_comparison_table.dart';
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
  bool _inspecting = false;
  bool _inspected = false;
  ChartPeriod _period = ChartPeriod.month;

  @override
  void initState() {
    super.initState();
    _item = widget.item;
    _fetchHistory();
    _autoInspect();
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

  Future<void> _autoInspect() async {
    if (_item.inspectLink == null || _item.inspectLink!.isEmpty) return;
    if (_item.floatValue != null && _item.paintSeed != null) {
      _inspected = true;
      return;
    }
    await _inspect();
  }

  Future<void> _inspect() async {
    if (_inspecting) return;
    setState(() => _inspecting = true);

    try {
      final api = ref.read(apiClientProvider);
      final response = await api.get('/inventory/${_item.assetId}/inspect');
      final data = response.data as Map<String, dynamic>;

      if (mounted) {
        final stickers = (data['stickers'] as List<dynamic>?)
                ?.map((e) => StickerInfo.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [];
        final charms = (data['charms'] as List<dynamic>?)
                ?.map((e) => CharmInfo.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [];

        setState(() {
          _item = _item.withInspectData(
            floatValue: (data['floatValue'] as num).toDouble(),
            paintSeed: data['paintSeed'] as int? ?? 0,
            stickers: stickers,
            charms: charms,
          );
          _inspecting = false;
          _inspected = true;
        });
        HapticFeedback.lightImpact();
      }
    } catch (e) {
      dev.log('Inspect failed: $e', name: 'ItemDetail');
      if (mounted) {
        setState(() {
          _inspecting = false;
          _inspected = true;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    final currency = ref.watch(currencyProvider);
    final rarityColor = item.rarityColor != null
        ? Color(int.parse('FF${item.rarityColor}', radix: 16))
        : AppTheme.textDisabled;

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 20, color: AppTheme.textSecondary),
                    onPressed: () => Navigator.of(context).pop(),
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
              child: Container(
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
                child: WearBar(floatValue: item.floatValue!),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 250.ms)
            else if (_inspecting)
              GlassCard(
                padding: const EdgeInsets.all(AppTheme.s16),
                margin: const EdgeInsets.only(bottom: AppTheme.s12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppTheme.primary.withValues(alpha: 0.6),
                      ),
                    ),
                    const SizedBox(width: AppTheme.s10),
                    Text('Inspecting item...', style: AppTheme.bodySmall),
                  ],
                ),
              )
                  .animate(onPlay: (c) => c.repeat())
                  .shimmer(
                    duration: 1500.ms,
                    color: AppTheme.primary.withValues(alpha: 0.1),
                  ),

            // ── Stickers ──
            if (item.stickers.isNotEmpty) ...[
              GlassCard(
                padding: const EdgeInsets.all(AppTheme.s14),
                margin: const EdgeInsets.only(bottom: AppTheme.s12),
                child: StickerDisplay(stickers: item.stickers),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 300.ms),
            ],

            // ── Charms ──
            if (item.charms.isNotEmpty) ...[
              GlassCard(
                padding: const EdgeInsets.all(AppTheme.s14),
                margin: const EdgeInsets.only(bottom: AppTheme.s12),
                child: CharmDisplay(charms: item.charms),
              )
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 350.ms),
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

            const SizedBox(height: AppTheme.s16),

            // ── Sell actions ──
            _SellActions(item: item)
                .animate()
                .fadeIn(duration: 400.ms, delay: 300.ms),

            const SizedBox(height: AppTheme.s10),

            // ── Log Purchase shortcut ──
            _LogPurchaseButton(item: item)
                .animate()
                .fadeIn(duration: 400.ms, delay: 350.ms),

            const SizedBox(height: AppTheme.s16),

            // ── Cross-market prices ──
            PriceComparisonTable(prices: item.prices, currency: currency)
                .animate()
                .fadeIn(duration: 400.ms, delay: 350.ms),

            const SizedBox(height: AppTheme.s16),

            // ── P/L section ──
            _PLSection(
              marketHashName: item.marketHashName,
              iconUrl: item.iconUrl,
            )
                .animate()
                .fadeIn(duration: 400.ms, delay: 400.ms),

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
              PriceHistoryChart(
                history: _history ?? [],
                period: _period,
                onPeriodChanged: (p) {
                  setState(() {
                    _period = p;
                    _historyLoading = true;
                    _historyError = null;
                  });
                  _fetchHistory();
                },
              )
                  .animate()
                  .fadeIn(duration: 500.ms, delay: 450.ms),

            // ── Re-inspect button ──
            if (item.inspectLink != null &&
                item.inspectLink!.isNotEmpty &&
                _inspected &&
                !_inspecting) ...[
              const SizedBox(height: AppTheme.s16),
              Center(
                child: TextButton.icon(
                  onPressed: () {
                    HapticFeedback.lightImpact();
                    setState(() => _inspected = false);
                    _inspect();
                  },
                  icon: const Icon(Icons.refresh_rounded, size: 16),
                  label: const Text('Re-inspect'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppTheme.textMuted,
                    textStyle: const TextStyle(fontSize: 13),
                  ),
                ),
              ),
            ],
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
              Text('PROFIT / LOSS', style: AppTheme.label),
              const Spacer(),
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  showModalBottomSheet(
                    context: context,
                    useRootNavigator: true,
                    isScrollControlled: true,
                    backgroundColor: Colors.transparent,
                    builder: (_) => _AddPurchaseSheet(
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
              'Unrealized P/L',
              currency.formatWithSign(itemPL.unrealizedProfit),
              valueColor: AppTheme.plColor(itemPL.unrealizedProfitCents),
            ),
            _plRow(
              'Realized P/L',
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
                'No purchase data yet.\nAdd your buy price to track P/L.',
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

    final price = double.tryParse(priceText);
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
      if (mounted) Navigator.pop(context);
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
    final quickPriceAsync = ref.watch(quickPriceProvider(item.marketHashName));
    final currency = ref.watch(currencyProvider);

    return GlassCard(
      padding: const EdgeInsets.all(AppTheme.s14),
      child: Column(
        children: [
          quickPriceAsync.when(
            data: (priceCents) {
              final priceStr = currency.format(priceCents / 100);
              return Column(
                children: [
                  FeeBreakdown(sellerReceivesCents: priceCents, currency: currency),
                  const SizedBox(height: AppTheme.s10),
                  Row(
                    children: [
                      // Quick Sell
                      Expanded(
                        flex: 3,
                        child: GestureDetector(
                          onTap: () async {
                            HapticFeedback.mediumImpact();
                            final items = [
                              {
                                'assetId': item.assetId,
                                'marketHashName': item.marketHashName,
                                'priceCents': priceCents,
                              },
                            ];
                            await ref
                                .read(sellOperationProvider.notifier)
                                .startOperation(items);
                            if (context.mounted) {
                              showModalBottomSheet(
                                context: context,
                                useRootNavigator: true,
                                isScrollControlled: true,
                                isDismissible: false,
                                enableDrag: false,
                                backgroundColor: Colors.transparent,
                                builder: (_) => const SellProgressSheet(),
                              );
                            }
                          },
                          child: Container(
                            height: 48,
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
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Text(
                                  'Quick Sell',
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                                Text(
                                  priceStr,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500,
                                    color: Colors.white.withValues(alpha: 0.7),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: AppTheme.s10),
                      // Custom sell
                      Expanded(
                        flex: 2,
                        child: GestureDetector(
                          onTap: () {
                            HapticFeedback.selectionClick();
                            showModalBottomSheet(
                              context: context,
                              useRootNavigator: true,
                              isScrollControlled: true,
                              backgroundColor: Colors.transparent,
                              builder: (_) =>
                                  SellBottomSheet(items: [item]),
                            );
                          },
                          child: Container(
                            height: 48,
                            decoration: BoxDecoration(
                              color: Colors.transparent,
                              borderRadius: BorderRadius.circular(AppTheme.r12),
                              border: Border.all(color: AppTheme.borderLight),
                            ),
                            child: const Center(
                              child: Text(
                                'Custom',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppTheme.textSecondary,
                                ),
                              ),
                            ),
                          ),
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
                showModalBottomSheet(
                  context: context,
                  useRootNavigator: true,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => SellBottomSheet(items: [item]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ── Log Purchase Button ──────────────────────────────────────────
class _LogPurchaseButton extends StatelessWidget {
  final InventoryItem item;

  const _LogPurchaseButton({required this.item});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        showModalBottomSheet(
          context: context,
          useRootNavigator: true,
          isScrollControlled: true,
          backgroundColor: Colors.transparent,
          builder: (_) => AddTransactionSheet(
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
              'Log Purchase',
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
