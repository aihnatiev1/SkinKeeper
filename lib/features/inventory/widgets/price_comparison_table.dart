import 'package:flutter/material.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';

const _sourceDisplayNames = <String, String>{
  'steam': 'Steam Market',
  'skinport': 'Skinport',
  'csfloat': 'CSFloat',
  'dmarket': 'DMarket',
  'buff': 'Buff163',
  'buff_bid': 'Buff163 Buy Order',
  'bitskins': 'BitSkins',
  'csmoney': 'CS.Money',
  'youpin': 'YouPin',
  'lisskins': 'Lisskins',
};

const _sourceColors = <String, Color>{
  'steam': AppTheme.steamBlue,
  'skinport': AppTheme.skinportGreen,
  'csfloat': AppTheme.csfloatOrange,
  'dmarket': AppTheme.dmarketPurple,
  'buff': AppTheme.buffYellow,
  'buff_bid': AppTheme.buffBidYellowDim,
  'bitskins': AppTheme.bitskinsRed,
  'csmoney': AppTheme.csmoneyTeal,
  'youpin': AppTheme.youpinPink,
  'lisskins': AppTheme.lisskinsLime,
};

String sourceDisplayName(String source) =>
    _sourceDisplayNames[source] ?? source;

Color sourceColor(String source) =>
    _sourceColors[source] ?? AppTheme.textDisabled;

class PriceComparisonTable extends StatelessWidget {
  final Map<String, double> prices;
  final CurrencyInfo? currency;

  const PriceComparisonTable({super.key, required this.prices, this.currency});

  @override
  Widget build(BuildContext context) {
    if (prices.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(AppTheme.s24),
        decoration: AppTheme.glass(),
        child: Center(
          child: Text('No prices available', style: AppTheme.bodySmall),
        ),
      );
    }

    // Steam price already shown on card — only show other sources
    final sorted = prices.entries
        .where((e) => e.key != 'steam')
        .toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    if (sorted.isEmpty) return const SizedBox.shrink();

    final bestSource = sorted.first.key;

    return Container(
      decoration: AppTheme.glass(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppTheme.s16,
              AppTheme.s14,
              AppTheme.s16,
              AppTheme.s8,
            ),
            child: Text('CROSS-MARKET PRICES', style: AppTheme.label),
          ),
          ...sorted.map((entry) {
            final isBest = entry.key == bestSource;
            return _PriceRow(
              source: entry.key,
              price: entry.value,
              isBest: isBest,
              currency: currency,
            );
          }),
          const SizedBox(height: AppTheme.s8),
        ],
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  final String source;
  final double price;
  final bool isBest;
  final CurrencyInfo? currency;

  const _PriceRow({
    required this.source,
    required this.price,
    required this.isBest,
    this.currency,
  });

  @override
  Widget build(BuildContext context) {
    final color = sourceColor(source);

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.s16,
        vertical: AppTheme.s10,
      ),
      decoration: isBest
          ? BoxDecoration(
              color: color.withValues(alpha: 0.06),
              border: Border(
                left: BorderSide(color: color, width: 3),
              ),
            )
          : null,
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: isBest
                  ? [BoxShadow(color: color.withValues(alpha: 0.4), blurRadius: 6)]
                  : null,
            ),
          ),
          const SizedBox(width: AppTheme.s12),
          Expanded(
            child: Text(
              sourceDisplayName(source),
              style: TextStyle(
                fontSize: 14,
                fontWeight: isBest ? FontWeight.w600 : FontWeight.w400,
                color: isBest ? AppTheme.textPrimary : AppTheme.textSecondary,
              ),
            ),
          ),
          if (isBest)
            Container(
              margin: const EdgeInsets.only(right: AppTheme.s10),
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(AppTheme.r6),
                border: Border.all(color: color.withValues(alpha: 0.2)),
              ),
              child: Text(
                'BEST',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: color,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          Text(
            currency?.format(price) ?? '\$${price.toStringAsFixed(2)}',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              fontFeatures: const [FontFeature.tabularFigures()],
              color: isBest ? AppTheme.accent : AppTheme.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}
