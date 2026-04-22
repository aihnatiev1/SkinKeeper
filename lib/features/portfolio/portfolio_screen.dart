import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/analytics_service.dart';
import '../../core/cache_service.dart';
import '../../core/api_client.dart';
import '../../core/router.dart';
import '../settings/currency_picker_dialog.dart';
import '../../core/theme.dart';
import '../../core/widgets/stale_data_banner.dart';
import '../../widgets/shared_ui.dart';
import '../inventory/inventory_provider.dart';
import '../trades/trades_provider.dart';
import '../transactions/transactions_provider.dart';
import 'portfolio_pl_provider.dart';
import 'portfolio_provider.dart';
import '../../core/sync_state_provider.dart';
import '../../widgets/glass_sheet.dart';
import 'widgets/add_transaction_sheet.dart';
import 'widgets/analytics_tab.dart';
import 'widgets/portfolio_fab_and_banners.dart';
import 'widgets/portfolio_header.dart';
import 'widgets/portfolio_items_tab.dart';
import 'widgets/portfolio_pill_tabs.dart';
import 'widgets/portfolio_pl_chart_tab.dart';
import 'widgets/portfolio_stat_cards.dart';
import 'widgets/portfolio_value_tab.dart';
import 'widgets/market_value_tab.dart';

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
                      child: PortfolioValueTab(key: const ValueKey('value')),
                    ),
                    Visibility(
                      visible: tab == 1,
                      maintainState: true,
                      child: PortfolioPLChartTab(key: const ValueKey('pl')),
                    ),
                    Visibility(
                      visible: tab == 2,
                      maintainState: true,
                      child: PortfolioItemsTab(key: const ValueKey('items')),
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

