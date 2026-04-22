import 'package:flutter/material.dart';
import '../../../core/theme.dart';
import '../../../core/settings_provider.dart';
import '../../../models/inventory_item.dart';
import 'tradeup_rarity.dart';

class TradeUpResultsPanel extends StatelessWidget {
  final List<InventoryItem> selected;
  final double avgFloat;
  final double inputCost;
  final String? requiredRarity;
  final CurrencyInfo currency;

  const TradeUpResultsPanel({
    super.key,
    required this.selected,
    required this.avgFloat,
    required this.inputCost,
    required this.requiredRarity,
    required this.currency,
  });

  String _floatToWear(double f) {
    if (f < 0.07) return 'Factory New';
    if (f < 0.15) return 'Minimal Wear';
    if (f < 0.38) return 'Field-Tested';
    if (f < 0.45) return 'Well-Worn';
    return 'Battle-Scarred';
  }

  Color _wearColor(String wear) => switch (wear) {
    'Factory New' => const Color(0xFF4ade80),
    'Minimal Wear' => const Color(0xFF22d3ee),
    'Field-Tested' => const Color(0xFFa78bfa),
    'Well-Worn' => const Color(0xFFf97316),
    _ => const Color(0xFFef4444),
  };

  Map<String, double> _collectionProbabilities() {
    final counts = <String, int>{};
    for (final item in selected) {
      final col = item.collection?.name ?? item.marketHashName.split(' | ').first;
      counts[col] = (counts[col] ?? 0) + 1;
    }
    return counts.map((k, v) => MapEntry(k, v / selected.length));
  }

  @override
  Widget build(BuildContext context) {
    final outputWear = _floatToWear(avgFloat);
    final wearColor = _wearColor(outputWear);
    final outputRarityIdx = rarityOrder.indexOf(requiredRarity ?? '') + 1;
    final outputRarity = outputRarityIdx < rarityOrder.length
        ? rarityOrder[outputRarityIdx]
        : 'Covert';
    final outputRarityColor = rarityColors[outputRarity] ?? AppTheme.primary;

    final probs = _collectionProbabilities();

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.primary.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome, size: 14, color: AppTheme.primary),
              const SizedBox(width: 6),
              const Text('Trade-Up Outcome', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
            ],
          ),
          const SizedBox(height: 8),

          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: outputRarityColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: outputRarityColor.withValues(alpha: 0.4)),
                ),
                child: Text(
                  outputRarity,
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: outputRarityColor),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: wearColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: wearColor.withValues(alpha: 0.35)),
                ),
                child: Text(
                  outputWear,
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: wearColor),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Float ~${avgFloat.toStringAsFixed(4)}',
                style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
              ),
            ],
          ),

          if (probs.length > 1) ...[
            const SizedBox(height: 8),
            const Text('Output chances by collection:', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
            const SizedBox(height: 4),
            ...probs.entries.map((e) => Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      e.key,
                      style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${(e.value * 100).round()}%',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textPrimary),
                  ),
                ],
              ),
            )),
          ],

          const SizedBox(height: 8),
          const Divider(color: AppTheme.divider, height: 1),
          const SizedBox(height: 8),

          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Input Cost', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    Text(currency.format(inputCost), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppTheme.loss)),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward, size: 16, color: AppTheme.textMuted),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        const Text('1× ', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                        Text(outputRarity, style: TextStyle(fontSize: 10, color: outputRarityColor, fontWeight: FontWeight.w700)),
                        Text(' · $outputWear', style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                      ],
                    ),
                    const Text('Check market for price', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: null,
              icon: const Icon(Icons.open_in_new, size: 14),
              label: const Text('Execute on Desktop (GC required)'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.primary,
                side: BorderSide(color: AppTheme.primary.withValues(alpha: 0.4)),
                textStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                padding: const EdgeInsets.symmetric(vertical: 8),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
