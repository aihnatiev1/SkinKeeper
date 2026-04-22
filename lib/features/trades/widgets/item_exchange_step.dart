import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/trade_offer.dart';
import '../../../widgets/glass_sheet.dart';
import '../../../widgets/shared_ui.dart';
import '../trade_constants.dart';
import 'sticky_trade_bar.dart';
import 'trade_quantity_sheet.dart';

class ItemExchangeStep extends StatefulWidget {
  final List<TradeOfferItem> myItems;
  final List<TradeOfferItem> partnerItems;
  final Set<String> giveAssetIds;
  final Set<String> recvAssetIds;
  final bool loading;
  final String? error;
  final ValueChanged<String> onToggleGive;
  final ValueChanged<String> onToggleRecv;
  final ValueChanged<List<String>> onAddMultipleGive;
  final ValueChanged<List<String>> onRemoveMultipleGive;
  final ValueChanged<List<String>> onAddMultipleRecv;
  final ValueChanged<List<String>> onRemoveMultipleRecv;
  final VoidCallback onContinue;
  final CurrencyInfo currency;

  const ItemExchangeStep({
    super.key,
    required this.myItems,
    required this.partnerItems,
    required this.giveAssetIds,
    required this.recvAssetIds,
    required this.loading,
    this.error,
    required this.onToggleGive,
    required this.onToggleRecv,
    required this.onAddMultipleGive,
    required this.onRemoveMultipleGive,
    required this.onAddMultipleRecv,
    required this.onRemoveMultipleRecv,
    required this.onContinue,
    required this.currency,
  });

  @override
  State<ItemExchangeStep> createState() => _ItemExchangeStepState();
}

class _ItemExchangeStepState extends State<ItemExchangeStep> {
  int _selectedTab = 0;
  late final PageController _pageCtrl;
  bool _switchedOnce = false;

  @override
  void initState() {
    super.initState();
    _pageCtrl = PageController();
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  void _handleContinue() {
    final giveEmpty = widget.giveAssetIds.isEmpty;
    final recvEmpty = widget.recvAssetIds.isEmpty;

    if (!_switchedOnce && ((giveEmpty && !recvEmpty) || (!giveEmpty && recvEmpty))) {
      final targetTab = giveEmpty ? 0 : 1;
      if (_selectedTab != targetTab) {
        _switchedOnce = true;
        setState(() => _selectedTab = targetTab);
        _pageCtrl.animateToPage(targetTab,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOutCubic);
        return;
      }
    }

    if (giveEmpty || recvEmpty) {
      final msg = giveEmpty
          ? "You haven't selected any items to give."
          : "You haven't selected any items to receive.";
      showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: AppTheme.surface,
          title: Text(giveEmpty ? 'Nothing to give' : 'Nothing requested'),
          content: Text('$msg Continue anyway?'),
          actions: [
            TextButton(
              onPressed: () => ctx.pop(false),
              child: const Text('Go Back'),
            ),
            TextButton(
              onPressed: () => ctx.pop(true),
              child: const Text('Continue Anyway'),
            ),
          ],
        ),
      ).then((confirmed) {
        if (confirmed == true) widget.onContinue();
      });
      return;
    }

    widget.onContinue();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Loading inventories...',
                style: TextStyle(fontSize: 13, color: AppTheme.textMuted)),
          ],
        ),
      );
    }

    if (widget.error != null) {
      return Center(
        child: Text('Failed to load: ${friendlyError(widget.error)}',
            style: const TextStyle(color: AppTheme.textSecondary)),
      );
    }

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          color: AppTheme.surface.withValues(alpha: 0.5),
          child: Row(
            children: [
              _SelectionChip(
                label: 'Give',
                count: widget.giveAssetIds.length,
                color: AppTheme.loss,
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Icon(Icons.swap_horiz,
                    size: 18, color: AppTheme.textDisabled),
              ),
              _SelectionChip(
                label: 'Get',
                count: widget.recvAssetIds.length,
                color: AppTheme.profit,
              ),
              const Spacer(),
              _SideLimitBadge(
                label: 'Give',
                count: widget.giveAssetIds.length,
                color: AppTheme.loss,
              ),
              const SizedBox(width: 4),
              _SideLimitBadge(
                label: 'Get',
                count: widget.recvAssetIds.length,
                color: AppTheme.profit,
              ),
            ],
          ),
        ),

        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: PillTabSelector(
            tabs: [
              'Your Items (${widget.myItems.length})',
              'Their Items (${widget.partnerItems.length})',
            ],
            selected: _selectedTab,
            onChanged: (i) {
              setState(() => _selectedTab = i);
              _pageCtrl.animateToPage(i, duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
            },
          ),
        ),
        const SizedBox(height: 8),

        Expanded(
          child: PageView(
            controller: _pageCtrl,
            onPageChanged: (i) => setState(() => _selectedTab = i),
            children: [
              _GroupedItemList(
                items: widget.myItems,
                selectedIds: widget.giveAssetIds,
                onToggle: widget.onToggleGive,
                onAddMultiple: widget.onAddMultipleGive,
                onRemoveMultiple: widget.onRemoveMultipleGive,
                sideSelected: widget.giveAssetIds.length,
                emptyText: 'No tradable items in your inventory',
                currency: widget.currency,
              ),
              _GroupedItemList(
                items: widget.partnerItems,
                selectedIds: widget.recvAssetIds,
                onToggle: widget.onToggleRecv,
                onAddMultiple: widget.onAddMultipleRecv,
                onRemoveMultiple: widget.onRemoveMultipleRecv,
                sideSelected: widget.recvAssetIds.length,
                emptyText: 'No tradable items in partner inventory',
                currency: widget.currency,
              ),
            ],
          ),
        ),

        StickyTradeBar(
          giveItems: widget.myItems
              .where((i) => widget.giveAssetIds.contains(i.assetId))
              .toList(),
          recvItems: widget.partnerItems
              .where((i) => widget.recvAssetIds.contains(i.assetId))
              .toList(),
          currency: widget.currency,
          onRemoveGive: widget.onToggleGive,
          onRemoveRecv: widget.onToggleRecv,
          onContinue: _handleContinue,
        ),
      ],
    );
  }
}

