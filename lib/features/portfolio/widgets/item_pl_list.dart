import 'dart:async';

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
import '../portfolio_provider.dart';
import '../../transactions/transactions_provider.dart';
import 'add_transaction_sheet.dart';
import 'csv_import_sheet.dart';

// ── Sort labels ──────────────────────────────────────────────────────────────
const _kSortLabels = <PlSortCol, String>{
  PlSortCol.recent: 'Recent',
  PlSortCol.qty: 'Quantity',
  PlSortCol.buyPrice: 'Buy Price',
  PlSortCol.currentPrice: 'Current',
  PlSortCol.invested: 'Invested',
  PlSortCol.worth: 'Worth',
  PlSortCol.pct: 'Change %',
  PlSortCol.gain: 'Gain',
  PlSortCol.afterFees: 'After Fees',
};

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
              'No purchases yet.\nAdd what you paid to track profit.',
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
                          Text('Add Purchase',
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

// ── Card list ────────────────────────────────────────────────────────────────
class _TableContent extends ConsumerStatefulWidget {
  final List<ItemPL> items;
  final PlSort sort;
  const _TableContent({required this.items, required this.sort});

  @override
  ConsumerState<_TableContent> createState() => _TableContentState();
}

class _TableContentState extends ConsumerState<_TableContent> {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
      child: Column(
        children: [
          _SortBar(sort: widget.sort),
          const SizedBox(height: 4),
          for (int i = 0; i < widget.items.length; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            _ItemCard(item: widget.items[i]),
          ],
        ],
      ),
    );
  }
}

// ── Sort bar ─────────────────────────────────────────────────────────────────
class _SortBar extends ConsumerWidget {
  final PlSort sort;
  const _SortBar({required this.sort});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final label = _kSortLabels[sort.col] ?? 'Recent';
    final arrow = sort.desc ? ' \u2193' : ' \u2191';
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
      child: Row(
        children: [
          Text('Sort by: ',
              style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
          GestureDetector(
            onTap: () => _showSortMenu(context, ref),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                    color: AppTheme.primary.withValues(alpha: 0.25)),
              ),
              child: Text(
                '$label$arrow',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.primary,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showSortMenu(BuildContext context, WidgetRef ref) {
    final current = ref.read(plSortProvider);
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: AppTheme.glass(),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text('Sort by',
                  style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 14)),
            ),
            for (final col in PlSortCol.values)
              ListTile(
                dense: true,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16),
                title: Text(
                  _kSortLabels[col] ?? col.name,
                  style: TextStyle(
                    color: current.col == col
                        ? AppTheme.primary
                        : AppTheme.textPrimary,
                    fontSize: 13,
                    fontWeight: current.col == col
                        ? FontWeight.w700
                        : FontWeight.w400,
                  ),
                ),
                trailing: current.col == col
                    ? Text(
                        current.desc ? '\u2193' : '\u2191',
                        style: TextStyle(
                            color: AppTheme.primary, fontSize: 14),
                      )
                    : null,
                onTap: () {
                  HapticFeedback.selectionClick();
                  ref.read(plSortProvider.notifier).state =
                      current.withCol(col);
                  context.pop();
                },
              ),
          ],
        ),
      ),
    );
  }
}

// ── Item card ────────────────────────────────────────────────────────────────
class _ItemCard extends ConsumerStatefulWidget {
  final ItemPL item;
  const _ItemCard({required this.item});

  @override
  ConsumerState<_ItemCard> createState() => _ItemCardState();
}

class _ItemCardState extends ConsumerState<_ItemCard> {
  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final currency = ref.watch(currencyProvider);
    final tab = ref.watch(plTabProvider);
    final isSold = tab == PlTab.sold;
    final profitColor = item.isProfitable ? AppTheme.profit : AppTheme.loss;
    final pctPrefix = item.profitPct >= 0 ? '+' : '';
    // Arrow makes sign readable for colorblind users (~8% of males).
    final pctArrow = item.profitPct >= 0 ? '↑' : '↓';
    final pctText = item.hasCostData && item.currentPriceCents > 0
        ? '$pctArrow $pctPrefix${item.profitPct.toStringAsFixed(1)}%'
        : null;

    // Subtitle
    final subtitle = isSold
        ? '${item.totalQuantitySold} sold \u00B7 ${currency.format(item.avgSellPrice)} avg'
        : '${item.currentHolding} held \u00B7 ${currency.format(item.avgBuyPrice)} avg';

    // Worth / Earned
    final worthLabel = isSold ? 'Earned' : 'Worth';
    final worthValue = isSold
        ? (item.totalEarnedCents > 0
            ? currency.format(item.totalEarned)
            : '\u2014')
        : (item.totalWorthNowCents > 0
            ? currency.format(item.totalWorthNow)
            : '\u2014');

    // Profit
    final profitValue = item.hasCostData && item.currentPriceCents > 0
        ? currency.formatWithSign(item.totalProfit)
        : '\u2014';

