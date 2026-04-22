import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../transactions_provider.dart';

class TransactionTypeBadge extends StatelessWidget {
  final String label;
  final Color color;

  const TransactionTypeBadge({super.key, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 10, color: color),
      ),
    );
  }
}

class TransactionPriceColumn extends StatelessWidget {
  final String label;
  final double price;
  final Color color;
  final CurrencyInfo currency;

  const TransactionPriceColumn({
    super.key,
    required this.label,
    required this.price,
    required this.color,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label, style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled)),
        const SizedBox(height: 4),
        Text(
          currency.format(price),
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color),
        ),
      ],
    );
  }
}

class TransactionItemThumbnail extends StatelessWidget {
  final String? imageUrl;
  final bool isBuy;

  const TransactionItemThumbnail({super.key, required this.imageUrl, required this.isBuy});

  @override
  Widget build(BuildContext context) {
    final color = isBuy ? AppTheme.primary : AppTheme.profit;
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.12)),
      ),
      child: imageUrl != null
          ? ClipRRect(
              borderRadius: BorderRadius.circular(7),
              child: Image.network(
                imageUrl!,
                width: 40,
                height: 40,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => Icon(
                  isBuy ? Icons.shopping_cart : Icons.sell,
                  color: color,
                  size: 18,
                ),
              ),
            )
          : Icon(
              isBuy ? Icons.shopping_cart : Icons.sell,
              color: color,
              size: 18,
            ),
    );
  }
}

class TradeValueBox extends StatelessWidget {
  final String label;
  final int count;
  final double value;
  final Color color;
  final CurrencyInfo currency;

