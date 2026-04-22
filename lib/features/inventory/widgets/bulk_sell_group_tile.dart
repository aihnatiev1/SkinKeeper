import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import 'bulk_sell_quantity_sheet.dart';

class BulkSellGroupTile extends ConsumerWidget {
  final BulkSellItemGroup group;
  final bool selected;
  final VoidCallback onTap;

  const BulkSellGroupTile({
    super.key,
    required this.group,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final priceStr = group.estimatedPrice != null
        ? currency.format(group.estimatedPrice!)
        : '—';

    return Column(
      children: [
        InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
            child: Row(
              children: [
                SizedBox(
                  width: 36,
                  child: Center(
                    child: selected
                        ? Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              color: AppTheme.primary,
                              borderRadius: BorderRadius.circular(5),
                            ),
                            child: const Icon(Icons.check_rounded,
                                size: 14, color: Colors.white),
                          )
                        : Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(5),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.2),
                                width: 1.5,
                              ),
                            ),
                          ),
                  ),
                ),

                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    width: 44,
                    height: 44,
                    color: AppTheme.surface,
                    child: group.fullIconUrl.isNotEmpty
                        ? CachedNetworkImage(
                            imageUrl: group.fullIconUrl,
                            fit: BoxFit.contain,
                            errorWidget: (_, _, _) => const Icon(
                                Icons.image_not_supported,
                                size: 18,
                                color: AppTheme.textDisabled),
                          )
                        : const Icon(Icons.image_not_supported,
                            size: 18, color: AppTheme.textDisabled),
                  ),
                ),
                const SizedBox(width: 10),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${group.items.first.isStatTrak ? 'ST ' : ''}${group.items.first.isSouvenir ? 'SV ' : ''}${group.displayName}',
                        style: AppTheme.bodySmall.copyWith(
                          fontWeight: FontWeight.w600,
                          color: selected
                              ? Colors.white
                              : AppTheme.textPrimary,
                        ),
                        overflow: TextOverflow.ellipsis,
                        maxLines: 1,
                      ),
                      Row(
                        children: [
                          if (group.items.first.accountName != null)
                            Container(
                              margin: const EdgeInsets.only(right: 6),
                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                              decoration: BoxDecoration(
                                color: AppTheme.primary.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(3),
                                border: Border.all(color: AppTheme.primary.withValues(alpha: 0.3), width: 0.5),
                              ),
                              child: Text(
                                group.items.first.accountName!.length > 8
                                    ? '${group.items.first.accountName!.substring(0, 8)}…'
                                    : group.items.first.accountName!,
                                style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w600, color: AppTheme.primaryLight),
                              ),
                            ),
                          Flexible(
                            child: Text(
                              group.weaponName.replaceFirst('★ ', '').replaceFirst('StatTrak™ ', '').replaceFirst('Souvenir ', ''),
                              style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted),
                              overflow: TextOverflow.ellipsis,
                              maxLines: 1,
                            ),
                          ),
                          if (group.wear != null) ...[
                            Text(' · ', style: TextStyle(color: AppTheme.textDisabled, fontSize: 10)),
                            Text(
                              group.wear!,
                              style: const TextStyle(fontSize: 10, color: AppTheme.textDisabled),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),

                if (group.count > 1) ...[
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: selected
                          ? AppTheme.warning.withValues(alpha: 0.1)
                          : Colors.white.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: selected
                            ? AppTheme.warning.withValues(alpha: 0.3)
                            : Colors.white.withValues(alpha: 0.08),
                        width: 0.5,
                      ),
                    ),
                    child: Text(
                      'x${group.count}',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: selected
                            ? AppTheme.warning
                            : AppTheme.textMuted,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                ],

                Text(
                  priceStr,
                  style: AppTheme.mono.copyWith(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.primary,
                  ),
                ),

                const SizedBox(width: 4),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
