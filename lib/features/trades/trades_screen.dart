import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/analytics_service.dart';
import '../../core/api_client.dart';
import '../../core/review_service.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../features/auth/session_gate.dart';
import '../../features/auth/session_provider.dart';
import '../../features/auth/widgets/session_status_widget.dart';
import '../../features/settings/accounts_provider.dart';
import '../../models/market_listing.dart';
import '../../models/trade_offer.dart';
import '../../models/user.dart';
import '../../widgets/shared_ui.dart';
import '../inventory/inventory_provider.dart';
import 'trades_provider.dart';

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
                              'Extra verification needed for trading',
                              style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500),
                            ),
                          ),
                          Icon(Icons.chevron_right_rounded, color: AppTheme.textMuted, size: 20),
                        ],
                      ),
                    ),
                  ),
                if (hasSession) _TradesAccountFilter(),
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
                      children: [_PendingTab(), _HistoryTab(), _ListingsTab()],
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
            itemBuilder: (_, i) => _TradeOfferTile(offer: pending[i])
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
              return _TradeOfferTile(
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

class _TradeOfferTile extends ConsumerWidget {
  final TradeOffer offer;
  final bool showActions;

  const _TradeOfferTile({
    required this.offer,
    this.showActions = true,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final giveItems = offer.giveItems;
    final recvItems = offer.receiveItems;
    final isScamWarning =
        offer.valueDiffCents < 0 &&
        offer.valueDiffCents.abs() > (offer.valueGiveCents * 0.15);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: isScamWarning && offer.isPending
          ? AppTheme.glassAccent(accentColor: AppTheme.loss)
          : AppTheme.glass(),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppTheme.r16),
        onTap: () => context.push('/trades/${offer.id}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header: direction + partner + status
              Row(
                children: [
                  Icon(
                    offer.isIncoming
                        ? Icons.call_received
                        : Icons.call_made,
                    size: 16,
                    color: offer.isIncoming
                        ? AppTheme.accent
                        : AppTheme.warning,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      offer.isIncoming
                          ? 'From ${offer.partnerName ?? _shortSteamId(offer.partnerSteamId)}'
                          : 'To ${offer.partnerName ?? _shortSteamId(offer.partnerSteamId)}',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  StatusChip.fromTradeStatus(offer.status),
                ],
              ),

              if (offer.isInternal || offer.isQuickTransfer)
                Padding(
                  padding: const EdgeInsets.only(top: 4, left: 22),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.swap_horiz_rounded,
                        size: 13,
                        color: Colors.amber.shade400,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        offer.isQuickTransfer ? 'Quick Transfer' : 'Internal Transfer',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.amber.shade400,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),

              if (offer.isInternal &&
                  (offer.accountFromName != null || offer.accountToName != null))
                Padding(
                  padding: const EdgeInsets.only(top: 3, left: 22),
                  child: _AccountBadge(
                    fromName: offer.accountFromName,
                    toName: offer.accountToName,
                  ),
                )
              else if (!offer.isInternal && offer.ownerAccountName != null)
                Padding(
                  padding: const EdgeInsets.only(top: 3, left: 22),
                  child: _AccountBadge(fromName: offer.ownerAccountName),
                ),

              const SizedBox(height: 10),

              // Items preview: give -> receive
              Row(
                children: [
                  Expanded(child: _ItemsPreview(items: giveItems, label: 'Give', alignEnd: true)),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Icon(Icons.arrow_forward,
                        size: 16, color: AppTheme.textDisabled),
                  ),
                  Expanded(
                    child: _ItemsPreview(items: recvItems, label: 'Receive'),
                  ),
                ],
              ),

              // Value comparison
              if (offer.valueGiveCents > 0 || offer.valueRecvCents > 0) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      currency.format(offer.giveValueUsd),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Icon(Icons.arrow_forward,
                          size: 12, color: AppTheme.textDisabled),
                    ),
                    Text(
                      currency.format(offer.recvValueUsd),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                    const Spacer(),
                    // Value diff
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: offer.valueDiffCents >= 0
                            ? AppTheme.profit.withValues(alpha: 0.1)
                            : AppTheme.loss.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(AppTheme.r8),
                      ),
                      child: Text(
                        '${currency.formatWithSign(offer.valueDiffUsd)} (${offer.valueDiffPct >= 0 ? '+' : ''}${offer.valueDiffPct.toStringAsFixed(1)}%)',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: offer.valueDiffCents >= 0
                              ? AppTheme.profit
                              : AppTheme.loss,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                  ],
                ),
              ],

              // Scam warning
              if (isScamWarning && offer.isPending) ...[
                const SizedBox(height: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppTheme.loss.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(AppTheme.r8),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.warning_amber, size: 14, color: AppTheme.loss),
                      SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Significant value difference — review carefully',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppTheme.loss,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              // Awaiting mobile confirmation hint (outgoing only — sender must confirm)
              if (offer.status == 'awaiting_confirmation') ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(AppTheme.r8),
                    border: Border.all(
                      color: AppTheme.warning.withValues(alpha: 0.3),
                      width: 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.phone_android_rounded, color: AppTheme.warning.withValues(alpha: 0.7), size: 15),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Confirm or revoke in Steam mobile app',
                          style: TextStyle(color: AppTheme.warning.withValues(alpha: 0.7), fontSize: 12, fontWeight: FontWeight.w500),
                        ),
                      ),
                    ],
                  ),
                ),
              ]
              // Fast actions for pending
              else if (showActions && offer.isPending) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    if (offer.isIncoming) ...[
                      Expanded(
                        child: SizedBox(
                          height: 36,
                          child: ElevatedButton(
                            onPressed: () => _accept(ref, context),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.profit,
                              foregroundColor: Colors.black,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(AppTheme.r12),
                              ),
                              elevation: 0,
                              padding: EdgeInsets.zero,
                            ),
                            child: const Text(
                              'Accept',
                              style: TextStyle(
                                  fontSize: 13, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: SizedBox(
                          height: 36,
                          child: OutlinedButton(
                            onPressed: () => _decline(ref, context),
                            style: OutlinedButton.styleFrom(
                              side: BorderSide(
                                  color: AppTheme.loss.withValues(alpha: 0.4)),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(AppTheme.r12),
                              ),
                              padding: EdgeInsets.zero,
                            ),
                            child: const Text(
                              'Decline',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.loss,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ] else ...[
                      Expanded(
                        child: SizedBox(
                          height: 36,
                          child: OutlinedButton(
                            onPressed: () => _cancel(ref, context),
                            style: OutlinedButton.styleFrom(
                              side: BorderSide(
                                  color: AppTheme.warning.withValues(alpha: 0.4)),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(AppTheme.r12),
                              ),
                              padding: EdgeInsets.zero,
                            ),
                            child: const Text(
                              'Cancel Offer',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.warning,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _accept(WidgetRef ref, BuildContext context) async {
    if (!await requireSession(context, ref)) return;
    if (!context.mounted) return;
    HapticFeedback.mediumImpact();
    try {
      await ref.read(tradesProvider.notifier).acceptOffer(offer.id);
      ReviewService.maybeRequestReview();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Trade accepted')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: ${friendlyError(e)}')),
        );
      }
    }
  }

  Future<void> _decline(WidgetRef ref, BuildContext context) async {
    if (!await requireSession(context, ref)) return;
    if (!context.mounted) return;
    HapticFeedback.lightImpact();
    try {
      await ref.read(tradesProvider.notifier).declineOffer(offer.id);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Trade declined')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: ${friendlyError(e)}')),
        );
      }
    }
  }

  Future<void> _cancel(WidgetRef ref, BuildContext context) async {
    if (!await requireSession(context, ref)) return;
    if (!context.mounted) return;
    HapticFeedback.lightImpact();
    try {
      await ref.read(tradesProvider.notifier).cancelOffer(offer.id);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Offer cancelled')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: ${friendlyError(e)}')),
        );
      }
    }
  }

  String _shortSteamId(String steamId) {
    if (steamId.length > 8) return '...${steamId.substring(steamId.length - 6)}';
    return steamId;
  }
}

