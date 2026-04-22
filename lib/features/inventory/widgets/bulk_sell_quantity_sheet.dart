import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';

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

            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppTheme.r8),
                    child: Container(
                      width: 48,
                      height: 48,
                      color: AppTheme.surface,
                      child: widget.group.fullIconUrl.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: widget.group.fullIconUrl,
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
                          widget.group.displayName,
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w600),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (price > 0)
                          Text(
                            '${widget.currency.format(price)} each',
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
                      'x${widget.group.count}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.warning,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            if (_hasUniqueItems) _buildManualList() else _buildSlider(),

            const SizedBox(height: 8),

            Padding(
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
                          '~${widget.currency.format(totalPrice)}',
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
                    onTap: () {
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
                    },
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
                        _selectedCount == 0 ? 'Clear' : 'Select $_selectedCount',
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
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSlider() {
    final max = _max;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _QtyCircleBtn(
                icon: Icons.remove_rounded,
                enabled: _quantity > 0,
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _quantity--);
                },
              ),
              const SizedBox(width: 20),
              Text(
                '$_quantity',
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
                enabled: _quantity < max,
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _quantity++);
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
                value: _quantity.toDouble(),
                min: 0,
                max: max.toDouble(),
                divisions: max,
                onChanged: (v) {
                  final newQty = v.round();
                  if (newQty != _quantity) {
                    HapticFeedback.selectionClick();
                    setState(() => _quantity = newQty);
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
                    selected: _quantity == 0,
                    onTap: () => setState(() => _quantity = 0),
                  ),
                  if (max >= 10)
                    _QuickBtn(
                      label: '${max ~/ 4}',
                      selected: _quantity == max ~/ 4,
                      onTap: () => setState(() => _quantity = max ~/ 4),
                    ),
                  if (max >= 4)
                    _QuickBtn(
                      label: '${max ~/ 2}',
                      selected: _quantity == max ~/ 2,
                      onTap: () => setState(() => _quantity = max ~/ 2),
                    ),
                  _QuickBtn(
                    label: 'All ($max)',
                    selected: _quantity == max,
                    onTap: () => setState(() => _quantity = max),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildManualList() {
    final max = _max;
    final sorted = List<InventoryItem>.from(widget.group.items)
      ..sort((a, b) => (a.floatValue ?? 999).compareTo(b.floatValue ?? 999));

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            children: [
              Text(
                '${_manualSelected.length} selected',
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
                  setState(() {
                    if (_manualSelected.length == max ||
                        _manualSelected.length == sorted.length) {
                      _manualSelected.clear();
                    } else {
                      _manualSelected = sorted
                          .take(max)
                          .map((i) => i.assetId)
                          .toSet();
                    }
                  });
                },
                child: Text(
                  _manualSelected.length == max ||
                          _manualSelected.length == sorted.length
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
              final selected = _manualSelected.contains(item.assetId);
              final atLimit = !selected && _manualSelected.length >= max;

              return InkWell(
                onTap: atLimit && !selected
                    ? null
                    : () {
                        HapticFeedback.selectionClick();
                        setState(() {
                          if (selected) {
                            _manualSelected.remove(item.assetId);
                          } else {
                            _manualSelected.add(item.assetId);
                          }
                        });
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
                          widget.currency.format(item.steamPrice!),
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
