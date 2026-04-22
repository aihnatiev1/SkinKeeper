import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../portfolio_pl_provider.dart';

class ItemPLListHeader extends ConsumerWidget {
  final int activeCount;
  final int soldCount;
  const ItemPLListHeader({
    super.key,
    required this.activeCount,
    required this.soldCount,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(plTabProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Row(
        children: [
          _TabChip(
            label: 'Active',
            count: activeCount,
            active: tab == PlTab.active,
            onTap: () {
              HapticFeedback.selectionClick();
              ref.read(plTabProvider.notifier).state = PlTab.active;
            },
          ),
          const SizedBox(width: 8),
          _TabChip(
            label: 'Sold',
            count: soldCount,
            active: tab == PlTab.sold,
            onTap: () {
              HapticFeedback.selectionClick();
              ref.read(plTabProvider.notifier).state = PlTab.sold;
            },
          ),
        ],
      ),
    );
  }
}

class _TabChip extends StatelessWidget {
  final String label;
  final int count;
  final bool active;
  final VoidCallback onTap;
  const _TabChip({
    required this.label,
    required this.count,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: active ? AppTheme.primary.withValues(alpha: 0.2) : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active ? AppTheme.primary : AppTheme.divider,
            width: active ? 1.5 : 1,
          ),
        ),
        child: Text(
          '$label  $count',
          style: TextStyle(
            fontSize: 12,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            color: active ? AppTheme.primary : AppTheme.textMuted,
          ),
        ),
      ),
    );
  }
}
