import 'package:flutter/material.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';

/// Two-pill row showing sticker value on the item and — when the ratio
/// crosses 50% of the base price — an "overpay" indicator. Only used on
/// ItemDetailScreen.
class StickerValueRow extends StatelessWidget {
  final double stickerValue;
  final double? bestPrice;
  final CurrencyInfo currency;

  const StickerValueRow({
    super.key,
    required this.stickerValue,
    required this.currency,
    this.bestPrice,
  });

  @override
  Widget build(BuildContext context) {
    final overpayPct = bestPrice != null && bestPrice! > 0
        ? (stickerValue / bestPrice! * 100)
        : null;
    final isHighOverpay = overpayPct != null && overpayPct > 50;

    return Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppTheme.s10,
            vertical: AppTheme.s6,
          ),
          decoration: BoxDecoration(
            color: AppTheme.warning.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(AppTheme.r6),
            border: Border.all(
              color: AppTheme.warning.withValues(alpha: 0.2),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.auto_awesome,
                  size: 14,
                  color: AppTheme.warning.withValues(alpha: 0.8)),
              const SizedBox(width: 6),
              Text(
                'Sticker Value: ${currency.format(stickerValue)}',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.warning.withValues(alpha: 0.9),
                ),
              ),
            ],
          ),
        ),
        if (isHighOverpay)
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppTheme.s10,
              vertical: AppTheme.s6,
            ),
            decoration: BoxDecoration(
              color: AppTheme.profit.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(AppTheme.r6),
              border: Border.all(
                color: AppTheme.profit.withValues(alpha: 0.2),
              ),
            ),
            child: Text(
              'Sticker Overpay: ${overpayPct.round()}%',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppTheme.profit,
              ),
            ),
          ),
      ],
    );
  }
}
