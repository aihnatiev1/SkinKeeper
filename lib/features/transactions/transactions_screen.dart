import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../core/api_client.dart';
import '../../widgets/account_scope_chip.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../widgets/glass_sheet.dart';
import '../../widgets/shared_ui.dart';
import '../auth/session_gate.dart';
import '../auth/session_provider.dart';
import '../inventory/inventory_provider.dart';
import '../purchases/iap_service.dart';
import 'transactions_provider.dart';

class TransactionsScreen extends ConsumerWidget {
  const TransactionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final transactions = ref.watch(transactionsProvider);
    final stats = ref.watch(txStatsProvider);
    final typeFilter = ref.watch(txTypeFilterProvider);
    final itemFilter = ref.watch(txItemFilterProvider);
    final sessionAsync = ref.watch(sessionStatusProvider);
    final needsReauth = sessionAsync.valueOrNull?.needsReauth ?? false;
    final hasSession = ref.watch(hasSessionProvider);
    final l10n = AppLocalizations.of(context);

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
                        AppLocalizations.of(context).historyTitle,
                        maxLines: 1,
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: -0.5,
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
                      showGlassSheet(context, _ExportSheet(ref: ref));
                    },
                  ),
                  IconButton(
                    icon: Icon(Icons.sync_rounded, color: AppTheme.textMuted, size: 22),
                    tooltip: 'Sync from Steam',
                    onPressed: () async {
                      try {
                        final fetched = await ref.read(transactionsProvider.notifier).sync();
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Synced $fetched transactions')),
                          );
                        }
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Sync failed')),
                          );
                        }
                      }
                    },
                  ),
                  const SizedBox(width: 4),
                  const AccountScopeChip(),
                  const SizedBox(width: 8),
                ],
              ),
            ),
            // Session banner
            if (needsReauth && hasSession)
              GestureDetector(
                onTap: () => requireSession(context, ref),
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
                      Icon(Icons.lock_outline_rounded, color: AppTheme.warning, size: 20),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Extra verification needed for history sync',
                          style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500),
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded, color: AppTheme.textMuted, size: 20),
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
              data: (s) => _StatsBar(stats: s).animate().fadeIn(duration: 400.ms),
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
                      child: _FilterChip(
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
                  _IconFilterButton(
                    icon: Icons.search,
                    active: itemFilter != null,
                    tooltip: itemFilter ?? 'Search items',
                    onTap: () => _showItemFilter(context, ref),
                  ),
                  const SizedBox(width: 6),
                  // Date filter
                  _IconFilterButton(
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
                    _IconFilterButton(
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
                    return Center(
                      child: Text(
                        'No transactions.\nTap sync to fetch from Steam.',
                        textAlign: TextAlign.center,
                        style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted),
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
                      items.add(_DateHeader(label: dateStr));
                    }
                    items.add(_TransactionTile(tx: tx));
                  }
                  if (hasMore) {
                    items.add(
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            Text(
                              'Showing ${transactions.length} of $total',
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
      builder: (sheetCtx) => _ItemFilterSheet(
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
      builder: (_) => _DateFilterSheet(
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
}

class _StatsBar extends ConsumerWidget {
  final TransactionStats stats;

  const _StatsBar({required this.stats});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final isProfit = stats.profitCents >= 0;
    final profitColor = isProfit ? AppTheme.profit : AppTheme.loss;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      child: Column(
        children: [
          Row(
            children: [
              _MiniStat(
                label: 'Bought',
                value: '${stats.totalBought}',
                sub: currency.format(stats.spent),
                color: AppTheme.loss,
              ),
              const SizedBox(width: 6),
              _MiniStat(
                label: 'Sold',
                value: '${stats.totalSold}',
                sub: currency.format(stats.earned),
                color: AppTheme.profit,
              ),
              const SizedBox(width: 6),
              _MiniStat(
                label: 'Traded',
                value: '${stats.totalTraded}',
                sub: currency.format(stats.tradedValue),
                color: AppTheme.warning,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Container(
            width: double.infinity,
            decoration: AppTheme.glass(radius: AppTheme.r12),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('Profit', style: AppTheme.captionSmall),
                const SizedBox(width: 12),
                Text(
                  currency.formatWithSign(stats.profit),
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: profitColor,
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

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  final Color color;

  const _MiniStat({
    required this.label,
    required this.value,
    this.sub,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        decoration: AppTheme.glass(radius: AppTheme.r12),
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Text(label, style: AppTheme.captionSmall),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(value,
                  maxLines: 1,
                  style: TextStyle(
                      fontSize: 15, fontWeight: FontWeight.bold, color: color)),
            ),
            if (sub != null)
              Text(sub!, style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled)),
          ],
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;

  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.primary.withValues(alpha: 0.15)
              : AppTheme.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppTheme.primary : AppTheme.border,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 13, color: selected ? AppTheme.primary : AppTheme.textMuted),
              const SizedBox(width: 5),
            ],
            Flexible(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  color: selected ? AppTheme.primary : AppTheme.textSecondary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IconFilterButton extends StatelessWidget {
  final IconData icon;
  final bool active;
  final Color? activeColor;
  final String tooltip;
  final VoidCallback onTap;

  const _IconFilterButton({
    required this.icon,
    required this.active,
    this.activeColor,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = active ? (activeColor ?? AppTheme.primary) : AppTheme.textMuted;
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            color: active
                ? color.withValues(alpha: 0.15)
                : AppTheme.surface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: active ? color.withValues(alpha: 0.4) : AppTheme.border,
            ),
          ),
          child: Icon(icon, size: 15, color: color),
        ),
      ),
    );
  }
}

// ─── Date Header (sticky-style group separator) ────────────────────
class _DateHeader extends StatelessWidget {
  final String label;
  const _DateHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
      child: Row(
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppTheme.textSecondary,
              letterSpacing: 0.2,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Container(height: 0.5, color: AppTheme.divider),
          ),
        ],
      ),
    );
  }
}

class _TransactionTile extends ConsumerWidget {
  final TransactionItem tx;

  const _TransactionTile({required this.tx});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    if (tx.isTrade) return _buildTradeTile(context, currency);
    return _buildMarketTile(context, ref, currency);
  }

  Widget _buildMarketTile(BuildContext context, WidgetRef ref, CurrencyInfo currency) {
    final isBuy = tx.isBuy;
    final badgeColor = isBuy ? AppTheme.accent : AppTheme.loss;
    final delta = tx.plDeltaCents;
    final deltaPct = tx.plDeltaPct;
    final hasDelta = delta != null && tx.currentPriceCents != null;

    // For buy: positive delta = price went up (good, you bought cheap)
    // For sell: positive delta = current price > sell price (you sold too early)
    final deltaColor = hasDelta
        ? (isBuy
            ? (delta >= 0 ? AppTheme.profit : AppTheme.loss)
            : (delta <= 0 ? AppTheme.profit : AppTheme.warning))
        : AppTheme.textMuted;

    // Date — short format, no year if current
    final localDate = tx.date.toLocal();
    final isThisYear = localDate.year == DateTime.now().year;
    final dateStr = isThisYear
        ? DateFormat('MMM d').format(localDate)
        : DateFormat('MMM d, yy').format(localDate);

    return GestureDetector(
      onTap: () => _showPriceCheck(context, ref),
      child: Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: AppTheme.glass(radius: AppTheme.r12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            // Thumbnail
            _ItemThumbnail(imageUrl: tx.imageUrl, isBuy: isBuy),
            const SizedBox(width: 10),
            // Item info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tx.marketHashName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTheme.bodySmall.copyWith(fontWeight: FontWeight.w500, color: AppTheme.textPrimary),
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      _TypeBadge(label: isBuy ? 'Buy' : 'Sell', color: badgeColor),
                      const SizedBox(width: 6),
                      Text(
                        dateStr,
                        style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
                      ),
                    ],
                  ),
                  if (tx.note != null && tx.note!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      tx.note!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTheme.captionSmall.copyWith(
                        color: AppTheme.textMuted,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            // Price + P/L delta
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  currency.format(tx.priceUsd),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textPrimary,
                  ),
                ),
                if (hasDelta) ...[
                  const SizedBox(height: 3),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                    decoration: BoxDecoration(
                      color: deltaColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      '${currency.formatWithSign(delta / 100)} (${deltaPct!.toStringAsFixed(0)}%)',
                      style: TextStyle(
                        fontSize: 10,
                        color: deltaColor,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    ),
    );
  }

  Future<void> _showPriceCheck(BuildContext context, WidgetRef ref) async {
    final currency = ref.read(currencyProvider);
    HapticFeedback.lightImpact();
    final currentPrice = tx.currentPriceUsd;
    if (currentPrice == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No current price available')),
      );
      return;
    }

    final txPrice = tx.priceUsd;
    final diff = currentPrice - txPrice;
    final pct = txPrice > 0 ? (diff / txPrice) * 100 : 0.0;
    final isUp = diff >= 0;
    final diffColor = isUp ? AppTheme.profit : AppTheme.loss;

    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      builder: (_) => Container(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (tx.imageUrl != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Image.network(tx.imageUrl!, height: 80, fit: BoxFit.contain),
              ),
            Text(
              tx.marketHashName,
              style: AppTheme.title,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _PriceColumn(
                  label: '${tx.isBuy ? "Bought" : "Sold"} for',
                  price: txPrice,
                  color: AppTheme.textSecondary,
                  currency: currency,
                ),
                Icon(Icons.arrow_forward, color: AppTheme.textDisabled, size: 20),
                _PriceColumn(
                  label: 'Current price',
                  price: currentPrice,
                  color: AppTheme.textPrimary,
                  currency: currency,
                ),
              ],
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: diffColor.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: diffColor.withValues(alpha: 0.15)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    isUp ? Icons.trending_up : Icons.trending_down,
                    color: diffColor,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${currency.formatWithSign(diff)} (${pct.toStringAsFixed(1)}%)',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: diffColor,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildTradeTile(BuildContext context, CurrencyInfo currency) {
    final diff = tx.tradeDiffCents;
    final pct = tx.tradeDiffPct;
    final diffColor = diff > 0
        ? AppTheme.profit
        : diff < 0
            ? AppTheme.loss
            : AppTheme.textMuted;

    final statusColor = switch (tx.tradeStatus) {
      'accepted' => AppTheme.profit,
      'pending' => AppTheme.warning,
      'cancelled' || 'declined' || 'expired' => AppTheme.textDisabled,
      _ => AppTheme.textMuted,
    };

    final giveVal = (tx.giveTotal ?? 0) / 100;
    final recvVal = (tx.recvTotal ?? 0) / 100;

    return StatefulBuilder(
      builder: (context, setState) {
        // Track expanded state via a static set to survive rebuilds
        final expanded = _expandedTrades.contains(tx.id);

        return GestureDetector(
          onTap: () => setState(() {
            if (expanded) {
              _expandedTrades.remove(tx.id);
            } else {
              _expandedTrades.add(tx.id);
            }
          }),
          child: Container(
            margin: const EdgeInsets.only(bottom: 6),
            decoration: AppTheme.glass(radius: AppTheme.r12),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Compact row (always visible) ──
                  Row(
                    children: [
                      const Icon(Icons.swap_horiz, color: AppTheme.warning, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              tx.marketHashName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTheme.bodySmall.copyWith(
                                  fontWeight: FontWeight.w500,
                                  color: AppTheme.textPrimary),
                            ),
                            const SizedBox(height: 2),
                            Row(
                              children: [
                                Text(
                                  '${tx.giveCount ?? 0}→${tx.recvCount ?? 0}',
                                  style: AppTheme.captionSmall.copyWith(
                                      color: AppTheme.textMuted),
                                ),
                                const SizedBox(width: 8),
                                Icon(
                                  diff >= 0 ? Icons.trending_up : Icons.trending_down,
                                  size: 12,
                                  color: diffColor,
                                ),
                                const SizedBox(width: 2),
                                Text(
                                  '${currency.formatWithSign(diff / 100)} (${pct.toStringAsFixed(1)}%)',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: diffColor,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      _TypeBadge(label: tx.tradeStatus ?? 'trade', color: statusColor),
                      const SizedBox(width: 6),
                      Icon(
                        expanded ? Icons.expand_less : Icons.expand_more,
                        size: 18,
                        color: AppTheme.textDisabled,
                      ),
                    ],
                  ),

                  // ── Expanded details ──
                  if (expanded) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: _TradeValueBox(
                            label: 'GAVE',
                            count: tx.giveCount ?? 0,
                            value: giveVal,
                            color: AppTheme.loss,
                            currency: currency,
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: Icon(Icons.arrow_forward, size: 16, color: AppTheme.textDisabled),
                        ),
                        Expanded(
                          child: _TradeValueBox(
                            label: 'GOT',
                            count: tx.recvCount ?? 0,
                            value: recvVal,
                            color: AppTheme.profit,
                            currency: currency,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Text(
                          _getTradeVerdict(pct) ?? '',
                          style: TextStyle(
                            fontSize: 12,
                            fontStyle: FontStyle.italic,
                            color: diffColor.withValues(alpha: 0.7),
                          ),
                        ),
                        const Spacer(),
                        Text(
                          DateFormat('dd.MM.yyyy HH:mm').format(tx.date.toLocal()),
                          style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
                        ),
                      ],
                    ),
                  ] else ...[
                    // Date in compact mode (right-aligned under row)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: Text(
                          DateFormat('dd.MM.yyyy HH:mm').format(tx.date.toLocal()),
                          style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  static String? _getTradeVerdict(double pct) {
    // Use hashCode-based selection but make it static
    final hash = pct.hashCode.abs();
    if (pct >= 15) {
      return const ['Excellent outcome', 'Strong return on investment', 'Outstanding trade result'][hash % 3];
    } else if (pct >= 3) {
      return const ['Solid profit', 'Good deal', 'Profitable outcome'][hash % 3];
    } else if (pct >= -3) {
      return const ['Balanced trade', 'Fair exchange', 'Break-even'][hash % 3];
    } else if (pct >= -15) {
      return const ['Minor loss', 'Below market value', 'Slight negative return'][hash % 3];
    } else {
      return const ['Significant loss', 'Well below market price', 'Large negative P/L'][hash % 3];
    }
  }
}

// Track which trades are expanded (persists across rebuilds within session)
final _expandedTrades = <String>{};

class _TypeBadge extends StatelessWidget {
  final String label;
  final Color color;

  const _TypeBadge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 10, color: color),
      ),
    );
  }
}

class _PriceColumn extends StatelessWidget {
  final String label;
  final double price;
  final Color color;
  final CurrencyInfo currency;

  const _PriceColumn({required this.label, required this.price, required this.color, required this.currency});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label, style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled)),
        const SizedBox(height: 4),
        Text(
          currency.format(price),
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color),
        ),
      ],
    );
  }
}

class _ItemThumbnail extends StatelessWidget {
  final String? imageUrl;
  final bool isBuy;

  const _ItemThumbnail({required this.imageUrl, required this.isBuy});

  @override
  Widget build(BuildContext context) {
    final color = isBuy ? AppTheme.primary : AppTheme.profit;
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.12)),
      ),
      child: imageUrl != null
          ? ClipRRect(
              borderRadius: BorderRadius.circular(7),
              child: Image.network(
                imageUrl!,
                width: 40,
                height: 40,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => Icon(
                  isBuy ? Icons.shopping_cart : Icons.sell,
                  color: color,
                  size: 18,
                ),
              ),
            )
          : Icon(
              isBuy ? Icons.shopping_cart : Icons.sell,
              color: color,
              size: 18,
            ),
    );
  }
}

