import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../l10n/app_localizations.dart';
import '../../../widgets/account_scope_chip.dart';
import '../../../widgets/sync_indicator.dart';
import '../inventory_provider.dart';
import '../inventory_selection_provider.dart';
import 'filter_sheet.dart';
import 'glass_icon_btn.dart';
import 'sort_menu_btn.dart';

class InventoryAppBar extends ConsumerWidget {
  final bool searchOpen;
  final VoidCallback onToggleSearch;

  const InventoryAppBar({
    super.key,
    required this.searchOpen,
    required this.onToggleSearch,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final allItems = ref.watch(inventoryProvider);
    final columns = ref.watch(gridColumnsProvider);
    final selection = ref.watch(selectionProvider);
    final isSelecting = selection.isNotEmpty;
    final groupingEnabled = ref.watch(groupingEnabledProvider);
    final currency = ref.watch(currencyProvider);

    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 12, 0),
        child: Column(
          children: [
            Row(
              children: [
                if (isSelecting)
                  GlassIconBtn(
                    icon: Icons.close_rounded,
                    onTap: () => ref.read(selectionProvider.notifier).clear(),
                  )
                else
                  const SizedBox.shrink(),
                if (isSelecting) const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isSelecting
                            ? '${selection.count} selected'
                            : AppLocalizations.of(context).inventoryTitle,
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                          color: isSelecting ? AppTheme.primary : Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      allItems.whenData((items) {
                        final totalValue = items.fold<double>(
                            0, (sum, item) => sum + (item.steamPrice ?? 0));
                        return Text(
                          '${items.length} items \u2022 ${currency.format(totalValue)}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: AppTheme.textDisabled,
                          ),
                        );
                      }).maybeWhen(orElse: () => const SizedBox.shrink()),
                    ],
                  ),
                ),
                GlassIconBtn(
                  icon: groupingEnabled
                      ? Icons.layers_rounded
                      : Icons.layers_clear_rounded,
                  isActive: groupingEnabled,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    ref.read(groupingEnabledProvider.notifier).state =
                        !groupingEnabled;
                  },
                ),
                GlassIconBtn(
                  icon: columns <= 2
                      ? Icons.grid_view_rounded
                      : Icons.view_module_rounded,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    final next = columns >= 5 ? 2 : columns + 1;
                    ref.read(gridColumnsProvider.notifier).state = next;
                  },
                ),
                GlassIconBtn(
                  icon: Icons.search_rounded,
                  isActive: searchOpen,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    onToggleSearch();
                  },
                ),
                _FilterIconBtn(),
                SortMenuBtn(
                  currentSort: ref.watch(sortOptionProvider),
                  onSelected: (option) {
                    HapticFeedback.selectionClick();
                    ref.read(sortOptionProvider.notifier).state = option;
                  },
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                SyncIndicator(
                  onTap: () async {
                    HapticFeedback.mediumImpact();
                    await ref.read(inventoryProvider.notifier).refresh();
                  },
                ),
                const SizedBox(width: 8),
                const AccountScopeChip(),
                const Spacer(),
                GestureDetector(
                  onTap: () {
                    HapticFeedback.mediumImpact();
                    context.push('/deals');
                  },
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppTheme.profit.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: AppTheme.profit.withValues(alpha: 0.3),
                        width: 0.5,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.compare_arrows_rounded,
                            size: 13, color: AppTheme.profit),
                        const SizedBox(width: 5),
                        Text(
                          'Deals',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.profit,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () {
                    HapticFeedback.mediumImpact();
                    context.push('/inventory/bulk-sell');
                  },
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppTheme.warning.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(AppTheme.r8),
                      border: Border.all(
                        color: AppTheme.warning.withValues(alpha: 0.2),
                        width: 0.5,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.sell_rounded,
                            size: 13, color: AppTheme.warning),
                        const SizedBox(width: 5),
                        Text(
                          'Bulk Sale',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.warning,
                          ),
                        ),
                      ],
                    ),
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

class _FilterIconBtn extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isActive = ref.watch(advancedFiltersActiveProvider);

    return Stack(
      children: [
        GlassIconBtn(
          icon: Icons.tune_rounded,
          isActive: isActive,
          onTap: () {
            HapticFeedback.selectionClick();
            showModalBottomSheet(
              context: context,
              useRootNavigator: true,
              isScrollControlled: true,
              backgroundColor: Colors.transparent,
              builder: (_) => const FilterSheet(),
            );
          },
        ),
        if (isActive)
          Positioned(
            right: 0,
            top: 0,
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: AppTheme.primary,
                shape: BoxShape.circle,
                border: Border.all(color: AppTheme.bg, width: 1.5),
              ),
            ),
          ),
      ],
    );
  }
}