// ---------------------------------------------------------------------------
// Items preview (small image row)
// ---------------------------------------------------------------------------

class _ItemsPreview extends StatelessWidget {
  final List<TradeOfferItem> items;
  final String label;
  /// Align items to the right edge (for the Give/left side).
  final bool alignEnd;

  const _ItemsPreview({
    required this.items,
    required this.label,
    this.alignEnd = false,
  });

  // 34px thumbs + 3px gaps, max 3 shown → worst case 3*37+34 = 145px
  // safely fits within each Expanded half on any iPhone.
  static const _kSize = 34.0;
  static const _kGap = 3.0;
  static const _kMax = 3;

  @override
  Widget build(BuildContext context) {
    final visible = items.where((i) => i.fullIconUrl.isNotEmpty).toList();
    final shown = visible.take(_kMax).toList();
    final extra = items.length > _kMax ? items.length - _kMax : 0;

    return Column(
      crossAxisAlignment:
          alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (items.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              '$label (${items.length})',
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: AppTheme.textMuted,
              ),
            ),
          ),
        Align(
          alignment:
              alignEnd ? Alignment.centerRight : Alignment.centerLeft,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: shown.isEmpty
                ? [_emptyThumb()]
                : [
                    for (int i = 0; i < shown.length; i++) ...[
                      _thumb(shown[i].fullIconUrl),
                      if (i < shown.length - 1 || extra > 0)
                        const SizedBox(width: _kGap),
                    ],
                    if (extra > 0) _badge('+$extra'),
                  ],
          ),
        ),
      ],
    );
  }

  Widget _thumb(String url) => SizedBox(
        width: _kSize,
        height: _kSize,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: ColoredBox(
            color: AppTheme.surface,
            child: CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.contain,
              errorWidget: (_, _, _) => const Icon(
                  Icons.image_not_supported,
                  size: 13,
                  color: AppTheme.textDisabled),
            ),
          ),
        ),
      );

  Widget _badge(String text) => Container(
        width: _kSize,
        height: _kSize,
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(6),
        ),
        alignment: Alignment.center,
        child: Text(text,
            style: const TextStyle(
                fontSize: 10, color: AppTheme.textSecondary)),
      );

  /// Subtle placeholder shown when a trade side has no items (or no images).
  Widget _emptyThumb() => Container(
        width: _kSize,
        height: _kSize,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.09),
            width: 1,
          ),
        ),
        alignment: Alignment.center,
        child: Icon(Icons.remove,
            size: 13, color: Colors.white.withValues(alpha: 0.18)),
      );
}

