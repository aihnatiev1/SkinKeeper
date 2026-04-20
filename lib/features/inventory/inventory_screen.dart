import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/analytics_service.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../models/inventory_item.dart';
import '../auth/session_gate.dart';
import '../purchases/iap_service.dart';
import 'inventory_provider.dart';
import 'inventory_selection_provider.dart';
import 'sell_provider.dart';
import 'widgets/glass_bottom_sheet.dart';
import 'widgets/inventory_app_bar.dart';
import 'widgets/inventory_grid.dart';
import 'widgets/inventory_search_bar.dart';
import 'widgets/selection_tray.dart';
import 'widgets/sell_bottom_sheet.dart';
import 'widgets/sell_progress_sheet.dart';
import '../../core/widgets/stale_data_banner.dart';

/// Re-export for backward compat (old code may import selectedItemsProvider)
final selectedItemsProvider = StateProvider<Set<String>>((ref) {
  final selection = ref.watch(selectionProvider);
  return selection.selected;
});

class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen>
    with AutomaticKeepAliveClientMixin {
  bool _trayExpanded = false;
  bool _searchOpen = false;

  @override
  bool get wantKeepAlive => true;

  bool _inventoryViewedLogged = false;

  @override
  void initState() {
    super.initState();
    Analytics.screen('inventory');
    // Richer funnel event — captures item_count + totalValue so we can
    // segment "empty inventory" drop-off from "loaded inventory" retention.
    ref.listenManual(inventoryProvider, (prev, next) {
      if (_inventoryViewedLogged) return;
      next.whenData((items) {
        if (_inventoryViewedLogged) return;
        _inventoryViewedLogged = true;
        final totalValue = items.fold<double>(
            0, (sum, it) => sum + (it.currentPriceCents / 100));
        Analytics.inventoryViewed(
            itemCount: items.length, totalValue: totalValue);
      });
    });
  }

  Future<void> _showSellSheet(List<InventoryItem> items) async {
    if (!await requireSession(context, ref)) return;
    if (!mounted) return;
    showGlassSheet(context, SellBottomSheet(items: items));
  }

  Future<void> _quickSell(List<InventoryItem> items) async {
    if (items.isEmpty) return;
    if (!await requireSession(context, ref)) return;
    if (!mounted) return;
    HapticFeedback.mediumImpact();

    // Show progress sheet immediately — it will display "Fetching prices..."
    showGlassSheetLocked(context, const SellProgressSheet());

    final sellItems = items
        .map((item) => {
              'assetId': item.assetId,
              'marketHashName': item.marketHashName,
              'priceCents': 0, // resolved by startQuickSell via histogram
              if (item.accountId != null) 'accountId': item.accountId,
            })
        .toList();

    // startQuickSell handles: fetch prices → create operation → poll progress
    await ref.read(sellOperationProvider.notifier).startQuickSell(
      sellItems,
      accountId: items.first.accountId,
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final selection = ref.watch(selectionProvider);
    final isSelecting = selection.isNotEmpty;
    final selectedItems = ref.watch(selectedItemsListProvider);
    final currency = ref.watch(currencyProvider);
    final isStale = ref.watch(inventoryStaleProvider);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: Stack(
        children: [
          Column(
        children: [
          InventoryAppBar(
            searchOpen: _searchOpen,
            onToggleSearch: () => setState(() => _searchOpen = !_searchOpen),
          ),
          InventorySearchBar(
            isOpen: _searchOpen,
            onClose: () => setState(() => _searchOpen = false),
          ),
          const _InventoryStatsAndFilters(),
          if (isStale)
            StaleDataBanner(
              onRefresh: () {
                ref.read(inventoryStaleProvider.notifier).state = false;
                ref.read(inventoryProvider.notifier).refresh();
              },
            ),
          const InventoryGrid(),
          if (isSelecting)
            SelectionTray(
              selectedItems: selectedItems,
              currency: currency,
              expanded: _trayExpanded,
              hasSession: ref.watch(hasSessionProvider),
              onToggleExpand: () =>
                  setState(() => _trayExpanded = !_trayExpanded),
              onRemoveItem: (assetId) =>
                  ref.read(selectionProvider.notifier).toggle(assetId),
              onClear: () {
                ref.read(selectionProvider.notifier).clear();
                setState(() => _trayExpanded = false);
              },
              onSell: () {
                if (selectedItems.isNotEmpty) {
                  final isPremium = ref.read(premiumProvider).valueOrNull ?? false;
                  if (selectedItems.length > 1 && !isPremium) {
                    context.push('/premium');
                    return;
                  }
                  _showSellSheet(selectedItems);
                }
              },
              onQuickSell: () {
                if (selectedItems.isNotEmpty) {
                  final isPremium = ref.read(premiumProvider).valueOrNull ?? false;
                  if (selectedItems.length > 1 && !isPremium) {
                    context.push('/premium');
                    return;
                  }
                  _quickSell(selectedItems);
                }
              },
            ),
        ],
      ),
          // Floating action buttons
          if (!isSelecting) ...[
            // Trade-Up Calculator
            Positioned(
              right: 16,
              bottom: MediaQuery.of(context).padding.bottom + 116,
              child: GestureDetector(
                onTap: () {
                  HapticFeedback.mediumImpact();
                  context.push('/tradeup');
                },
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppTheme.accent,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [BoxShadow(color: AppTheme.accent.withValues(alpha: 0.4), blurRadius: 12, offset: const Offset(0, 4))],
                  ),
                  child: const Icon(Icons.swap_vert_rounded, color: Colors.black, size: 22),
                ),
              ),
            ),
            // Bulk Sale
            Positioned(
              right: 16,
              bottom: MediaQuery.of(context).padding.bottom + 60,
              child: GestureDetector(
                onTap: () {
                  HapticFeedback.mediumImpact();
                  context.push('/inventory/bulk-sell');
                },
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppTheme.warning,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [BoxShadow(color: AppTheme.warning.withValues(alpha: 0.4), blurRadius: 12, offset: const Offset(0, 4))],
                  ),
                  child: const Icon(Icons.sell_rounded, color: Colors.black, size: 22),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _InventoryStatsAndFilters extends ConsumerWidget {
  const _InventoryStatsAndFilters();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(inventorySummaryProvider);
    final currency = ref.watch(currencyProvider);
    final activeCategory = ref.watch(categoryProvider);

    return Column(
      children: [
        // ── Category Chips ──
        SizedBox(
          height: 38,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              _categoryChip(ref, InventoryCategory.all, 'All', Icons.grid_view_rounded),
              _categoryChip(ref, InventoryCategory.knives, 'Knives', Icons.colorize_rounded),
              _categoryChip(ref, InventoryCategory.weapons, 'Weapons', Icons.gps_fixed_rounded),
              _categoryChip(ref, InventoryCategory.stickers, 'Stickers', Icons.sell_rounded),
              _categoryChip(ref, InventoryCategory.containers, 'Cases', Icons.inventory_2_rounded),
            ],
          ),
        ),
        const SizedBox(height: 12),
      ],
    );
  }

  Widget _statItem(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            letterSpacing: 1,
            color: AppTheme.textDisabled,
          ),
        ),
        Text(
          value,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: Colors.white,
          ),
        ),
      ],
    );
  }

  Widget _categoryChip(WidgetRef ref, InventoryCategory category, String label, IconData icon) {
    final isSelected = ref.watch(categoryProvider) == category;
    final color = isSelected ? AppTheme.primary : Colors.white.withValues(alpha: 0.05);

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: isSelected,
        onSelected: (_) => ref.read(categoryProvider.notifier).state = category,
        backgroundColor: Colors.white.withValues(alpha: 0.03),
        selectedColor: AppTheme.primary.withValues(alpha: 0.2),
        checkmarkColor: AppTheme.primary,
        labelStyle: TextStyle(
          fontSize: 12,
          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
          color: isSelected ? Colors.white : AppTheme.textSecondary,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(
            color: isSelected ? AppTheme.primary.withValues(alpha: 0.5) : Colors.white.withValues(alpha: 0.05),
            width: 1,
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 4),
      ),
    );
  }
}
