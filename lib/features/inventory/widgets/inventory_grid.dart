import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../widgets/shared_ui.dart';
import '../inventory_provider.dart';
import '../inventory_selection_provider.dart';
import '../../auth/steam_auth_service.dart';
import '../../portfolio/portfolio_pl_provider.dart' show itemPLFamilyProvider;
import '../../settings/accounts_provider.dart';
import 'glass_bottom_sheet.dart';
import 'group_expand_sheet.dart';
import 'item_card.dart';
import 'quantity_picker_sheet.dart';

class InventoryGrid extends ConsumerWidget {
  const InventoryGrid({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groupedInventory = ref.watch(groupedInventoryProvider);
    final columns = ref.watch(gridColumnsProvider);
    final selection = ref.watch(selectionProvider);
    final isSelecting = selection.isNotEmpty;
    final currency = ref.watch(currencyProvider);

    return Expanded(
      child: groupedInventory.when(
        data: (groups) => groups.isEmpty
          ? AppRefreshIndicator(
              onRefresh: () => ref.read(inventoryProvider.notifier).refresh(),
              child: ListView(
                children: [
                  const SizedBox(height: 120),
                  ref.read(searchQueryProvider).isNotEmpty
                    ? const EmptyState(
                        icon: Icons.search_off_rounded,
                        title: 'No items match your search',
                        subtitle: 'Try a different search term',
                      )
                    : const EmptyState(
                        icon: Icons.inventory_2_outlined,
                        title: 'No items in inventory',
                        subtitle: 'Pull down to refresh or link a Steam account',
                      ),
                ],
              ),
            )
          : AppRefreshIndicator(
          onRefresh: () => ref.read(inventoryProvider.notifier).refresh(),
          child: GridView.builder(
            padding: EdgeInsets.fromLTRB(
              AppTheme.s8,
              AppTheme.s4,
              AppTheme.s8,
              isSelecting ? 140 : 80,
            ),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              childAspectRatio:
                  columns <= 2 ? 0.72 : columns >= 5 ? 0.75 : 0.85,
              crossAxisSpacing: AppTheme.s6,
              mainAxisSpacing: AppTheme.s6,
            ),
            itemCount: groups.length,
            itemBuilder: (_, index) {
              final group = groups[index];
              return _GridItem(
                group: group,
                columns: columns,
                currency: currency,
                index: index,
              );
            },
          ),
        ),
        loading: () => GridView.builder(
          padding: const EdgeInsets.all(AppTheme.s8),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            childAspectRatio:
                columns <= 2 ? 0.72 : columns >= 5 ? 0.75 : 0.85,
            crossAxisSpacing: AppTheme.s6,
            mainAxisSpacing: AppTheme.s6,
          ),
          itemCount: 12,
          itemBuilder: (_, i) => const SkeletonItemCard(),
        ),
        error: (e, _) => EmptyState(
          icon: Icons.error_outline_rounded,
          title: 'Failed to load inventory',
          subtitle: 'Check your connection and try again',
          action: GradientButton(
            label: 'Retry',
            icon: Icons.refresh_rounded,
            expanded: false,
            onPressed: () => ref.read(inventoryProvider.notifier).refresh(),
          ),
        ),
      ),
    );
  }
}

/// Individual grid item — uses `.select()` for granular rebuilds.
class _GridItem extends ConsumerWidget {
  final ItemGroup group;
  final int columns;
  final CurrencyInfo? currency;
  final int index;

  const _GridItem({
    required this.group,
    required this.columns,
    required this.currency,
    required this.index,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final item = group.representative;
    final isSelected = ref.watch(
      selectionProvider.select((s) => s.contains(item.assetId)),
    );
    final itemPL = ref.watch(itemPLFamilyProvider(item.marketHashName));

    // Count how many items from this group are selected
    final selectedCount = group.isGroup
        ? ref.watch(selectionProvider.select(
            (s) => group.items.where((i) => s.contains(i.assetId)).length,
          ))
        : (isSelected ? 1 : 0);

    final accountCount = ref.watch(
      authStateProvider.select((u) => u.valueOrNull?.accountCount ?? 1),
    );
    final activeAccountId = ref.watch(
      authStateProvider.select((u) => u.valueOrNull?.activeAccountId),
    );
    final showBadge = accountCount > 1;

    return ItemCard(
      item: item,
      compact: columns >= 4,
      itemPL: itemPL,
      currency: currency,
      groupCount: group.isGroup ? group.count : null,
      selectedCount: group.isGroup && selectedCount > 0 ? selectedCount : null,
      isSelected: isSelected || selectedCount > 0,
      showAccountBadge: showBadge,
      onAccountBadgeTap: showBadge && group.representative.accountId != null
        ? () async {
            final accountId = group.representative.accountId!;
            if (accountId != activeAccountId) {
              await ref.read(accountsProvider.notifier).setActive(accountId);
            }
          }
        : null,
      onTap: () {
        HapticFeedback.selectionClick();
        if (group.isGroup) {
          _showQuantityPicker(context, ref, group);
        } else {
          ref.read(selectionProvider.notifier).toggle(item.assetId);
        }
      },
      onLongPress: () {
        HapticFeedback.mediumImpact();
        if (group.isGroup) {
          _showGroupSheet(context, ref, group);
        } else {
          context.push('/inventory/item-detail', extra: item);
        }
      },
      onInfoTap: () {
        HapticFeedback.lightImpact();
        if (group.isGroup) {
          _showGroupSheet(context, ref, group);
        } else {
          context.push('/inventory/item-detail', extra: item);
        }
      },
    )
        .animate()
        .fadeIn(
          duration: 300.ms,
          delay: Duration(milliseconds: (index % 12) * 30),
        )
        .slideY(
          begin: 0.05,
          duration: 300.ms,
          delay: Duration(milliseconds: (index % 12) * 30),
          curve: Curves.easeOutCubic,
        );
  }

  void _showGroupSheet(BuildContext context, WidgetRef ref, ItemGroup group) {
    final currency = ref.read(currencyProvider);
    showGlassSheet(context, GroupExpandSheet(group: group, currency: currency));
  }

  void _showQuantityPicker(
      BuildContext context, WidgetRef ref, ItemGroup group) {
    final currency = ref.read(currencyProvider);
    final selected = ref.read(selectionProvider);
    final currentCount =
        group.items.where((i) => selected.contains(i.assetId)).length;
    showGlassSheet(
      context,
      QuantityPickerSheet(
        group: group,
        currency: currency,
        initialCount: currentCount > 0 ? currentCount : 1,
        onConfirm: (assetIds) {
          ref.read(selectionProvider.notifier).replaceGroupSelection(
                group.items.map((i) => i.assetId).toList(),
                assetIds,
              );
        },
      ),
    );
  }
}
