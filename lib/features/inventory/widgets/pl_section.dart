import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../widgets/glass_sheet.dart';
import '../../../widgets/shared_ui.dart';
import '../../portfolio/portfolio_pl_provider.dart';
import '../../portfolio/widgets/add_purchase_sheet.dart';

/// P/L summary card on the ItemDetailScreen. Shows avg buy price, current
/// price, holding count, realized+unrealized profit, lifetime bought/sold
/// totals — plus an "Add Purchase" pill that opens the AddPurchaseSheet.
class PLSection extends ConsumerWidget {
  final String marketHashName;
  final String? iconUrl;

  const PLSection({super.key, required this.marketHashName, this.iconUrl});

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
              Text('PROFIT', style: AppTheme.label),
              const Spacer(),
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  showGlassSheet(
                    context,
                    AddPurchaseSheet(
                      marketHashName: marketHashName,
                      iconUrl: iconUrl,
                      ref: ref,
                    ),
                  );
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(AppTheme.r8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.add_rounded,
                          size: 14, color: AppTheme.primary),
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
              'Unrealized Profit',
              currency.formatWithSign(itemPL.unrealizedProfit),
              valueColor: AppTheme.plColor(itemPL.unrealizedProfitCents),
            ),
            _plRow(
              'Realized Profit',
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
                'No purchase data yet.\nAdd what you paid to track profit.',
                textAlign: TextAlign.center,
                style: AppTheme.bodySmall
                    .copyWith(color: AppTheme.textMuted),
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
