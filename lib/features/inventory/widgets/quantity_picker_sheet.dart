import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../inventory_provider.dart';

class QuantityPickerSheet extends StatefulWidget {
  final ItemGroup group;
  final CurrencyInfo? currency;
  final void Function(List<String> assetIds) onConfirm;

  const QuantityPickerSheet({
    super.key,
    required this.group,
    this.currency,
    required this.onConfirm,
  });

  @override
  State<QuantityPickerSheet> createState() => _QuantityPickerSheetState();
}

class _QuantityPickerSheetState extends State<QuantityPickerSheet> {
  late int _quantity;

  @override
  void initState() {
    super.initState();
    _quantity = 1;
  }

  @override
  Widget build(BuildContext context) {
    final rep = widget.group.representative;
    final maxQty = widget.group.count;
    final unitPrice = rep.bestPrice ?? rep.steamPrice ?? 0;
    final totalPrice = unitPrice * _quantity;

    final rarityColor = rep.rarityColor != null
        ? Color(int.parse('FF${rep.rarityColor}', radix: 16))
        : AppTheme.textDisabled;

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(AppTheme.r20)),
        border: Border(
          top: BorderSide(color: rarityColor.withValues(alpha: 0.5), width: 2),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 14),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textDisabled,
                borderRadius: BorderRadius.circular(2),
              ),
            ),

            // Item preview row
            Row(
              children: [
                SizedBox(
                  width: 52,
                  height: 52,
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
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        rep.weaponName,
                        style: AppTheme.captionSmall
                            .copyWith(color: AppTheme.textMuted),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'x$maxQty available',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.primaryLight,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 20),

            // Quantity display
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _QtyButton(
                  icon: Icons.remove_rounded,
                  onTap: _quantity > 1
                      ? () {
                          HapticFeedback.selectionClick();
                          setState(() => _quantity--);
                        }
                      : null,
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
                _QtyButton(
                  icon: Icons.add_rounded,
                  onTap: _quantity < maxQty
                      ? () {
                          HapticFeedback.selectionClick();
                          setState(() => _quantity++);
                        }
                      : null,
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Slider
            if (maxQty > 2)
              SliderTheme(
                data: SliderThemeData(
                  activeTrackColor: AppTheme.primary,
                  inactiveTrackColor: AppTheme.primary.withValues(alpha: 0.15),
                  thumbColor: AppTheme.primary,
                  overlayColor: AppTheme.primary.withValues(alpha: 0.12),
                  trackHeight: 4,
                  thumbShape:
                      const RoundSliderThumbShape(enabledThumbRadius: 8),
                ),
                child: Slider(
                  value: _quantity.toDouble(),
                  min: 1,
                  max: maxQty.toDouble(),
                  divisions: maxQty - 1,
                  onChanged: (v) {
                    final newQty = v.round();
                    if (newQty != _quantity) {
                      HapticFeedback.selectionClick();
                      setState(() => _quantity = newQty);
                    }
                  },
                ),
              ),

            // Quick select buttons
            if (maxQty > 3)
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _QuickBtn(
                      label: '1',
                      selected: _quantity == 1,
                      onTap: () => setState(() => _quantity = 1),
                    ),
                    if (maxQty >= 10)
                      _QuickBtn(
                        label: '${maxQty ~/ 4}',
                        selected: _quantity == maxQty ~/ 4,
                        onTap: () => setState(() => _quantity = maxQty ~/ 4),
                      ),
                    if (maxQty >= 4)
                      _QuickBtn(
                        label: '${maxQty ~/ 2}',
                        selected: _quantity == maxQty ~/ 2,
                        onTap: () => setState(() => _quantity = maxQty ~/ 2),
                      ),
                    _QuickBtn(
                      label: 'All ($maxQty)',
                      selected: _quantity == maxQty,
                      onTap: () => setState(() => _quantity = maxQty),
                    ),
                  ],
                ),
              ),

            const SizedBox(height: 8),

            // Total + confirm
            Row(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Total value',
                      style: TextStyle(
                        fontSize: 11,
                        color: AppTheme.textMuted,
                      ),
                    ),
                    Text(
                      widget.currency?.format(totalPrice) ??
                          '\$${totalPrice.toStringAsFixed(2)}',
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
                    final assetIds = widget.group.items
                        .take(_quantity)
                        .map((i) => i.assetId)
                        .toList();
                    widget.onConfirm(assetIds);
                    Navigator.of(context).pop();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 12),
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      borderRadius: BorderRadius.circular(AppTheme.r12),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.primary.withValues(alpha: 0.3),
                          blurRadius: 10,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Text(
                      'Select $_quantity',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _QtyButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;

  const _QtyButton({required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: enabled
              ? AppTheme.primary.withValues(alpha: 0.15)
              : Colors.white.withValues(alpha: 0.03),
          shape: BoxShape.circle,
          border: Border.all(
            color: enabled
                ? AppTheme.primary.withValues(alpha: 0.3)
                : Colors.white.withValues(alpha: 0.05),
          ),
        ),
        child: Icon(
          icon,
          size: 20,
          color: enabled ? AppTheme.primary : AppTheme.textDisabled,
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
                ? AppTheme.primary.withValues(alpha: 0.2)
                : Colors.white.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: selected
                  ? AppTheme.primary.withValues(alpha: 0.4)
                  : Colors.white.withValues(alpha: 0.08),
              width: 0.5,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: selected ? AppTheme.primaryLight : AppTheme.textMuted,
            ),
          ),
        ),
      ),
    );
  }
}
