import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/analytics_service.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../features/auth/session_gate.dart';
import '../../features/auth/session_provider.dart';
import '../../features/auth/widgets/session_status_widget.dart';
import '../../widgets/shared_ui.dart';
import '../inventory/inventory_provider.dart';
import 'trades_provider.dart';
import 'widgets/listings_tab.dart';
import 'widgets/trade_offer_tile.dart';
import 'widgets/trades_account_filter.dart';

class TradesScreen extends ConsumerStatefulWidget {
  const TradesScreen({super.key});

  @override
  ConsumerState<TradesScreen> createState() => _TradesScreenState();
}

class _TradesScreenState extends ConsumerState<TradesScreen>
    with AutomaticKeepAliveClientMixin {
  int _selectedTab = 0;
  late final PageController _pageCtrl;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    Analytics.screen('trades');
    _pageCtrl = PageController();
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final l10n = AppLocalizations.of(context);
    final sessionAsync = ref.watch(sessionStatusProvider);
    final needsReauth = sessionAsync.valueOrNull?.needsReauth ?? false;
    final hasSession = ref.watch(hasSessionProvider);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Stack(
          children: [
            // ── Main content ──
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 16, 0),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          l10n.tradesTitle.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.5,
                            color: AppTheme.textDisabled,
                          ),
                        ),
                      ),
                      const SessionStatusWidget(),
                      _SyncButton(ref: ref),
                    ],
                  ),
                ),
                if (needsReauth && hasSession)
                  GestureDetector(
                    onTap: () => requireSession(context, ref, forceShow: true),
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
                              'Extra verification needed for trading',
                              style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500),
                            ),
                          ),
                          Icon(Icons.chevron_right_rounded, color: AppTheme.textMuted, size: 20),
                        ],
                      ),
                    ),
                  ),
                if (hasSession) const TradesAccountFilter(),
                if (!hasSession)
                  // ── Locked state — clean centered plashka ──
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
                            'Enable trading',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Steam requires an extra verification step\nto create and accept trade offers',
                            style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 20),
                          GradientButton(
                            label: 'Enable Trading',
                            icon: Icons.lock_open_rounded,
                            expanded: false,
                            onPressed: () => requireSession(context, ref),
                          ),
                        ],
                      ),
                    ).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.95, 0.95)),
                  )
                else ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: PillTabSelector(
                      tabs: [l10n.tradePending, l10n.alertHistory, 'Listings'],
                      selected: _selectedTab,
                      onChanged: (i) {
                        setState(() => _selectedTab = i);
                        _pageCtrl.animateToPage(i, duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
                      },
                    ),
                  ),
                  Expanded(
                    child: PageView(
                      controller: _pageCtrl,
                      onPageChanged: (i) => setState(() => _selectedTab = i),
                      children: [_PendingTab(), _HistoryTab(), const ListingsTab()],
                    ),
                  ),
                  // Bottom spacing for the FAB
                  const SizedBox(height: 80),
                ],
              ],
            ),

            // ── FAB over content (hidden when no session — locked state shows Connect CTA) ──
            if (hasSession) Positioned(
              bottom: 16,
              left: 0,
              right: 0,
              child: Center(
                child: GestureDetector(
                  onTap: () {
                    HapticFeedback.mediumImpact();
                    context.push('/trades/create');
                  },
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.primary.withValues(alpha: 0.45),
                          blurRadius: 20,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.swap_horiz_rounded,
                            size: 20, color: Colors.white),
                        const SizedBox(width: 8),
                        Text(
                          l10n.createTrade,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: null,
    );
  }
}

// ---------------------------------------------------------------------------
// Pending offers tab
// ---------------------------------------------------------------------------

