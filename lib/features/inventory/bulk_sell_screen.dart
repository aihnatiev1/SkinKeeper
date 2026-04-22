import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../models/inventory_item.dart';
import '../../widgets/glass_sheet.dart';
import 'inventory_provider.dart';
import 'sell_provider.dart';
import 'widgets/bulk_sell_group_tile.dart';
import 'widgets/bulk_sell_quantity_sheet.dart';
import 'widgets/sell_progress_sheet.dart';

// ---------------------------------------------------------------------------
// Selection state per group
// ---------------------------------------------------------------------------

class _GroupSel {
  Set<String> selectedIds;

  _GroupSel() : selectedIds = {};

  bool get selected => selectedIds.isNotEmpty;
  int get count => selectedIds.length;
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

enum _Sort { priceDesc, priceAsc, countDesc, nameAsc, valueDesc }

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

class BulkSellScreen extends ConsumerStatefulWidget {
  const BulkSellScreen({super.key});

  @override
  ConsumerState<BulkSellScreen> createState() => _BulkSellScreenState();
}

class _BulkSellScreenState extends ConsumerState<BulkSellScreen> {
  List<BulkSellItemGroup> _groups = [];
  final Map<String, _GroupSel> _sel = {};
  _Sort _sort = _Sort.priceDesc;
  String _search = '';
  bool _built = false;

  // --- Data ----------------------------------------------------------------

  void _buildGroups(List<InventoryItem> items) {
    if (_built) return;
    _built = true;

    final map = <String, List<InventoryItem>>{};
    for (final item in items) {
      map.putIfAbsent(item.marketHashName, () => []).add(item);
    }

    _groups = map.entries.map((e) {
      final sorted = List<InventoryItem>.from(e.value)
        ..sort((a, b) {
          if (a.floatValue == null && b.floatValue == null) return 0;
          if (a.floatValue == null) return 1;
          if (b.floatValue == null) return -1;
          return a.floatValue!.compareTo(b.floatValue!);
        });
      return BulkSellItemGroup(marketHashName: e.key, items: sorted);
    }).toList();

    for (final g in _groups) {
      _sel.putIfAbsent(g.marketHashName, () => _GroupSel());
    }

    _applySorting();
  }

  void _applySorting() {
    switch (_sort) {
      case _Sort.priceDesc:
        _groups.sort(
            (a, b) => (b.estimatedPrice ?? 0).compareTo(a.estimatedPrice ?? 0));
      case _Sort.priceAsc:
        _groups.sort(
            (a, b) => (a.estimatedPrice ?? 0).compareTo(b.estimatedPrice ?? 0));
      case _Sort.countDesc:
        _groups.sort((a, b) => b.count.compareTo(a.count));
      case _Sort.nameAsc:
        _groups.sort((a, b) => a.displayName.compareTo(b.displayName));
      case _Sort.valueDesc:
        _groups.sort((a, b) {
          final av = (a.estimatedPrice ?? 0) * a.count;
          final bv = (b.estimatedPrice ?? 0) * b.count;
          return bv.compareTo(av);
        });
    }
  }

  List<BulkSellItemGroup> get _filtered {
    if (_search.isEmpty) return _groups;
    final q = _search.toLowerCase();
    return _groups
        .where((g) => g.marketHashName.toLowerCase().contains(q))
        .toList();
  }

  // --- Totals --------------------------------------------------------------

  int get _totalSellCount {
    int n = 0;
    for (final g in _groups) {
      final s = _sel[g.marketHashName];
      if (s != null) n += s.count;
    }
    return n;
  }

  double get _totalValue {
    double v = 0;
    for (final g in _groups) {
      final s = _sel[g.marketHashName];
      if (s != null && s.selected) {
        v += (g.estimatedPrice ?? 0) * s.count;
      }
    }
    return v;
  }

  bool get _hasSelection => _sel.values.any((s) => s.selected);

  bool get _allSelected =>
      _groups.isNotEmpty &&
      _groups.every((g) => _sel[g.marketHashName]?.selected ?? false);

  // --- Actions -------------------------------------------------------------

  void _toggleSelectAll() {
    final target = !_allSelected;
    setState(() {
      for (final g in _groups) {
        final s = _sel[g.marketHashName]!;
        if (target) {
          // Select all items (up to 1000 per group)
          final take = g.count > 1000 ? 1000 : g.count;
          s.selectedIds = g.items.take(take).map((i) => i.assetId).toSet();
        } else {
          s.selectedIds.clear();
        }
      }
    });
    HapticFeedback.selectionClick();
  }

