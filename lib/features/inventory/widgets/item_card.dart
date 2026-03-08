import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../models/inventory_item.dart';
class ItemCard extends StatelessWidget {
  final InventoryItem item;
  final bool compact;
  final VoidCallback? onTap;

  const ItemCard({
    super.key,
    required this.item,
    this.compact = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final rarityColor = item.rarityColor != null
        ? Color(int.parse('FF${item.rarityColor}', radix: 16))
        : Colors.grey;

    return GestureDetector(
      onTap: onTap,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(height: 3, color: rarityColor),
            Expanded(
              child: Padding(
                padding: EdgeInsets.all(compact ? 4 : 8),
                child: CachedNetworkImage(
                  imageUrl: item.fullIconUrl,
                  fit: BoxFit.contain,
                  placeholder: (_, _) => const Center(
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                  errorWidget: (_, _, _) =>
                      const Icon(Icons.image_not_supported, size: 24),
                ),
              ),
            ),
            if (!compact)
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      item.weaponName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 11, color: Colors.white54),
                    ),
                    const SizedBox(height: 4),
                    if (item.steamPrice != null)
                      Text(
                        '\$${item.steamPrice!.toStringAsFixed(2)}',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).colorScheme.secondary,
                        ),
                      ),
                  ],
                ),
              ),
            if (compact && item.steamPrice != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  '\$${item.steamPrice!.toStringAsFixed(2)}',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.secondary,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
