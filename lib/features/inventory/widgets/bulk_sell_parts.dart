import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';
import 'bulk_sell_quantity_sheet.dart';

enum BulkSellSort { priceDesc, priceAsc, countDesc, nameAsc, valueDesc }

typedef BulkSellSelectedGroupEntry = ({BulkSellItemGroup group, int count});

class BulkSellAppBar extends StatelessWidget {
  final VoidCallback onBack;
  final BulkSellSort sort;
  final ValueChanged<BulkSellSort> onSortChanged;

  const BulkSellAppBar({
    super.key,
    required this.onBack,
    required this.sort,
    required this.onSortChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 16, 8, 0),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded,
                size: 20, color: AppTheme.textSecondary),
            onPressed: onBack,
          ),
          Expanded(
            child: Text(
              'Sell Multiple Items'.toUpperCase(),
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.5,
                color: AppTheme.textDisabled,
              ),
            ),
          ),
          PopupMenuButton<BulkSellSort>(
            onSelected: (s) {
              HapticFeedback.selectionClick();
              onSortChanged(s);
            },
            offset: const Offset(0, 42),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            color: const Color(0xFF1E2A48),
            elevation: 12,
            itemBuilder: (_) => {
              BulkSellSort.priceDesc: (Icons.arrow_downward_rounded, 'Price: high \u2192 low'),
              BulkSellSort.priceAsc:  (Icons.arrow_upward_rounded,   'Price: low \u2192 high'),
              BulkSellSort.countDesc: (Icons.stacked_bar_chart_rounded, 'Quantity: most first'),
              BulkSellSort.valueDesc: (Icons.account_balance_wallet_rounded, 'Total value: high \u2192 low'),
              BulkSellSort.nameAsc:   (Icons.sort_by_alpha_rounded, 'Name: A \u2192 Z'),
            }.entries.map((e) {
              final selected = e.key == sort;
              return PopupMenuItem<BulkSellSort>(
                value: e.key,
                height: 44,
                child: Row(
                  children: [
                    Icon(e.value.$1, size: 16,
                      color: selected ? AppTheme.primary : AppTheme.textMuted),
                    const SizedBox(width: 10),
                    Text(e.value.$2, style: TextStyle(
                      fontSize: 13,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      color: selected ? AppTheme.primary : Colors.white.withValues(alpha: 0.85),
                    )),
                    if (selected) ...[
                      const Spacer(),
                      Icon(Icons.check_rounded, size: 16, color: AppTheme.primary),
                    ],
                  ],
                ),
              );
            }).toList(),
            icon: const Icon(Icons.sort_rounded, size: 20, color: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }
}

class BulkSellSearchField extends StatelessWidget {
  final ValueChanged<String> onChanged;

  const BulkSellSearchField({super.key, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: TextField(
        onChanged: onChanged,
        decoration: InputDecoration(
          hintText: 'Search items...',
          prefixIcon: const Icon(Icons.search),
          filled: true,
          fillColor: AppTheme.surface,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppTheme.r12),
            borderSide: BorderSide.none,
          ),
        ),
      ),
    );
  }
}

class BulkSellSelectAllRow extends StatelessWidget {
  final bool allSelected;
  final bool anySelected;
  final int totalItems;
  final VoidCallback onToggle;

  const BulkSellSelectAllRow({
    super.key,
    required this.allSelected,
    required this.anySelected,
    required this.totalItems,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      child: Row(
        children: [
          Checkbox(
            value: allSelected ? true : (anySelected ? null : false),
            tristate: true,
            onChanged: (_) => onToggle(),
            activeColor: AppTheme.warning,
          ),
          Text(
            'Select All',
            style: AppTheme.bodySmall.copyWith(color: AppTheme.textPrimary),
          ),
          const Spacer(),
          Text(
            '$totalItems items total',
            style: AppTheme.caption,
          ),
          const SizedBox(width: 12),
        ],
      ),
    );
  }
}

