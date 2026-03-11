import 'package:flutter/material.dart';
import '../core/settings_provider.dart';
import '../core/theme.dart';

/// Consistent price display widget with currency formatting,
/// optional profit/loss coloring, and tabular figures.
class PriceText extends StatelessWidget {
  final double? price;
  final CurrencyInfo? currency;
  final double fontSize;
  final FontWeight fontWeight;
  final Color? color;
  final bool showSign;
  final bool profitLossColor;
  final String placeholder;

  const PriceText({
    super.key,
    required this.price,
    this.currency,
    this.fontSize = 14,
    this.fontWeight = FontWeight.w600,
    this.color,
    this.showSign = false,
    this.profitLossColor = false,
    this.placeholder = '\u2014',
  });

  /// Convenience: large display price
  const PriceText.large({
    super.key,
    required this.price,
    this.currency,
    this.fontSize = 28,
    this.fontWeight = FontWeight.w800,
    this.color,
    this.showSign = false,
    this.profitLossColor = false,
    this.placeholder = '\u2014',
  });

  /// Convenience: profit/loss colored price
  const PriceText.pl({
    super.key,
    required this.price,
    this.currency,
    this.fontSize = 14,
    this.fontWeight = FontWeight.w600,
    this.color,
    this.showSign = true,
    this.profitLossColor = true,
    this.placeholder = '\u2014',
  });

  @override
  Widget build(BuildContext context) {
    if (price == null) {
      return Text(
        placeholder,
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: fontWeight,
          color: AppTheme.textDisabled,
        ),
      );
    }

    final effectiveColor = profitLossColor
        ? AppTheme.plColor(price!)
        : color ?? AppTheme.textPrimary;

    final text = showSign
        ? (currency?.formatWithSign(price!) ??
            '${price! >= 0 ? '+' : ''}\$${price!.abs().toStringAsFixed(2)}')
        : (currency?.format(price!) ??
            '\$${price!.toStringAsFixed(2)}');

    return Text(
      text,
      style: TextStyle(
        fontSize: fontSize,
        fontWeight: fontWeight,
        color: effectiveColor,
        fontFeatures: const [FontFeature.tabularFigures()],
        letterSpacing: fontSize >= 24 ? -0.5 : 0,
      ),
    );
  }
}
