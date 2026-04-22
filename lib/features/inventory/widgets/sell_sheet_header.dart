import 'package:flutter/material.dart';

import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';

class SellSheetHeader extends StatelessWidget {
  final List<InventoryItem> items;

  const SellSheetHeader({super.key, required this.items});

  bool get _isSingle => items.length == 1;
  bool get _allSameName =>
      items.every((i) => i.marketHashName == items.first.marketHashName);

  void _showItemList(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.bgSecondary,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.5,
        maxChildSize: 0.8,
        minChildSize: 0.3,
        expand: false,
        builder: (_, scrollCtrl) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                '${items.length} items to sell',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white),
              ),
            ),
            Expanded(
              child: ListView.builder(
                controller: scrollCtrl,
                itemCount: items.length,
                itemBuilder: (_, i) {
                  final item = items[i];
                  return ListTile(
                    leading: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Container(
                        width: 36, height: 36,
                        color: AppTheme.surface,
                        child: Image.network(item.fullIconUrl, fit: BoxFit.contain,
                            errorBuilder: (_, _, _) => const Icon(Icons.image, size: 14, color: AppTheme.textDisabled)),
                      ),
                    ),
                    title: Text(item.displayName, style: const TextStyle(fontSize: 13, color: Colors.white)),
                    subtitle: Text(item.weaponName, style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                    dense: true,
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final item = items.first;
    final count = items.length;

    if (!_isSingle && !_allSameName) {
      return GestureDetector(
        onTap: () => _showItemList(context),
        child: Row(
          children: [
            SizedBox(
              width: 56,
              height: 56,
              child: Stack(
                children: [
                  for (var i = 0; i < items.take(3).length; i++)
                    Positioned(
                      left: i * 12.0,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          width: 40,
                          height: 40,
                          color: AppTheme.surface,
                          child: Image.network(
                            items[i].fullIconUrl,
                            fit: BoxFit.contain,
                            errorBuilder: (_, _, _) => const Icon(
                                Icons.image, size: 16, color: AppTheme.textDisabled),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$count items',
                    style: AppTheme.title,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Tap to view & edit list',
                    style: AppTheme.bodySmall.copyWith(color: AppTheme.primary),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, size: 20, color: AppTheme.textMuted),
          ],
        ),
      );
    }

    return Row(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Container(
            width: 56,
            height: 56,
            color: AppTheme.surface,
            child: Image.network(
              item.fullIconUrl,
              fit: BoxFit.contain,
              errorBuilder: (_, _, _) =>
                  const Icon(Icons.image_not_supported, color: AppTheme.textDisabled),
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _isSingle
                    ? item.displayName
                    : '$count x ${item.displayName}',
                style: AppTheme.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                _isSingle ? item.weaponName : item.marketHashName,
                style: AppTheme.bodySmall,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
