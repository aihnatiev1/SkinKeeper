import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';
import 'bulk_sell_quantity_sheet.dart';

class BulkSellSheetHeader extends StatelessWidget {
  final BulkSellItemGroup group;
  final CurrencyInfo currency;
  final double price;

  const BulkSellSheetHeader({
    super.key,
    required this.group,
    required this.currency,
    required this.price,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.r8),
            child: Container(
              width: 48,
              height: 48,
              color: AppTheme.surface,
              child: group.fullIconUrl.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: group.fullIconUrl,
                      fit: BoxFit.contain,
                    )
                  : const Icon(Icons.image_not_supported,
                      color: AppTheme.textDisabled),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  group.displayName,
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (price > 0)
                  Text(
                    '${currency.format(price)} each',
                    style: const TextStyle(
                        fontSize: 12, color: AppTheme.textMuted),
                  ),
              ],
            ),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppTheme.warning.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              'x${group.count}',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppTheme.warning,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class BulkSellSliderSection extends StatelessWidget {
  final int quantity;
  final int max;
  final ValueChanged<int> onChanged;

  const BulkSellSliderSection({
    super.key,
    required this.quantity,
    required this.max,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _QtyCircleBtn(
                icon: Icons.remove_rounded,
                enabled: quantity > 0,
                onTap: () {
                  HapticFeedback.selectionClick();
                  onChanged(quantity - 1);
                },
              ),
              const SizedBox(width: 20),
              Text(
                '$quantity',
                style: const TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  letterSpacing: -1,
                ),
              ),
              const SizedBox(width: 20),
              _QtyCircleBtn(
                icon: Icons.add_rounded,
                enabled: quantity < max,
                onTap: () {
                  HapticFeedback.selectionClick();
                  onChanged(quantity + 1);
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (max > 2)
            SliderTheme(
              data: SliderThemeData(
                activeTrackColor: AppTheme.warning,
                inactiveTrackColor: AppTheme.warning.withValues(alpha: 0.15),
                thumbColor: AppTheme.warning,
                overlayColor: AppTheme.warning.withValues(alpha: 0.12),
                trackHeight: 4,
                thumbShape:
                    const RoundSliderThumbShape(enabledThumbRadius: 8),
              ),
              child: Slider(
                value: quantity.toDouble(),
                min: 0,
                max: max.toDouble(),
                divisions: max,
                onChanged: (v) {
                  final newQty = v.round();
                  if (newQty != quantity) {
                    HapticFeedback.selectionClick();
                    onChanged(newQty);
                  }
                },
              ),
            ),
          if (max > 3)
            Padding(
              padding: const EdgeInsets.only(top: 4, bottom: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _QuickBtn(
                    label: '0',
                    selected: quantity == 0,
                    onTap: () => onChanged(0),
                  ),
                  if (max >= 10)
                    _QuickBtn(
                      label: '${max ~/ 4}',
                      selected: quantity == max ~/ 4,
                      onTap: () => onChanged(max ~/ 4),
                    ),
                  if (max >= 4)
                    _QuickBtn(
                      label: '${max ~/ 2}',
                      selected: quantity == max ~/ 2,
                      onTap: () => onChanged(max ~/ 2),
                    ),
                  _QuickBtn(
                    label: 'All ($max)',
                    selected: quantity == max,
                    onTap: () => onChanged(max),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class BulkSellManualList extends StatelessWidget {
  final List<InventoryItem> items;
  final Set<String> manualSelected;
  final int max;
  final CurrencyInfo currency;
  final VoidCallback onToggleSelectAll;
  final ValueChanged<String> onToggleItem;

  const BulkSellManualList({
    super.key,
    required this.items,
    required this.manualSelected,
    required this.max,
    required this.currency,
    required this.onToggleSelectAll,
    required this.onToggleItem,
  });

  @override
  Widget build(BuildContext context) {
    final sorted = List<InventoryItem>.from(items)
      ..sort((a, b) => (a.floatValue ?? 999).compareTo(b.floatValue ?? 999));

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            children: [
              Text(
                '${manualSelected.length} selected',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.warning,
                ),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  onToggleSelectAll();
                },
                child: Text(
                  manualSelected.length == max ||
                          manualSelected.length == sorted.length
                      ? 'Clear all'
                      : 'Select all',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.warning.withValues(alpha: 0.8),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 280),
          child: ListView.separated(
            shrinkWrap: true,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            itemCount: sorted.length,
            separatorBuilder: (_, _) =>
                Divider(height: 1, color: AppTheme.border),
            itemBuilder: (_, index) {
              final item = sorted[index];
              final selected = manualSelected.contains(item.assetId);
              final atLimit = !selected && manualSelected.length >= max;

              return InkWell(
                onTap: atLimit && !selected
                    ? null
                    : () {
                        HapticFeedback.selectionClick();
                        onToggleItem(item.assetId);
                      },
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
                  child: Row(
                    children: [
                      Icon(
                        selected
                            ? Icons.check_circle_rounded
                            : Icons.circle_outlined,
                        size: 20,
                        color: selected
                            ? AppTheme.warning
                            : atLimit
                                ? AppTheme.textDisabled.withValues(alpha: 0.3)
                                : AppTheme.textDisabled,
                      ),
                      const SizedBox(width: 10),
                      if (item.floatValue != null)
                        Expanded(
                          child: Text(
                            item.floatValue!.toStringAsFixed(8),
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: selected
                                  ? FontWeight.w600
                                  : FontWeight.normal,
                              fontFamily: 'monospace',
                              color: selected
                                  ? Colors.white
                                  : atLimit
                                      ? AppTheme.textDisabled
                                      : AppTheme.textSecondary,
                            ),
                          ),
                        )
                      else
                        Expanded(
                          child: Text(
                            '#${item.assetId.length > 6 ? item.assetId.substring(item.assetId.length - 6) : item.assetId}',
                            style: TextStyle(
                              fontSize: 13,
                              color: atLimit
                                  ? AppTheme.textDisabled
                                  : AppTheme.textSecondary,
                            ),
                          ),
                        ),
                      if (item.steamPrice != null)
                        Text(
                          currency.format(item.steamPrice!),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: selected ? Colors.white : AppTheme.textMuted,
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class BulkSellTotalsBar extends StatelessWidget {
  final double price;
  final double totalPrice;
  final int selectedCount;
  final CurrencyInfo currency;
  final VoidCallback onConfirm;

  const BulkSellTotalsBar({
    super.key,
    required this.price,
    required this.totalPrice,
    required this.selectedCount,
    required this.currency,
    required this.onConfirm,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      child: Row(
        children: [
          if (price > 0)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Total value',
                  style:
                      TextStyle(fontSize: 11, color: AppTheme.textMuted),
                ),
                Text(
                  '~${currency.format(totalPrice)}',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          const Spacer(),
          GestureDetector(
            onTap: onConfirm,
            child: Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 24, vertical: 12),
              decoration: BoxDecoration(
                color: AppTheme.warning,
                borderRadius: BorderRadius.circular(AppTheme.r12),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.warning.withValues(alpha: 0.3),
                    blurRadius: 10,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Text(
                selectedCount == 0 ? 'Clear' : 'Select $selectedCount',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: Colors.black,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _QtyCircleBtn extends StatelessWidget {
  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;

  const _QtyCircleBtn({
    required this.icon,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: enabled
              ? AppTheme.warning.withValues(alpha: 0.15)
              : AppTheme.surface,
          shape: BoxShape.circle,
          border: Border.all(
            color: enabled
                ? AppTheme.warning.withValues(alpha: 0.3)
                : AppTheme.border,
          ),
        ),
        child: Icon(
          icon,
          size: 20,
          color: enabled ? AppTheme.warning : AppTheme.textDisabled,
        ),
      ),
    );
  }
}

class _QuickBtn extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _QuickBtn({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected
                ? AppTheme.warning.withValues(alpha: 0.15)
                : AppTheme.surface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: selected
                  ? AppTheme.warning.withValues(alpha: 0.4)
                  : AppTheme.border,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              color: selected ? AppTheme.warning : AppTheme.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}