class _PendingTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offersAsync = ref.watch(tradesProvider);

    return offersAsync.when(
      data: (tradesState) {
        final pending = tradesState.offers.where((o) => o.isPending).toList();
        if (pending.isEmpty) {
          return Center(
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
                      color: AppTheme.accent.withValues(alpha: 0.15),
                      width: 1,
                    ),
                  ),
                  child: Icon(
                    Icons.swap_horiz_rounded,
                    size: 36,
                    color: AppTheme.accent.withValues(alpha: 0.5),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'No active trade offers',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Create a trade or wait for incoming offers',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppTheme.textMuted,
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.95, 0.95));
        }
        return RefreshIndicator(
          onRefresh: () => ref.read(tradesProvider.notifier).refresh(),
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: pending.length,
            itemBuilder: (_, i) => TradeOfferTile(offer: pending[i])
                .animate()
                .fadeIn(duration: 300.ms, delay: (i * 50).ms)
                .slideX(begin: 0.03, end: 0),
          ),
        );
      },
      loading: () => ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: List.generate(4, (_) => const SkeletonTradeTile()),
      ),
      error: (_, _) => EmptyState(
        icon: Icons.cloud_off_rounded,
        title: 'Failed to load trades',
        subtitle: 'Check your connection and try again',
        action: GradientButton(
          label: 'Retry',
          icon: Icons.refresh_rounded,
          expanded: false,
          onPressed: () => ref.read(tradesProvider.notifier).refresh(),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// History tab (non-pending)
// ---------------------------------------------------------------------------

class _HistoryTab extends ConsumerStatefulWidget {
  @override
  ConsumerState<_HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends ConsumerState<_HistoryTab> {
  final _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollCtrl.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollCtrl.hasClients) return;
    final maxScroll = _scrollCtrl.position.maxScrollExtent;
    final currentScroll = _scrollCtrl.position.pixels;
    // Trigger at ~80% scroll
    if (currentScroll >= maxScroll * 0.8) {
      ref.read(tradesProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final offersAsync = ref.watch(tradesProvider);

    return offersAsync.when(
      data: (tradesState) {
        final history = tradesState.offers.where((o) => !o.isPending).toList();
        if (history.isEmpty) {
          return Center(
            child: Text(
              'No trade history',
              style: const TextStyle(
                fontSize: 15,
                color: AppTheme.textSecondary,
              ),
            ),
          ).animate().fadeIn(duration: 400.ms);
        }
        return RefreshIndicator(
          onRefresh: () => ref.read(tradesProvider.notifier).refresh(),
          child: ListView.builder(
            controller: _scrollCtrl,
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: history.length + (tradesState.isLoadingMore ? 1 : 0),
            itemBuilder: (_, i) {
              if (i >= history.length) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(
                    child: SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppTheme.accent,
                      ),
                    ),
                  ),
                );
              }
              return TradeOfferTile(
                offer: history[i],
                showActions: false,
              ).animate()
                  .fadeIn(duration: 300.ms, delay: (i * 50).ms)
                  .slideX(begin: 0.03, end: 0);
            },
          ),
        );
      },
      loading: () => ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: List.generate(4, (_) => const SkeletonTradeTile()),
      ),
      error: (_, _) => EmptyState(
        icon: Icons.cloud_off_rounded,
        title: 'Failed to load trades',
        subtitle: 'Check your connection and try again',
        action: GradientButton(
          label: 'Retry',
          icon: Icons.refresh_rounded,
          expanded: false,
          onPressed: () => ref.read(tradesProvider.notifier).refresh(),
        ),
      ),
    );
  }
}


// ---------------------------------------------------------------------------
// Trade offer tile with fast accept/decline
// ---------------------------------------------------------------------------


// StatusBadge replaced by shared StatusChip widget from shared_ui.dart



// ---------------------------------------------------------------------------
// Sync button with loading spinner
// ---------------------------------------------------------------------------

class _SyncButton extends StatefulWidget {
  final WidgetRef ref;
  const _SyncButton({required this.ref});

  @override
  State<_SyncButton> createState() => _SyncButtonState();
}

class _SyncButtonState extends State<_SyncButton> {
  bool _syncing = false;

  @override
  Widget build(BuildContext context) {
    if (_syncing) {
      return const SizedBox(
        width: 40, height: 40,
        child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.accent))),
      );
    }
    return GlassIconButton(
      icon: Icons.sync_rounded,
      onTap: () async {
              HapticFeedback.mediumImpact();
              setState(() => _syncing = true);
              try {
                await widget.ref.read(tradesProvider.notifier).syncFromSteam();
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Synced from Steam'),
                      duration: Duration(seconds: 1),
                    ),
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Sync failed: ${friendlyError(e)}')),
                  );
                }
              } finally {
                if (mounted) setState(() => _syncing = false);
              }
            },
    );
  }
}
