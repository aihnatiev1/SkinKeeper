import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api_client.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/profit_loss.dart';
import '../../../widgets/glass_sheet.dart';
import '../portfolio_pl_provider.dart';
import 'add_transaction_sheet.dart';
import 'csv_import_sheet.dart';

// ── Layout constants ──────────────────────────────────────────────────────────
const _kRowH = 52.0;
const _kHdrH = 28.0;
const _kNameW = 162.0; // sticky: icon + name

// Scrollable column widths — order matches screenshot
const _kColQty = 46.0;
const _kColBuy = 76.0;
const _kColCur = 76.0;
const _kColInv = 86.0;
const _kColWorth = 82.0;
const _kColPct = 54.0;
const _kColGain = 82.0;
const _kColFees = 86.0;

const _hdrStyle = TextStyle(
  fontSize: 10,
  fontWeight: FontWeight.w700,
  color: AppTheme.textMuted,
  letterSpacing: 0.7,
);

// ── Public widget ─────────────────────────────────────────────────────────────
class ItemPLList extends ConsumerWidget {
  final List<ItemPL> items;
  final bool isLoadingMore;
  const ItemPLList({super.key, required this.items, this.isLoadingMore = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final valid = items.where((i) => i.marketHashName.isNotEmpty).toList();
    if (valid.isEmpty) {
      return Container(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
        decoration: AppTheme.glass(),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'No transactions found.\nSync your Steam Market history\nor add them manually.',
              textAlign: TextAlign.center,
              style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => showGlassSheet(context, const AddTransactionSheet()),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: AppTheme.primary.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppTheme.primary.withValues(alpha: 0.3)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.add_rounded, size: 16, color: AppTheme.primary),
                          const SizedBox(width: 6),
                          Text('Add transaction',
                              style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: AppTheme.primary)),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: GestureDetector(
                    onTap: () => showGlassSheet(context, const CsvImportSheet()),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: Colors.transparent,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppTheme.divider),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.upload_file_rounded, size: 16, color: AppTheme.textMuted),
                          const SizedBox(width: 6),
                          Text('Import CSV',
                              style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: AppTheme.textMuted)),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      );
    }

    final tab = ref.watch(plTabProvider);
    final sort = ref.watch(plSortProvider);

    final active = valid.where((i) => i.currentHolding > 0).toList();
    final sold = valid.where((i) => i.currentHolding == 0).toList();
    final current = tab == PlTab.active ? active : sold;
    final sorted = _applySort(current, sort);

    return Container(
      decoration: AppTheme.glass(),
      child: Column(
        children: [
          _Header(activeCount: active.length, soldCount: sold.length),
          Divider(height: 1, color: AppTheme.divider),
          if (sorted.isEmpty)
            Padding(
              padding: const EdgeInsets.all(24),
              child: Text('No items',
                  style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted)),
            )
          else
            _TableContent(items: sorted, sort: sort),
          if (isLoadingMore)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 1.5,
                      color: AppTheme.textMuted,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Loading more items…',
                    style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  static List<ItemPL> _applySort(List<ItemPL> src, PlSort s) {
    final out = List<ItemPL>.from(src);
    int cmp(ItemPL a, ItemPL b) {
      switch (s.col) {
        case PlSortCol.recent:
          if (a.updatedAt == null && b.updatedAt == null) return 0;
          if (a.updatedAt == null) return 1;
          if (b.updatedAt == null) return -1;
          return b.updatedAt!.compareTo(a.updatedAt!);
        case PlSortCol.qty:
          return b.currentHolding.compareTo(a.currentHolding);
        case PlSortCol.buyPrice:
          return b.avgBuyPriceCents.compareTo(a.avgBuyPriceCents);
        case PlSortCol.currentPrice:
          return b.currentPriceCents.compareTo(a.currentPriceCents);
        case PlSortCol.invested:
          return b.totalSpentCents.compareTo(a.totalSpentCents);
        case PlSortCol.worth:
          return b.totalWorthNowCents.compareTo(a.totalWorthNowCents);
        case PlSortCol.pct:
          return b.profitPct.compareTo(a.profitPct);
        case PlSortCol.gain:
          return b.totalProfitCents.compareTo(a.totalProfitCents);
        case PlSortCol.afterFees:
          return b.gainAfterFeesCents.compareTo(a.gainAfterFeesCents);
      }
    }
    out.sort((a, b) => s.desc ? cmp(a, b) : -cmp(a, b));
    return out;
  }
}

// ── Header: tabs + item count ────────────────────────────────────────────────
class _Header extends ConsumerWidget {
  final int activeCount;
  final int soldCount;
  const _Header({required this.activeCount, required this.soldCount});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(plTabProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Row(
        children: [
          _TabChip(label: 'Active', count: activeCount, active: tab == PlTab.active,
              onTap: () { HapticFeedback.selectionClick(); ref.read(plTabProvider.notifier).state = PlTab.active; }),
          const SizedBox(width: 8),
          _TabChip(label: 'Sold', count: soldCount, active: tab == PlTab.sold,
              onTap: () { HapticFeedback.selectionClick(); ref.read(plTabProvider.notifier).state = PlTab.sold; }),
        ],
      ),
    );
  }
}

