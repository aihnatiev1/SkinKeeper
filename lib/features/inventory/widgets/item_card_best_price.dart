import 'package:flutter/material.dart';

import '../../../core/settings_provider.dart';
import '../../../models/inventory_item.dart';
import 'price_comparison_table.dart' show sourceColor;

class BestExternalPrice extends StatelessWidget {
  final InventoryItem item;
  final CurrencyInfo? currency;

  const BestExternalPrice({super.key, required this.item, this.currency});

  @override
  Widget build(BuildContext context) {
    final external = item.prices.entries
        .where((e) => e.key != 'steam' && e.key != 'csgotrader' && e.key != 'buff_bid' && e.value > 0)
        .toList();
    if (external.isEmpty) return const SizedBox.shrink();

    external.sort((a, b) => a.value.compareTo(b.value));
    final best = external.first;
    final color = sourceColor(best.key);

    const shortNames = <String, String>{
      'buff': 'Buff',
      'skinport': 'SP',
      'csfloat': 'CSF',
      'dmarket': 'DM',
      'bitskins': 'BS',
      'csmoney': 'CSM',
      'youpin': 'YP',
      'lisskins': 'LS',
    };
    final label = shortNames[best.key] ?? best.key;
    final priceText = currency?.format(best.value) ??
        '\$${best.value.toStringAsFixed(2)}';

    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 5,
            height: 5,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 3),
          Flexible(
            child: Text(
              '$label $priceText',
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: color.withValues(alpha: 0.8),
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
