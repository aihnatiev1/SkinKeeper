import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/profit_loss.dart';
import '../portfolio_pl_provider.dart';

class ItemPLList extends ConsumerWidget {
  final List<ItemPL> items;

  const ItemPLList({super.key, required this.items});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (items.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(32),
        decoration: AppTheme.glass(),
        child: Center(
          child: Text(
            'No transactions found.\nSync your Steam Market history.',
            textAlign: TextAlign.center,
            style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted),
          ),
        ),
      );
    }

    final sort = ref.watch(plSortProvider);
    final sorted = List<ItemPL>.from(items);
    switch (sort) {
      case PLSort.profitDesc:
        sorted.sort((a, b) => b.totalProfitCents.compareTo(a.totalProfitCents));
      case PLSort.profitAsc:
        sorted.sort((a, b) => a.totalProfitCents.compareTo(b.totalProfitCents));
      case PLSort.investedDesc:
        sorted.sort((a, b) => b.totalSpentCents.compareTo(a.totalSpentCents));
      case PLSort.holdingDesc:
        sorted.sort((a, b) => b.currentHolding.compareTo(a.currentHolding));
    }

    return Container(
      decoration: AppTheme.glass(),
      child: Column(
        children: [
          // Sort header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
            child: Row(
              children: [
                Text(
                  '${items.length} items',
                  style: AppTheme.caption,
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    // Cycle through sort options
                    const cycle = [
                      PLSort.profitDesc,
                      PLSort.profitAsc,
                      PLSort.investedDesc,
                      PLSort.holdingDesc,
                    ];
                    final idx = cycle.indexOf(sort);
                    ref.read(plSortProvider.notifier).state =
                        cycle[(idx + 1) % cycle.length];
                  },
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Sort by ',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppTheme.textMuted,
                        ),
                      ),
                      Text(
                        _sortLabel(sort),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      const Icon(Icons.keyboard_arrow_down_rounded,
                          size: 16, color: AppTheme.textSecondary),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: AppTheme.divider),
          // Item list
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: sorted.length,
            separatorBuilder: (_, _) =>
                Divider(height: 1, color: AppTheme.divider),
            itemBuilder: (context, index) =>
                _ItemPLRow(item: sorted[index])
                    .animate()
                    .fadeIn(duration: 300.ms, delay: (index * 30).ms),
          ),
        ],
      ),
    );
  }

  String _sortLabel(PLSort sort) {
    switch (sort) {
      case PLSort.profitDesc:
        return 'Profit ↓';
      case PLSort.profitAsc:
        return 'Profit ↑';
      case PLSort.investedDesc:
        return 'Invested ↓';
      case PLSort.holdingDesc:
        return 'Holdings ↓';
    }
  }
}

class _ItemPLRow extends ConsumerWidget {
  final ItemPL item;

  const _ItemPLRow({required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final profitColor =
        item.isProfitable ? AppTheme.profit : AppTheme.loss;
    final pctPrefix = item.profitPct >= 0 ? '+' : '';

    return InkWell(
      onTap: () {
        // Navigate to item detail if in inventory
        // For now, just provide haptic feedback
        HapticFeedback.lightImpact();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            // Item info
            Expanded(
              flex: 3,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTheme.bodySmall.copyWith(
                      fontWeight: FontWeight.w500,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Avg: ${currency.format(item.avgBuyPrice)}',
                    style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted),
                  ),
                ],
              ),
            ),
            // Current price
            Expanded(
              flex: 2,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    currency.format(item.currentPrice),
                    style: AppTheme.bodySmall.copyWith(
                      fontWeight: FontWeight.w500,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  if (item.currentHolding > 0)
                    Text(
                      '${item.currentHolding} held',
                      style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            // Profit
            Expanded(
              flex: 2,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    currency.formatWithSign(item.totalProfit),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: profitColor,
                    ),
                  ),
                  Text(
                    '$pctPrefix${item.profitPct.toStringAsFixed(1)}%',
                    style: TextStyle(
                      fontSize: 11,
                      color: profitColor.withValues(alpha: 0.7),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
