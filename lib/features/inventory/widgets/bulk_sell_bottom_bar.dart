import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import 'bulk_sell_quantity_sheet.dart';

typedef BulkSellSelectedEntry = ({BulkSellItemGroup group, int count});

class BulkSellBottomBar extends ConsumerWidget {
  final List<BulkSellSelectedEntry> selected;
  final bool hasSelection;
  final int totalSellCount;
  final double totalValue;
  final ValueChanged<BulkSellItemGroup> onOpenQuantitySheet;
  final ValueChanged<BulkSellItemGroup> onRemoveGroup;
  final VoidCallback onShowSelected;
  final VoidCallback? onStartSell;

  const BulkSellBottomBar({
    super.key,
    required this.selected,
    required this.hasSelection,
    required this.totalSellCount,
    required this.totalValue,
    required this.onOpenQuantitySheet,
    required this.onRemoveGroup,
    required this.onShowSelected,
    required this.onStartSell,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.only(
        top: 10,
        bottom: 10,
      ),
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        border: Border(top: BorderSide(color: AppTheme.border)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (hasSelection) SizedBox(
            height: 62,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: selected.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final entry = selected[i];
                return GestureDetector(
                  onTap: () => onOpenQuantitySheet(entry.group),
                  child: Container(
                    width: 56,
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: AppTheme.warning.withValues(alpha: 0.25),
                      ),
                    ),
                    child: Stack(
                      children: [
                        Center(
                          child: Padding(
                            padding: const EdgeInsets.all(4),
                            child: entry.group.fullIconUrl.isNotEmpty
                                ? CachedNetworkImage(
                                    imageUrl: entry.group.fullIconUrl,
                                    fit: BoxFit.contain,
                                  )
                                : const Icon(Icons.image_not_supported,
                                    size: 16, color: AppTheme.textDisabled),
                          ),
                        ),
                        if (entry.count > 1)
                          Positioned(
                            right: 2,
                            top: 2,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 4, vertical: 1),
                              decoration: BoxDecoration(
                                color: AppTheme.warning,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                '${entry.count}',
                                style: const TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.black,
                                ),
                              ),
                            ),
                          ),
                        Positioned(
                          left: 2,
                          top: 2,
                          child: GestureDetector(
                            onTap: () {
                              HapticFeedback.selectionClick();
                              onRemoveGroup(entry.group);
                            },
                            child: Container(
                              width: 16,
                              height: 16,
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.6),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.close,
                                  size: 10, color: AppTheme.textSecondary),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          if (hasSelection) const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: hasSelection ? onShowSelected : null,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Text(
                              hasSelection
                                  ? 'Selling $totalSellCount items'
                                  : 'Select items to sell',
                              style: AppTheme.title,
                            ),
                            if (hasSelection) ...[
                              const SizedBox(width: 4),
                              Icon(Icons.expand_less_rounded, size: 16, color: AppTheme.textMuted),
                            ],
                          ],
                        ),
                        if (hasSelection)
                          Text(
                            '~${ref.watch(currencyProvider).format(totalValue)}',
                            style: AppTheme.mono.copyWith(
                              fontSize: 13,
                              color: AppTheme.primary,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                SizedBox(
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: onStartSell,
                    icon: const Icon(Icons.sell, size: 18),
                    label: const Text(
                      'Quick Sell',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.warning,
                      foregroundColor: Colors.black,
                      disabledBackgroundColor: AppTheme.warning.withValues(alpha: 0.15),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppTheme.r16),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      elevation: 0,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
