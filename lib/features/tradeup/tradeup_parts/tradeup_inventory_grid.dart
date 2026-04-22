import 'package:flutter/material.dart';
import '../../../core/theme.dart';
import '../../../core/settings_provider.dart';
import '../../../core/steam_image.dart';
import '../../../models/inventory_item.dart';
import 'tradeup_rarity.dart';

class TradeUpInventoryGrid extends StatelessWidget {
  final List<InventoryItem> allItems;
  final List<InventoryItem> selected;
  final String? requiredRarity;
  final bool requiredStatTrak;
  final CurrencyInfo currency;
  final void Function(InventoryItem) onAddItem;

  const TradeUpInventoryGrid({
    super.key,
    required this.allItems,
    required this.selected,
    required this.requiredRarity,
    required this.requiredStatTrak,
    required this.currency,
    required this.onAddItem,
  });

  @override
  Widget build(BuildContext context) {
    final eligible = allItems.where(isTradeUpEligible).toList();

    final filtered = requiredRarity != null
        ? eligible.where((item) {
            final rarity = normalizeRarity(item.rarity);
            final isStatTrak = item.marketHashName.contains('StatTrak');
            return rarity == requiredRarity && isStatTrak == requiredStatTrak;
          }).toList()
        : eligible;

    filtered.sort((a, b) {
      final aIdx = rarityOrder.indexOf(normalizeRarity(a.rarity));
      final bIdx = rarityOrder.indexOf(normalizeRarity(b.rarity));
      if (aIdx != bIdx) return bIdx - aIdx;
      return (b.steamPrice ?? 0).compareTo(a.steamPrice ?? 0);
    });

    if (filtered.isEmpty) {
      return const Center(
        child: Text('No eligible items found', style: TextStyle(color: AppTheme.textMuted)),
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.all(8),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 5,
        childAspectRatio: 0.75,
        crossAxisSpacing: 4,
        mainAxisSpacing: 4,
      ),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final item = filtered[index];
        final isSelected = selected.any((s) => s.assetId == item.assetId);
        final rarity = normalizeRarity(item.rarity);
        final rarityColor = rarityColors[rarity] ?? AppTheme.textMuted;

        return GestureDetector(
          onTap: isSelected ? null : () => onAddItem(item),
          child: Opacity(
            opacity: isSelected ? 0.3 : (selected.length >= 10 ? 0.5 : 1.0),
            child: Container(
              decoration: BoxDecoration(
                color: AppTheme.card,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: isSelected ? AppTheme.profit : rarityColor.withValues(alpha: 0.3),
                  width: isSelected ? 2 : 1,
                ),
              ),
              child: Column(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(5)),
                      child: Image.network(
                        SteamImage.url(item.iconUrl, size: '128fx128f'),
                        fit: BoxFit.cover,
                        width: double.infinity,
                      ),
                    ),
                  ),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 2),
                    decoration: BoxDecoration(
                      color: rarityColor.withValues(alpha: 0.1),
                      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(5)),
                    ),
                    child: Text(
                      item.steamPrice != null ? currency.format(item.steamPrice!) : '—',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: rarityColor),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
