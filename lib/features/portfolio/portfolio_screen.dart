import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/analytics_service.dart';
import '../../core/cache_service.dart';
import '../../core/api_client.dart';
import '../../core/router.dart';
import '../settings/currency_picker_dialog.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../core/widgets/stale_data_banner.dart';
import '../../models/profit_loss.dart';
import '../../widgets/premium_gate.dart';
import '../../widgets/shared_ui.dart';
import '../inventory/inventory_provider.dart';
import '../trades/trades_provider.dart';
import '../transactions/transactions_provider.dart';
import '../purchases/iap_service.dart';
import 'portfolio_pl_provider.dart';
import 'portfolio_provider.dart';
import '../../core/sync_state_provider.dart';
import '../../widgets/glass_sheet.dart';
import 'widgets/add_transaction_sheet.dart';
import 'widgets/analytics_tab.dart';
import 'widgets/portfolio_fab_and_banners.dart';
import 'widgets/portfolio_header.dart';
import 'widgets/portfolio_pill_tabs.dart';
import 'widgets/portfolio_selector_bar.dart';
import 'widgets/portfolio_stat_cards.dart';
import 'widgets/item_pl_list.dart';
import 'widgets/market_value_tab.dart';
import 'widgets/pl_history_chart.dart';

final _tabProvider = StateProvider<int>((ref) => 0);

class PortfolioScreen extends ConsumerStatefulWidget {
  const PortfolioScreen({super.key});

  @override
  ConsumerState<PortfolioScreen> createState() => _PortfolioScreenState();
}

