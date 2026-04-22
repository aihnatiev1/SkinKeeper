import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme.dart';
import '../../../models/profit_loss.dart';
import '../portfolio_pl_provider.dart';
import 'item_pl_list_header.dart';
import 'item_pl_list_parts.dart';
import 'item_pl_sort_bar.dart';

// ── Public widget ─────────────────────────────────────────────────────────────
class ItemPLList extends ConsumerWidget {
  final List<ItemPL> items;
  final bool isLoadingMore;
  const ItemPLList({super.key, required this.items, this.isLoadingMore = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final valid = items.where((i) => i.marketHashName.isNotEmpty).toList();
    if (valid.isEmpty) {
      return const ItemPLEmptyState();
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
          ItemPLListHeader(activeCount: active.length, soldCount: sold.length),
          Divider(height: 1, color: AppTheme.divider),
          if (sorted.isEmpty)
            Padding(
              padding: const EdgeInsets.all(24),
              child: Text('No items',
                  style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted)),
            )
          else
            _TableContent(items: sorted, sort: sort),
          if (isLoadingMore) const ItemPLLoadingMoreFooter(),
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
          ItemPLSortBar(sort: widget.sort),
          const SizedBox(height: 4),
          for (int i = 0; i < widget.items.length; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            ItemPLCard(item: widget.items[i]),
          ],
        ],
      ),
    );
  }
}
