import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';
import 'bulk_sell_quantity_sheet_parts.dart';

/// Groups identical inventory items (same market_hash_name) for bulk sell UI.
class BulkSellItemGroup {
  final String marketHashName;
  final String displayName;
  final String weaponName;
  final String fullIconUrl;
  final double? steamPrice;
  final double? bestPrice;
  final String? wear;
  final List<InventoryItem> items;

  BulkSellItemGroup({required this.marketHashName, required this.items})
      : displayName = _extractDisplay(marketHashName),
        weaponName = marketHashName.split(' | ').first,
        fullIconUrl = items.first.fullIconUrl,
        steamPrice = items.first.steamPrice,
        bestPrice = items.first.bestPrice,
        wear = items.first.wear;

  int get count => items.length;
  double? get estimatedPrice => steamPrice ?? bestPrice;

  static String _extractDisplay(String name) {
    final parts = name.split(' | ');
    return parts.length > 1 ? parts[1].split(' (').first : name;
  }
}

class BulkSellQuantitySheet extends StatefulWidget {
  final BulkSellItemGroup group;
  final Set<String> preSelectedIds;
  final void Function(List<String> assetIds) onConfirm;
  final CurrencyInfo currency;

  const BulkSellQuantitySheet({
    super.key,
    required this.group,
    required this.preSelectedIds,
    required this.onConfirm,
    required this.currency,
  });

  @override
  State<BulkSellQuantitySheet> createState() => _BulkSellQuantitySheetState();
}

class _BulkSellQuantitySheetState extends State<BulkSellQuantitySheet> {
  late bool _hasUniqueItems;
  late int _quantity;
  late Set<String> _manualSelected;

  int get _max => widget.group.count > 1000 ? 1000 : widget.group.count;

  @override
  void initState() {
    super.initState();
    _hasUniqueItems = widget.group.items.any((i) => i.floatValue != null);
    _manualSelected = Set<String>.from(widget.preSelectedIds);
    _quantity = widget.preSelectedIds.length;
  }

  int get _selectedCount =>
      _hasUniqueItems ? _manualSelected.length : _quantity;

  void _handleConfirm() {
    HapticFeedback.mediumImpact();
    if (_hasUniqueItems) {
      widget.onConfirm(_manualSelected.toList());
    } else {
      final ids = widget.group.items
          .take(_quantity)
          .map((i) => i.assetId)
          .toList();
      widget.onConfirm(ids);
    }
    context.pop();
  }

  void _toggleSelectAll() {
    final max = _max;
    final sortedLen = widget.group.items.length;
    setState(() {
      if (_manualSelected.length == max ||
          _manualSelected.length == sortedLen) {
        _manualSelected.clear();
      } else {
        final sorted = List<InventoryItem>.from(widget.group.items)
          ..sort(
              (a, b) => (a.floatValue ?? 999).compareTo(b.floatValue ?? 999));
        _manualSelected =
            sorted.take(max).map((i) => i.assetId).toSet();
      }
    });
  }

  void _toggleItem(String assetId) {
    setState(() {
      if (_manualSelected.contains(assetId)) {
        _manualSelected.remove(assetId);
      } else {
        _manualSelected.add(assetId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final price = widget.group.estimatedPrice ?? 0;
    final totalPrice = price * _selectedCount;

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(AppTheme.r20)),
        border: const Border(
          top: BorderSide(color: AppTheme.warning, width: 2),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 14),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textDisabled,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            BulkSellSheetHeader(
              group: widget.group,
              currency: widget.currency,
              price: price,
            ),
            const SizedBox(height: 16),
            if (_hasUniqueItems)
              BulkSellManualList(
                items: widget.group.items,
                manualSelected: _manualSelected,
                max: _max,
                currency: widget.currency,
                onToggleSelectAll: _toggleSelectAll,
                onToggleItem: _toggleItem,
              )
            else
              BulkSellSliderSection(
                quantity: _quantity,
                max: _max,
                onChanged: (v) => setState(() => _quantity = v),
              ),
            const SizedBox(height: 8),
            BulkSellTotalsBar(
              price: price,
              totalPrice: totalPrice,
              selectedCount: _selectedCount,
              currency: widget.currency,
              onConfirm: _handleConfirm,
            ),
          ],
        ),
      ),
    );
  }
}
