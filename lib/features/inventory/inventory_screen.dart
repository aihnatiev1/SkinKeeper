import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/inventory_item.dart';
import '../../widgets/shared_ui.dart';
import '../../widgets/sync_indicator.dart';
import '../auth/widgets/session_status_widget.dart';
import '../portfolio/portfolio_pl_provider.dart';
import 'inventory_provider.dart';
import 'sell_provider.dart';
import 'widgets/item_card.dart';
import 'widgets/group_expand_sheet.dart';
import 'widgets/sell_bottom_sheet.dart';
import 'widgets/sell_progress_sheet.dart';

final selectedItemsProvider = StateProvider<Set<String>>((ref) => {});

class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  bool _trayExpanded = false;
  bool _searchOpen = false;
  final _searchController = TextEditingController();
  final _searchFocus = FocusNode();

  void _showSellSheet(List<InventoryItem> items) {
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => SellBottomSheet(items: items),
    );
  }

  Future<void> _quickSell(List<InventoryItem> items) async {
    if (items.isEmpty) return;
    HapticFeedback.mediumImpact();

    // Fetch quick price for the first item (all selected share same price logic)
    final marketHashName = items.first.marketHashName;
    try {
      final priceCents = await ref.read(
        quickPriceProvider(marketHashName).future,
      );

      final sellItems = items
          .map((item) => {
                'assetId': item.assetId,
                'marketHashName': item.marketHashName,
                'priceCents': priceCents,
              })
          .toList();

      await ref.read(sellOperationProvider.notifier).startOperation(sellItems);

      if (!mounted) return;
      showModalBottomSheet(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        isDismissible: false,
        enableDrag: false,
        backgroundColor: Colors.transparent,
        builder: (_) => const SellProgressSheet(),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Quick sell failed: $e'),
          backgroundColor: AppTheme.loss,
        ),
      );
    }
  }

  void _toggleSelection(String assetId) {
    final current = ref.read(selectedItemsProvider);
    final updated = Set<String>.from(current);
    if (updated.contains(assetId)) {
      updated.remove(assetId);
    } else {
      updated.add(assetId);
    }
    ref.read(selectedItemsProvider.notifier).state = updated;
  }

  void _clearSelection() {
    ref.read(selectedItemsProvider.notifier).state = {};
    setState(() => _trayExpanded = false);
  }

  void _showGroupSheet(ItemGroup group) {
    final currency = ref.read(currencyProvider);
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => GroupExpandSheet(group: group, currency: currency),
    );
  }

  @override
  Widget build(BuildContext context) {
    final groupedInventory = ref.watch(groupedInventoryProvider);
    final allItems = ref.watch(inventoryProvider);
    final columns = ref.watch(gridColumnsProvider);
    final selectedIds = ref.watch(selectedItemsProvider);
    final isSelecting = selectedIds.isNotEmpty;
    final groupingEnabled = ref.watch(groupingEnabledProvider);
    final currency = ref.watch(currencyProvider);

    final allItemsList = ref.watch(filteredInventoryProvider).valueOrNull ?? [];
    final selectedItems =
        allItemsList.where((i) => selectedIds.contains(i.assetId)).toList();

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: Column(
        children: [
          // ── Custom header ──
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 12, 0),
              child: Column(
                children: [
                  Row(
                    children: [
                      if (isSelecting)
                        _GlassIconBtn(
                          icon: Icons.close_rounded,
                          onTap: _clearSelection,
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
                                  ? '${selectedIds.length} selected'
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
                                  0, (sum, item) => sum + (item.bestPrice ?? 0));
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
                      // Grouping / grid / sort — always visible
                      _GlassIconBtn(
                        icon: groupingEnabled ? Icons.layers_rounded : Icons.layers_clear_rounded,
                        isActive: groupingEnabled,
                        onTap: () {
                          HapticFeedback.selectionClick();
                          ref.read(groupingEnabledProvider.notifier).state = !groupingEnabled;
                        },
                      ),
                      _GlassIconBtn(
                        icon: columns <= 2 ? Icons.grid_view_rounded : Icons.view_module_rounded,
                        onTap: () {
                          HapticFeedback.selectionClick();
                          final next = columns >= 5 ? 2 : columns + 1;
                          ref.read(gridColumnsProvider.notifier).state = next;
                        },
                      ),
                      _GlassIconBtn(
                        icon: Icons.search_rounded,
                        isActive: _searchOpen,
                        onTap: () {
                          HapticFeedback.selectionClick();
                          setState(() => _searchOpen = !_searchOpen);
                          if (_searchOpen) {
                            Future.delayed(const Duration(milliseconds: 250), () {
                              _searchFocus.requestFocus();
                            });
                          } else {
                            _searchController.clear();
                            ref.read(searchQueryProvider.notifier).state = '';
                            _searchFocus.unfocus();
                          }
                        },
                      ),
                      _GlassIconBtn(
                        icon: Icons.sort_rounded,
                        onTap: () {
                          HapticFeedback.selectionClick();
                          const cycle = SortOption.values;
                          final current = ref.read(sortOptionProvider);
                          final idx = cycle.indexOf(current);
                          ref.read(sortOptionProvider.notifier).state =
                              cycle[(idx + 1) % cycle.length];
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  // Sync + Bulk Sale row
                  Row(
                    children: [
                      SyncIndicator(
                        onTap: () async {
                          HapticFeedback.mediumImpact();
                          await ref.read(inventoryProvider.notifier).refresh();
                        },
                      ),
                      const Spacer(),
                      GestureDetector(
                        onTap: () {
                          HapticFeedback.mediumImpact();
                          context.push('/inventory/bulk-sell');
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
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
                              Icon(Icons.sell_rounded, size: 13, color: AppTheme.warning),
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
          ),
          // Collapsible search bar
          AnimatedSize(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOutCubic,
            child: _searchOpen
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppTheme.s16, AppTheme.s8, AppTheme.s16, AppTheme.s4,
                    ),
                    child: TextField(
                      controller: _searchController,
                      focusNode: _searchFocus,
                      onChanged: (v) =>
                          ref.read(searchQueryProvider.notifier).state = v,
                      style: AppTheme.body,
                      decoration: InputDecoration(
                        hintText: 'Search items...',
                        prefixIcon: const Icon(Icons.search_rounded, size: 20),
                        suffixIcon: GestureDetector(
                          onTap: () {
                            _searchController.clear();
                            ref.read(searchQueryProvider.notifier).state = '';
                            _searchFocus.unfocus();
                            setState(() => _searchOpen = false);
                          },
                          child: const Icon(Icons.close_rounded, size: 18),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: AppTheme.s16,
                          vertical: AppTheme.s12,
                        ),
                      ),
                    ),
                  )
                : const SizedBox(height: 4),
          ),
          // Grid
          Expanded(
            child: groupedInventory.when(
              data: (groups) => AppRefreshIndicator(
                onRefresh: () =>
                    ref.read(inventoryProvider.notifier).refresh(),
                child: GridView.builder(
                  padding: EdgeInsets.fromLTRB(
                    AppTheme.s8,
                    AppTheme.s4,
                    AppTheme.s8,
                    // Extra padding for selection tray + nav bar
                    isSelecting ? 140 : 80,
                  ),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    childAspectRatio: columns <= 2 ? 0.72 : columns >= 5 ? 0.75 : 0.85,
                    crossAxisSpacing: AppTheme.s6,
                    mainAxisSpacing: AppTheme.s6,
                  ),
                  itemCount: groups.length,
                  itemBuilder: (_, index) {
                    final group = groups[index];
                    final item = group.representative;
                    final isSelected = selectedIds.contains(item.assetId);
                    final plMap = ref.watch(itemPLMapProvider);

                    return ItemCard(
                      item: item,
                      compact: columns >= 4,
                      itemPL: plMap[item.marketHashName],
                      currency: currency,
                      groupCount: group.isGroup ? group.count : null,
                      isSelected: isSelected,
                      onTap: () {
                        HapticFeedback.selectionClick();
                        if (group.isGroup && !isSelecting) {
                          // First tap on group = select all items in group
                          final current = ref.read(selectedItemsProvider);
                          final updated = Set<String>.from(current);
                          for (final i in group.items) {
                            updated.add(i.assetId);
                          }
                          ref.read(selectedItemsProvider.notifier).state = updated;
                        } else {
                          _toggleSelection(item.assetId);
                        }
                      },
                      onInfoTap: () {
                        HapticFeedback.lightImpact();
                        if (group.isGroup) {
                          _showGroupSheet(group);
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
                  },
                ),
              ),
              loading: () => GridView.builder(
                padding: const EdgeInsets.all(AppTheme.s8),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: columns,
                  childAspectRatio: columns <= 2 ? 0.72 : columns >= 5 ? 0.75 : 0.85,
                  crossAxisSpacing: AppTheme.s6,
                  mainAxisSpacing: AppTheme.s6,
                ),
                itemCount: 12,
                itemBuilder: (_, i) => ShimmerBox(
                  height: 200,
                  radius: AppTheme.r12,
                ),
              ),
              error: (e, _) => EmptyState(
                icon: Icons.error_outline_rounded,
                title: 'Failed to load inventory',
                subtitle: 'Check your connection and try again',
                action: GradientButton(
                  label: 'Retry',
                  icon: Icons.refresh_rounded,
                  expanded: false,
                  onPressed: () =>
                      ref.read(inventoryProvider.notifier).refresh(),
                ),
              ),
            ),
          ),
          // Selection tray
          if (isSelecting)
            _SelectionTray(
              selectedItems: selectedItems,
              currency: currency,
              expanded: _trayExpanded,
              onToggleExpand: () =>
                  setState(() => _trayExpanded = !_trayExpanded),
              onRemoveItem: (assetId) => _toggleSelection(assetId),
              onClear: _clearSelection,
              onSell: () {
                if (selectedItems.isNotEmpty) {
                  _showSellSheet(selectedItems);
                }
              },
              onQuickSell: () {
                if (selectedItems.isNotEmpty) {
                  _quickSell(selectedItems);
                }
              },
            ),
        ],
      ),
    );
  }
}

// ─── Glass Icon Button (matches portfolio style) ────────────────

class _GlassIconBtn extends StatelessWidget {
  final IconData icon;
  final bool isActive;
  final VoidCallback onTap;

  const _GlassIconBtn({
    required this.icon,
    this.isActive = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
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
          icon, size: 18,
          color: isActive ? AppTheme.primary : AppTheme.textMuted,
        ),
      ),
    );
  }
}

// ─── Selection Tray ──────────────────────────────────────────────

class _SelectionTray extends StatelessWidget {
  final List<InventoryItem> selectedItems;
  final CurrencyInfo currency;
  final bool expanded;
  final VoidCallback onToggleExpand;
  final void Function(String assetId) onRemoveItem;
  final VoidCallback onClear;
  final VoidCallback onSell;
  final VoidCallback onQuickSell;

  const _SelectionTray({
    required this.selectedItems,
    required this.currency,
    required this.expanded,
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
            // ── Drag handle ──
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

            // ── Header row: "Selected N items $XXX" + Sell button ──
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
                    '$count items',
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
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.flash_on_rounded,
                              size: 15, color: Colors.black),
                          SizedBox(width: 4),
                          Text(
                            'Quick',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: Colors.black,
                            ),
                          ),
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
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.sell_rounded,
                              size: 15, color: Colors.white),
                          SizedBox(width: 6),
                          Text(
                            'Sell',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // ── Item cards grid ──
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
                    return _MiniItemCard(
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
                        child: _MiniItemCard(
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

// ─── Mini item card for selection tray ────────────────────────────

class _MiniItemCard extends StatelessWidget {
  final InventoryItem item;
  final CurrencyInfo currency;
  final Map<String, Color> wearColors;
  final VoidCallback onRemove;

  const _MiniItemCard({
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
                        : '—',
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
            // Remove badge (X)
            Positioned(
              top: 2,
              right: 2,
              child: Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.6),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.close_rounded,
                  size: 10,
                  color: AppTheme.textMuted,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
