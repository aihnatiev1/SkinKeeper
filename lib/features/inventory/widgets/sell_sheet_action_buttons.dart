import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme.dart';

class SellSheetQuickSellButtons extends StatelessWidget {
  final int count;
  final String priceStr;
  final String totalStr;
  final bool isSelling;
  final bool showCustomPrice;
  final VoidCallback onQuickSell;
  final VoidCallback onToggleCustomPrice;

  const SellSheetQuickSellButtons({
    super.key,
    required this.count,
    required this.priceStr,
    required this.totalStr,
    required this.isSelling,
    required this.showCustomPrice,
    required this.onQuickSell,
    required this.onToggleCustomPrice,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          flex: 4,
          child: SizedBox(
            height: 48,
            child: ElevatedButton(
              onPressed: isSelling ? null : onQuickSell,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.warning,
                foregroundColor: Colors.black,
                disabledBackgroundColor: AppTheme.surface,
                disabledForegroundColor: AppTheme.textDisabled,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.r16),
                ),
                elevation: 0,
              ),
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: count == 1 ? 'Quick Sell ' : 'Quick Sell All ',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                    ),
                    TextSpan(
                      text: count == 1 ? priceStr : totalStr,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Colors.black.withValues(alpha: 0.7),
                      ),
                    ),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          flex: 2,
          child: SizedBox(
            height: 48,
            child: OutlinedButton(
              onPressed: () {
                HapticFeedback.selectionClick();
                onToggleCustomPrice();
              },
              style: OutlinedButton.styleFrom(
                side: BorderSide(
                  color: showCustomPrice
                      ? AppTheme.primary
                      : AppTheme.textDisabled,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.r16),
                ),
              ),
              child: Text(
                'Sell',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: showCustomPrice
                      ? AppTheme.primary
                      : AppTheme.textSecondary,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class SellSheetNoPriceButtons extends StatelessWidget {
  final String? marketUrl;
  final VoidCallback onShowCustomPrice;

  const SellSheetNoPriceButtons({
    super.key,
    required this.marketUrl,
    required this.onShowCustomPrice,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (marketUrl != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SizedBox(
              width: double.infinity,
              height: 48,
              child: OutlinedButton.icon(
                onPressed: () => launchUrl(Uri.parse(marketUrl!),
                    mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.open_in_new, size: 16),
                label: const Text('Check Price on Steam Market'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppTheme.steamBlue,
                  side: BorderSide(color: AppTheme.steamBlue.withValues(alpha: 0.4)),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.r16),
                  ),
                  textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: ElevatedButton(
            onPressed: () {
              HapticFeedback.selectionClick();
              onShowCustomPrice();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppTheme.r16),
              ),
              elevation: 0,
            ),
            child: const Text(
              'Sell at Custom Price',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
          ),
        ),
      ],
    );
  }
}
