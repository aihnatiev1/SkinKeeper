import 'package:flutter/material.dart';
import '../../../core/theme.dart';
import '../../../core/steam_image.dart';
import '../../../models/inventory_item.dart';
import 'tradeup_rarity.dart';

class TradeUpSelectedTile extends StatelessWidget {
  final InventoryItem item;
  final VoidCallback onRemove;

  const TradeUpSelectedTile({
    super.key,
    required this.item,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onRemove,
      child: Container(
        width: 52,
        margin: const EdgeInsets.only(right: 4),
        decoration: BoxDecoration(
          border: Border.all(color: rarityColors[normalizeRarity(item.rarity)] ?? AppTheme.border),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(5),
              child: Image.network(
                SteamImage.url(item.iconUrl, size: '96fx96f'),
                fit: BoxFit.cover,
                width: 52,
                height: 56,
              ),
            ),
            Positioned(
              top: 1, right: 1,
              child: Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: AppTheme.loss.withValues(alpha: 0.9),
                  borderRadius: BorderRadius.circular(3),
                ),
                child: const Icon(Icons.close, size: 10, color: Colors.white),
              ),
            ),
            if (item.floatValue != null)
              Positioned(
                bottom: 1, left: 1,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.7),
                    borderRadius: BorderRadius.circular(2),
                  ),
                  child: Text(
                    item.floatValue!.toStringAsFixed(3),
                    style: const TextStyle(fontSize: 7, color: Colors.white70),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class TradeUpStatChip extends StatelessWidget {
  final String label;
  final String value;

  const TradeUpStatChip({super.key, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
          const SizedBox(width: 4),
          Text(value, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
        ],
      ),
    );
  }
}
