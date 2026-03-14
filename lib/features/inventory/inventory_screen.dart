import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../models/inventory_item.dart';
import '../purchases/iap_service.dart';
import 'inventory_selection_provider.dart';
import 'sell_provider.dart';
import 'widgets/glass_bottom_sheet.dart';
import 'widgets/inventory_app_bar.dart';
import 'widgets/inventory_grid.dart';
import 'widgets/inventory_search_bar.dart';
import 'widgets/selection_tray.dart';
import 'widgets/sell_bottom_sheet.dart';
import 'widgets/sell_progress_sheet.dart';

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

  void _showSellSheet(List<InventoryItem> items) {
    showGlassSheet(context, SellBottomSheet(items: items));
  }

  Future<void> _quickSell(List<InventoryItem> items) async {
    if (items.isEmpty) return;
    HapticFeedback.mediumImpact();

    try {
      // Fetch quick price per unique market hash name in parallel
      final uniqueNames = items.map((i) => i.marketHashName).toSet();
      final priceEntries = await Future.wait(
        uniqueNames.map((name) async {
          final price = await ref.read(quickPriceProvider(name).future);
          return MapEntry(name, price);
        }),
      );
      final priceMap = Map.fromEntries(priceEntries);

      final sellItems = items
          .map((item) => {
                'assetId': item.assetId,
                'marketHashName': item.marketHashName,
                'priceCents': priceMap[item.marketHashName] ?? 0,
                if (item.accountId != null) 'accountId': item.accountId,
              })
          .toList();

      await ref.read(sellOperationProvider.notifier).startOperation(sellItems);

      if (!mounted) return;
      showGlassSheetLocked(context, const SellProgressSheet());
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

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final selection = ref.watch(selectionProvider);
    final isSelecting = selection.isNotEmpty;
    final selectedItems = ref.watch(selectedItemsListProvider);
    final currency = ref.watch(currencyProvider);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: Column(
        children: [
          InventoryAppBar(
            searchOpen: _searchOpen,
            onToggleSearch: () => setState(() => _searchOpen = !_searchOpen),
          ),
          InventorySearchBar(
            isOpen: _searchOpen,
            onClose: () => setState(() => _searchOpen = false),
          ),
          const InventoryGrid(),
          if (isSelecting)
            SelectionTray(
              selectedItems: selectedItems,
              currency: currency,
              expanded: _trayExpanded,
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
    );
  }
}
