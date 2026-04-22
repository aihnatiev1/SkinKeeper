import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../portfolio_pl_provider.dart';

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

class ItemPLSortBar extends ConsumerWidget {
  final PlSort sort;
  const ItemPLSortBar({super.key, required this.sort});

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
