import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/trade_offer.dart';

class TradeDetailSectionHeader extends StatelessWidget {
  final String title;
  final int count;
  final Color color;

  const TradeDetailSectionHeader({
    super.key,
    required this.title,
    required this.count,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppTheme.textPrimary,
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(AppTheme.r8),
          ),
          child: Text(
            '$count',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ),
      ],
    );
  }
}

class TradeDetailItemTile extends StatelessWidget {
  final TradeOfferItem item;
  final CurrencyInfo currency;

  const TradeDetailItemTile({
    super.key,
    required this.item,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(10),
      decoration: AppTheme.glass(radius: AppTheme.r12),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(AppTheme.r8),
            ),
            child: item.fullIconUrl.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: item.fullIconUrl,
                    fit: BoxFit.contain,
                    errorWidget: (_, _, _) => const Icon(
                        Icons.image_not_supported,
                        size: 18,
                        color: AppTheme.textDisabled),
                  )
                : const Icon(Icons.image_not_supported,
                    size: 18, color: AppTheme.textDisabled),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.displayName,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (item.floatValue != null)
                  Text(
                    'FV ${item.floatValue!.toStringAsFixed(6)}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textMuted,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
              ],
            ),
          ),
          if (item.priceCents > 0)
            Text(
              currency.formatCents(item.priceCents),
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
        ],
      ),
    );
  }
}

class TradeDetailValueColumn extends StatelessWidget {
  final String label;
  final int valueCents;
  final Color color;
  final bool showSign;
  final CurrencyInfo currency;

  const TradeDetailValueColumn({
    super.key,
    required this.label,
    required this.valueCents,
    required this.color,
    this.showSign = false,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: AppTheme.textMuted,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          showSign
              ? currency.formatCentsWithSign(valueCents)
              : currency.formatCents(valueCents),
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.bold,
            color: color,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}