  void _openQuantitySheet(BulkSellItemGroup group) {
    final s = _sel[group.marketHashName]!;

    // Single item — just toggle selection, no popup needed
    if (group.count == 1) {
      setState(() {
        if (s.selected) {
          s.selectedIds.clear();
        } else {
          s.selectedIds = {group.items.first.assetId};
        }
      });
      HapticFeedback.selectionClick();
      return;
    }

    showGlassSheet(
      context,
      BulkSellQuantitySheet(
        group: group,
        preSelectedIds: Set<String>.from(s.selectedIds),
        currency: ref.read(currencyProvider),
        onConfirm: (chosenIds) {
          setState(() {
            s.selectedIds = chosenIds.toSet();
          });
        },
      ),
    );
  }

  // --- Sell ----------------------------------------------------------------

  List<InventoryItem> _collectItems() {
    final result = <InventoryItem>[];
    for (final g in _groups) {
      final s = _sel[g.marketHashName];
      if (s == null || !s.selected) continue;
      result.addAll(g.items.where((i) => s.selectedIds.contains(i.assetId)));
    }
    return result;
  }

  void _startSell() {
    final items = _collectItems();
    if (items.isEmpty) return;

    // Check for items without Steam price
    final noPrice = items.where((i) => i.steamPrice == null).toList();
    if (noPrice.isNotEmpty) {
      _showNoPriceWarning(noPrice, items);
      return;
    }

    _executeSell(items);
  }

