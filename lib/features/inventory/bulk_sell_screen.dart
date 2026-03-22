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
import 'widgets/sell_progress_sheet.dart';

// ---------------------------------------------------------------------------
// Item group (same market_hash_name)
// ---------------------------------------------------------------------------

class _ItemGroup {
  final String marketHashName;
  final String displayName;
  final String weaponName;
  final String fullIconUrl;
  final double? steamPrice;
  final double? bestPrice;
  final String? wear;
  final List<InventoryItem> items; // sorted by float

  _ItemGroup({required this.marketHashName, required this.items})
      : displayName = _extractDisplay(marketHashName),
        weaponName = marketHashName.split(' | ').first,
        fullIconUrl = items.first.fullIconUrl,
        steamPrice = items.first.steamPrice,
        bestPrice = items.first.bestPrice,
        wear = items.first.wear;

  int get count => items.length;
  double? get estimatedPrice => steamPrice ?? bestPrice;

  static String _extractDisplay(String name) {
    final parts = name.split(' | ');
    return parts.length > 1 ? parts[1].split(' (').first : name;
  }
}

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
  List<_ItemGroup> _groups = [];
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
      return _ItemGroup(marketHashName: e.key, items: sorted);
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

  List<_ItemGroup> get _filtered {
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

  void _openQuantitySheet(_ItemGroup group) {
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
      _BulkSellQuantitySheet(
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

    HapticFeedback.heavyImpact();

    final payload = items
        .map((i) => {
              'assetId': i.assetId,
              'marketHashName': i.marketHashName,
              'priceCents': 0, // quickprice on backend
              if (i.accountId != null) 'accountId': i.accountId,
            })
        .toList();

    ref.read(sellOperationProvider.notifier).startOperation(payload);

    // Pop bulk sell screen first, then show progress on parent
    if (mounted) {
      final nav = Navigator.of(context);
      nav.pop();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        showGlassSheetLocked(nav.context, const SellProgressSheet());
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
                  const Expanded(
                    child: Text(
                      'Sell Multiple Items',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -0.5,
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
              itemBuilder: (_, i) => _buildGroupTile(groups[i]),
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

  // --- Group tile ----------------------------------------------------------

  Widget _buildGroupTile(_ItemGroup group) {
    final s = _sel[group.marketHashName]!;
    final currency = ref.watch(currencyProvider);
    final priceStr = group.estimatedPrice != null
        ? currency.format(group.estimatedPrice!)
        : '—';

    return Column(
      children: [
        InkWell(
          onTap: () => _openQuantitySheet(group),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
            child: Row(
              children: [
                // Selection indicator
                SizedBox(
                  width: 36,
                  child: Center(
                    child: s.selected
                        ? Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              color: AppTheme.primary,
                              borderRadius: BorderRadius.circular(5),
                            ),
                            child: const Icon(Icons.check_rounded,
                                size: 14, color: Colors.white),
                          )
                        : Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(5),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.2),
                                width: 1.5,
                              ),
                            ),
                          ),
                  ),
                ),

                // Image
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    width: 44,
                    height: 44,
                    color: AppTheme.surface,
                    child: group.fullIconUrl.isNotEmpty
                        ? CachedNetworkImage(
                            imageUrl: group.fullIconUrl,
                            fit: BoxFit.contain,
                            errorWidget: (_, _, _) => const Icon(
                                Icons.image_not_supported,
                                size: 18,
                                color: AppTheme.textDisabled),
                          )
                        : const Icon(Icons.image_not_supported,
                            size: 18, color: AppTheme.textDisabled),
                  ),
                ),
                const SizedBox(width: 10),

                // Name
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${group.items.first.isStatTrak ? 'ST ' : ''}${group.items.first.isSouvenir ? 'SV ' : ''}${group.displayName}',
                        style: AppTheme.bodySmall.copyWith(
                          fontWeight: FontWeight.w600,
                          color: s.selected
                              ? Colors.white
                              : AppTheme.textPrimary,
                        ),
                        overflow: TextOverflow.ellipsis,
                        maxLines: 1,
                      ),
                      Row(
                        children: [
                          if (group.items.first.accountName != null)
                            Container(
                              margin: const EdgeInsets.only(right: 6),
                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                              decoration: BoxDecoration(
                                color: AppTheme.primary.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(3),
                                border: Border.all(color: AppTheme.primary.withValues(alpha: 0.3), width: 0.5),
                              ),
                              child: Text(
                                group.items.first.accountName!.length > 8
                                    ? '${group.items.first.accountName!.substring(0, 8)}…'
                                    : group.items.first.accountName!,
                                style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w600, color: AppTheme.primaryLight),
                              ),
                            ),
                          Flexible(
                            child: Text(
                              group.weaponName.replaceFirst('★ ', '').replaceFirst('StatTrak™ ', '').replaceFirst('Souvenir ', ''),
                              style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted),
                              overflow: TextOverflow.ellipsis,
                              maxLines: 1,
                            ),
                          ),
                          if (group.wear != null) ...[
                            Text(' · ', style: TextStyle(color: AppTheme.textDisabled, fontSize: 10)),
                            Text(
                              group.wear!,
                              style: const TextStyle(fontSize: 10, color: AppTheme.textDisabled),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),

                // Count badge — only show when more than 1
                if (group.count > 1) ...[
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: s.selected
                          ? AppTheme.warning.withValues(alpha: 0.1)
                          : Colors.white.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: s.selected
                            ? AppTheme.warning.withValues(alpha: 0.3)
                            : Colors.white.withValues(alpha: 0.08),
                        width: 0.5,
                      ),
                    ),
                    child: Text(
                      'x${group.count}',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: s.selected
                            ? AppTheme.warning
                            : AppTheme.textMuted,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                ],

                // Price
                Text(
                  priceStr,
                  style: AppTheme.mono.copyWith(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.primary,
                  ),
                ),

                const SizedBox(width: 4),
              ],
            ),
          ),
        ),

      ],
    );
  }

  // --- Helper: selected groups with counts ---------------------------------

  List<({_ItemGroup group, int count})> get _selectedGroups {
    final result = <({_ItemGroup group, int count})>[];
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

// ===========================================================================
// Quantity picker bottom sheet (same UX as trades)
// ===========================================================================

class _BulkSellQuantitySheet extends StatefulWidget {
  final _ItemGroup group;
  final Set<String> preSelectedIds;
  final void Function(List<String> assetIds) onConfirm;
  final CurrencyInfo currency;

  const _BulkSellQuantitySheet({
    required this.group,
    required this.preSelectedIds,
    required this.onConfirm,
    required this.currency,
  });

  @override
  State<_BulkSellQuantitySheet> createState() => _BulkSellQuantitySheetState();
}

class _BulkSellQuantitySheetState extends State<_BulkSellQuantitySheet> {
  late bool _hasUniqueItems;
  late int _quantity;
  late Set<String> _manualSelected;

  int get _max => widget.group.count > 1000 ? 1000 : widget.group.count;

  @override
  void initState() {
    super.initState();
    _hasUniqueItems = widget.group.items.any((i) => i.floatValue != null);
    _manualSelected = Set<String>.from(widget.preSelectedIds);
    _quantity = widget.preSelectedIds.length;
  }

  int get _selectedCount =>
      _hasUniqueItems ? _manualSelected.length : _quantity;

  @override
  Widget build(BuildContext context) {
    final price = widget.group.estimatedPrice ?? 0;
    final totalPrice = price * _selectedCount;

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(AppTheme.r20)),
        border: const Border(
          top: BorderSide(color: AppTheme.warning, width: 2),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 14),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textDisabled,
                borderRadius: BorderRadius.circular(2),
              ),
            ),

            // Item preview
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppTheme.r8),
                    child: Container(
                      width: 48,
                      height: 48,
                      color: AppTheme.surface,
                      child: widget.group.fullIconUrl.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: widget.group.fullIconUrl,
                              fit: BoxFit.contain,
                            )
                          : const Icon(Icons.image_not_supported,
                              color: AppTheme.textDisabled),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.group.displayName,
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w600),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (price > 0)
                          Text(
                            '${widget.currency.format(price)} each',
                            style: const TextStyle(
                                fontSize: 12, color: AppTheme.textMuted),
                          ),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppTheme.warning.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'x${widget.group.count}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.warning,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Content: slider or manual list
            if (_hasUniqueItems) _buildManualList() else _buildSlider(),

            const SizedBox(height: 8),

            // Total + confirm
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Row(
                children: [
                  if (price > 0)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Total value',
                          style:
                              TextStyle(fontSize: 11, color: AppTheme.textMuted),
                        ),
                        Text(
                          '~${widget.currency.format(totalPrice)}',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  const Spacer(),
                  GestureDetector(
                    onTap: () {
                      HapticFeedback.mediumImpact();
                      if (_hasUniqueItems) {
                        widget.onConfirm(_manualSelected.toList());
                      } else {
                        final ids = widget.group.items
                            .take(_quantity)
                            .map((i) => i.assetId)
                            .toList();
                        widget.onConfirm(ids);
                      }
                      context.pop();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 24, vertical: 12),
                      decoration: BoxDecoration(
                        color: AppTheme.warning,
                        borderRadius: BorderRadius.circular(AppTheme.r12),
                        boxShadow: [
                          BoxShadow(
                            color: AppTheme.warning.withValues(alpha: 0.3),
                            blurRadius: 10,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Text(
                        _selectedCount == 0 ? 'Clear' : 'Select $_selectedCount',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.black,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Slider mode (generic items: cases, stickers, etc.) ──
  Widget _buildSlider() {
    final max = _max;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _QtyCircleBtn(
                icon: Icons.remove_rounded,
                enabled: _quantity > 0,
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _quantity--);
                },
              ),
              const SizedBox(width: 20),
              Text(
                '$_quantity',
                style: const TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  letterSpacing: -1,
                ),
              ),
              const SizedBox(width: 20),
              _QtyCircleBtn(
                icon: Icons.add_rounded,
                enabled: _quantity < max,
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _quantity++);
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (max > 2)
            SliderTheme(
              data: SliderThemeData(
                activeTrackColor: AppTheme.warning,
                inactiveTrackColor: AppTheme.warning.withValues(alpha: 0.15),
                thumbColor: AppTheme.warning,
                overlayColor: AppTheme.warning.withValues(alpha: 0.12),
                trackHeight: 4,
                thumbShape:
                    const RoundSliderThumbShape(enabledThumbRadius: 8),
              ),
              child: Slider(
                value: _quantity.toDouble(),
                min: 0,
                max: max.toDouble(),
                divisions: max,
                onChanged: (v) {
                  final newQty = v.round();
                  if (newQty != _quantity) {
                    HapticFeedback.selectionClick();
                    setState(() => _quantity = newQty);
                  }
                },
              ),
            ),
          if (max > 3)
            Padding(
              padding: const EdgeInsets.only(top: 4, bottom: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _QuickBtn(
                    label: '0',
                    selected: _quantity == 0,
                    onTap: () => setState(() => _quantity = 0),
                  ),
                  if (max >= 10)
                    _QuickBtn(
                      label: '${max ~/ 4}',
                      selected: _quantity == max ~/ 4,
                      onTap: () => setState(() => _quantity = max ~/ 4),
                    ),
                  if (max >= 4)
                    _QuickBtn(
                      label: '${max ~/ 2}',
                      selected: _quantity == max ~/ 2,
                      onTap: () => setState(() => _quantity = max ~/ 2),
                    ),
                  _QuickBtn(
                    label: 'All ($max)',
                    selected: _quantity == max,
                    onTap: () => setState(() => _quantity = max),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ── Manual mode (unique items: weapons with floats) ──
  Widget _buildManualList() {
    final max = _max;
    final sorted = List<InventoryItem>.from(widget.group.items)
      ..sort((a, b) => (a.floatValue ?? 999).compareTo(b.floatValue ?? 999));

    return Column(
      children: [
        // Select all / clear row
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            children: [
              Text(
                '${_manualSelected.length} selected',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.warning,
                ),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() {
                    if (_manualSelected.length == max ||
                        _manualSelected.length == sorted.length) {
                      _manualSelected.clear();
                    } else {
                      _manualSelected = sorted
                          .take(max)
                          .map((i) => i.assetId)
                          .toSet();
                    }
                  });
                },
                child: Text(
                  _manualSelected.length == max ||
                          _manualSelected.length == sorted.length
                      ? 'Clear all'
                      : 'Select all',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.warning.withValues(alpha: 0.8),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        // Scrollable list
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 280),
          child: ListView.separated(
            shrinkWrap: true,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            itemCount: sorted.length,
            separatorBuilder: (_, _) =>
                Divider(height: 1, color: AppTheme.border),
            itemBuilder: (_, index) {
              final item = sorted[index];
              final selected = _manualSelected.contains(item.assetId);
              final atLimit = !selected && _manualSelected.length >= max;

              return InkWell(
                onTap: atLimit && !selected
                    ? null
                    : () {
                        HapticFeedback.selectionClick();
                        setState(() {
                          if (selected) {
                            _manualSelected.remove(item.assetId);
                          } else {
                            _manualSelected.add(item.assetId);
                          }
                        });
                      },
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
                  child: Row(
                    children: [
                      Icon(
                        selected
                            ? Icons.check_circle_rounded
                            : Icons.circle_outlined,
                        size: 20,
                        color: selected
                            ? AppTheme.warning
                            : atLimit
                                ? AppTheme.textDisabled.withValues(alpha: 0.3)
                                : AppTheme.textDisabled,
                      ),
                      const SizedBox(width: 10),
                      if (item.floatValue != null)
                        Expanded(
                          child: Text(
                            item.floatValue!.toStringAsFixed(8),
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: selected
                                  ? FontWeight.w600
                                  : FontWeight.normal,
                              fontFamily: 'monospace',
                              color: selected
                                  ? Colors.white
                                  : atLimit
                                      ? AppTheme.textDisabled
                                      : AppTheme.textSecondary,
                            ),
                          ),
                        )
                      else
                        Expanded(
                          child: Text(
                            '#${item.assetId.length > 6 ? item.assetId.substring(item.assetId.length - 6) : item.assetId}',
                            style: TextStyle(
                              fontSize: 13,
                              color: atLimit
                                  ? AppTheme.textDisabled
                                  : AppTheme.textSecondary,
                            ),
                          ),
                        ),
                      if (item.steamPrice != null)
                        Text(
                          widget.currency.format(item.steamPrice!),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: selected ? Colors.white : AppTheme.textMuted,
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

// ===========================================================================
// Supporting widgets
// ===========================================================================

class _QtyCircleBtn extends StatelessWidget {
  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;

  const _QtyCircleBtn({
    required this.icon,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: enabled
              ? AppTheme.warning.withValues(alpha: 0.15)
              : AppTheme.surface,
          shape: BoxShape.circle,
          border: Border.all(
            color: enabled
                ? AppTheme.warning.withValues(alpha: 0.3)
                : AppTheme.border,
          ),
        ),
        child: Icon(
          icon,
          size: 20,
          color: enabled ? AppTheme.warning : AppTheme.textDisabled,
        ),
      ),
    );
  }
}

class _QuickBtn extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _QuickBtn({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected
                ? AppTheme.warning.withValues(alpha: 0.15)
                : AppTheme.surface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: selected
                  ? AppTheme.warning.withValues(alpha: 0.4)
                  : AppTheme.border,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              color: selected ? AppTheme.warning : AppTheme.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}
