import 'package:flutter/material.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';
import 'price_comparison_table.dart' show sourceColor, sourceDisplayName;


// ── Best Buy / Best Sell Summary ─────────────────────────────────
class BestBuySellSummary extends StatelessWidget {
  final InventoryItem item;
  final CurrencyInfo currency;

  const BestBuySellSummary({
    super.key,required this.item, required this.currency});

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
                Text('Cheapest Buy', style: TextStyle(
                  fontSize: 12, color: AppTheme.textSecondary,
                )),
                const SizedBox(width: 6),
                Container(
                  width: 6, height: 6,
                  decoration: BoxDecoration(color: buyColor, shape: BoxShape.circle),
                ),
                const SizedBox(width: 4),
                Text(
                  sourceDisplayName(cheapest.key),
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: buyColor),
                ),
                const Spacer(),
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
class BuffSpreadWidget extends StatelessWidget {
  final double ask;
  final double bid;
  final CurrencyInfo currency;

  const BuffSpreadWidget({
    super.key,
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