class _GroupedItemList extends StatefulWidget {
  final List<TradeOfferItem> items;
  final Set<String> selectedIds;
  final ValueChanged<String> onToggle;
  final void Function(List<String>) onAddMultiple;
  final void Function(List<String>) onRemoveMultiple;
  final int sideSelected;
  final String emptyText;
  final CurrencyInfo currency;

  const _GroupedItemList({
    required this.items,
    required this.selectedIds,
    required this.onToggle,
    required this.onAddMultiple,
    required this.onRemoveMultiple,
    required this.sideSelected,
    required this.emptyText,
    required this.currency,
  });

  @override
  State<_GroupedItemList> createState() => _GroupedItemListState();
}

class _GroupedItemListState extends State<_GroupedItemList> {
  String _search = '';

  void _showTradeQuantityPicker(
    BuildContext context, {
    required TradeItemGroup group,
    required Set<String> selectedIds,
    required int sideSelected,
    required CurrencyInfo currency,
    required void Function(List<String>) onAddMultiple,
    required void Function(List<String>) onRemoveMultiple,
  }) {
    final currentlySelected = group.items
        .where((i) => selectedIds.contains(i.assetId))
        .map((i) => i.assetId)
        .toSet();
    final currentCount = currentlySelected.length;
    final maxAllowed = group.count.clamp(0, kMaxTradeItems - sideSelected + currentCount);

    showGlassSheet(
      context,
      TradeQuantitySheet(
        group: group,
        currency: currency,
        preSelectedIds: currentlySelected,
        maxQuantity: maxAllowed,
        onConfirm: (chosenIds) {
          final chosenSet = chosenIds.toSet();
          final toAdd = chosenIds
              .where((id) => !currentlySelected.contains(id))
              .toList();
          final toRemove = currentlySelected
              .where((id) => !chosenSet.contains(id))
              .toList();
          if (toAdd.isNotEmpty) onAddMultiple(toAdd);
          if (toRemove.isNotEmpty) onRemoveMultiple(toRemove);
        },
      ),
    );
  }

  List<TradeItemGroup> _buildGroups() {
    final map = <String, List<TradeOfferItem>>{};
    for (final item in widget.items) {
      if (item.marketHashName == null) continue;
      map.putIfAbsent(item.marketHashName!, () => []).add(item);
    }

    var groups = map.entries
        .map((e) => TradeItemGroup(marketHashName: e.key, items: e.value))
        .toList();

    groups.sort((a, b) {
      final cmp = b.count.compareTo(a.count);
      if (cmp != 0) return cmp;
      return b.priceCents.compareTo(a.priceCents);
    });

    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      groups = groups
          .where((g) => g.marketHashName.toLowerCase().contains(q))
          .toList();
    }

