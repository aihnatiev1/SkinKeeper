import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../sell_provider.dart';
import 'fee_breakdown.dart';

/// Custom price input card shown when user taps "Sell" (custom) on the
/// quick-sell sheet. Renders currency toggle (when wallet is not USD),
/// optional USD-conversion warning, the number field, a live fee breakdown
/// and the final List button.
class SellSheetCustomPriceInput extends StatelessWidget {
  final int count;
  final String currencySymbol;
  final int walletCurrencyId;
  final String walletCurrencyCode;
  final TextEditingController controller;
  final bool customPriceInUsd;
  final int? customPriceCents;
  final bool isSelling;
  final ValueChanged<String> onPriceChanged;
  final ValueChanged<bool> onUsdToggle;
  final void Function(int sellerReceivesCents, int priceCurrencyId) onList;

  const SellSheetCustomPriceInput({
    super.key,
    required this.count,
    required this.currencySymbol,
    required this.walletCurrencyId,
    required this.walletCurrencyCode,
    required this.controller,
    required this.customPriceInUsd,
    required this.customPriceCents,
    required this.isSelling,
    required this.onPriceChanged,
    required this.onUsdToggle,
    required this.onList,
  });

  @override
  Widget build(BuildContext context) {
    final isWalletUsd = walletCurrencyId == 1;
    final activeSymbol = customPriceInUsd ? '\$' : currencySymbol;
    final activeCurrencyId = customPriceInUsd ? 1 : walletCurrencyId;

    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!isWalletUsd)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Expanded(
                    child: _CurrencyToggleButton(
                      label: walletCurrencyCode,
                      symbol: currencySymbol,
                      isActive: !customPriceInUsd,
                      onTap: () => onUsdToggle(false),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _CurrencyToggleButton(
                      label: 'USD',
                      symbol: '\$',
                      isActive: customPriceInUsd,
                      onTap: () => onUsdToggle(true),
                    ),
                  ),
                ],
              ),
            ),

          if (customPriceInUsd && !isWalletUsd)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppTheme.warning.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppTheme.warning.withValues(alpha: 0.25)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.currency_exchange,
                        color: AppTheme.warning, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Your Steam wallet is $walletCurrencyCode. USD price will be converted — actual listing may differ slightly.',
                        style: AppTheme.captionSmall.copyWith(
                          color: AppTheme.warning,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

          TextField(
            controller: controller,
            onChanged: onPriceChanged,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'^\d*[.,]?\d{0,2}')),
              TextInputFormatter.withFunction((oldValue, newValue) {
                return newValue.copyWith(text: newValue.text.replaceAll(',', '.'));
              }),
            ],
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
            decoration: InputDecoration(
              prefixText: '$activeSymbol ',
              prefixStyle: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textSecondary,
              ),
              hintText: '0.00',
              hintStyle: TextStyle(color: AppTheme.textDisabled),
              filled: true,
              fillColor: AppTheme.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.r12),
                borderSide: BorderSide(color: AppTheme.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.r12),
                borderSide: BorderSide(color: AppTheme.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.r12),
                borderSide: const BorderSide(color: AppTheme.primary),
              ),
              contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16, vertical: 14),
            ),
          ),
          const SizedBox(height: 10),

          if (customPriceCents != null && customPriceCents! > 0) ...[
            FeeBreakdown(
              sellerReceivesCents: customPriceCents!,
              fromBuyerPays: true,
              compact: false,
              currency: CurrencyInfo(code: walletCurrencyCode, symbol: activeSymbol, rate: 1.0),
            ),
            const SizedBox(height: 12),
          ],

          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: customPriceCents != null && customPriceCents! > 0 && !isSelling
                  ? () {
                      final fees = calculateFeesFromBuyerPays(customPriceCents!);
                      onList(fees.sellerReceivesCents, activeCurrencyId);
                    }
                  : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                disabledBackgroundColor: AppTheme.primary.withValues(alpha: 0.25),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.r16),
                ),
                elevation: 0,
              ),
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  customPriceCents != null && customPriceCents! > 0
                      ? count == 1
                          ? 'List at $activeSymbol${(customPriceCents! / 100).toStringAsFixed(2)}'
                          : 'List $count at $activeSymbol${(customPriceCents! / 100).toStringAsFixed(2)} each'
                      : 'Enter a price',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CurrencyToggleButton extends StatelessWidget {
  final String label;
  final String symbol;
  final bool isActive;
  final VoidCallback onTap;

  const _CurrencyToggleButton({
    required this.label,
    required this.symbol,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? AppTheme.primary.withValues(alpha: 0.15) : AppTheme.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isActive ? AppTheme.primary : AppTheme.border,
            width: isActive ? 1.5 : 1,
          ),
        ),
        child: Center(
          child: Text(
            '$symbol $label',
            style: TextStyle(
              fontSize: 14,
              fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
              color: isActive ? AppTheme.primary : AppTheme.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}
