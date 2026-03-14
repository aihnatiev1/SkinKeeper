import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';
import '../inventory_provider.dart';
import 'wear_bar.dart';

class GroupExpandSheet extends StatelessWidget {
  final ItemGroup group;
  final CurrencyInfo? currency;

  const GroupExpandSheet({super.key, required this.group, this.currency});

  @override
  Widget build(BuildContext context) {
    final rep = group.representative;
    final rarityColor = rep.rarityColor != null
        ? Color(int.parse('FF${rep.rarityColor}', radix: 16))
        : Colors.grey;

    return GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      behavior: HitTestBehavior.opaque,
      child: DraggableScrollableSheet(
        initialChildSize: 0.5,
        minChildSize: 0.3,
        maxChildSize: 0.85,
        builder: (context, scrollController) {
          return GestureDetector(
            onTap: () {}, // absorb taps on the sheet itself
            child: Container(
          decoration: BoxDecoration(
            color: AppTheme.bgSecondary,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(AppTheme.r20)),
            border: Border(
              top: BorderSide(color: rarityColor.withValues(alpha: 0.5), width: 2),
            ),
          ),
          child: Column(
            children: [
              // Drag handle
              Container(
                margin: const EdgeInsets.only(top: 10, bottom: 8),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.textDisabled,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              // Header
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Row(
                  children: [
                    // Item image
                    SizedBox(
                      width: 48,
                      height: 48,
                      child: rep.fullIconUrl.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: rep.fullIconUrl,
                              fit: BoxFit.contain,
                            )
                          : const Icon(Icons.image_not_supported,
                              color: AppTheme.textDisabled),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            rep.displayName,
                            style: AppTheme.title,
                          ),
                          Text(
                            rep.weaponName,
                            style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted),
                          ),
                        ],
                      ),
                    ),
                    // Count + total value
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppTheme.warning,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            'x${group.count}',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              color: Colors.black,
                            ),
                          ),
                        ),
                        const SizedBox(height: 4),
                        if (group.bestPrice != null)
                          Text(
                            currency?.format(group.totalValue) ?? '\$${group.totalValue.toStringAsFixed(2)}',
                            style: AppTheme.bodySmall,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 4),
              Divider(color: AppTheme.divider, height: 1),
              // Items list
              Expanded(
                child: ListView.separated(
                  controller: scrollController,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  itemCount: group.items.length,
                  separatorBuilder: (_, _) =>
                      Divider(color: AppTheme.divider, height: 1),
                  itemBuilder: (context, index) {
                    final item = group.items[index];
                    return _GroupItemTile(
                      item: item,
                      currency: currency,
                      onTap: () {
                        HapticFeedback.selectionClick();
                        Navigator.of(context).pop();
                        context.push('/inventory/item-detail', extra: item);
                      },
                    );
                  },
                ),
              ),
            ],
          ),
          ),
          );
        },
      ),
    );
  }
}

class _GroupItemTile extends StatelessWidget {
  final InventoryItem item;
  final CurrencyInfo? currency;
  final VoidCallback onTap;

  const _GroupItemTile({required this.item, this.currency, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          children: [
            // Small icon
            SizedBox(
              width: 40,
              height: 40,
              child: item.fullIconUrl.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: item.fullIconUrl,
                      fit: BoxFit.contain,
                    )
                  : const SizedBox.shrink(),
            ),
            const SizedBox(width: 12),
            // Float + wear
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (item.floatValue != null) ...[
                    WearBar(floatValue: item.floatValue!, height: 16),
                    const SizedBox(height: 4),
                  ] else if (item.wear != null)
                    Text(
                      item.wear!,
                      style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted),
                    ),
                  if (item.floatValue == null && item.wear == null)
                    Text(
                      'Asset: ${item.assetId}',
                      style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
                    ),
                  // Stickers & charms summary
                  if (item.stickers.isNotEmpty || item.charms.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Row(
                        children: [
                          if (item.stickers.isNotEmpty) ...[
                            Icon(Icons.sticky_note_2,
                                size: 12, color: AppTheme.warning.withValues(alpha: 0.7)),
                            const SizedBox(width: 2),
                            Text(
                              '${item.stickers.length}',
                              style: TextStyle(
                                  fontSize: 10,
                                  color: AppTheme.warning.withValues(alpha: 0.7)),
                            ),
                            const SizedBox(width: 8),
                          ],
                          if (item.charms.isNotEmpty) ...[
                            Icon(Icons.auto_awesome,
                                size: 12,
                                color: AppTheme.primaryLight.withValues(alpha: 0.7)),
                            const SizedBox(width: 2),
                            Text(
                              item.charms.map((c) => c.name).join(', '),
                              style: TextStyle(
                                  fontSize: 10,
                                  color: AppTheme.primaryLight.withValues(alpha: 0.7)),
                            ),
                          ],
                        ],
                      ),
                    ),
                ],
              ),
            ),
            // Paint seed
            if (item.paintSeed != null)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Text(
                  'Seed ${item.paintSeed}',
                  style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
                ),
              ),
            // Price
            if (item.steamPrice != null)
              Text(
                currency?.format(item.steamPrice!) ?? '\$${item.steamPrice!.toStringAsFixed(2)}',
                style: AppTheme.price,
              ),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right,
                size: 18, color: AppTheme.textDisabled),
          ],
        ),
      ),
    );
  }
}