    return groups;
  }

  int _selectedInGroup(TradeItemGroup group) {
    return group.items
        .where((i) => widget.selectedIds.contains(i.assetId))
        .length;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty) {
      return Center(
        child: Text(widget.emptyText,
            style: const TextStyle(fontSize: 13, color: AppTheme.textMuted)),
      );
    }

    final groups = _buildGroups();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: TextField(
            onChanged: (v) => setState(() => _search = v),
            decoration: InputDecoration(
              hintText: 'Search...',
              prefixIcon: const Icon(Icons.search, size: 18),
              filled: true,
              fillColor: AppTheme.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.r12),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
              isDense: true,
            ),
            style: const TextStyle(fontSize: 13),
          ),
        ),

        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 4),
            itemCount: groups.length,
            itemBuilder: (_, i) {
              final group = groups[i];
              final selectedCount = _selectedInGroup(group);

              return _GroupTile(
                group: group,
                selectedCount: selectedCount,
                sideSelected: widget.sideSelected,
                selectedIds: widget.selectedIds,
                currency: widget.currency,
                onToggleItem: widget.onToggle,
                onOpenQuantityPicker: () {
                  _showTradeQuantityPicker(
                    context,
                    group: group,
                    selectedIds: widget.selectedIds,
                    sideSelected: widget.sideSelected,
                    currency: widget.currency,
                    onAddMultiple: widget.onAddMultiple,
                    onRemoveMultiple: widget.onRemoveMultiple,
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _GroupTile extends StatelessWidget {
  final TradeItemGroup group;
  final int selectedCount;
  final Set<String> selectedIds;
  final int sideSelected;
  final VoidCallback onOpenQuantityPicker;
  final ValueChanged<String> onToggleItem;
  final CurrencyInfo currency;

  const _GroupTile({
    required this.group,
    required this.selectedCount,
    required this.selectedIds,
    required this.sideSelected,
    required this.onOpenQuantityPicker,
    required this.onToggleItem,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    final hasSelection = selectedCount > 0;
    final priceStr = group.priceCents > 0
        ? currency.formatCents(group.priceCents)
        : '';

    return Column(
      children: [
        InkWell(
          onTap: () {
            if (group.count == 1) {
              onToggleItem(group.first.assetId);
            } else {
              HapticFeedback.selectionClick();
              onOpenQuantityPicker();
            }
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(AppTheme.r8),
                  child: Container(
                    width: 42,
                    height: 42,
                    color: AppTheme.surface,
                    child: group.fullIconUrl.isNotEmpty
                        ? CachedNetworkImage(
                            imageUrl: group.fullIconUrl,
                            fit: BoxFit.contain,
                            errorWidget: (_, _, _) => const Icon(
                                Icons.image_not_supported,
                                size: 16,
                                color: AppTheme.textDisabled),
                          )
                        : const Icon(Icons.image_not_supported,
                            size: 16, color: AppTheme.textDisabled),
                  ),
                ),
                const SizedBox(width: 10),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        group.displayName,
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600),
                        overflow: TextOverflow.ellipsis,
                        maxLines: 1,
                      ),
                      Row(
                        children: [
                          if (hasSelection)
                            Text(
                              '$selectedCount selected',
                              style: const TextStyle(
                                  fontSize: 11, color: AppTheme.primary),
                            )
                          else if (priceStr.isNotEmpty)
                            Text(
                              priceStr,
                              style: const TextStyle(
                                  fontSize: 11,
                                  color: AppTheme.textMuted),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),

                if (group.count > 1)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: hasSelection
                          ? AppTheme.primary.withValues(alpha: 0.1)
                          : AppTheme.surface,
                      borderRadius: BorderRadius.circular(AppTheme.r8),
                    ),
                    child: Text(
                      hasSelection ? '$selectedCount / ${group.count}' : 'x${group.count}',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: hasSelection
                            ? AppTheme.primary
                            : AppTheme.textSecondary,
                      ),
                    ),
                  ),

                if (group.count == 1)
                  Checkbox(
                    value: hasSelection,
                    onChanged: (_) => onToggleItem(group.first.assetId),
                    activeColor: AppTheme.primary,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                  ),

                if (group.count > 1)
                  Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: Icon(
                      Icons.chevron_right_rounded,
                      size: 20,
                      color: AppTheme.textMuted,
                    ),
                  ),
              ],
            ),
          ),
        ),
        Divider(height: 1, color: AppTheme.border),
      ],
    );
  }
}

class _SelectionChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;

  const _SelectionChip({
    required this.label,
    required this.count,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: count > 0 ? 0.1 : 0.04),
        borderRadius: BorderRadius.circular(AppTheme.r8),
        border: Border.all(color: color.withValues(alpha: count > 0 ? 0.2 : 0.06)),
      ),
      child: Text(
        '$label: $count',
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: count > 0 ? color : AppTheme.textMuted,
        ),
      ),
    );
  }
}

class _SideLimitBadge extends StatelessWidget {
  final String label;
  final int count;
  final Color color;

  const _SideLimitBadge({
    required this.label,
    required this.count,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final atLimit = count >= kMaxTradeItems;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: atLimit ? AppTheme.loss.withValues(alpha: 0.1) : AppTheme.surface,
        borderRadius: BorderRadius.circular(AppTheme.r8),
      ),
      child: Text(
        '$label $count/$kMaxTradeItems',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: atLimit ? AppTheme.loss : AppTheme.textSecondary,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}
