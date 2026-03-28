import 'package:flutter/material.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../sell_provider.dart';

/// Visual fee breakdown widget showing buyer pays / steam fee / CS2 fee /
/// seller receives for a given price.
class FeeBreakdown extends StatelessWidget {
  final int sellerReceivesCents;
  final bool compact;
  final WalletInfo? wallet;
  final CurrencyInfo? currency;
  final String? walletSymbol;

  const FeeBreakdown({
    super.key,
    required this.sellerReceivesCents,
    this.compact = false,
    this.wallet,
    this.currency,
    this.walletSymbol,
  });

  String _fmt(int cents) {
    // walletSymbol = already in wallet currency, no conversion needed
    if (walletSymbol != null) {
      return CurrencyInfo(code: '', symbol: walletSymbol!, rate: 1.0).formatRaw(cents / 100);
    }
    return currency?.format(cents / 100) ?? '\$${(cents / 100).toStringAsFixed(2)}';
  }

  @override
  Widget build(BuildContext context) {
    final fees = calculateFees(sellerReceivesCents);

    if (compact) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            'You receive',
            style: AppTheme.caption,
          ),
          Text(
            _fmt(fees.sellerReceivesCents),
            style: AppTheme.mono.copyWith(
              fontWeight: FontWeight.bold,
              color: AppTheme.profit,
            ),
          ),
        ],
      );
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: AppTheme.glass(radius: AppTheme.r12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _FeeRow(
            label: 'Buyer pays',
            value: _fmt(fees.buyerPaysCents),
            color: AppTheme.textPrimary,
            bold: false,
          ),
          const SizedBox(height: 6),
          _FeeRow(
            label: 'Steam fee (15%)',
            value: '-${_fmt(fees.steamFeeCents + fees.cs2FeeCents)}',
            color: AppTheme.textSecondary,
            bold: false,
          ),
          const SizedBox(height: 8),
          Container(
            height: 1,
            color: AppTheme.border,
          ),
          const SizedBox(height: 8),
          _FeeRow(
            label: 'You receive',
            value: _fmt(fees.sellerReceivesCents),
            color: AppTheme.profit,
            bold: true,
          ),
        ],
      ),
    );
  }
}

class _FeeRow extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final bool bold;

  const _FeeRow({
    required this.label,
    required this.value,
    required this.color,
    required this.bold,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            color: color,
            fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 14,
            color: color,
            fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}