  void _showNoPriceWarning(List<InventoryItem> noPrice, List<InventoryItem> allItems) {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.bgSecondary,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textDisabled,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            const Icon(Icons.warning_amber_rounded, color: AppTheme.warning, size: 32),
            const SizedBox(height: 10),
            Text(
              '${noPrice.length} item${noPrice.length > 1 ? 's' : ''} without Steam price',
              style: const TextStyle(
                fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'These items have no current Steam Market price. Remove them from selection or sell individually with a custom price.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 12),
            // List of items without price
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 150),
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: noPrice.length,
                itemBuilder: (_, i) {
                  final item = noPrice[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: Image.network(item.fullIconUrl, width: 36, height: 28, fit: BoxFit.contain),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            item.marketHashName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12, color: AppTheme.textPrimary),
                          ),
                        ),
                        const Text('No price', style: TextStyle(fontSize: 11, color: AppTheme.loss)),
                      ],
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 16),
            // Buttons
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 44,
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: AppTheme.borderLight),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('Back', style: TextStyle(color: AppTheme.textSecondary)),
                    ),
                  ),
                ),
                if (allItems.length > noPrice.length) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: SizedBox(
                      height: 44,
                      child: ElevatedButton(
                        onPressed: () {
                          Navigator.pop(ctx);
                          final withPrice = allItems.where((i) => i.steamPrice != null).toList();
                          _executeSell(withPrice);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.warning,
                          foregroundColor: Colors.black,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        child: Text(
                          'Sell ${allItems.length - noPrice.length} with price',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _executeSell(List<InventoryItem> items) {
    HapticFeedback.heavyImpact();

    final payload = items
        .map((i) => {
              'assetId': i.assetId,
              'marketHashName': i.marketHashName,
              'priceCents': 0, // resolved by startQuickSell via histogram
              if (i.accountId != null) 'accountId': i.accountId,
            })
        .toList();

    // Pop bulk sell screen first, then show progress sheet immediately
    // startQuickSell handles: fetch prices → create operation → poll
    if (mounted) {
      final nav = Navigator.of(context);
      nav.pop();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        showGlassSheetLocked(nav.context, const SellProgressSheet());
        ref.read(sellOperationProvider.notifier).startQuickSell(
          payload,
          accountId: items.first.accountId,
        );
      });
    }
  }

  // --- Build ---------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final inventoryAsync = ref.watch(inventoryProvider);

    return inventoryAsync.when(
      data: (items) {
        _buildGroups(items);
        return _buildScaffold();
      },
      loading: () => const Scaffold(
        backgroundColor: AppTheme.bg,
        body: Center(child: CircularProgressIndicator(color: AppTheme.primary)),
      ),
      error: (e, _) => Scaffold(
        backgroundColor: AppTheme.bg,
        body: const Center(child: Text('Failed to load', style: TextStyle(color: AppTheme.textSecondary))),
      ),
    );
  }

  Widget _buildScaffold() {
    final groups = _filtered;

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 16, 8, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 20, color: AppTheme.textSecondary),
                    onPressed: () => context.pop(),
                  ),
                  Expanded(
                    child: Text(
                      'Sell Multiple Items'.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.5,
                        color: AppTheme.textDisabled,
                      ),
                    ),
                  ),
                  PopupMenuButton<_Sort>(
                    onSelected: (s) {
                      HapticFeedback.selectionClick();
                      setState(() { _sort = s; _applySorting(); });
                    },
                    offset: const Offset(0, 42),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    color: const Color(0xFF1E2A48),
                    elevation: 12,
                    itemBuilder: (_) => {
                      _Sort.priceDesc: (Icons.arrow_downward_rounded, 'Price: high \u2192 low'),
                      _Sort.priceAsc:  (Icons.arrow_upward_rounded,   'Price: low \u2192 high'),
                      _Sort.countDesc: (Icons.stacked_bar_chart_rounded, 'Quantity: most first'),
                      _Sort.valueDesc: (Icons.account_balance_wallet_rounded, 'Total value: high \u2192 low'),
                      _Sort.nameAsc:   (Icons.sort_by_alpha_rounded, 'Name: A \u2192 Z'),
                    }.entries.map((e) {
                      final selected = e.key == _sort;
                      return PopupMenuItem<_Sort>(
                        value: e.key,
                        height: 44,
                        child: Row(
                          children: [
                            Icon(e.value.$1, size: 16,
                              color: selected ? AppTheme.primary : AppTheme.textMuted),
                            const SizedBox(width: 10),
                            Text(e.value.$2, style: TextStyle(
                              fontSize: 13,
                              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                              color: selected ? AppTheme.primary : Colors.white.withValues(alpha: 0.85),
                            )),
                            if (selected) ...[
                              const Spacer(),
                              Icon(Icons.check_rounded, size: 16, color: AppTheme.primary),
                            ],
                          ],
                        ),
                      );
                    }).toList(),
                    icon: const Icon(Icons.sort_rounded, size: 20, color: AppTheme.textSecondary),
                  ),
                ],
              ),
            ),
            Expanded(child: Column(
        children: [
          // Search
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: TextField(
              onChanged: (v) => setState(() => _search = v),
              decoration: InputDecoration(
                hintText: 'Search items...',
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: AppTheme.surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.r12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),

          // Select all
          _buildSelectAllRow(),
          Divider(height: 1, color: AppTheme.divider),

          // Groups list
          Expanded(
            child: ListView.builder(
              itemCount: groups.length,
              itemBuilder: (_, i) {
                final group = groups[i];
                final s = _sel[group.marketHashName]!;
                return BulkSellGroupTile(
                  group: group,
                  selected: s.selected,
                  onTap: () => _openQuantitySheet(group),
                );
              },
            ),
          ),

          // Bottom bar (always visible so CTA is discoverable)
          _buildBottomBar(),
        ],
      )),
          ],
        ),
      ),
    );
  }

  // --- Select All ----------------------------------------------------------

  Widget _buildSelectAllRow() {
    final totalItems = _groups.fold<int>(0, (s, g) => s + g.count);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      child: Row(
        children: [
          Checkbox(
            value: _allSelected
                ? true
                : (_sel.values.any((s) => s.selected) ? null : false),
            tristate: true,
            onChanged: (_) => _toggleSelectAll(),
            activeColor: AppTheme.warning,
          ),
          Text(
            'Select All',
            style: AppTheme.bodySmall.copyWith(color: AppTheme.textPrimary),
          ),
          const Spacer(),
          Text(
            '$totalItems items total',
            style: AppTheme.caption,
          ),
          const SizedBox(width: 12),
        ],
      ),
    );
  }

  // --- Helper: selected groups with counts ---------------------------------

  List<({BulkSellItemGroup group, int count})> get _selectedGroups {
    final result = <({BulkSellItemGroup group, int count})>[];
    for (final g in _groups) {
      final s = _sel[g.marketHashName];
      if (s != null && s.selected) {
        result.add((group: g, count: s.count));
      }
    }
    return result;
  }

  // --- Selected items sheet ------------------------------------------------

  void _showSelectedItemsSheet() {
    final selected = _selectedGroups;
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.bgSecondary,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.5,
        maxChildSize: 0.8,
        minChildSize: 0.3,
        expand: false,
        builder: (_, scrollCtrl) => StatefulBuilder(
          builder: (ctx, setSheetState) => Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Text('$_totalSellCount items to sell', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
                    const Spacer(),
                    Text('~${ref.read(currencyProvider).format(_totalValue)}', style: const TextStyle(fontSize: 14, color: AppTheme.primary, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
              Expanded(
                child: ListView.builder(
                  controller: scrollCtrl,
                  itemCount: selected.length,
                  itemBuilder: (_, i) {
                    final entry = selected[i];
                    return ListTile(
                      leading: ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: Container(
                          width: 36, height: 36,
                          color: AppTheme.surface,
                          child: entry.group.fullIconUrl.isNotEmpty
                              ? Image.network(entry.group.fullIconUrl, fit: BoxFit.contain)
                              : null,
                        ),
                      ),
                      title: Text(entry.group.displayName, style: const TextStyle(fontSize: 13, color: Colors.white)),
                      subtitle: Text('${entry.count} × ${ref.read(currencyProvider).format(entry.group.estimatedPrice ?? 0)}', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                      trailing: GestureDetector(
                        onTap: () {
                          setState(() {
                            _sel[entry.group.marketHashName]!.selectedIds.clear();
                          });
                          setSheetState(() {});
                          // Close if nothing left
                          if (!_hasSelection) Navigator.pop(ctx);
                        },
                        child: const Icon(Icons.close_rounded, size: 18, color: AppTheme.loss),
                      ),
                      dense: true,
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // --- Bottom bar ----------------------------------------------------------

  Widget _buildBottomBar() {
    final selected = _selectedGroups;

    return Container(
      padding: const EdgeInsets.only(
        top: 10,
        bottom: 10,
      ),
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        border: Border(top: BorderSide(color: AppTheme.border)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Selected items preview (only when items selected)
          if (_hasSelection) SizedBox(
            height: 62,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: selected.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final entry = selected[i];
                return GestureDetector(
                  onTap: () => _openQuantitySheet(entry.group),
                  child: Container(
                    width: 56,
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: AppTheme.warning.withValues(alpha: 0.25),
                      ),
                    ),
                    child: Stack(
                      children: [
                        // Item image
                        Center(
                          child: Padding(
                            padding: const EdgeInsets.all(4),
                            child: entry.group.fullIconUrl.isNotEmpty
                                ? CachedNetworkImage(
                                    imageUrl: entry.group.fullIconUrl,
                                    fit: BoxFit.contain,
                                  )
                                : const Icon(Icons.image_not_supported,
                                    size: 16, color: AppTheme.textDisabled),
                          ),
                        ),
                        // Count badge
                        if (entry.count > 1)
                          Positioned(
                            right: 2,
                            top: 2,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 4, vertical: 1),
                              decoration: BoxDecoration(
                                color: AppTheme.warning,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                '${entry.count}',
                                style: const TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.black,
                                ),
                              ),
                            ),
                          ),
                        // Remove button
                        Positioned(
                          left: 2,
                          top: 2,
                          child: GestureDetector(
                            onTap: () {
                              HapticFeedback.selectionClick();
                              setState(() {
                                _sel[entry.group.marketHashName]!
                                    .selectedIds
                                    .clear();
                              });
                            },
                            child: Container(
                              width: 16,
                              height: 16,
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.6),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.close,
                                  size: 10, color: AppTheme.textSecondary),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          if (_hasSelection) const SizedBox(height: 10),
          // Summary + sell button
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: _hasSelection ? _showSelectedItemsSheet : null,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Text(
                              _hasSelection
                                  ? 'Selling $_totalSellCount items'
                                  : 'Select items to sell',
                              style: AppTheme.title,
                            ),
                            if (_hasSelection) ...[
                              const SizedBox(width: 4),
                              Icon(Icons.expand_less_rounded, size: 16, color: AppTheme.textMuted),
                            ],
                          ],
                        ),
                        if (_hasSelection)
                          Text(
                            '~${ref.watch(currencyProvider).format(_totalValue)}',
                            style: AppTheme.mono.copyWith(
                              fontSize: 13,
                              color: AppTheme.primary,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                SizedBox(
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: _totalSellCount > 0 ? _startSell : null,
                    icon: const Icon(Icons.sell, size: 18),
                    label: const Text(
                      'Quick Sell',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.warning,
                      foregroundColor: Colors.black,
                      disabledBackgroundColor: AppTheme.warning.withValues(alpha: 0.15),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppTheme.r16),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      elevation: 0,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
