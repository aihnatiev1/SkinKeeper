import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/inventory_item.dart';
import '../auth/widgets/session_status_widget.dart';
import 'inventory_provider.dart';
import 'sell_provider.dart';
import 'widgets/item_card.dart';
import 'widgets/sell_bottom_sheet.dart';
import 'widgets/sell_progress_sheet.dart';

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

  void _showDuplicatesSheet(BuildContext context, WidgetRef ref) {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _DuplicatesSheet(
        onSellItems: (items) {
          Navigator.pop(context);
          _showSellSheet(context, items);
        },
        onSellAllDuplicates: (allItems) {
          Navigator.pop(context);
          // Start batch sell operation directly
          final sellItems = allItems
              .map((item) => {
                    'assetId': item.assetId,
                    'marketHashName': item.marketHashName,
                    'priceCents': 0, // will use quick price on backend
                  })
              .toList();
          ref
              .read(sellOperationProvider.notifier)
              .startOperation(sellItems);
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            isDismissible: false,
            enableDrag: false,
            backgroundColor: Colors.transparent,
            builder: (_) => const SellProgressSheet(),
          );
        },
      ),
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
            : const Text('Inventory'),
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
            // Sell duplicates
            IconButton(
              icon: const Icon(Icons.copy_all, color: Colors.orangeAccent),
              tooltip: 'Sell Duplicates',
              onPressed: () => _showDuplicatesSheet(context, ref),
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
                    return Stack(
                      children: [
                        ItemCard(
                          item: item,
                          compact: columns >= 4,
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

// ---------------------------------------------------------------------------
// Duplicates bottom sheet
// ---------------------------------------------------------------------------

class _DuplicatesSheet extends ConsumerWidget {
  final void Function(List<InventoryItem> items) onSellItems;
  final void Function(List<InventoryItem> allItems) onSellAllDuplicates;

  const _DuplicatesSheet({
    required this.onSellItems,
    required this.onSellAllDuplicates,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final duplicatesAsync = ref.watch(duplicatesProvider);

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.7,
      ),
      padding: const EdgeInsets.only(left: 20, right: 20, top: 12, bottom: 20),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: Colors.white.withAlpha(15)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Title
          const Row(
            children: [
              Icon(Icons.copy_all, color: Colors.orangeAccent, size: 22),
              SizedBox(width: 10),
              Text(
                'Sell Duplicates',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Content
          duplicatesAsync.when(
            data: (groups) {
              if (groups.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      Icon(Icons.check_circle_outline,
                          size: 48,
                          color: Colors.white.withAlpha(60)),
                      const SizedBox(height: 12),
                      Text(
                        'No duplicate items found',
                        style: TextStyle(
                          color: Colors.white.withAlpha(140),
                          fontSize: 15,
                        ),
                      ),
                    ],
                  ),
                );
              }

              final totalItems =
                  groups.fold<int>(0, (sum, g) => sum + g.count - 1);
              final totalValueCents = groups.fold<int>(
                  0, (sum, g) => sum + g.bestPriceCents * (g.count - 1));
              final totalStr =
                  '\$${(totalValueCents / 100).toStringAsFixed(2)}';

              return Flexible(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Summary
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: Colors.orangeAccent.withAlpha(15),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: Colors.orangeAccent.withAlpha(40)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '$totalItems duplicate items',
                            style: const TextStyle(
                              fontSize: 13,
                              color: Colors.orangeAccent,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          Text(
                            '~$totalStr',
                            style: const TextStyle(
                              fontSize: 14,
                              color: Colors.orangeAccent,
                              fontWeight: FontWeight.bold,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Duplicate groups list
                    Flexible(
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: groups.length,
                        itemBuilder: (_, index) =>
                            _buildGroupRow(context, groups[index]),
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Sell All Duplicates button
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        onPressed: () {
                          HapticFeedback.heavyImpact();
                          // Build InventoryItem list from duplicates
                          // Keep count-1 of each (sell extras, keep one)
                          final items = <InventoryItem>[];
                          for (final group in groups) {
                            // Sell all but one
                            for (int i = 1; i < group.assetIds.length; i++) {
                              items.add(InventoryItem(
                                assetId: group.assetIds[i],
                                marketHashName: group.marketHashName,
                                iconUrl: group.iconUrl,
                              ));
                            }
                          }
                          onSellAllDuplicates(items);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.orangeAccent,
                          foregroundColor: Colors.black,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                          elevation: 0,
                        ),
                        child: Text(
                          'Quick Sell All Duplicates ($totalStr)',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
            loading: () => const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Failed to load duplicates: $e',
                style: const TextStyle(color: Colors.redAccent),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGroupRow(BuildContext context, DuplicateGroup group) {
    final extras = group.count - 1; // keep one, sell extras
    final valueStr =
        '\$${(group.bestPriceCents * extras / 100).toStringAsFixed(2)}';
    final parts = group.marketHashName.split(' | ');
    final displayName =
        parts.length > 1 ? parts[1].split(' (').first : group.marketHashName;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.white.withAlpha(8)),
        ),
      ),
      child: Row(
        children: [
          // Icon
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Container(
              width: 40,
              height: 40,
              color: Colors.white.withAlpha(10),
              child: Image.network(
                group.fullIconUrl,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const Icon(
                    Icons.image_not_supported,
                    size: 18,
                    color: Colors.white24),
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  displayName,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  '${group.count} owned · sell $extras',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.white.withAlpha(120),
                  ),
                ),
              ],
            ),
          ),
          // Value
          Text(
            '~$valueStr',
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFF00D2D3),
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