class _TabChip extends StatelessWidget {
  final String label;
  final int count;
  final bool active;
  final VoidCallback onTap;
  const _TabChip({required this.label, required this.count, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: active ? AppTheme.primary.withValues(alpha: 0.2) : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active ? AppTheme.primary : AppTheme.divider,
            width: active ? 1.5 : 1,
          ),
        ),
        child: Text(
          '$label  $count',
          style: TextStyle(
            fontSize: 12,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            color: active ? AppTheme.primary : AppTheme.textMuted,
          ),
        ),
      ),
    );
  }
}

// ── Table ────────────────────────────────────────────────────────────────────
class _TableContent extends ConsumerStatefulWidget {
  final List<ItemPL> items;
  final PlSort sort;
  const _TableContent({required this.items, required this.sort});

  @override
  ConsumerState<_TableContent> createState() => _TableContentState();
}

class _TableContentState extends ConsumerState<_TableContent> {
  final _hCtrl = ScrollController();

  @override
  void dispose() { _hCtrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Sticky left: icon + name
        SizedBox(
          width: _kNameW,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _stickyHeader(),
              for (final item in widget.items)
                GestureDetector(
                  onLongPress: () => _showItemActions(context, item),
                  child: _stickyRow(item),
                ),
            ],
          ),
        ),
        Container(width: 0.5, color: AppTheme.divider),
        // Scrollable columns
        Expanded(
          child: SingleChildScrollView(
            controller: _hCtrl,
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _dataHeader(),
                for (final item in widget.items)
                  Consumer(builder: (ctx, ref, child) => _dataRow(item, ref)),
              ],
            ),
          ),
        ),
        Container(width: 0.5, color: AppTheme.divider),
        // Sticky right: edit + delete
        SizedBox(
          width: 72,
          child: Column(
            children: [
              _actionsHeader(),
              for (final item in widget.items)
                _actionsRow(context, item),
            ],
          ),
        ),
      ],
    );
  }

  Widget _actionsHeader() => Container(
        height: _kHdrH,
        decoration: _border(),
      );

  Widget _actionsRow(BuildContext context, ItemPL item) => Container(
        height: _kRowH,
        decoration: _border(),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            GestureDetector(
              onTap: () {
                HapticFeedback.lightImpact();
                showGlassSheet(context, AddTransactionSheet(
                  initialItemName: item.marketHashName,
                  initialPriceUsd: item.avgBuyPrice > 0 ? item.avgBuyPrice : null,
                  initialQty: item.currentHolding > 0 ? item.currentHolding : null,
                  editMode: true,
                ));
              },
              child: Container(
                width: 28, height: 28,
                decoration: BoxDecoration(
                  color: AppTheme.textMuted.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(Icons.edit_outlined, size: 14, color: AppTheme.textSecondary),
              ),
            ),
            const SizedBox(width: 4),
            GestureDetector(
              onTap: () => _confirmDeleteAll(context, item),
              child: Container(
                width: 28, height: 28,
                decoration: BoxDecoration(
                  color: AppTheme.loss.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(Icons.delete_outline_rounded, size: 14, color: AppTheme.loss.withValues(alpha: 0.8)),
              ),
            ),
          ],
        ),
      );

  // ── Delete all transactions for item ──────────────────────────────────────
  void _confirmDeleteAll(BuildContext context, ItemPL item) {
    HapticFeedback.mediumImpact();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: Text('Delete transactions?',
            style: const TextStyle(color: Colors.white, fontSize: 15)),
        content: Text(
          'Remove all records for "${item.displayName}"? Cannot be undone.',
          style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => context.pop(),
            child: Text('Cancel', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: () async {
              context.pop();
              _deleteAllForItem(context, item);
            },
            child: Text('Delete', style: TextStyle(color: AppTheme.loss, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  void _deleteAllForItem(BuildContext context, ItemPL item) async {
    try {
      final api = ref.read(apiClientProvider);
      final encoded = Uri.encodeQueryComponent(item.marketHashName);
      await api.delete('/transactions?item=$encoded');
      ref.invalidate(itemsPLProvider);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Delete failed: $e'), backgroundColor: AppTheme.loss),
        );
      }
    }
  }

  // ── Item long-press actions ────────────────────────────────────────────────
  void _showItemActions(BuildContext context, ItemPL item) {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.all(16),
        decoration: AppTheme.glass(),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              item.displayName,
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            ListTile(
              leading: Icon(Icons.add_circle_outline,
                  color: AppTheme.primary, size: 20),
              title: Text(
                'Log transaction',
                style:
                    TextStyle(color: AppTheme.textPrimary, fontSize: 14),
              ),
              onTap: () {
                context.pop();
                showGlassSheet(
                  context,
                  AddTransactionSheet(
                    initialItemName: item.marketHashName,
                    initialIconUrl: item.imageUrl,
                  ),
                );
              },
              contentPadding: EdgeInsets.zero,
              dense: true,
            ),
          ],
        ),
      ),
    );
  }

  // ── Sticky header ──────────────────────────────────────────────────────────
  Widget _stickyHeader() => Container(
        height: _kHdrH,
        padding: const EdgeInsets.only(left: 10),
        decoration: _border(),
        alignment: Alignment.centerLeft,
        child: const Text('ITEM', style: _hdrStyle),
      );

  // ── Sticky row ─────────────────────────────────────────────────────────────
  Widget _stickyRow(ItemPL item) {
    final subtitle = item.currentHolding > 0
        ? '${item.currentHolding} in stock'
        : 'sold all';
    return Container(
      height: _kRowH,
      padding: const EdgeInsets.only(left: 8, right: 6),
      decoration: _border(),
      child: Row(
        children: [
          // Icon
          if (item.imageUrl != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: CachedNetworkImage(
                imageUrl: item.imageUrl!,
                width: 30,
                height: 30,
                fit: BoxFit.contain,
                errorWidget: (ctx, url, err) => _iconPlaceholder(),
                placeholder: (ctx, url) => _iconPlaceholder(),
              ),
            )
          else
            _iconPlaceholder(),
          const SizedBox(width: 6),
          // Name
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(item.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTheme.bodySmall.copyWith(
                        fontWeight: FontWeight.w500,
                        color: AppTheme.textPrimary)),
                const SizedBox(height: 1),
                Text(subtitle,
                    style: AppTheme.captionSmall.copyWith(
                        color: item.currentHolding > 0
                            ? AppTheme.textMuted
                            : AppTheme.textDisabled)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _iconPlaceholder() => Container(
        width: 30, height: 30,
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(4),
        ),
      );

  // ── Data header ────────────────────────────────────────────────────────────
  Widget _dataHeader() => Consumer(
        builder: (ctx, ref, _) {
          final sort = ref.watch(plSortProvider);
          void tap(PlSortCol c) {
            HapticFeedback.selectionClick();
            ref.read(plSortProvider.notifier).state = sort.withCol(c);
          }
          return Container(
            height: _kHdrH,
            decoration: _border(),
            child: Row(children: [
              _hdrCell('QTY', _kColQty, PlSortCol.qty, sort, tap),
              _hdrCell('BUY', _kColBuy, PlSortCol.buyPrice, sort, tap),
              _hdrCell('CURRENT', _kColCur, PlSortCol.currentPrice, sort, tap),
              _hdrCell('INVESTED', _kColInv, PlSortCol.invested, sort, tap),
              _hdrCell('WORTH', _kColWorth, PlSortCol.worth, sort, tap),
              _hdrCell('%', _kColPct, PlSortCol.pct, sort, tap),
              _hdrCell('GAIN', _kColGain, PlSortCol.gain, sort, tap),
              _hdrCell('AFTER FEES', _kColFees, PlSortCol.afterFees, sort, tap),
            ]),
          );
        },
      );

  Widget _hdrCell(String label, double w, PlSortCol col, PlSort sort,
      void Function(PlSortCol) tap) {
    final active = sort.col == col;
    return GestureDetector(
      onTap: () => tap(col),
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: w,
        child: Padding(
          padding: const EdgeInsets.only(right: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(label,
                    style: _hdrStyle.copyWith(
                        color: active ? Colors.white : AppTheme.textMuted),
                    textAlign: TextAlign.right,
                    overflow: TextOverflow.ellipsis),
              ),
              const SizedBox(width: 2),
              Text(
                active ? (sort.desc ? '↓' : '↑') : '⇅',
                style: TextStyle(
                  fontSize: 9,
                  color: active ? AppTheme.primary : AppTheme.textDisabled,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Data row ───────────────────────────────────────────────────────────────
  Widget _dataRow(ItemPL item, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final tab = ref.watch(plTabProvider);
    final profitColor = item.isProfitable ? AppTheme.profit : AppTheme.loss;
    final feesColor =
        item.gainAfterFeesCents >= 0 ? AppTheme.profit : AppTheme.loss;
    final pctPrefix = item.profitPct >= 0 ? '+' : '';

    // For sold tab: show avg sell price as "current"
    final displayPrice = tab == PlTab.sold && item.isSoldOut
        ? item.avgSellPrice
        : item.currentPrice;
    final displayPriceLabel =
        tab == PlTab.sold && item.isSoldOut ? 'sold @' : null;

    return Container(
      height: _kRowH,
      decoration: _border(),
      child: Row(children: [
        // QTY
        _cell(_kColQty,
            child: Text(
              tab == PlTab.sold
                  ? '${item.totalQuantitySold}'
                  : '${item.currentHolding}',
              style: AppTheme.bodySmall.copyWith(fontWeight: FontWeight.w600),
            )),

        // BUY price (each)
        _cell(_kColBuy,
            child: Text(
              item.avgBuyPriceCents > 0 ? currency.format(item.avgBuyPrice) : '—',
              style: AppTheme.bodySmall.copyWith(color: AppTheme.textSecondary),
            )),

        // CURRENT / sold @
        _cell(_kColCur,
            child: displayPrice > 0
                ? Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(currency.format(displayPrice),
                          style: AppTheme.bodySmall
                              .copyWith(fontWeight: FontWeight.w500)),
                      if (displayPriceLabel != null)
                        Text(displayPriceLabel,
                            style: AppTheme.captionSmall
                                .copyWith(color: AppTheme.textDisabled)),
                    ],
                  )
                : Text('—',
                    style:
                        TextStyle(color: AppTheme.textDisabled, fontSize: 15))),

        // TOTAL INVESTED
        _cell(_kColInv,
            child: Text(
              item.totalSpentCents > 0
                  ? currency.format(item.totalSpent)
                  : '—',
              style: AppTheme.bodySmall.copyWith(color: AppTheme.textSecondary),
            )),

        // WORTH NOW
        _cell(_kColWorth,
            child: Text(
              item.totalWorthNowCents > 0
                  ? currency.format(item.totalWorthNow)
                  : '—',
              style: AppTheme.bodySmall.copyWith(fontWeight: FontWeight.w500),
            )),

        // %
        _cell(_kColPct,
            child: item.hasCostData && item.currentPriceCents > 0
                ? Text(
                    '$pctPrefix${item.profitPct.toStringAsFixed(1)}%',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: profitColor),
                  )
                : Text('—',
                    style: TextStyle(
                        color: AppTheme.textDisabled, fontSize: 15))),

        // GAIN
        _cell(_kColGain,
            child: item.hasCostData && item.currentPriceCents > 0
                ? Text(
                    currency.formatWithSign(item.totalProfit),
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: profitColor),
                  )
                : Text('—',
                    style: TextStyle(
                        color: AppTheme.textDisabled, fontSize: 15))),

        // AFTER FEES
        _cell(_kColFees,
            child: item.hasCostData && item.currentPriceCents > 0
                ? Text(
                    currency.formatWithSign(item.gainAfterFees),
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: feesColor),
                  )
                : Text('—',
                    style: TextStyle(
                        color: AppTheme.textDisabled, fontSize: 15))),
      ]),
    );
  }

  Widget _cell(double width, {required Widget child}) => SizedBox(
        width: width,
        child: Padding(
          padding: const EdgeInsets.only(right: 10),
          child: Align(alignment: Alignment.centerRight, child: child),
        ),
      );

  BoxDecoration _border() => BoxDecoration(
        border: Border(
            bottom: BorderSide(color: AppTheme.divider, width: 0.5)),
      );
}
