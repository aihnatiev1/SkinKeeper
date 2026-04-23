import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../widgets/shared_ui.dart';
import '../inventory_provider.dart';
import '../inventory_selection_provider.dart';
import '../../auth/steam_auth_service.dart';
import '../../portfolio/portfolio_pl_provider.dart' show itemPLFamilyProvider;
import '../../../models/user.dart';
import '../../settings/accounts_provider.dart';
import 'glass_bottom_sheet.dart';
import 'group_expand_sheet.dart';
import 'item_card.dart';
import 'quantity_picker_sheet.dart';
import 'session_expired_item_dialog.dart';

class InventoryGrid extends ConsumerWidget {
  const InventoryGrid({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groupedInventory = ref.watch(groupedInventoryProvider);
    final columns = ref.watch(gridColumnsProvider);
    final selection = ref.watch(selectionProvider);
    final isSelecting = selection.isNotEmpty;
    final currency = ref.watch(currencyProvider);

    return Expanded(
      child: groupedInventory.when(
        data: (groups) => groups.isEmpty
          ? AppRefreshIndicator(
              onRefresh: () => ref.read(inventoryProvider.notifier).refresh(),
              child: ListView(
                children: [
                  const SizedBox(height: 120),
                  ref.read(searchQueryProvider).isNotEmpty
                    ? const EmptyState(
                        icon: Icons.search_off_rounded,
                        title: 'No items match your search',
                        subtitle: 'Try a different search term',
                      )
                    : const EmptyState(
                        icon: Icons.inventory_2_outlined,
                        title: 'No items in inventory',
                        subtitle: 'Pull down to refresh or link a Steam account',
                      ),
                ],
              ),
            )
          : AppRefreshIndicator(
          onRefresh: () => ref.read(inventoryProvider.notifier).refresh(),
          child: GridView.builder(
            padding: EdgeInsets.fromLTRB(
              AppTheme.s8,
              AppTheme.s4,
              AppTheme.s8,
              isSelecting ? 140 : 80,
            ),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              childAspectRatio:
                  columns <= 2 ? 0.72 : columns >= 5 ? 0.75 : 0.85,
              crossAxisSpacing: AppTheme.s6,
              mainAxisSpacing: AppTheme.s6,
            ),
            itemCount: groups.length,
            itemBuilder: (_, index) {
              final group = groups[index];
              return _GridItem(
                group: group,
                columns: columns,
                currency: currency,
                index: index,
              );
            },
          ),
        ),
        loading: () => GridView.builder(
          padding: const EdgeInsets.all(AppTheme.s8),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            childAspectRatio:
                columns <= 2 ? 0.72 : columns >= 5 ? 0.75 : 0.85,
            crossAxisSpacing: AppTheme.s6,
            mainAxisSpacing: AppTheme.s6,
          ),
          itemCount: 12,
          itemBuilder: (_, i) => const SkeletonItemCard(),
        ),
        error: (e, _) => EmptyState(
          icon: Icons.error_outline_rounded,
          title: 'Failed to load inventory',
          subtitle: 'Check your connection and try again',
          action: GradientButton(
            label: 'Retry',
            icon: Icons.refresh_rounded,
            expanded: false,
            onPressed: () => ref.read(inventoryProvider.notifier).refresh(),
          ),
        ),
      ),
    );
  }
}

/// Individual grid item — stateful for shake animation on trade-ban tap.
class _GridItem extends ConsumerStatefulWidget {
  final ItemGroup group;
  final int columns;
  final CurrencyInfo? currency;
  final int index;

  const _GridItem({
    required this.group,
    required this.columns,
    required this.currency,
    required this.index,
  });

  @override
  ConsumerState<_GridItem> createState() => _GridItemState();
}