class _PortfolioScreenState extends ConsumerState<PortfolioScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  bool _portfolioViewedLogged = false;

  @override
  void initState() {
    super.initState();
    Analytics.screen('portfolio');
    // Richer funnel event: fires once when P/L data resolves so we capture
    // actual totalValue for segmentation (empty vs $10 vs $1000 portfolios).
    // fireImmediately so the event still logs when the provider is already
    // AsyncData at mount time (keep-alive + cached first load).
    ref.listenManual(portfolioPLProvider, (prev, next) {
      if (_portfolioViewedLogged) return;
      next.whenData((data) {
        if (_portfolioViewedLogged) return;
        _portfolioViewedLogged = true;
        Analytics.portfolioViewed(totalValue: data.totalCurrentValue);
      });
    }, fireImmediately: true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initSequence();
      _backgroundRefresh();
    });
  }

  Future<void> _initSequence() async {
    // Start sync immediately in background (doesn't need currency or onboarding)
    _runInitialSync();

    // 1. Onboarding (first launch only)
    final done = await ref.read(onboardingCompleteProvider.future);
    if (!done && mounted) {
      await context.push('/onboarding');
    }

    // 2. Currency picker (once, after onboarding closes)
    if (mounted) {
      final needsPicker = await shouldShowCurrencyPicker();
      if (needsPicker && mounted) {
        await showCurrencyPickerDialog(context, ref);
      }
    }
  }

  /// Background refresh on every mount: sync inventory + transactions, then
  /// invalidate portfolio/PL providers. Same as pull-to-refresh but automatic.
  /// Skips if _runInitialSync already running (first login).
  Future<void> _backgroundRefresh() async {
    final needsSync = ref.read(needsInitialSyncProvider);
    if (needsSync) return; // _runInitialSync will handle it

    // Immediately refresh P&L from existing DB data (shows Total Profit right away)
    ref.invalidate(portfolioPLProvider);
    ref.invalidate(portfolioProvider);

    final api = ref.read(apiClientProvider);
    final sync = ref.read(syncStateProvider.notifier);

    // Sync inventory in background
    sync.setInventory(true);
    try {
      await api.post('/inventory/refresh');
      if (mounted) {
        ref.invalidate(inventoryProvider);
        ref.invalidate(portfolioProvider);
      }
    } catch (_) {}
    if (mounted) sync.setInventory(false);

    // Sync transactions → triggers cost basis recalc → P/L data appears
    sync.setTransactions(true);
    try {
      await api.post('/transactions/sync');
      if (mounted) {
        ref.invalidate(transactionsProvider);
        ref.invalidate(portfolioPLProvider);
        ref.invalidate(portfolioProvider);
        ref.invalidate(txStatsProvider);
      }
    } catch (_) {}
    if (mounted) sync.setTransactions(false);
  }

  /// Runs initial sync in background. Portfolio screen stays mounted under
  /// onboarding/currency sheets, so ref.invalidate() works fine.
  Future<void> _runInitialSync() async {
    final needsSync = ref.read(needsInitialSyncProvider);
    if (!needsSync) return;
    ref.read(needsInitialSyncProvider.notifier).state = false;

    final api = ref.read(apiClientProvider);
    final sync = ref.read(syncStateProvider.notifier);

    sync.setInventory(true);
    try {
      await api.post('/inventory/refresh');
      if (mounted) {
        ref.invalidate(inventoryProvider);
        ref.invalidate(portfolioProvider);
      }
    } catch (_) {}
    sync.setInventory(false);

    sync.setTransactions(true);
    try {
      await api.post('/transactions/sync');
      if (mounted) {
        ref.invalidate(transactionsProvider);
        ref.invalidate(portfolioPLProvider);
        ref.invalidate(portfolioProvider);
        // Also invalidate P&L history chart and item P&L list
        for (final days in [7, 30, 90, 365]) {
          ref.invalidate(plHistoryProvider(days));
        }
        ref.invalidate(txStatsProvider);
      }
    } catch (_) {}
    sync.setTransactions(false);

    sync.setTrades(true);
    try {
      await api.post('/trades/sync');
      if (mounted) ref.invalidate(tradesProvider);
    } catch (_) {}
    sync.setTrades(false);
  }

  void _showAddTransaction(BuildContext context) {
    HapticFeedback.mediumImpact();
    // Free users get 5 manual transactions — backend enforces the limit
    // and returns 403 premium_required when exceeded
    showGlassSheet(context, const AddTransactionSheet());
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final ref = this.ref;
    final portfolio = ref.watch(portfolioProvider);
    final tab = ref.watch(_tabProvider);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      floatingActionButton: PortfolioAddFab(onTap: () => _showAddTransaction(context)),
      body: AppRefreshIndicator(
        onRefresh: () async {
          ref.invalidate(portfolioProvider);
          await ref.read(portfolioPLProvider.notifier).refresh();
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // ── Custom header ──
            SliverToBoxAdapter(
              child: SafeArea(
                bottom: false,
                child: PortfolioHeader(portfolio: portfolio),
              ),
            ),

            // ── Thin progress bar during background sync ──
            SliverToBoxAdapter(
              child: Consumer(builder: (_, ref, _) {
                final syncing = ref.watch(syncStateProvider.select((s) => s.isSyncing));
                if (!syncing) return const SizedBox.shrink();
                return const LinearProgressIndicator(
                  minHeight: 2,
                  backgroundColor: Colors.transparent,
                  color: AppTheme.accent,
                );
              }),
            ),

            // ── Sync banner (shows during background sync after login) ──
            SliverToBoxAdapter(child: PortfolioSyncBanner()),

            // ── Stale data warning — trader-grade threshold ──
            // Banner appears at 15 min. Below that, the persistent
            // "Updated Nm ago" timestamp near the value is enough signal.
            if (portfolio.hasValue) SliverToBoxAdapter(
              child: Builder(builder: (_) {
                final lastSync = CacheService.lastSync;
                final isStale = lastSync != null &&
                    DateTime.now().difference(lastSync).inMinutes >= 15;
                if (!isStale) return const SizedBox.shrink();
                return StaleDataBanner(
                  lastSync: lastSync,
                  onRefresh: () {
                    ref.invalidate(portfolioProvider);
                    ref.read(portfolioPLProvider.notifier).refresh();
                  },
                );
              }),
            ),

            // ── P/L Summary (always visible, compact) ──
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: PortfolioPLQuickSummary(),
              ),
            ),

            // ── Stat cards ──
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
                child: portfolio.when(
                  data: (data) => PortfolioStatCards(data: data)
                      .animate()
                      .fadeIn(duration: 400.ms)
                      .slideY(begin: 0.1, duration: 400.ms, curve: Curves.easeOutCubic),
                  loading: () => const SkeletonStatCards(),
                  error: (_, _) => const SizedBox.shrink(),
                ),
              ),
            ),

            // ── Session nudge ──
            SliverToBoxAdapter(
              child: SessionNudgeBanner(),
            ),

            // ── Tabs ──
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: PortfolioPillTabs(
                  tabs: const ['Value', 'Profit', 'Items', 'Markets', 'Analytics'],
                  selected: tab,
                  onChanged: (i) {
                    HapticFeedback.selectionClick();
                    ref.read(_tabProvider.notifier).state = i;
                  },
                ),
              ),
            ),

            // ── Tab content — Visibility keeps state, avoids IndexedStack height bloat ──
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
              sliver: SliverToBoxAdapter(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Visibility(
                      visible: tab == 0,
                      maintainState: true,
                      child: _ValueTab(key: const ValueKey('value')),
                    ),
                    Visibility(
                      visible: tab == 1,
                      maintainState: true,
                      child: _PLChartTab(key: const ValueKey('pl')),
                    ),
                    Visibility(
                      visible: tab == 2,
                      maintainState: true,
                      child: _ItemsTab(key: const ValueKey('items')),
                    ),
                    Visibility(
                      visible: tab == 3,
                      maintainState: true,
                      child: MarketValueTab(key: const ValueKey('markets')),
                    ),
                    Visibility(
                      visible: tab == 4,
                      maintainState: true,
                      child: AnalyticsTab(key: const ValueKey('analytics')),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Value Tab ────────────────────────────────────────────────────────
class _ValueTab extends ConsumerWidget {
  const _ValueTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfolio = ref.watch(portfolioProvider);
    return portfolio.when(
      data: (data) => _PortfolioChart(history: data.history)
          .animate().fadeIn(duration: 500.ms).slideY(begin: 0.05, duration: 400.ms, curve: Curves.easeOutCubic),
      loading: () => const Column(children: [
        ShimmerCard(height: 110),
        SizedBox(height: 12),
        ShimmerCard(height: 240),
      ]),
      error: (e, _) => EmptyState(
        icon: Icons.error_outline_rounded,
        title: 'Failed to load portfolio',
        subtitle: 'Check your connection and try again',
        action: GradientButton(
          label: 'Retry',
          icon: Icons.refresh_rounded,
          expanded: false,
          onPressed: () => ref.invalidate(portfolioProvider),
        ),
      ),
    );
  }
}

class _PortfolioChart extends ConsumerStatefulWidget {
  final List<PortfolioHistoryPoint> history;
  const _PortfolioChart({required this.history});

  @override
  ConsumerState<_PortfolioChart> createState() => _PortfolioChartState();
}

class _PortfolioChartState extends ConsumerState<_PortfolioChart> {
  int _activePeriodIdx = 1; // 1W default
  static const _periods = ['1D', '1W', '1M', 'ALL'];

  @override
  Widget build(BuildContext context) {
    final currency = ref.watch(currencyProvider);
    if (widget.history.isEmpty) {
      return SizedBox(
        width: double.infinity,
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.025),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withValues(alpha: 0.06), width: 0.5),
          ),
          child: Column(
            children: [
              Icon(Icons.show_chart_rounded, size: 40,
                  color: Colors.white.withValues(alpha: 0.15)),
              const SizedBox(height: 12),
              Text('Not enough data yet',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600,
                      color: Colors.white.withValues(alpha: 0.5))),
              const SizedBox(height: 6),
              Text('Your portfolio value chart will appear once we have a few days of price data.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12,
                      color: Colors.white.withValues(alpha: 0.3), height: 1.4)),
            ],
          ),
        ),
      );
    }

    // If only 1 data point, duplicate it to draw a flat line
    final chartHistory = widget.history.length == 1
        ? [widget.history.first, widget.history.first]
        : widget.history;

    final spots = chartHistory.asMap().entries
        .map((e) => FlSpot(e.key.toDouble(), e.value.valueCents / 100))
        .toList();

    final minY = chartHistory
        .map((e) => e.valueCents / 100)
        .reduce((a, b) => a < b ? a : b);
    final maxY = chartHistory
        .map((e) => e.valueCents / 100)
        .reduce((a, b) => a > b ? a : b);
    final range = maxY - minY > 0 ? maxY - minY : maxY.abs() * 0.1 + 1;
    final pad = range * 0.12;
    final isUp =
        chartHistory.last.valueCents >= chartHistory.first.valueCents;
    final lineColor = isUp ? AppTheme.profit : AppTheme.loss;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.025),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06), width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('Portfolio Value', style: TextStyle(
                fontSize: 13, fontWeight: FontWeight.w600,
                color: AppTheme.textSecondary,
              )),
              const Spacer(),
              Container(
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(10),
                ),
                padding: const EdgeInsets.all(3),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: _periods.asMap().entries.map((e) {
                    final active = e.key == _activePeriodIdx;
                    return GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        setState(() => _activePeriodIdx = e.key);
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                        decoration: BoxDecoration(
                          color: active ? lineColor.withValues(alpha: 0.2) : Colors.transparent,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          e.value,
                          style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w600,
                            color: active ? lineColor : AppTheme.textDisabled,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 200,
            child: LineChart(
              LineChartData(
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  horizontalInterval: range / 3,
                  getDrawingHorizontalLine: (_) => FlLine(
                    color: Colors.white.withValues(alpha: 0.04),
                    strokeWidth: 1,
                  ),
                ),
                titlesData: FlTitlesData(
                  leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      interval: (widget.history.length / 4).ceilToDouble().clamp(1.0, double.infinity),
                      getTitlesWidget: (value, _) {
                        final idx = value.toInt();
                        if (idx < 0 || idx >= widget.history.length) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            DateFormat('d/M').format(widget.history[idx].date),
                            style: const TextStyle(fontSize: 10, color: AppTheme.textDisabled),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                borderData: FlBorderData(show: false),
                minY: minY - pad,
                maxY: maxY + pad,
                lineBarsData: [
                  LineChartBarData(
                    spots: spots,
                    isCurved: true,
                    curveSmoothness: 0.35,
                    color: lineColor,
                    barWidth: 2.5,
                    dotData: const FlDotData(show: false),
                    shadow: Shadow(color: lineColor.withValues(alpha: 0.3), blurRadius: 8),
                    belowBarData: BarAreaData(
                      show: true,
                      gradient: LinearGradient(
                        colors: [lineColor.withValues(alpha: 0.22), lineColor.withValues(alpha: 0.0)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                  ),
                ],
                lineTouchData: LineTouchData(
                  touchTooltipData: LineTouchTooltipData(
                    tooltipRoundedRadius: 10,
                    tooltipBorder: BorderSide(color: lineColor.withValues(alpha: 0.3), width: 0.5),
                    getTooltipItems: (spots) => spots.map((s) => LineTooltipItem(
                      currency.format(s.y),
                      const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13),
                    )).toList(),
                  ),
                  getTouchedSpotIndicator: (_, indicators) => indicators.map((_) => TouchedSpotIndicatorData(
                    FlLine(color: lineColor.withValues(alpha: 0.3), strokeWidth: 1, dashArray: [4, 4]),
                    FlDotData(
                      show: true,
                      getDotPainter: (_, _, _, _) => FlDotCirclePainter(
                        radius: 5, color: lineColor, strokeWidth: 2.5, strokeColor: AppTheme.bg,
                      ),
                    ),
                  )).toList(),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── P/L Tab ──────────────────────────────────────────────────────────
class _PLChartTab extends ConsumerStatefulWidget {
  const _PLChartTab({super.key});
  @override
  ConsumerState<_PLChartTab> createState() => _PLChartTabState();
}

class _PLChartTabState extends ConsumerState<_PLChartTab> {
  PLPeriod _period = PLPeriod.month;

  @override
  Widget build(BuildContext context) {
    final pl = ref.watch(portfolioPLProvider);
    final history = ref.watch(plHistoryProvider(_period.days));
    final isPremium = ref.watch(premiumProvider).valueOrNull ?? false;

    final accountsPL = ref.watch(accountsPLProvider);

    return Column(
      children: [
        pl.when(
          data: (d) => _PLSummaryCard(data: d)
              .animate().fadeIn(duration: 400.ms).slideY(begin: 0.05, duration: 400.ms, curve: Curves.easeOutCubic),
          loading: () => const ShimmerCard(height: 150),
          error: (_, _) => const SizedBox.shrink(),
        ),
        const SizedBox(height: 12),
        // ── Per-account breakdown (multi-account users) ──
        accountsPL.when(
          data: (accounts) => accounts.length > 1
              ? _AccountBreakdownCard(accounts: accounts)
                  .animate().fadeIn(duration: 400.ms, delay: 100.ms)
              : const SizedBox.shrink(),
          loading: () => const SizedBox.shrink(),
          error: (_, _) => const SizedBox.shrink(),
        ),
        const SizedBox(height: 12),
        PremiumGate(
          isPremium: isPremium,
          featureName: 'Detailed P/L charts over time',
          child: history.when(
            data: (data) => PLHistoryChart(
              history: data,
              period: _period,
              onPeriodChanged: (p) => setState(() => _period = p),
            ).animate().fadeIn(duration: 500.ms, delay: 100.ms),
            loading: () => const ShimmerCard(height: 230),
            error: (_, _) => Center(child: Text('Failed to load', style: TextStyle(color: AppTheme.textSecondary))),
          ),
        ),
      ],
    );
  }
}

// ── Items Tab ────────────────────────────────────────────────────────
class _ItemsTab extends ConsumerWidget {
  const _ItemsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsPL = ref.watch(itemsPLProvider);
    final isPremium = ref.watch(premiumProvider).valueOrNull ?? false;

    return PremiumGate(
      isPremium: isPremium,
      featureName: 'Per-item profit & loss breakdown',
      child: Column(
        children: [
          const PortfolioSelectorBar(),
          const SizedBox(height: 8),
          itemsPL.when(
            data: (s) => ItemPLList(items: s.items, isLoadingMore: s.isLoadingMore)
                .animate()
                .fadeIn(duration: 400.ms),
            loading: () => Column(
              children: List.generate(5, (i) => const Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: ShimmerBox(height: 56),
              )),
            ),
            error: (err, _) => Center(child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Error: $err', style: const TextStyle(color: AppTheme.loss, fontSize: 11)),
            )),
          ),
        ],
      ),
    );
  }
}

// ── P/L Summary Card ─────────────────────────────────────────────────
class _PLSummaryCard extends ConsumerWidget {
  final PortfolioPL data;
  const _PLSummaryCard({required this.data});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    if (!data.hasData) {
      return GestureDetector(
        onTap: () async {
          HapticFeedback.mediumImpact();
          final api = ref.read(apiClientProvider);
          try {
            await api.post('/transactions/sync');
            ref.invalidate(portfolioPLProvider);
            ref.invalidate(transactionsProvider);
          } catch (_) {}
        },
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.primary.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppTheme.primary.withValues(alpha: 0.15), width: 0.5),
          ),
          child: Row(
            children: [
              const Icon(Icons.refresh_rounded, size: 18, color: AppTheme.primary),
              const SizedBox(width: 10),
              Expanded(child: Text('Tap to sync transactions & calculate P/L', style: AppTheme.caption.copyWith(color: AppTheme.textSecondary))),
              const Icon(Icons.chevron_right_rounded, size: 18, color: AppTheme.textDisabled),
            ],
          ),
        ),
      );
    }

    final plColor = AppTheme.plColor(data.totalProfitCents);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: plColor.withValues(alpha: 0.12), width: 0.5),
        boxShadow: [BoxShadow(color: plColor.withValues(alpha: 0.05), blurRadius: 16)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('DETAILED PROFIT', style: TextStyle(
            fontSize: 10, fontWeight: FontWeight.w600,
            letterSpacing: 1.5, color: AppTheme.textDisabled,
          )),
          const SizedBox(height: 14),
          Row(
            children: [
              _MiniStat(label: 'Invested', value: currency.format(data.totalInvested, decimals: 0)),
              _MiniStat(label: 'Current', value: currency.format(data.totalCurrentValue, decimals: 0)),
              _MiniStat(label: 'Realized', value: currency.formatWithSign(data.realizedProfit, decimals: 0), valueColor: AppTheme.plColor(data.realizedProfitCents)),
              _MiniStat(label: 'Unrealized', value: currency.formatWithSign(data.unrealizedProfit, decimals: 0), valueColor: AppTheme.plColor(data.unrealizedProfitCents)),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _MiniStat({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(label.toUpperCase(), style: AppTheme.label.copyWith(fontSize: 9)),
          const SizedBox(height: 3),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(value, style: TextStyle(
              fontSize: 13, fontWeight: FontWeight.w600,
              color: valueColor ?? AppTheme.textPrimary,
              fontFeatures: const [FontFeature.tabularFigures()],
            )),
          ),
        ],
      ),
    );
  }
}

// ── Account Breakdown Card ──────────────────────────────────────────
class _AccountBreakdownCard extends ConsumerWidget {
  final List<AccountPL> accounts;
  const _AccountBreakdownCard({required this.accounts});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06), width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.people_alt_rounded, size: 14, color: AppTheme.textDisabled),
              const SizedBox(width: 6),
              const Text('P/L BY ACCOUNT', style: TextStyle(
                fontSize: 10, fontWeight: FontWeight.w600,
                letterSpacing: 1.5, color: AppTheme.textDisabled,
              )),
            ],
          ),
          const SizedBox(height: 12),
          ...accounts.map((acc) {
            final plColor = AppTheme.plColor(acc.pl.totalProfitCents);
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  // Avatar
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: AppTheme.primary.withValues(alpha: 0.15),
                    backgroundImage: acc.avatarUrl != null
                        ? NetworkImage(acc.avatarUrl!)
                        : null,
                    child: acc.avatarUrl == null
                        ? const Icon(Icons.person_rounded, size: 14, color: AppTheme.textMuted)
                        : null,
                  ),
                  const SizedBox(width: 10),
                  // Name + invested
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          acc.displayName,
                          style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600,
                            color: AppTheme.textPrimary,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          'Invested ${currency.format(acc.pl.totalInvested, decimals: 0)}',
                          style: const TextStyle(fontSize: 10, color: AppTheme.textDisabled),
                        ),
                      ],
                    ),
                  ),
                  // P/L value + percentage
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        currency.formatWithSign(acc.pl.totalProfit),
                        style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w700,
                          color: plColor,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: plColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          AppTheme.pctText(acc.pl.totalProfitPct),
                          style: TextStyle(
                            fontSize: 10, fontWeight: FontWeight.w600,
                            color: plColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
