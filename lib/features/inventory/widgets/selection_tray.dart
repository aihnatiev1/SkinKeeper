import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';

// ---- Selection Tray ----

class SelectionTray extends StatelessWidget {
  final List<InventoryItem> selectedItems;
  final CurrencyInfo currency;
  final bool expanded;
  final bool hasSession;
  final VoidCallback onToggleExpand;
  final void Function(String assetId) onRemoveItem;
  final VoidCallback onClear;
  final VoidCallback onSell;
  final VoidCallback onQuickSell;

  const SelectionTray({
    super.key,
    required this.selectedItems,
    required this.currency,
    required this.expanded,
    this.hasSession = true,
    required this.onToggleExpand,
    required this.onRemoveItem,
    required this.onClear,
    required this.onSell,
    required this.onQuickSell,
  });

  static const _wearColors = <String, Color>{
    'FN': Color(0xFF10B981),
    'MW': Color(0xFF06B6D4),
    'FT': Color(0xFF3B82F6),
    'WW': Color(0xFFF59E0B),
    'BS': Color(0xFFEF4444),
  };

  @override
  Widget build(BuildContext context) {
    final count = selectedItems.length;
    final totalValue = selectedItems.fold<double>(
        0, (sum, i) => sum + (i.steamPrice ?? 0));

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        border: Border(
          top: BorderSide(color: AppTheme.primary.withValues(alpha: 0.2)),
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primary.withValues(alpha: 0.08),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // -- Drag handle --
            GestureDetector(
              onTap: onToggleExpand,
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.only(top: 8, bottom: 4),
                child: Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppTheme.textDisabled.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ),
            ),

            // -- Header row: "Selected N items $XXX" + Sell button --
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 2, 10, 8),
              child: Row(
                children: [
                  Text(
                    'Selected ',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  Text(
                    '$count ${count == 1 ? 'item' : 'items'}',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.primary,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    currency.format(totalValue),
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  const Spacer(),
                  // Quick Sell button
                  GestureDetector(
                    onTap: () {
                      HapticFeedback.mediumImpact();
                      onQuickSell();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: AppTheme.warning,
                        borderRadius: BorderRadius.circular(AppTheme.r10),
                        boxShadow: [
                          BoxShadow(
                            color: AppTheme.warning.withValues(alpha: 0.3),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.flash_on_rounded,
                              size: 15, color: Colors.black),
                          const SizedBox(width: 4),
                          const Text(
                            'Quick Sell',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Colors.black,
                            ),
                          ),
                          if (!hasSession) ...[
                            const SizedBox(width: 3),
                            const Icon(Icons.lock_outline,
                                size: 10, color: Colors.black54),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Sell button
                  GestureDetector(
                    onTap: () {
                      HapticFeedback.mediumImpact();
                      onSell();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 20, vertical: 10),
                      decoration: BoxDecoration(
                        gradient: AppTheme.primaryGradient,
                        borderRadius: BorderRadius.circular(AppTheme.r10),
                        boxShadow: [
                          BoxShadow(
                            color: AppTheme.primary.withValues(alpha: 0.3),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.sell_rounded,
                              size: 15, color: Colors.white),
                          const SizedBox(width: 6),
                          const Text(
                            'Set Price',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                          if (!hasSession) ...[
                            const SizedBox(width: 3),
                            Icon(Icons.lock_outline,
                                size: 10,
                                color: Colors.white.withValues(alpha: 0.6)),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // -- Item cards grid --
            if (expanded)
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 220),
                child: GridView.builder(
                  shrinkWrap: true,
                  padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 4,
                    childAspectRatio: 0.78,
                    crossAxisSpacing: 6,
                    mainAxisSpacing: 6,
                  ),
                  itemCount: selectedItems.length,
                  itemBuilder: (_, index) {
                    final item = selectedItems[index];
                    return MiniItemCard(
                      item: item,
                      currency: currency,
                      wearColors: _wearColors,
                      onRemove: () {
                        HapticFeedback.lightImpact();
                        onRemoveItem(item.assetId);
                      },
                    );
                  },
                ),
              )
            else
              // Collapsed: horizontal scroll preview
              SizedBox(
                height: 80,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
                  itemCount: selectedItems.length,
                  itemBuilder: (_, index) {
                    final item = selectedItems[index];
                    return Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: SizedBox(
                        width: 68,
                        child: MiniItemCard(
                          item: item,
                          currency: currency,
                          wearColors: _wearColors,
                          onRemove: () {
                            HapticFeedback.lightImpact();
                            onRemoveItem(item.assetId);
                          },
                        ),
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ---- Mini item card for selection tray ----

class MiniItemCard extends StatelessWidget {
  final InventoryItem item;
  final CurrencyInfo currency;
  final Map<String, Color> wearColors;
  final VoidCallback onRemove;

  const MiniItemCard({
    super.key,
    required this.item,
    required this.currency,
    required this.wearColors,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final wearColor =
        wearColors[item.wearShort] ?? AppTheme.textMuted;

    return GestureDetector(
      onTap: onRemove,
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF1A2540),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: AppTheme.primary.withValues(alpha: 0.25),
            width: 0.8,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Price header
                Padding(
                  padding: const EdgeInsets.fromLTRB(5, 4, 5, 0),
                  child: Text(
                    item.steamPrice != null
                        ? currency.format(item.steamPrice!)
                        : '\u2014',
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: -0.3,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                // Item image
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    child: Image.network(
                      item.fullIconUrl,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.image_not_supported_rounded,
                        size: 16,
                        color: AppTheme.textDisabled,
                      ),
                    ),
                  ),
                ),
                // Footer: wear + float
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 5, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.2),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          if (item.isStatTrak)
                            Text(
                              'ST ',
                              style: TextStyle(
                                fontSize: 8,
                                fontWeight: FontWeight.w800,
                                color: AppTheme.warning.withValues(alpha: 0.9),
                              ),
                            ),
                          if (item.wearShort != null)
                            Text(
                              item.wearShort!,
                              style: TextStyle(
                                fontSize: 8,
                                fontWeight: FontWeight.w800,
                                color: wearColor,
                              ),
                            ),
                          if (item.floatValue != null) ...[
                            Text(
                              ' / ',
                              style: TextStyle(
                                fontSize: 8,
                                color: AppTheme.textDisabled,
                              ),
                            ),
                            Expanded(
                              child: Text(
                                item.floatValue!.toStringAsFixed(4),
                                style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white.withValues(alpha: 0.5),
                                  fontFamily: 'monospace',
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