// StatusBadge replaced by shared StatusChip widget from shared_ui.dart

// ---------------------------------------------------------------------------
// Listings tab (active Steam Market listings)
// ---------------------------------------------------------------------------

class _ListingsTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final listingsAsync = ref.watch(listingsProvider);

    return listingsAsync.when(
      data: (state) {
        if (state.listings.isEmpty) {
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
                    Icons.storefront_outlined,
                    size: 36,
                    color: AppTheme.accent.withValues(alpha: 0.5),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'No active listings',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Items you list on Steam Market appear here',
                  style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.95, 0.95));
        }
        return RefreshIndicator(
          onRefresh: () => ref.read(listingsProvider.notifier).refresh(),
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: state.listings.length,
            itemBuilder: (_, i) => _ListingTile(listing: state.listings[i], currency: currency)
                .animate()
                .fadeIn(duration: 300.ms, delay: (i * 40).ms)
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
        title: 'Failed to load listings',
        subtitle: 'Check your session and try again',
        action: GradientButton(
          label: 'Retry',
          icon: Icons.refresh_rounded,
          expanded: false,
          onPressed: () => ref.read(listingsProvider.notifier).refresh(),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Single listing tile
// ---------------------------------------------------------------------------

class _ListingTile extends ConsumerWidget {
  final MarketListing listing;
  final CurrencyInfo currency;
  const _ListingTile({required this.listing, required this.currency});

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: const Text('Cancel listing?'),
        content: Text('Remove "${listing.displayName}" from Steam Market?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('No')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel listing', style: TextStyle(color: AppTheme.loss)),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    final ok = await ref.read(listingsProvider.notifier).cancelListing(listing.listingId);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(ok ? 'Listing cancelled' : 'Failed to cancel — try again'),
        backgroundColor: ok ? AppTheme.profit : AppTheme.loss,
        duration: const Duration(seconds: 2),
      ));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final createdStr = _formatDate(listing.createdAt);
    final accentColor = listing.needsConfirmation
        ? AppTheme.warning
        : listing.isOnHold
            ? AppTheme.textMuted
            : null;

    return Dismissible(
      key: Key(listing.listingId),
      direction: DismissDirection.endToStart,
      confirmDismiss: (_) async {
        final ok = await ref.read(listingsProvider.notifier).cancelListing(listing.listingId);
        if (!ok && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Failed to cancel — try again'),
            backgroundColor: AppTheme.loss,
          ));
        }
        return ok;
      },
      background: Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: AppTheme.loss.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(AppTheme.r12),
          border: Border.all(color: AppTheme.loss.withValues(alpha: 0.3)),
        ),
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.delete_outline_rounded, color: AppTheme.loss, size: 22),
            SizedBox(height: 4),
            Text('Cancel', style: TextStyle(color: AppTheme.loss, fontSize: 11, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
      child: Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: accentColor != null
          ? AppTheme.glassAccent(accentColor: accentColor)
          : AppTheme.glass(),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            // Icon
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(AppTheme.r8),
              ),
              child: listing.fullIconUrl.isNotEmpty
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(AppTheme.r8),
                      child: Image.network(
                        listing.fullIconUrl,
                        fit: BoxFit.contain,
                        errorBuilder: (_, _, _) => const Icon(
                          Icons.image_not_supported,
                          size: 22,
                          color: AppTheme.textDisabled,
                        ),
                      ),
                    )
                  : const Icon(
                      Icons.image_not_supported,
                      size: 22,
                      color: AppTheme.textDisabled,
                    ),
            ),
            const SizedBox(width: 12),
            // Name + meta
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          listing.displayName,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (listing.needsConfirmation) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppTheme.warning.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text(
                            'Confirm',
                            style: TextStyle(fontSize: 10, color: AppTheme.warning, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ] else if (listing.isOnHold) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppTheme.textMuted.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text(
                            'On Hold',
                            style: TextStyle(fontSize: 10, color: AppTheme.textMuted, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (listing.marketHashName != null &&
                      listing.marketHashName != listing.displayName) ...[
                    const SizedBox(height: 2),
                    Text(
                      listing.marketHashName!,
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppTheme.textMuted,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(
                        createdStr,
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppTheme.textDisabled,
                        ),
                      ),
                      if (listing.accountName != null) ...[
                        const SizedBox(width: 6),
                        _AccountBadge(fromName: listing.accountName),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            // Prices + cancel button
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  currency.format(listing.sellerPriceValue),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.profit,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Buyer: ${currency.format(listing.buyerPriceValue)}',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppTheme.textMuted,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 6),
                GestureDetector(
                  onTap: () => _cancel(context, ref),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppTheme.loss.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: AppTheme.loss.withValues(alpha: 0.25)),
                    ),
                    child: const Text(
                      'Cancel',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppTheme.loss),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      ), // Dismissible child
    ); // Dismissible
  }

  String _formatDate(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inDays == 0) return 'Today';
    if (diff.inDays == 1) return 'Yesterday';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[dt.month - 1]} ${dt.day}';
  }
}