class _GridItemState extends ConsumerState<_GridItem>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shakeController;
  late final Animation<double> _shakeAnim;

  @override
  void initState() {
    super.initState();
    _shakeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
    // Sine-wave shake: 0 → +8 → -8 → +8 → -8 → 0
    _shakeAnim = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 8.0), weight: 1),
      TweenSequenceItem(tween: Tween(begin: 8.0, end: -8.0), weight: 2),
      TweenSequenceItem(tween: Tween(begin: -8.0, end: 8.0), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 8.0, end: -8.0), weight: 2),
      TweenSequenceItem(tween: Tween(begin: -8.0, end: 0.0), weight: 1),
    ]).animate(CurvedAnimation(parent: _shakeController, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _shakeController.dispose();
    super.dispose();
  }

  void _shake() {
    _shakeController.forward(from: 0);
  }

  void _showTradeBanToast(BuildContext context, DateTime? banUntil) {
    HapticFeedback.heavyImpact();
    _shake();

    final banText = banUntil != null
        ? 'Unlocks ${_formatBanDate(banUntil)}'
        : 'Item is trade locked';

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: const Color(0xFF1E1228),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: AppTheme.loss.withValues(alpha: 0.3)),
          ),
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          duration: const Duration(seconds: 3),
          content: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppTheme.loss.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(Icons.lock_rounded, size: 16, color: AppTheme.loss),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Trade Locked',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    banText,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.55),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
  }

  String _formatBanDate(DateTime date) {
    final now = DateTime.now();
    final diff = date.difference(now);
    if (diff.inDays > 0) return 'in ${diff.inDays}d ${diff.inHours % 24}h';
    if (diff.inHours > 0) return 'in ${diff.inHours}h ${diff.inMinutes % 60}m';
    return 'soon';
  }

  @override
  Widget build(BuildContext context) {
    final group = widget.group;
    final item = group.representative;

    final isSelected = ref.watch(
      selectionProvider.select((s) => s.contains(item.assetId)),
    );
    final itemPL = ref.watch(itemPLFamilyProvider(item.marketHashName));

    final selectedCount = group.isGroup
        ? ref.watch(selectionProvider.select(
            (s) => group.items.where((i) => s.contains(i.assetId)).length,
          ))
        : (isSelected ? 1 : 0);

    final accountCount = ref.watch(
      authStateProvider.select((u) => u.valueOrNull?.accountCount ?? 1),
    );
    final activeAccountId = ref.watch(
      authStateProvider.select((u) => u.valueOrNull?.activeAccountId),
    );
    final showBadge = accountCount > 1;

    final accounts = ref.watch(accountsProvider).valueOrNull ?? const [];
    SteamAccount? expiredAccount;
    if (accountCount > 1 && item.accountId != null) {
      for (final a in accounts) {
        if (a.id == item.accountId &&
            (a.sessionStatus == 'expired' || a.sessionStatus == 'none')) {
          expiredAccount = a;
          break;
        }
      }
    }
    final isSessionExpired = expiredAccount != null;

    // Check if item (or any in group) is trade banned
    final isTradeBanned = !item.tradable &&
        (item.tradeBanUntil == null ||
            item.tradeBanUntil!.isAfter(DateTime.now()));

    return AnimatedBuilder(
      animation: _shakeAnim,
      builder: (context, child) => Transform.translate(
        offset: Offset(_shakeAnim.value, 0),
        child: child,
      ),
      child: ItemCard(
        item: item,
        compact: widget.columns >= 3,
        ultraCompact: widget.columns >= 5,
        itemPL: itemPL,
        currency: widget.currency,
        groupCount: group.isGroup ? group.count : null,
        selectedCount: group.isGroup && selectedCount > 0 ? selectedCount : null,
        isSelected: isSelected || selectedCount > 0,
        showAccountBadge: showBadge,
        isDisabled: isSessionExpired,
        onAccountBadgeTap: showBadge && item.accountId != null
            ? () async {
                final accountId = item.accountId!;
                if (accountId != activeAccountId) {
                  await ref.read(accountsProvider.notifier).setActive(accountId);
                }
              }
            : null,
        onTap: () {
          if (isSessionExpired) {
            HapticFeedback.mediumImpact();
            showSessionExpiredItemDialog(
              context,
              ref,
              expiredAccount!,
              title: 'Wanna sell this skin?',
            );
            return;
          }
          if (isTradeBanned) {
            _showTradeBanToast(context, item.tradeBanUntil);
            return;
          }
          HapticFeedback.selectionClick();
          if (group.isGroup) {
            _showQuantityPicker(context, group);
          } else {
            ref.read(selectionProvider.notifier).toggle(item.assetId);
          }
        },
        onLongPress: () {
          if (isSessionExpired) {
            HapticFeedback.mediumImpact();
            showSessionExpiredItemDialog(
              context,
              ref,
              expiredAccount!,
              title: 'Wanna sell this skin?',
            );
            return;
          }
          HapticFeedback.mediumImpact();
          if (group.isGroup) {
            _showGroupSheet(context, group);
          } else {
            context.push('/inventory/item-detail', extra: item);
          }
        },
        onInfoTap: () {
          if (isSessionExpired) {
            HapticFeedback.mediumImpact();
            showSessionExpiredItemDialog(
              context,
              ref,
              expiredAccount!,
              title: 'Wanna sell this skin?',
            );
            return;
          }
          HapticFeedback.lightImpact();
          if (group.isGroup) {
            _showGroupSheet(context, group);
          } else {
            context.push('/inventory/item-detail', extra: item);
          }
        },
      )
          .animate()
          .fadeIn(
            duration: 300.ms,
            delay: Duration(milliseconds: (widget.index % 12) * 30),
          )
          .slideY(
            begin: 0.05,
            duration: 300.ms,
            delay: Duration(milliseconds: (widget.index % 12) * 30),
            curve: Curves.easeOutCubic,
          ),
    );
  }

  void _showGroupSheet(BuildContext context, ItemGroup group) {
    final currency = ref.read(currencyProvider);
    showGlassSheet(context, GroupExpandSheet(group: group, currency: currency));
  }

  void _showQuantityPicker(BuildContext context, ItemGroup group) {
    final currency = ref.read(currencyProvider);
    final selected = ref.read(selectionProvider);
    final currentCount =
        group.items.where((i) => selected.contains(i.assetId)).length;
    showGlassSheet(
      context,
      QuantityPickerSheet(
        group: group,
        currency: currency,
        initialCount: currentCount > 0 ? currentCount : 1,
        onConfirm: (assetIds) {
          ref.read(selectionProvider.notifier).replaceGroupSelection(
                group.items.map((i) => i.assetId).toList(),
                assetIds,
              );
        },
      ),
    );
  }
}
