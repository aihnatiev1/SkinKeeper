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
import 'widgets/bulk_sell_bottom_bar.dart';
import 'widgets/bulk_sell_group_tile.dart';
import 'widgets/bulk_sell_parts.dart';
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
  BulkSellSort _sort = BulkSellSort.priceDesc;
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
      case BulkSellSort.priceDesc:
        _groups.sort(
            (a, b) => (b.estimatedPrice ?? 0).compareTo(a.estimatedPrice ?? 0));
      case BulkSellSort.priceAsc:
        _groups.sort(
            (a, b) => (a.estimatedPrice ?? 0).compareTo(b.estimatedPrice ?? 0));
      case BulkSellSort.countDesc:
        _groups.sort((a, b) => b.count.compareTo(a.count));
      case BulkSellSort.nameAsc:
        _groups.sort((a, b) => a.displayName.compareTo(b.displayName));
      case BulkSellSort.valueDesc:
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
      builder: (ctx) => BulkSellNoPriceSheet(
        noPrice: noPrice,
        allItems: allItems,
        onSellWithPrice: _executeSell,
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
    final totalItems = _groups.fold<int>(0, (s, g) => s + g.count);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          children: [
            BulkSellAppBar(
              onBack: () => context.pop(),
              sort: _sort,
              onSortChanged: (s) {
                setState(() { _sort = s; _applySorting(); });
              },
            ),
            Expanded(child: Column(
        children: [
          BulkSellSearchField(
            onChanged: (v) => setState(() => _search = v),
          ),

          BulkSellSelectAllRow(
            allSelected: _allSelected,
            anySelected: _sel.values.any((s) => s.selected),
            totalItems: totalItems,
            onToggle: _toggleSelectAll,
          ),
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
          BulkSellBottomBar(
            selected: _selectedGroups,
            hasSelection: _hasSelection,
            totalSellCount: _totalSellCount,
            totalValue: _totalValue,
            onOpenQuantitySheet: _openQuantitySheet,
            onRemoveGroup: (g) {
              setState(() {
                _sel[g.marketHashName]!.selectedIds.clear();
              });
            },
            onShowSelected: _showSelectedItemsSheet,
            onStartSell: _totalSellCount > 0 ? _startSell : null,
          ),
        ],
      )),
          ],
        ),
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
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.bgSecondary,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => BulkSellSelectedItemsSheet(
        selectedProvider: () => _selectedGroups,
        totalSellCount: () => _totalSellCount,
        totalValue: () => _totalValue,
        hasSelection: () => _hasSelection,
        onRemoveGroup: (group) {
          setState(() {
            _sel[group.marketHashName]!.selectedIds.clear();
          });
        },
      ),
    );
  }
}
