import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../portfolio/portfolio_pl_provider.dart';
import '../transactions_provider.dart';
import 'transaction_tile_parts.dart';

final _expandedTrades = <String>{};

class TransactionDateHeader extends StatelessWidget {
  final String label;
  const TransactionDateHeader({super.key, required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
      child: Row(
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppTheme.textSecondary,
              letterSpacing: 0.2,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Container(height: 0.5, color: AppTheme.divider),
          ),
        ],
      ),
    );
  }
}

class TransactionTile extends ConsumerWidget {
  final TransactionItem tx;

  const TransactionTile({super.key, required this.tx});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    if (tx.isTrade) return _buildTradeTile(context, currency);
    return MarketTransactionTile(
      tx: tx,
      currency: currency,
      onTap: () => _showPriceCheck(context, ref),
    );
  }

  Future<void> _showPriceCheck(BuildContext context, WidgetRef ref) async {
    final currency = ref.read(currencyProvider);
    HapticFeedback.lightImpact();
    final currentPrice = tx.currentPriceUsd;
    if (currentPrice == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No current price available')),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      builder: (_) => PriceCheckSheet(
        tx: tx,
        currency: currency,
        currentPrice: currentPrice,
        onToggleRefund: tx.canMarkRefunded
            ? (refunded) async {
                await ref
                    .read(transactionsProvider.notifier)
                    .setRefunded(tx.dbId!, refunded: refunded);
                // Cost basis changed — drop cached P/L so the next read recomputes.
                ref.invalidate(portfolioPLProvider);
                ref.invalidate(itemsPLProvider);
              }
            : null,
      ),
    );
  }

  Widget _buildTradeTile(BuildContext context, CurrencyInfo currency) {
    return StatefulBuilder(
      builder: (context, setState) {
        final expanded = _expandedTrades.contains(tx.id);
        return TradeTransactionTile(
          tx: tx,
          currency: currency,
          expanded: expanded,
          verdict: _getTradeVerdict(tx.tradeDiffPct),
          onToggle: () => setState(() {
            if (expanded) {
              _expandedTrades.remove(tx.id);
            } else {
              _expandedTrades.add(tx.id);
            }
          }),
        );
      },
    );
  }

  static String? _getTradeVerdict(double pct) {
    final hash = pct.hashCode.abs();
    if (pct >= 15) {
      return const ['Excellent outcome', 'Strong return on investment', 'Outstanding trade result'][hash % 3];
    } else if (pct >= 3) {
      return const ['Solid profit', 'Good deal', 'Profitable outcome'][hash % 3];
    } else if (pct >= -3) {
      return const ['Balanced trade', 'Fair exchange', 'Break-even'][hash % 3];
    } else if (pct >= -15) {
      return const ['Minor loss', 'Below market value', 'Slight negative return'][hash % 3];
    } else {
      return const ['Significant loss', 'Well below market price', 'Large negative P/L'][hash % 3];
    }
  }
}
