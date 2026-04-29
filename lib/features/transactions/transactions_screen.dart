import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../widgets/account_scope_chip.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../widgets/glass_sheet.dart';
import '../../widgets/shared_ui.dart';
import '../auth/session_gate.dart';
import '../auth/session_provider.dart';
import '../inventory/inventory_provider.dart';
import '../inventory/widgets/session_expired_item_dialog.dart';
import '../settings/accounts_provider.dart';
import '../../models/user.dart';
import '../purchases/iap_service.dart';
import 'transactions_provider.dart';
import 'widgets/date_filter_sheet.dart';
import 'widgets/export_sheet.dart';
import 'widgets/item_filter_sheet.dart';
import 'widgets/transaction_filter_chips.dart';
import 'widgets/transaction_tile.dart';
import 'widgets/transaction_stats_bar.dart';

class TransactionsScreen extends ConsumerWidget {
  const TransactionsScreen({super.key});

  /// Trigger Steam transactions sync and show a result snackbar.
  /// On failure: shows friendlyError(e) with a Retry action that re-runs sync.
  static Future<void> _runSync(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final fetched =
          await ref.read(transactionsProvider.notifier).sync();
      if (!context.mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text('Synced $fetched transactions')),
      );
    } catch (e) {
      if (!context.mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(friendlyError(e)),
          action: SnackBarAction(
            label: 'Retry',
            onPressed: () => _runSync(context, ref),
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final transactions = ref.watch(transactionsProvider);
    final stats = ref.watch(txStatsProvider);
    final typeFilter = ref.watch(txTypeFilterProvider);
    final itemFilter = ref.watch(txItemFilterProvider);
    final sessionAsync = ref.watch(sessionStatusProvider);
    final needsReauth = sessionAsync.valueOrNull?.needsReauth ?? false;
    final hasSession = ref.watch(hasSessionProvider);
    final allAccounts = ref.watch(accountsProvider).valueOrNull ?? const [];
    final expiredAccounts = allAccounts
        .where((a) =>
            a.sessionStatus == 'expired' || a.sessionStatus == 'none')
        .toList();

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Custom header
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 8, 0),
              child: Row(
                children: [
                  Expanded(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        AppLocalizations.of(context).historyTitle.toUpperCase(),
                        maxLines: 1,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 1.5,
                          color: AppTheme.textDisabled,
                        ),
                      ),
                    ),
                  ),
                  // SessionStatusWidget removed — session issues shown via dialog
                  IconButton(
                    icon: Icon(Icons.file_download_outlined, color: AppTheme.textMuted, size: 22),
                    tooltip: 'Export CSV',
                    onPressed: () {
                      final isPremium = ref.read(premiumProvider).valueOrNull ?? false;
                      if (!isPremium) {
                        context.push('/premium');
                        return;
                      }
                      HapticFeedback.selectionClick();
                      showGlassSheet(context, ExportSheet(ref: ref));
                    },
                  ),
                  IconButton(
                    icon: Icon(Icons.sync_rounded, color: AppTheme.textMuted, size: 22),
                    tooltip: 'Sync from Steam',
                    onPressed: () => _runSync(context, ref),
                  ),
                  const SizedBox(width: 4),
                  const AccountScopeChip(),
                  const SizedBox(width: 8),
                ],
              ),
            ),
            // Partial data banner — shown when ANY linked account is logged out.
            // Lists missing accounts so the user knows why data looks incomplete.
            if (expiredAccounts.isNotEmpty && hasSession)
              GestureDetector(
                onTap: () => _handleExpiredBannerTap(context, ref, expiredAccounts),
                child: Container(
                  width: double.infinity,
                  margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppTheme.warning.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppTheme.warning.withValues(alpha: 0.2)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.vpn_key_off_rounded,
                          color: AppTheme.warning, size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          expiredAccounts.length == 1
                              ? 'History may be incomplete — ${expiredAccounts.first.displayName} is logged out. Tap to relogin.'
                              : '${expiredAccounts.length} accounts logged out — history is incomplete. Tap to relogin.',
                          style: const TextStyle(
                            color: AppTheme.warning,
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      const Icon(Icons.chevron_right_rounded,
                          color: AppTheme.textMuted, size: 20),
                    ],
                  ),
                ),
              )
            // Legacy active-session-needs-reauth banner (kept for completeness).
            else if (needsReauth && hasSession)
              GestureDetector(
                onTap: () => _handleReauthTap(context, ref),
                child: Container(
                  width: double.infinity,
                  margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppTheme.warning.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppTheme.warning.withValues(alpha: 0.2)),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.lock_outline_rounded,
                          color: AppTheme.warning, size: 20),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Extra verification needed for history sync',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w500),
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded,
                          color: AppTheme.textMuted, size: 20),
                    ],
                  ),
                ),
              ),
            // Locked state — no session
            if (!hasSession) ...[
              Expanded(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: AppTheme.surface,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: AppTheme.primary.withValues(alpha: 0.15),
                            width: 1,
                          ),
                        ),
                        child: Icon(
                          Icons.lock_outline_rounded,
                          size: 36,
                          color: AppTheme.primary.withValues(alpha: 0.5),
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Enable history sync',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Steam requires an extra verification step\nto access your market history',
                        style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 20),
                      GradientButton(
                        label: 'Enable History',
                        icon: Icons.lock_open_rounded,
                        expanded: false,
                        onPressed: () => requireSession(context, ref),
                      ),
                    ],
                  ),
                ).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.95, 0.95)),
              ),
            ] else ...[
            // Body content
            // Stats card
            stats.when(
              data: (s) => TransactionStatsBar(stats: s).animate().fadeIn(duration: 400.ms),
              loading: () => const SizedBox(height: 80),
              error: (_, _) => const SizedBox.shrink(),
            ),

            // Filters — single row: type chips + item/date icon buttons
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                children: [
                  for (final entry in [
                    (null, 'All'),
                    ('buy', 'Bought'),
                    ('sell', 'Sold'),
                    ('trade', 'Traded'),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: TransactionFilterChip(
                        label: entry.$2,
                        selected: typeFilter == entry.$1,
                        onTap: () {
                          HapticFeedback.selectionClick();
                          ref.read(txTypeFilterProvider.notifier).state = entry.$1;
                          ref.read(transactionsProvider.notifier).refresh();
                        },
                      ),
                    ),
                  const SizedBox(width: 8),
                  // Item search
                  IconFilterButton(
                    icon: Icons.search,
                    active: itemFilter != null,
                    tooltip: itemFilter ?? 'Search items',
                    onTap: () => _showItemFilter(context, ref),
                  ),
                  const SizedBox(width: 6),
                  // Date filter
                  IconFilterButton(
                    icon: Icons.calendar_today,
                    active: ref.watch(txDateFromProvider) != null,
                    tooltip: _dateFilterLabel(ref),
                    onTap: () => _showDateFilter(context, ref),
                  ),
                  // Clear all filters
                  if (typeFilter != null ||
                      itemFilter != null ||
                      ref.watch(txDateFromProvider) != null) ...[
                    const SizedBox(width: 6),
                    IconFilterButton(
                      icon: Icons.filter_alt_off,
                      active: true,
                      activeColor: AppTheme.loss,
                      tooltip: 'Clear filters',
                      onTap: () {
                        HapticFeedback.lightImpact();
                        ref.read(txTypeFilterProvider.notifier).state = null;
                        ref.read(txItemFilterProvider.notifier).state = null;
                        ref.read(txDateFromProvider.notifier).state = null;
                        ref.read(txDateToProvider.notifier).state = null;
                        ref.read(transactionsProvider.notifier).refresh();
                      },
                    ),
                  ],
                ],
              ),
            ),
            ),
            const SizedBox(height: 4),

            // Transaction list
            Expanded(
              child: transactions.when(
                data: (list) {
                  if (list.isEmpty) {
                    final activeFilter = ref.read(txTypeFilterProvider);
                    if (activeFilter != null) {
                      return Center(
                        child: Text(
                          'No $activeFilter transactions found.',
                          textAlign: TextAlign.center,
                          style: AppTheme.bodySmall
                              .copyWith(color: AppTheme.textMuted),
                        ),
                      );
                    }
                    return EmptyState(
                      icon: Icons.receipt_long_outlined,
                      title: 'No transactions yet',
                      subtitle: 'Sync from Steam to import buys & sells',
                      action: GradientButton(
                        label: 'Sync now',
                        icon: Icons.sync_rounded,
                        expanded: false,
                        onPressed: () => _runSync(context, ref),
                      ),
                    );
                  }
                  final notifier = ref.read(transactionsProvider.notifier);
                  final hasMore = notifier.hasMore;
                  // Build items with date headers
                  final items = <Widget>[];
                  String? lastDate;
                  for (var i = 0; i < list.length; i++) {
                    final tx = list[i];
                    final localDate = tx.date.toLocal();
                    final isThisYear = localDate.year == DateTime.now().year;
                    final dateStr = isThisYear
                        ? DateFormat('MMMM d').format(localDate)
                        : DateFormat('MMMM d, yyyy').format(localDate);
                    if (dateStr != lastDate) {
                      lastDate = dateStr;
                      items.add(TransactionDateHeader(label: dateStr));
                    }
                    items.add(TransactionTile(tx: tx));
                  }
                  if (hasMore) {
                    items.add(
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            Text(
                              'Showing ${list.length} items',
                              style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
                            ),
                            const SizedBox(height: 8),
                            const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppTheme.primary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  return NotificationListener<ScrollNotification>(
                    onNotification: (scroll) {
                      if (scroll.metrics.pixels >=
                              scroll.metrics.maxScrollExtent - 200 &&
                          hasMore &&
                          !notifier.isLoadingMore) {
                        notifier.loadMore();
                      }
                      return false;
                    },
                    child: ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      children: items,
                    ),
                  );
                },
                loading: () => ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  children: List.generate(
                    6,
                    (i) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: ShimmerCard(height: 70),
                    ),
                  ),
                ),
                error: (_, _) => EmptyState(
                  icon: Icons.cloud_off_rounded,
                  title: 'Failed to load transactions',
                  subtitle: 'Check your connection and try again',
                  animate: false,
                  action: GradientButton(
                    label: 'Retry',
                    icon: Icons.refresh_rounded,
                    expanded: false,
                    onPressed: () => ref.read(transactionsProvider.notifier).refresh(),
                  ),
                ),
              ),
            ),
          ], // end else (has session content)
          ],
        ),
      ),
    );
  }

  String _dateFilterLabel(WidgetRef ref) {
    final from = ref.watch(txDateFromProvider);
    final to = ref.watch(txDateToProvider);
    if (from == null) return 'All time';
    final fmt = DateFormat('dd.MM.yy');
    final now = DateTime.now();
    final diff = now.difference(from).inDays;
    // Show preset label if it matches
    if (to != null && to.difference(now).inDays.abs() <= 1) {
      if (diff <= 8 && diff >= 6) return 'Last 7 days';
      if (diff <= 31 && diff >= 29) return 'Last 30 days';
      if (diff <= 91 && diff >= 89) return 'Last 90 days';
      if (diff <= 366 && diff >= 364) return 'Last year';
    }
    return '${fmt.format(from)} – ${fmt.format(to ?? now)}';
  }

  Future<void> _showItemFilter(BuildContext context, WidgetRef ref) async {
    final items = await ref.read(txItemsListProvider.future);
    if (!context.mounted) return;
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      builder: (sheetCtx) => ItemFilterSheet(
        items: items,
        onSelect: (name) {
          ref.read(txItemFilterProvider.notifier).state = name;
          ref.read(transactionsProvider.notifier).refresh();
          Navigator.of(sheetCtx, rootNavigator: true).pop();
        },
      ),
    );
  }

  Future<void> _showDateFilter(BuildContext context, WidgetRef ref) async {
    HapticFeedback.selectionClick();
    await showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      builder: (_) => DateFilterSheet(
        currentFrom: ref.read(txDateFromProvider),
        currentTo: ref.read(txDateToProvider),
        onApply: (from, to) {
          ref.read(txDateFromProvider.notifier).state = from;
          ref.read(txDateToProvider.notifier).state = to;
          ref.read(transactionsProvider.notifier).refresh();
        },
      ),
    );
  }

  Future<void> _handleReauthTap(BuildContext context, WidgetRef ref) async {
    HapticFeedback.selectionClick();
    final accounts = ref.read(accountsProvider).valueOrNull ?? const [];
    for (final a in accounts) {
      if (a.isActive &&
          (a.sessionStatus == 'expired' || a.sessionStatus == 'none')) {
        await showSessionExpiredItemDialog(context, ref, a);
        return;
      }
    }
    if (context.mounted) {
      await requireSession(context, ref);
    }
  }

  Future<void> _handleExpiredBannerTap(
    BuildContext context,
    WidgetRef ref,
    List<SteamAccount> expired,
  ) async {
    HapticFeedback.selectionClick();
    if (expired.isEmpty) return;
    // Pick the active one if it's expired, otherwise the first in list.
    final target = expired.firstWhere(
      (a) => a.isActive,
      orElse: () => expired.first,
    );
    await showSessionExpiredItemDialog(context, ref, target);
  }
}

