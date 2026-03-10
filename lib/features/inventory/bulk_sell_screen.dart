import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../models/inventory_item.dart';
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
  bool selected;
  int sellCount;
  bool expanded;
  Set<String> pickedIds; // individual picks (overrides sellCount when non-empty)

  _GroupSel({
    this.sellCount = 0,
    Set<String>? pickedIds,
  })  : selected = false,
        expanded = false,
        pickedIds = pickedIds ?? {};

  bool get isIndividualMode => pickedIds.isNotEmpty;
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

enum _Sort { countDesc, priceDesc, nameAsc, valueDesc }

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
  _Sort _sort = _Sort.countDesc;
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
      _sel.putIfAbsent(
        g.marketHashName,
        () => _GroupSel(sellCount: g.count > 1 ? g.count - 1 : 1),
      );
    }

    _applySorting();
  }

  void _applySorting() {
    switch (_sort) {
      case _Sort.countDesc:
        _groups.sort((a, b) => b.count.compareTo(a.count));
      case _Sort.priceDesc:
        _groups.sort(
            (a, b) => (b.estimatedPrice ?? 0).compareTo(a.estimatedPrice ?? 0));
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
      if (s != null && s.selected) {
        n += s.isIndividualMode ? s.pickedIds.length : s.sellCount;
      }
    }
    return n;
  }

  double get _totalValue {
    double v = 0;
    for (final g in _groups) {
      final s = _sel[g.marketHashName];
      if (s != null && s.selected) {
        final cnt = s.isIndividualMode ? s.pickedIds.length : s.sellCount;
        v += (g.estimatedPrice ?? 0) * cnt;
      }
    }
    return v;
  }

  bool get _hasSelection => _sel.values.any((s) => s.selected && _effectiveCount(s) > 0);

  int _effectiveCount(_GroupSel s) =>
      s.isIndividualMode ? s.pickedIds.length : s.sellCount;

  bool get _allSelected =>
      _groups.isNotEmpty &&
      _groups.every((g) => _sel[g.marketHashName]?.selected ?? false);

  // --- Actions -------------------------------------------------------------

  void _toggleSelectAll() {
    final target = !_allSelected;
    setState(() {
      for (final g in _groups) {
        final s = _sel[g.marketHashName]!;
        s.selected = target;
        if (target && s.sellCount == 0) {
          s.sellCount = g.count > 1 ? g.count - 1 : 1;
        }
      }
    });
    HapticFeedback.selectionClick();
  }

  void _toggleGroup(String name, int count) {
    setState(() {
      final s = _sel[name]!;
      s.selected = !s.selected;
      if (s.selected && s.sellCount == 0 && s.pickedIds.isEmpty) {
        s.sellCount = count > 1 ? count - 1 : 1;
      }
    });
    HapticFeedback.selectionClick();
  }

  void _setCount(String name, int val, int max) {
    setState(() {
      final s = _sel[name]!;
      s.sellCount = val.clamp(1, max > 1000 ? 1000 : max);
      s.pickedIds.clear(); // back to quantity mode
    });
  }

  void _sellAllGroup(String name, int count) {
    setState(() {
      final s = _sel[name]!;
      s.selected = true;
      s.sellCount = count > 1000 ? 1000 : count;
      s.pickedIds.clear();
    });
    HapticFeedback.selectionClick();
  }

  void _toggleItem(String groupName, String assetId, _ItemGroup group) {
    setState(() {
      final s = _sel[groupName]!;
      if (s.pickedIds.contains(assetId)) {
        s.pickedIds.remove(assetId);
      } else {
        s.pickedIds.add(assetId);
      }
      s.sellCount = s.pickedIds.isEmpty
          ? (group.count > 1 ? group.count - 1 : 1)
          : s.pickedIds.length;
      s.selected = s.pickedIds.isNotEmpty || s.sellCount > 0;
    });
    HapticFeedback.selectionClick();
  }

  void _toggleExpand(String name) {
    setState(() => _sel[name]!.expanded = !_sel[name]!.expanded);
  }

  // --- Sell ----------------------------------------------------------------

  List<InventoryItem> _collectItems() {
    final result = <InventoryItem>[];
    for (final g in _groups) {
      final s = _sel[g.marketHashName];
      if (s == null || !s.selected) continue;

      if (s.isIndividualMode) {
        result.addAll(
            g.items.where((i) => s.pickedIds.contains(i.assetId)));
      } else if (s.sellCount > 0) {
        result.addAll(g.items.take(s.sellCount));
      }
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
            })
        .toList();

    ref.read(sellOperationProvider.notifier).startOperation(payload);

    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (_) => const SellProgressSheet(),
    );
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
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 20, color: AppTheme.textSecondary),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const Expanded(
                    child: Text(
                      'Bulk Sell',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.sort_rounded, size: 20, color: AppTheme.textSecondary),
                    onPressed: () {
                      HapticFeedback.selectionClick();
                      const cycle = _Sort.values;
                      final idx = cycle.indexOf(_sort);
                      setState(() {
                        _sort = cycle[(idx + 1) % cycle.length];
                        _applySorting();
                      });
                    },
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

          // Bottom bar
          if (_hasSelection) _buildBottomBar(),
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
            'Select All (${_groups.length} groups)',
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
    final priceStr = group.estimatedPrice != null
        ? '\$${group.estimatedPrice!.toStringAsFixed(2)}'
        : '—';

    return Column(
      children: [
        // Main row
        InkWell(
          onTap: () => _toggleGroup(group.marketHashName, group.count),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
            child: Row(
              children: [
                // Checkbox
                Checkbox(
                  value: s.selected,
                  onChanged: (_) =>
                      _toggleGroup(group.marketHashName, group.count),
                  activeColor: AppTheme.warning,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
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
                        group.displayName,
                        style: AppTheme.bodySmall.copyWith(
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textPrimary,
                        ),
                        overflow: TextOverflow.ellipsis,
                        maxLines: 1,
                      ),
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              group.weaponName,
                              style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted),
                              overflow: TextOverflow.ellipsis,
                              maxLines: 1,
                            ),
                          ),
                          if (group.wear != null) ...[
                            const SizedBox(width: 6),
                            Text(
                              group.wear!,
                              style: AppTheme.captionSmall.copyWith(
                                fontSize: 10,
                                color: AppTheme.textDisabled,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),

                // Count badge
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: s.selected
                        ? AppTheme.warning.withValues(alpha: 0.08)
                        : AppTheme.surface,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'x${group.count}',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: s.selected
                          ? AppTheme.warning
                          : AppTheme.textSecondary,
                    ),
                  ),
                ),
                const SizedBox(width: 8),

                // Price
                Text(
                  priceStr,
                  style: AppTheme.mono.copyWith(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.accent,
                  ),
                ),

                // Expand (only multi-item groups)
                if (group.count > 1)
                  IconButton(
                    icon: Icon(
                      s.expanded ? Icons.expand_less : Icons.expand_more,
                      size: 20,
                      color: AppTheme.textMuted,
                    ),
                    onPressed: () => _toggleExpand(group.marketHashName),
                    constraints:
                        const BoxConstraints(minWidth: 36, minHeight: 36),
                    padding: EdgeInsets.zero,
                  )
                else
                  const SizedBox(width: 36),
              ],
            ),
          ),
        ),

        // Quantity controls (when selected)
        if (s.selected) _buildQuantityRow(group, s),

        // Expanded items
        if (s.expanded && group.count > 1) _buildExpandedItems(group, s),

        Divider(height: 1, color: AppTheme.divider),
      ],
    );
  }

  // --- Quantity row --------------------------------------------------------

  Widget _buildQuantityRow(_ItemGroup group, _GroupSel s) {
    return Padding(
      padding: const EdgeInsets.only(left: 52, right: 12, bottom: 8),
      child: Row(
        children: [
          // Quick actions
          _QuickChip(
            label: 'All',
            active: !s.isIndividualMode && s.sellCount == group.count,
            onTap: () => _sellAllGroup(group.marketHashName, group.count),
          ),
          const Spacer(),
          // Sell value for this group
          Text(
            '~\$${((group.estimatedPrice ?? 0) * _effectiveCount(s)).toStringAsFixed(2)}',
            style: AppTheme.monoSmall.copyWith(
              color: AppTheme.accent,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 12),
          // Quantity picker
          _QuantityPicker(
            value: s.isIndividualMode ? s.pickedIds.length : s.sellCount,
            max: group.count,
            enabled: !s.isIndividualMode,
            onChanged: (v) =>
                _setCount(group.marketHashName, v, group.count),
          ),
        ],
      ),
    );
  }

  // --- Expanded items ------------------------------------------------------

  Widget _buildExpandedItems(_ItemGroup group, _GroupSel s) {
    return Container(
      margin: const EdgeInsets.only(left: 52, right: 12, bottom: 8),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: AppTheme.surface.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.border),
      ),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: group.items.map((item) {
          final picked = s.pickedIds.contains(item.assetId);
          final hasFloat = item.floatValue != null;

          return GestureDetector(
            onTap: () =>
                _toggleItem(group.marketHashName, item.assetId, group),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: picked
                    ? AppTheme.warning.withValues(alpha: 0.08)
                    : AppTheme.surface,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: picked
                      ? AppTheme.warning.withValues(alpha: 0.3)
                      : AppTheme.border,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    picked
                        ? Icons.check_box
                        : Icons.check_box_outline_blank,
                    size: 16,
                    color: picked
                        ? AppTheme.warning
                        : AppTheme.textDisabled,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    hasFloat
                        ? 'FV ${item.floatValue!.toStringAsFixed(4)}'
                        : '#${item.assetId.length > 4 ? item.assetId.substring(item.assetId.length - 4) : item.assetId}',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight:
                          picked ? FontWeight.w600 : FontWeight.normal,
                      color: picked
                          ? AppTheme.textPrimary
                          : AppTheme.textSecondary,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  // --- Bottom bar ----------------------------------------------------------

  Widget _buildBottomBar() {
    return Container(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 14,
        bottom: MediaQuery.of(context).padding.bottom + 14,
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
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Selling $_totalSellCount items',
                  style: AppTheme.title,
                ),
                Text(
                  '~\$${_totalValue.toStringAsFixed(2)}',
                  style: AppTheme.mono.copyWith(
                    fontSize: 13,
                    color: AppTheme.accent,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
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
    );
  }
}

// ===========================================================================
// Supporting widgets
// ===========================================================================

class _QuickChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _QuickChip(
      {required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: active
              ? AppTheme.warning.withValues(alpha: 0.1)
              : AppTheme.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: active
                ? AppTheme.warning.withValues(alpha: 0.3)
                : AppTheme.border,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: active ? FontWeight.w600 : FontWeight.normal,
            color:
                active ? AppTheme.warning : AppTheme.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _QuantityPicker extends StatelessWidget {
  final int value;
  final int max;
  final bool enabled;
  final ValueChanged<int> onChanged;

  const _QuantityPicker({
    required this.value,
    required this.max,
    required this.onChanged,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _CBtn(
            icon: Icons.remove,
            active: enabled && value > 1,
            onTap: () {
              if (enabled && value > 1) {
                onChanged(value - 1);
                HapticFeedback.selectionClick();
              }
            },
          ),
          GestureDetector(
            onTap: enabled ? () => _showInput(context) : null,
            child: Container(
              constraints: const BoxConstraints(minWidth: 36),
              alignment: Alignment.center,
              child: Text(
                '$value',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: enabled ? AppTheme.textPrimary : AppTheme.warning,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),
          _CBtn(
            icon: Icons.add,
            active: enabled && value < max && value < 1000,
            onTap: () {
              if (enabled && value < max && value < 1000) {
                onChanged(value + 1);
                HapticFeedback.selectionClick();
              }
            },
          ),
        ],
      ),
    );
  }

  void _showInput(BuildContext context) {
    final ctrl = TextEditingController(text: '$value');
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.bgSecondary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTheme.r16)),
        title: const Text('Quantity'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          autofocus: true,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(4),
          ],
          decoration: InputDecoration(
            hintText: '1 – ${max > 1000 ? 1000 : max}',
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final v = int.tryParse(ctrl.text);
              final limit = max > 1000 ? 1000 : max;
              if (v != null && v >= 1 && v <= limit) onChanged(v);
              Navigator.pop(ctx);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.warning,
              foregroundColor: Colors.black,
            ),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}

class _CBtn extends StatelessWidget {
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  const _CBtn(
      {required this.icon, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: active ? onTap : null,
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Icon(
          icon,
          size: 16,
          color: active ? AppTheme.textPrimary : AppTheme.textDisabled,
        ),
      ),
    );
  }
}