    return Dismissible(
      key: ValueKey(item.marketHashName),
      background: _swipeBackground(
        alignment: Alignment.centerLeft,
        color: AppTheme.primary,
        icon: Icons.edit_outlined,
      ),
      secondaryBackground: _swipeBackground(
        alignment: Alignment.centerRight,
        color: AppTheme.loss,
        icon: Icons.delete_outline,
      ),
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          // Swipe right → edit: pre-fill with existing data
          showGlassSheet(
            context,
            AddTransactionSheet(
              initialItemName: item.marketHashName,
              initialIconUrl: item.imageUrl,
              initialPriceUsd: item.avgBuyPrice,
              initialQty: item.currentHolding,
              editMode: true,
            ),
          );
          return false;
        } else {
          // Swipe left → delete
          return _confirmDeleteAll(context, item);
        }
      },
      child: GestureDetector(
      onLongPress: () => _showItemActions(context, item),
      child: Container(
          decoration: AppTheme.glass(),
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Row 1: icon + name + profit badge
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Item icon
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: _itemIcon(item),
                  ),
                  const SizedBox(width: 10),
                  // Name + subtitle
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.displayName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          style: TextStyle(
                            fontSize: 11,
                            color: AppTheme.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Profit % badge
                  if (pctText != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: profitColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        pctText,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: profitColor,
                        ),
                      ),
                    ),
                ],
              ),
              // Divider
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Divider(
                    height: 1,
                    thickness: 0.5,
                    color: AppTheme.divider),
              ),
              // Row 3: Worth / Profit / Change
              Row(
                children: [
                  _metricColumn(worthLabel, worthValue, Colors.white),
                  _metricColumn('Profit', profitValue, profitColor),
                  _metricColumn(
                    'Change',
                    pctText ?? '\u2014',
                    profitColor,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _metricColumn(String label, String value, Color valueColor) {
    return Expanded(
      child: Column(
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 10, color: AppTheme.textDisabled),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: valueColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _itemIcon(ItemPL item) {
    if (item.imageUrl != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: CachedNetworkImage(
          imageUrl: item.imageUrl!,
          width: 32,
          height: 32,
          fit: BoxFit.contain,
          errorWidget: (ctx, url, err) => _iconPlaceholder(),
          placeholder: (ctx, url) => _iconPlaceholder(),
        ),
      );
    }
    return _iconPlaceholder();
  }

  Widget _iconPlaceholder() => Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(4),
        ),
      );

  Widget _swipeBackground({
    required Alignment alignment,
    required Color color,
    required IconData icon,
  }) {
    return Container(
      alignment: alignment,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, color: color, size: 24),
    );
  }

  // ── Delete confirmation ──────────────────────────────────────────────────
  Future<bool> _confirmDeleteAll(BuildContext context, ItemPL item) async {
    HapticFeedback.mediumImpact();
    final result = await showDialog<bool>(
      context: context,
      useRootNavigator: true,
      builder: (dialogCtx) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: Text('Delete transactions?',
            style: const TextStyle(color: Colors.white, fontSize: 15)),
        content: Text(
          'Remove all records for "${item.displayName}"? Cannot be undone.',
          style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(false),
            child:
                Text('Cancel', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(true),
            child: Text('Delete',
                style: TextStyle(
                    color: AppTheme.loss, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (result == true && context.mounted) {
      await _deleteAllForItem(context, item);
    }
    return false; // never actually dismiss the Dismissible — we handle removal via provider
  }

  Future<void> _deleteAllForItem(BuildContext context, ItemPL item) async {
    // Optimistic-delay pattern: show an Undo snackbar for 5s before actually
    // hitting the backend. A mis-tapped delete on a long transaction history
    // is catastrophic (cost basis resets, ownership chain lost), so the 5s
    // window is a cheap safety net that needs no backend soft-delete support.
    final messenger = ScaffoldMessenger.of(context);
    final completer = Completer<bool>();
    Timer? timer;

    timer = Timer(const Duration(seconds: 5), () {
      if (!completer.isCompleted) completer.complete(true);
    });

    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        content: Text(
            'Deleting transactions for "${item.marketHashName}" — tap UNDO to cancel'),
        duration: const Duration(seconds: 5),
        behavior: SnackBarBehavior.floating,
        action: SnackBarAction(
          label: 'UNDO',
          textColor: AppTheme.profit,
          onPressed: () {
            timer?.cancel();
            if (!completer.isCompleted) completer.complete(false);
          },
        ),
      ),
    );

    final shouldDelete = await completer.future;
    if (!shouldDelete) return;

    try {
      final api = ref.read(apiClientProvider);
      final encoded = Uri.encodeQueryComponent(item.marketHashName);
      await api.delete('/transactions?item=$encoded');
      // Invalidate all related providers immediately
      ref.invalidate(itemsPLProvider);
      ref.invalidate(portfolioPLProvider);
      ref.invalidate(transactionsProvider);
      ref.invalidate(portfolioProvider);
      ref.invalidate(txStatsProvider);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Delete failed: ${friendlyError(e)}'),
              backgroundColor: AppTheme.loss),
        );
      }
    }
  }

  // ── Item long-press actions ──────────────────────────────────────────────
  void _showItemActions(BuildContext context, ItemPL item) {
    HapticFeedback.mediumImpact();
    showGlassSheet(
      context,
      AddTransactionSheet(
        initialItemName: item.marketHashName,
        initialIconUrl: item.imageUrl,
        initialPriceUsd: item.avgBuyPrice,
        initialQty: item.currentHolding,
        editMode: true,
      ),
    );
  }
}
