import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/inventory_item.dart';
import '../auth/widgets/session_status_widget.dart';
import '../portfolio/portfolio_pl_provider.dart';
import 'inventory_provider.dart';
import '../../widgets/sync_indicator.dart';
import 'widgets/item_card.dart';
import 'widgets/sell_bottom_sheet.dart';

final selectedItemsProvider = StateProvider<Set<String>>((ref) => {});

class InventoryScreen extends ConsumerWidget {
  const InventoryScreen({super.key});

  void _showSellSheet(BuildContext context, List<InventoryItem> items) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => SellBottomSheet(items: items),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inventory = ref.watch(filteredInventoryProvider);
    final allItems = ref.watch(inventoryProvider);
    final columns = ref.watch(gridColumnsProvider);
    final selectedIds = ref.watch(selectedItemsProvider);
    final isSelecting = selectedIds.isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: isSelecting
            ? Text('${selectedIds.length} selected')
            : Text(AppLocalizations.of(context).inventoryTitle),
        leading: isSelecting
            ? IconButton(
                icon: const Icon(Icons.close),
                onPressed: () =>
                    ref.read(selectedItemsProvider.notifier).state = {},
              )
            : null,
        actions: [
          const SessionStatusWidget(),
          if (isSelecting) ...[
            // Select all same name
            IconButton(
              icon: const Icon(Icons.select_all),
              tooltip: 'Select all same',
              onPressed: () {
                final items = inventory.valueOrNull ?? [];
                if (selectedIds.isEmpty) return;
                final firstName = items
                    .firstWhere((i) => selectedIds.contains(i.assetId))
                    .marketHashName;
                final sameItems = items
                    .where((i) => i.marketHashName == firstName)
                    .map((i) => i.assetId)
                    .toSet();
                ref.read(selectedItemsProvider.notifier).state = sameItems;
              },
            ),
            // Sell button
            IconButton(
              icon: const Icon(Icons.sell, color: Colors.orangeAccent),
              tooltip: 'Sell selected',
              onPressed: () {
                final items = inventory.valueOrNull ?? [];
                final selected = items
                    .where((i) => selectedIds.contains(i.assetId))
                    .toList();
                if (selected.isNotEmpty) {
                  _showSellSheet(context, selected);
                }
              },
            ),
          ] else ...[
            // Bulk sell
            IconButton(
              icon: const Icon(Icons.sell, color: Colors.orangeAccent),
              tooltip: 'Bulk Sell',
              onPressed: () {
                HapticFeedback.mediumImpact();
                context.push('/inventory/bulk-sell');
              },
            ),
            IconButton(
              icon:
                  Icon(columns <= 2 ? Icons.grid_view : Icons.view_module),
              onPressed: () {
                final next = columns >= 5 ? 2 : columns + 1;
                ref.read(gridColumnsProvider.notifier).state = next;
              },
              tooltip: 'Grid: ${columns}x',
            ),
            PopupMenuButton<SortOption>(
              icon: const Icon(Icons.sort),
              onSelected: (option) {
                ref.read(sortOptionProvider.notifier).state = option;
              },
              itemBuilder: (_) => const [
                PopupMenuItem(
                    value: SortOption.priceDesc,
                    child: Text('Price: High → Low')),
                PopupMenuItem(
                    value: SortOption.priceAsc,
                    child: Text('Price: Low → High')),
                PopupMenuItem(
                    value: SortOption.nameAsc,
                    child: Text('Name: A → Z')),
                PopupMenuItem(
                    value: SortOption.rarity, child: Text('Rarity')),
              ],
            ),
          ],
        ],
      ),
      body: Column(
        children: [
          // Sync indicator
          const Padding(
            padding: EdgeInsets.only(left: 16, right: 16, top: 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: SyncIndicator(),
            ),
          ),
          // Search bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              onChanged: (v) =>
                  ref.read(searchQueryProvider.notifier).state = v,
              decoration: InputDecoration(
                hintText: 'Search items...',
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: Theme.of(context).cardTheme.color,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          // Summary bar
          allItems.whenData((items) {
            final totalValue = items.fold<double>(
                0, (sum, item) => sum + (item.bestPrice ?? 0));
            return Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('${items.length} items',
                      style: const TextStyle(color: Colors.white70)),
                  Text(
                    'Total: \$${totalValue.toStringAsFixed(2)}',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.secondary,
                    ),
                  ),
                ],
              ),
            );
          }).maybeWhen(orElse: () => const SizedBox.shrink()),
          // Grid
          Expanded(
            child: inventory.when(
              data: (items) => RefreshIndicator(
                onRefresh: () =>
                    ref.read(inventoryProvider.notifier).refresh(),
                child: GridView.builder(
                  padding: const EdgeInsets.all(8),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    childAspectRatio: columns <= 2 ? 0.75 : 0.85,
                    crossAxisSpacing: 6,
                    mainAxisSpacing: 6,
                  ),
                  itemCount: items.length,
                  itemBuilder: (_, index) {
                    final item = items[index];
                    final isSelected =
                        selectedIds.contains(item.assetId);
                    final plMap = ref.watch(itemPLMapProvider);
                    return Stack(
                      children: [
                        ItemCard(
                          item: item,
                          compact: columns >= 4,
                          itemPL: plMap[item.marketHashName],
                          onTap: () {
                            if (isSelecting) {
                              _toggleSelection(ref, item.assetId);
                            } else {
                              context.push('/inventory/item-detail',
                                  extra: item);
                            }
                          },
                        ),
                        // Long press to start selection
                        Positioned.fill(
                          child: GestureDetector(
                            onLongPress: () {
                              HapticFeedback.mediumImpact();
                              _toggleSelection(ref, item.assetId);
                            },
                            behavior: HitTestBehavior.translucent,
                            child: const SizedBox.shrink(),
                          ),
                        ),
                        // Selection indicator
                        if (isSelected)
                          Positioned(
                            top: 8,
                            right: 8,
                            child: Container(
                              width: 24,
                              height: 24,
                              decoration: const BoxDecoration(
                                color: Colors.orangeAccent,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.check,
                                  size: 16, color: Colors.black),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline,
                        size: 48, color: Colors.red),
                    const SizedBox(height: 16),
                    Text('Failed to load inventory\n$e',
                        textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: () =>
                          ref.read(inventoryProvider.notifier).refresh(),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _toggleSelection(WidgetRef ref, String assetId) {
    final current = ref.read(selectedItemsProvider);
    final updated = Set<String>.from(current);
    if (updated.contains(assetId)) {
      updated.remove(assetId);
    } else {
      updated.add(assetId);
    }
    ref.read(selectedItemsProvider.notifier).state = updated;
  }
}