class _TradeValueBox extends StatelessWidget {
  final String label;
  final int count;
  final double value;
  final Color color;
  final CurrencyInfo currency;

  const _TradeValueBox({
    required this.label,
    required this.count,
    required this.value,
    required this.color,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.12)),
      ),
      child: Column(
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            '$count items',
            style: AppTheme.captionSmall,
          ),
          Text(
            currency.format(value),
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Date Filter Bottom Sheet ──────────────────────────────────────
class _DateFilterSheet extends StatefulWidget {
  final DateTime? currentFrom;
  final DateTime? currentTo;
  final void Function(DateTime? from, DateTime? to) onApply;

  const _DateFilterSheet({
    required this.currentFrom,
    required this.currentTo,
    required this.onApply,
  });

  @override
  State<_DateFilterSheet> createState() => _DateFilterSheetState();
}

class _DateFilterSheetState extends State<_DateFilterSheet> {
  DateTime? _from;
  DateTime? _to;
  String? _selectedPreset;

  static const _presets = [
    ('7d', 'Last 7 days', 7),
    ('30d', 'Last 30 days', 30),
    ('90d', 'Last 90 days', 90),
    ('1y', 'Last year', 365),
  ];

  @override
  void initState() {
    super.initState();
    _from = widget.currentFrom;
    _to = widget.currentTo;
    // Detect if current range matches a preset
    if (_from != null && _to != null) {
      final diff = DateTime.now().difference(_from!).inDays;
      for (final p in _presets) {
        if ((diff - p.$3).abs() <= 2) {
          _selectedPreset = p.$1;
          break;
        }
      }
    }
    if (_from == null) _selectedPreset = 'all';
  }

  void _selectPreset(String id, int? days) {
    HapticFeedback.selectionClick();
    setState(() {
      _selectedPreset = id;
      if (days == null) {
        _from = null;
        _to = null;
      } else {
        _from = DateTime.now().subtract(Duration(days: days));
        _to = DateTime.now();
      }
    });
  }

  Future<void> _pickCustomDate({required bool isFrom}) async {
    final initial = isFrom ? _from : _to;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial ?? DateTime.now(),
      firstDate: DateTime(2013),
      lastDate: DateTime.now(),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: const ColorScheme.dark(
            primary: AppTheme.primary,
            surface: AppTheme.surface,
            onSurface: AppTheme.textPrimary,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      HapticFeedback.selectionClick();
      setState(() {
        _selectedPreset = null;
        if (isFrom) {
          _from = picked;
          if (_to != null && _to!.isBefore(picked)) _to = picked;
        } else {
          _to = picked;
          if (_from != null && _from!.isAfter(picked)) _from = picked;
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd MMM yyyy');
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textDisabled,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('Select period', style: AppTheme.title),
          const SizedBox(height: 16),

          // Presets
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _PresetButton(
                label: 'All time',
                selected: _selectedPreset == 'all',
                onTap: () => _selectPreset('all', null),
              ),
              for (final p in _presets)
                _PresetButton(
                  label: p.$2,
                  selected: _selectedPreset == p.$1,
                  onTap: () => _selectPreset(p.$1, p.$3),
                ),
            ],
          ),
          const SizedBox(height: 20),

          // Custom range
          Text('Custom range', style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _DateField(
                  label: 'From',
                  value: _from != null ? fmt.format(_from!) : null,
                  onTap: () => _pickCustomDate(isFrom: true),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Icon(Icons.arrow_forward, size: 16, color: AppTheme.textDisabled),
              ),
              Expanded(
                child: _DateField(
                  label: 'To',
                  value: _to != null ? fmt.format(_to!) : null,
                  onTap: () => _pickCustomDate(isFrom: false),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Apply button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                HapticFeedback.mediumImpact();
                widget.onApply(_from, _to);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Apply', style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }
}

class _PresetButton extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _PresetButton({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppTheme.primary.withValues(alpha: 0.15) : AppTheme.surfaceLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AppTheme.primary : AppTheme.border,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
            color: selected ? AppTheme.primary : AppTheme.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  final String label;
  final String? value;
  final VoidCallback onTap;

  const _DateField({required this.label, required this.value, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppTheme.surfaceLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: value != null ? AppTheme.primary.withValues(alpha: 0.4) : AppTheme.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                value ?? label,
                style: TextStyle(
                  fontSize: 13,
                  color: value != null ? AppTheme.textPrimary : AppTheme.textDisabled,
                ),
              ),
            ),
            const Icon(Icons.calendar_today, size: 14, color: AppTheme.textMuted),
          ],
        ),
      ),
    );
  }
}

// ─── Item Filter Bottom Sheet with Search ──────────────────────────
class _ItemFilterSheet extends StatefulWidget {
  final List<String> items;
  final void Function(String?) onSelect;

  const _ItemFilterSheet({required this.items, required this.onSelect});

  @override
  State<_ItemFilterSheet> createState() => _ItemFilterSheetState();
}

class _ItemFilterSheetState extends State<_ItemFilterSheet> {
  String _query = '';

  List<String> get _filtered => _query.isEmpty
      ? widget.items
      : widget.items.where((n) => n.toLowerCase().contains(_query.toLowerCase())).toList();

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      maxChildSize: 0.9,
      minChildSize: 0.3,
      expand: false,
      builder: (_, controller) => Column(
        children: [
          // Handle
          Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 8),
            child: Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.textDisabled,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
          // Search
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: TextField(
              autofocus: true,
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
              decoration: InputDecoration(
                hintText: 'Search items...',
                hintStyle: const TextStyle(color: AppTheme.textDisabled),
                prefixIcon: const Icon(Icons.search, size: 20, color: AppTheme.textMuted),
                filled: true,
                fillColor: AppTheme.surfaceLight,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
          const SizedBox(height: 4),
          // List
          Expanded(
            child: ListView.builder(
              controller: controller,
              itemCount: _filtered.length + 1,
              itemBuilder: (_, i) {
                if (i == 0) {
                  return ListTile(
                    leading: const Icon(Icons.all_inclusive, size: 18, color: AppTheme.primary),
                    title: const Text('All items', style: TextStyle(color: AppTheme.textPrimary)),
                    onTap: () => widget.onSelect(null),
                  );
                }
                final name = _filtered[i - 1];
                return ListTile(
                  title: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
                  ),
                  onTap: () => widget.onSelect(name),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Export CSV Bottom Sheet ────────────────────────────────────────
class _ExportSheet extends StatefulWidget {
  final WidgetRef ref;
  const _ExportSheet({required this.ref});

  @override
  State<_ExportSheet> createState() => _ExportSheetState();
}

class _ExportSheetState extends State<_ExportSheet> {
  bool _includeBuy = true;
  bool _includeSell = true;
  DateTime? _from;
  DateTime? _to;
  String? _selectedPreset = 'all';
  bool _exporting = false;

  static const _presets = [
    ('all', 'All time', null),
    ('7d', '7 days', 7),
    ('30d', '30 days', 30),
    ('90d', '90 days', 90),
    ('1y', '1 year', 365),
  ];

  void _selectPreset(String id, int? days) {
    HapticFeedback.selectionClick();
    setState(() {
      _selectedPreset = id;
      if (days == null) {
        _from = null;
        _to = null;
      } else {
        _from = DateTime.now().subtract(Duration(days: days));
        _to = DateTime.now();
      }
    });
  }

  Future<void> _pickDate({required bool isFrom}) async {
    final initial = isFrom ? _from : _to;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial ?? DateTime.now(),
      firstDate: DateTime(2013),
      lastDate: DateTime.now(),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: const ColorScheme.dark(
            primary: AppTheme.primary,
            surface: AppTheme.surface,
            onSurface: AppTheme.textPrimary,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      HapticFeedback.selectionClick();
      setState(() {
        _selectedPreset = null;
        if (isFrom) {
          _from = picked;
          if (_to != null && _to!.isBefore(picked)) _to = picked;
        } else {
          _to = picked;
          if (_from != null && _from!.isAfter(picked)) _from = picked;
        }
      });
    }
  }

  Future<void> _export() async {
    if (!_includeBuy && !_includeSell) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one type')),
      );
      return;
    }
    setState(() => _exporting = true);
    HapticFeedback.mediumImpact();

    try {
      final api = widget.ref.read(apiClientProvider);
      final params = <String, dynamic>{};

      if (_includeBuy && !_includeSell) params['type'] = 'buy';
      if (_includeSell && !_includeBuy) params['type'] = 'sell';

      if (_from != null) params['from'] = _from!.toIso8601String();
      if (_to != null) params['to'] = _to!.toIso8601String();

      final response = await api.get('/export/csv', queryParameters: params);
      final csvData = response.data as String;
      final lines = csvData.split('\n').length - 1;

      if (mounted) {
        context.pop();
        final dir = await getTemporaryDirectory();
        final file = File('${dir.path}/skinkeeper_export.csv');
        await file.writeAsString(csvData);
        await SharePlus.instance.share(
          ShareParams(
            files: [XFile(file.path)],
            subject: 'SkinKeeper Export — $lines transactions',
          ),
        );
      }
    } on DioException catch (e) {
      setState(() => _exporting = false);
      if (e.response?.statusCode == 403 && mounted) {
        context.pop();
        context.push('/premium');
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Export failed: ${e.message}')),
        );
      }
    } catch (e) {
      setState(() => _exporting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Export failed')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd MMM yyyy');
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppTheme.r24)),
      ),
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textDisabled,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('Export CSV', style: AppTheme.title),
          const SizedBox(height: 20),

          // Type checkboxes
          Text('Transaction type', style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _CheckTile(
                  label: 'Purchases',
                  icon: Icons.shopping_cart,
                  color: AppTheme.primary,
                  checked: _includeBuy,
                  onChanged: (v) => setState(() => _includeBuy = v),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _CheckTile(
                  label: 'Sales',
                  icon: Icons.sell,
                  color: AppTheme.profit,
                  checked: _includeSell,
                  onChanged: (v) => setState(() => _includeSell = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Period presets
          Text('Period', style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final p in _presets)
                _PresetButton(
                  label: p.$2,
                  selected: _selectedPreset == p.$1,
                  onTap: () => _selectPreset(p.$1, p.$3),
                ),
            ],
          ),
          const SizedBox(height: 16),

          // Custom date range
          Text('Custom range', style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _DateField(
                  label: 'From',
                  value: _from != null ? fmt.format(_from!) : null,
                  onTap: () => _pickDate(isFrom: true),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Icon(Icons.arrow_forward, size: 16, color: AppTheme.textDisabled),
              ),
              Expanded(
                child: _DateField(
                  label: 'To',
                  value: _to != null ? fmt.format(_to!) : null,
                  onTap: () => _pickDate(isFrom: false),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Export button
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              onPressed: _exporting ? null : _export,
              icon: _exporting
                  ? const SizedBox(
                      width: 18, height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.file_download, size: 20),
              label: Text(
                _exporting ? 'Exporting...' : 'Export CSV',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                disabledBackgroundColor: AppTheme.primary.withValues(alpha: 0.3),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 0,
              ),
            ),
          ),
          SizedBox(height: MediaQuery.of(context).padding.bottom),
        ],
      ),
    );
  }
}

class _CheckTile extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool checked;
  final ValueChanged<bool> onChanged;

  const _CheckTile({
    required this.label,
    required this.icon,
    required this.color,
    required this.checked,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onChanged(!checked);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: checked ? color.withValues(alpha: 0.08) : AppTheme.surfaceLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: checked ? color.withValues(alpha: 0.3) : AppTheme.border,
          ),
        ),
        child: Row(
          children: [
            Icon(
              checked ? Icons.check_box : Icons.check_box_outline_blank,
              size: 20,
              color: checked ? color : AppTheme.textDisabled,
            ),
            const SizedBox(width: 8),
            Icon(icon, size: 16, color: checked ? color : AppTheme.textMuted),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: checked ? FontWeight.w600 : FontWeight.normal,
                color: checked ? color : AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