class BulkSellNoPriceSheet extends StatelessWidget {
  final List<InventoryItem> noPrice;
  final List<InventoryItem> allItems;
  final void Function(List<InventoryItem> withPrice) onSellWithPrice;

  const BulkSellNoPriceSheet({
    super.key,
    required this.noPrice,
    required this.allItems,
    required this.onSellWithPrice,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36, height: 4,
            decoration: BoxDecoration(
              color: AppTheme.textDisabled,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),
          const Icon(Icons.warning_amber_rounded, color: AppTheme.warning, size: 32),
          const SizedBox(height: 10),
          Text(
            '${noPrice.length} item${noPrice.length > 1 ? 's' : ''} without Steam price',
            style: const TextStyle(
              fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'These items have no current Steam Market price. Remove them from selection or sell individually with a custom price.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 12),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 150),
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: noPrice.length,
              itemBuilder: (_, i) {
                final item = noPrice[i];
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: Image.network(item.fullIconUrl, width: 36, height: 28, fit: BoxFit.contain),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          item.marketHashName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12, color: AppTheme.textPrimary),
                        ),
                      ),
                      const Text('No price', style: TextStyle(fontSize: 11, color: AppTheme.loss)),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 44,
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AppTheme.borderLight),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Back', style: TextStyle(color: AppTheme.textSecondary)),
                  ),
                ),
              ),
              if (allItems.length > noPrice.length) ...[
                const SizedBox(width: 10),
                Expanded(
                  child: SizedBox(
                    height: 44,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.pop(context);
                        final withPrice = allItems.where((i) => i.steamPrice != null).toList();
                        onSellWithPrice(withPrice);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.warning,
                        foregroundColor: Colors.black,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: Text(
                        'Sell ${allItems.length - noPrice.length} with price',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class BulkSellSelectedItemsSheet extends ConsumerStatefulWidget {
  final List<BulkSellSelectedGroupEntry> Function() selectedProvider;
  final int Function() totalSellCount;
  final double Function() totalValue;
  final bool Function() hasSelection;
  final void Function(BulkSellItemGroup group) onRemoveGroup;

  const BulkSellSelectedItemsSheet({
    super.key,
    required this.selectedProvider,
    required this.totalSellCount,
    required this.totalValue,
    required this.hasSelection,
    required this.onRemoveGroup,
  });

  @override
  ConsumerState<BulkSellSelectedItemsSheet> createState() =>
      _BulkSellSelectedItemsSheetState();
}

class _BulkSellSelectedItemsSheetState
    extends ConsumerState<BulkSellSelectedItemsSheet> {
  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.5,
      maxChildSize: 0.8,
      minChildSize: 0.3,
      expand: false,
      builder: (_, scrollCtrl) {
        final selected = widget.selectedProvider();
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Text('${widget.totalSellCount()} items to sell', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
                  const Spacer(),
                  Text('~${ref.read(currencyProvider).format(widget.totalValue())}', style: const TextStyle(fontSize: 14, color: AppTheme.primary, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
            Expanded(
              child: ListView.builder(
                controller: scrollCtrl,
                itemCount: selected.length,
                itemBuilder: (_, i) {
                  final entry = selected[i];
                  return ListTile(
                    leading: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Container(
                        width: 36, height: 36,
                        color: AppTheme.surface,
                        child: entry.group.fullIconUrl.isNotEmpty
                            ? Image.network(entry.group.fullIconUrl, fit: BoxFit.contain)
                            : null,
                      ),
                    ),
                    title: Text(entry.group.displayName, style: const TextStyle(fontSize: 13, color: Colors.white)),
                    subtitle: Text('${entry.count} × ${ref.read(currencyProvider).format(entry.group.estimatedPrice ?? 0)}', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                    trailing: GestureDetector(
                      onTap: () {
                        widget.onRemoveGroup(entry.group);
                        setState(() {});
                        if (!widget.hasSelection()) Navigator.pop(context);
                      },
                      child: const Icon(Icons.close_rounded, size: 18, color: AppTheme.loss),
                    ),
                    dense: true,
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}
