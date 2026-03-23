import 'package:flutter/material.dart';
import '../../../core/theme.dart';
import '../inventory_provider.dart';

class SortMenuBtn extends StatelessWidget {
  final SortOption currentSort;
  final ValueChanged<SortOption> onSelected;

  const SortMenuBtn({super.key, required this.currentSort, required this.onSelected});

  static const _menuItems = <SortOption, (IconData, String)>{
    SortOption.dateDesc:  (Icons.arrow_downward_rounded, 'Date: newest first'),
    SortOption.dateAsc:   (Icons.arrow_upward_rounded,   'Date: oldest first'),
    SortOption.priceDesc: (Icons.arrow_downward_rounded, 'Price: high \u2192 low'),
    SortOption.priceAsc:  (Icons.arrow_upward_rounded,   'Price: low \u2192 high'),
    // TODO: re-enable when float data is reliable
    // SortOption.floatAsc:  (Icons.arrow_upward_rounded,   'Float: low \u2192 high'),
    // SortOption.floatDesc: (Icons.arrow_downward_rounded, 'Float: high \u2192 low'),
    SortOption.stickerValue: (Icons.auto_awesome_rounded, 'Sticker value'),
  };

  @override
  Widget build(BuildContext context) {
    final isActive = currentSort != SortOption.priceDesc;
    return PopupMenuButton<SortOption>(
      onSelected: onSelected,
      offset: const Offset(0, 42),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      color: const Color(0xFF1E2A48),
      elevation: 12,
      itemBuilder: (_) => _menuItems.entries.map((e) {
        final selected = e.key == currentSort;
        return PopupMenuItem<SortOption>(
          value: e.key,
          height: 44,
          child: Row(
            children: [
              Icon(
                e.value.$1,
                size: 16,
                color: selected ? AppTheme.primary : AppTheme.textMuted,
              ),
              const SizedBox(width: 10),
              Text(
                e.value.$2,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  color: selected ? AppTheme.primary : Colors.white.withValues(alpha: 0.85),
                ),
              ),
              if (selected) ...[
                const Spacer(),
                Icon(Icons.check_rounded, size: 16, color: AppTheme.primary),
              ],
            ],
          ),
        );
      }).toList(),
      child: Container(
        width: 36, height: 36,
        margin: const EdgeInsets.only(left: 4),
        decoration: BoxDecoration(
          color: isActive
              ? AppTheme.primary.withValues(alpha: 0.12)
              : Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isActive
                ? AppTheme.primary.withValues(alpha: 0.25)
                : Colors.white.withValues(alpha: 0.07),
            width: 0.5,
          ),
        ),
        child: Icon(
          Icons.sort_rounded, size: 18,
          color: isActive ? AppTheme.primary : AppTheme.textMuted,
        ),
      ),
    );
  }
}