// ---------------------------------------------------------------------------
// Account filter chip (only shown when user has multiple accounts)
// ---------------------------------------------------------------------------

class _TradesAccountFilter extends ConsumerWidget {
  const _TradesAccountFilter();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accountsAsync = ref.watch(accountsProvider);
    return accountsAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (accounts) {
        if (accounts.length <= 1) return const SizedBox.shrink();
        final selectedId = ref.watch(
          tradesProvider.select((s) => s.valueOrNull?.selectedAccountId),
        );
        final active = selectedId != null
            ? accounts.firstWhere((a) => a.id == selectedId,
                orElse: () => accounts.first)
            : null;
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: GestureDetector(
            onTap: () => _showPicker(context, ref, accounts, selectedId),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: active != null
                      ? AppTheme.primary.withValues(alpha: 0.4)
                      : AppTheme.borderLight.withValues(alpha: 0.5),
                  width: 0.5,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (active != null)
                    _AccountAvatar(url: active.avatarUrl, size: 16)
                  else
                    _StackedAccountAvatars(accounts: accounts),
                  const SizedBox(width: 6),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 110),
                    child: Text(
                      active?.displayName ?? 'All accounts',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: active != null
                            ? AppTheme.primaryLight
                            : AppTheme.textSecondary,
                        overflow: TextOverflow.ellipsis,
                      ),
                      maxLines: 1,
                    ),
                  ),
                  const SizedBox(width: 3),
                  Icon(
                    Icons.expand_more_rounded,
                    size: 14,
                    color: active != null
                        ? AppTheme.primaryLight.withValues(alpha: 0.7)
                        : AppTheme.textMuted,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  void _showPicker(
    BuildContext context,
    WidgetRef ref,
    List<SteamAccount> accounts,
    int? currentId,
  ) {
    HapticFeedback.selectionClick();
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AccountFilterPicker(
        accounts: accounts,
        currentId: currentId,
        onSelect: (id) {
          HapticFeedback.selectionClick();
          ref.read(tradesProvider.notifier).setAccountFilter(id);
          Navigator.of(context, rootNavigator: true).pop();
        },
      ),
    );
  }
}

