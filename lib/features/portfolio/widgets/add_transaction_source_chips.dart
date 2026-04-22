import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme.dart';

/// Sources for transaction origin
const addTransactionSources = [
  ('csfloat', 'CSFloat', Icons.storefront_rounded),
  ('buff163', 'Buff', Icons.store_rounded),
  ('skinport', 'Skinport', Icons.shopping_bag_rounded),
  ('trade', 'Trade', Icons.swap_horiz_rounded),
  ('drop', 'Drop', Icons.card_giftcard_rounded),
  ('manual', 'Other', Icons.edit_rounded),
];

class AddTransactionSourceChips extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onChanged;

  const AddTransactionSourceChips({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: addTransactionSources.map((s) {
        final (id, label, icon) = s;
        final isSelected = selected == id;
        return GestureDetector(
          onTap: () {
            HapticFeedback.selectionClick();
            onChanged(id);
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: isSelected
                  ? AppTheme.primary.withValues(alpha: 0.15)
                  : AppTheme.surface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isSelected
                    ? AppTheme.primary.withValues(alpha: 0.4)
                    : AppTheme.border,
                width: isSelected ? 1.2 : 0.8,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon,
                    size: 14,
                    color:
                        isSelected ? AppTheme.primaryLight : AppTheme.textMuted),
                const SizedBox(width: 5),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                    color:
                        isSelected ? AppTheme.textPrimary : AppTheme.textMuted,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}