  const TradeValueBox({
    super.key,
    required this.label,
    required this.count,
    required this.value,
    required this.color,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.12)),
      ),
      child: Column(
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            '$count items',
            style: AppTheme.captionSmall,
          ),
          Text(
            currency.format(value),
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class MarketTransactionTile extends StatelessWidget {
  final TransactionItem tx;
  final CurrencyInfo currency;
  final VoidCallback onTap;

  const MarketTransactionTile({
    super.key,
    required this.tx,
    required this.currency,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isBuy = tx.isBuy;
    final badgeColor = isBuy ? AppTheme.accent : AppTheme.loss;
    final delta = tx.plDeltaCents;
    final deltaPct = tx.plDeltaPct;
    final hasDelta = delta != null && tx.currentPriceCents != null;

    final deltaColor = hasDelta
        ? (isBuy
            ? (delta >= 0 ? AppTheme.profit : AppTheme.loss)
            : (delta <= 0 ? AppTheme.profit : AppTheme.warning))
        : AppTheme.textMuted;

    final localDate = tx.date.toLocal();
    final isThisYear = localDate.year == DateTime.now().year;
    final dateStr = isThisYear
        ? DateFormat('MMM d').format(localDate)
        : DateFormat('MMM d, yy').format(localDate);

    return GestureDetector(
      onTap: onTap,
      child: Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: AppTheme.glass(radius: AppTheme.r12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            TransactionItemThumbnail(imageUrl: tx.imageUrl, isBuy: isBuy),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tx.marketHashName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTheme.bodySmall.copyWith(fontWeight: FontWeight.w500, color: AppTheme.textPrimary),
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      TransactionTypeBadge(label: isBuy ? 'Buy' : 'Sell', color: badgeColor),
                      const SizedBox(width: 6),
                      Text(
                        dateStr,
                        style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
                      ),
                    ],
                  ),
                  if (tx.note != null && tx.note!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      tx.note!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTheme.captionSmall.copyWith(
                        color: AppTheme.textMuted,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  currency.format(tx.priceUsd),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textPrimary,
                  ),
                ),
                if (hasDelta) ...[
                  const SizedBox(height: 3),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                    decoration: BoxDecoration(
                      color: deltaColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      '${currency.formatWithSign(delta / 100)} (${deltaPct!.toStringAsFixed(0)}%)',
                      style: TextStyle(
                        fontSize: 10,
                        color: deltaColor,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    ),
    );
  }
}

class TradeTransactionTile extends StatelessWidget {
  final TransactionItem tx;
  final CurrencyInfo currency;
  final bool expanded;
  final VoidCallback onToggle;
  final String? verdict;

  const TradeTransactionTile({
    super.key,
    required this.tx,
    required this.currency,
    required this.expanded,
    required this.onToggle,
    required this.verdict,
  });

  @override
  Widget build(BuildContext context) {
    final diff = tx.tradeDiffCents;
    final pct = tx.tradeDiffPct;
    final diffColor = diff > 0
        ? AppTheme.profit
        : diff < 0
            ? AppTheme.loss
            : AppTheme.textMuted;

    final statusColor = switch (tx.tradeStatus) {
      'accepted' => AppTheme.profit,
      'pending' => AppTheme.warning,
      'cancelled' || 'declined' || 'expired' => AppTheme.textDisabled,
      _ => AppTheme.textMuted,
    };

    final giveVal = (tx.giveTotal ?? 0) / 100;
    final recvVal = (tx.recvTotal ?? 0) / 100;

    return GestureDetector(
      onTap: onToggle,
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        decoration: AppTheme.glass(radius: AppTheme.r12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.swap_horiz, color: AppTheme.warning, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tx.marketHashName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTheme.bodySmall.copyWith(
                              fontWeight: FontWeight.w500,
                              color: AppTheme.textPrimary),
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Text(
                              '${tx.giveCount ?? 0}→${tx.recvCount ?? 0}',
                              style: AppTheme.captionSmall.copyWith(
                                  color: AppTheme.textMuted),
                            ),
                            const SizedBox(width: 8),
                            Icon(
                              diff >= 0 ? Icons.trending_up : Icons.trending_down,
                              size: 12,
                              color: diffColor,
                            ),
                            const SizedBox(width: 2),
                            Text(
                              '${currency.formatWithSign(diff / 100)} (${pct.toStringAsFixed(1)}%)',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: diffColor,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  TransactionTypeBadge(label: tx.tradeStatus ?? 'trade', color: statusColor),
                  const SizedBox(width: 6),
                  Icon(
                    expanded ? Icons.expand_less : Icons.expand_more,
                    size: 18,
                    color: AppTheme.textDisabled,
                  ),
                ],
              ),

              if (expanded) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TradeValueBox(
                        label: 'GAVE',
                        count: tx.giveCount ?? 0,
                        value: giveVal,
                        color: AppTheme.loss,
                        currency: currency,
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: Icon(Icons.arrow_forward, size: 16, color: AppTheme.textDisabled),
                    ),
                    Expanded(
                      child: TradeValueBox(
                        label: 'GOT',
                        count: tx.recvCount ?? 0,
                        value: recvVal,
                        color: AppTheme.profit,
                        currency: currency,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      verdict ?? '',
                      style: TextStyle(
                        fontSize: 12,
                        fontStyle: FontStyle.italic,
                        color: diffColor.withValues(alpha: 0.7),
                      ),
                    ),
                    const Spacer(),
                    Text(
                      DateFormat('dd.MM.yyyy HH:mm').format(tx.date.toLocal()),
                      style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
                    ),
                  ],
                ),
              ] else ...[
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: Text(
                      DateFormat('dd.MM.yyyy HH:mm').format(tx.date.toLocal()),
                      style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class PriceCheckSheet extends StatelessWidget {
  final TransactionItem tx;
  final CurrencyInfo currency;
  final double currentPrice;

  const PriceCheckSheet({
    super.key,
    required this.tx,
    required this.currency,
    required this.currentPrice,
  });

  @override
  Widget build(BuildContext context) {
    final txPrice = tx.priceUsd;
    final diff = currentPrice - txPrice;
    final pct = txPrice > 0 ? (diff / txPrice) * 100 : 0.0;
    final isUp = diff >= 0;
    final diffColor = isUp ? AppTheme.profit : AppTheme.loss;

    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (tx.imageUrl != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Image.network(tx.imageUrl!, height: 80, fit: BoxFit.contain),
            ),
          Text(
            tx.marketHashName,
            style: AppTheme.title,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              TransactionPriceColumn(
                label: '${tx.isBuy ? "Bought" : "Sold"} for',
                price: txPrice,
                color: AppTheme.textSecondary,
                currency: currency,
              ),
              Icon(Icons.arrow_forward, color: AppTheme.textDisabled, size: 20),
              TransactionPriceColumn(
                label: 'Current price',
                price: currentPrice,
                color: AppTheme.textPrimary,
                currency: currency,
              ),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: diffColor.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: diffColor.withValues(alpha: 0.15)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  isUp ? Icons.trending_up : Icons.trending_down,
                  color: diffColor,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  '${currency.formatWithSign(diff)} (${pct.toStringAsFixed(1)}%)',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: diffColor,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