class _AccountFilterPicker extends StatelessWidget {
  final List<SteamAccount> accounts;
  final int? currentId;
  final void Function(int?) onSelect;

  const _AccountFilterPicker({
    required this.accounts,
    required this.currentId,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 4),
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: AppTheme.borderLight,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 8, 20, 4),
              child: Text(
                'Filter by account',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.textPrimary),
              ),
            ),
            const Divider(color: AppTheme.divider, height: 1),
            _PickerRow(
              leading: _StackedAccountAvatars(accounts: accounts),
              label: 'All accounts',
              sublabel: '${accounts.length} linked',
              selected: currentId == null,
              onTap: () => onSelect(null),
            ),
            const Divider(color: AppTheme.divider, height: 1, indent: 20, endIndent: 20),
            for (final a in accounts)
              _PickerRow(
                leading: _AccountAvatar(url: a.avatarUrl, size: 36),
                label: a.displayName.isNotEmpty ? a.displayName : a.steamId,
                sublabel: a.isActive ? 'Active' : null,
                selected: currentId == a.id,
                onTap: () => onSelect(a.id),
              ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}

class _PickerRow extends StatelessWidget {
  final Widget leading;
  final String label;
  final String? sublabel;
  final bool selected;
  final VoidCallback onTap;

  const _PickerRow({
    required this.leading,
    required this.label,
    this.sublabel,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Row(
          children: [
            SizedBox(width: 36, height: 36, child: Center(child: leading)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: selected ? AppTheme.primaryLight : AppTheme.textPrimary,
                    ),
                  ),
                  if (sublabel != null)
                    Text(sublabel!, style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                ],
              ),
            ),
            if (selected) const Icon(Icons.check_rounded, size: 18, color: AppTheme.primary),
          ],
        ),
      ),
    );
  }
}

class _AccountAvatar extends StatelessWidget {
  final String url;
  final double size;
  const _AccountAvatar({required this.url, required this.size});

  @override
  Widget build(BuildContext context) {
    return ClipOval(
      child: url.isNotEmpty
          ? Image.network(url, width: size, height: size, fit: BoxFit.cover,
              errorBuilder: (_, _, _) => _placeholder())
          : _placeholder(),
    );
  }

  Widget _placeholder() => Container(
    width: size, height: size, color: AppTheme.surfaceLight,
    child: Icon(Icons.person_rounded, size: size * 0.7, color: AppTheme.textMuted),
  );
}

class _StackedAccountAvatars extends StatelessWidget {
  final List<SteamAccount> accounts;
  const _StackedAccountAvatars({required this.accounts});

  @override
  Widget build(BuildContext context) {
    const size = 14.0;
    final shown = accounts.take(2).toList();
    return SizedBox(
      width: size + (shown.length > 1 ? 8.0 : 0),
      height: size,
      child: Stack(
        children: [
          for (int i = 0; i < shown.length; i++)
            Positioned(
              left: i * 8.0,
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: AppTheme.bg, width: 0.8),
                ),
                child: _AccountAvatar(url: shown[i].avatarUrl, size: size),
              ),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Account badge pill shown on trade/listing tiles
// ---------------------------------------------------------------------------

class _AccountBadge extends StatelessWidget {
  final String? fromName;
  final String? toName; // set only for internal trades

  const _AccountBadge({this.fromName, this.toName});

  @override
  Widget build(BuildContext context) {
    final label = toName != null
        ? '${fromName ?? '?'} → $toName'
        : (fromName ?? '');
    if (label.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppTheme.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppTheme.primary.withValues(alpha: 0.2), width: 0.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.person_rounded, size: 10, color: AppTheme.primaryLight.withValues(alpha: 0.7)),
          const SizedBox(width: 3),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 160),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 10,
                color: AppTheme.primaryLight.withValues(alpha: 0.85),
                fontWeight: FontWeight.w500,
                overflow: TextOverflow.ellipsis,
              ),
              maxLines: 1,
            ),
          ),
        ],
      ),
    );
  }
}

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
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Synced from Steam'),
                      duration: Duration(seconds: 1),
                    ),
                  );
                }
              } catch (e) {
                if (mounted) {
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
