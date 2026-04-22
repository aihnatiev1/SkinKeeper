import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../transactions_provider.dart';

class TransactionStatsBar extends ConsumerWidget {
  final TransactionStats stats;

  const TransactionStatsBar({super.key, required this.stats});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final isProfit = stats.profitCents >= 0;
    final profitColor = isProfit ? AppTheme.profit : AppTheme.loss;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      child: Column(
        children: [
          Row(
            children: [
              _MiniStat(
                label: 'Bought',
                value: '${stats.totalBought}',
                sub: currency.format(stats.spent),
                color: AppTheme.loss,
              ),
              const SizedBox(width: 6),
              _MiniStat(
                label: 'Sold',
                value: '${stats.totalSold}',
                sub: currency.format(stats.earned),
                color: AppTheme.profit,
              ),
              const SizedBox(width: 6),
              _MiniStat(
                label: 'Traded',
                value: '${stats.totalTraded}',
                sub: currency.format(stats.tradedValue),
                color: AppTheme.warning,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Container(
            width: double.infinity,
            decoration: AppTheme.glass(radius: AppTheme.r12),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('Profit', style: AppTheme.captionSmall),
                const SizedBox(width: 12),
                Text(
                  currency.formatWithSign(stats.profit),
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: profitColor,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  final Color color;

  const _MiniStat({
    required this.label,
    required this.value,
    this.sub,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        decoration: AppTheme.glass(radius: AppTheme.r12),
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Text(label, style: AppTheme.captionSmall),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(value,
                  maxLines: 1,
                  style: TextStyle(
                      fontSize: 15, fontWeight: FontWeight.bold, color: color)),
            ),
            if (sub != null)
              Text(sub!, style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled)),
          ],
        ),
      ),
    );
  }
}
