import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../features/auth/session_provider.dart';
import '../../models/trade_offer.dart';
import '../../widgets/shared_ui.dart';
import 'trades_provider.dart';

class TradesScreen extends ConsumerStatefulWidget {
  const TradesScreen({super.key});

  @override
  ConsumerState<TradesScreen> createState() => _TradesScreenState();
}

class _TradesScreenState extends ConsumerState<TradesScreen> {
  int _selectedTab = 0;
  late final PageController _pageCtrl;

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

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final sessionAsync = ref.watch(sessionStatusProvider);
    final needsReauth = sessionAsync.valueOrNull?.needsReauth ?? false;

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
                          l10n.tradesTitle,
                          style: const TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: -0.5,
                          ),
                        ),
                      ),
                      GlassIconButton(
                        icon: Icons.sync_rounded,
                        onTap: () async {
                          HapticFeedback.mediumImpact();
                          try {
                            await ref.read(tradesProvider.notifier).syncFromSteam();
                          } catch (e) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Sync failed: ${friendlyError(e)}')),
                              );
                            }
                          }
                        },
                      ),
                    ],
                  ),
                ),
                if (needsReauth)
                  GestureDetector(
                    onTap: () => context.push('/session'),
                    child: Container(
                      width: double.infinity,
                      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: AppTheme.loss.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppTheme.loss.withValues(alpha: 0.3)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.warning_amber_rounded, color: AppTheme.loss, size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              l10n.sessionExpiredReauth,
                              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500),
                            ),
                          ),
                          const Icon(Icons.chevron_right_rounded, color: AppTheme.textMuted, size: 20),
                        ],
                      ),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: PillTabSelector(
                    tabs: [l10n.tradePending, l10n.alertHistory],
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
                    children: [_PendingTab(), _HistoryTab()],
                  ),
                ),
                // Bottom spacing for the FAB
                const SizedBox(height: 80),
              ],
            ),

            // ── FAB over content ──
            Positioned(
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
                      gradient: AppTheme.accentGradient,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.accent.withValues(alpha: 0.45),
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
      loading: () => Center(
        child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.accent),
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
      loading: () => Center(
        child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.accent),
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
                  _StatusBadge(status: offer.status),
                ],
              ),

              if (offer.isQuickTransfer)
                Padding(
                  padding: const EdgeInsets.only(top: 4, left: 22),
                  child: Text(
                    'Quick Transfer',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppTheme.textMuted,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ),

              const SizedBox(height: 10),

              // Items preview: give -> receive
              Row(
                children: [
                  Expanded(child: _ItemsPreview(items: giveItems, label: 'Give')),
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
                      '\$${offer.giveValueUsd.toStringAsFixed(2)}',
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
                      '\$${offer.recvValueUsd.toStringAsFixed(2)}',
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
                        '${offer.valueDiffCents >= 0 ? '+' : ''}\$${offer.valueDiffUsd.toStringAsFixed(2)}',
                        style: TextStyle(
                          fontSize: 12,
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

              // Fast actions
              if (showActions && offer.isPending) ...[
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
    HapticFeedback.mediumImpact();
    try {
      await ref.read(tradesProvider.notifier).acceptOffer(offer.id);
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

  const _ItemsPreview({required this.items, required this.label});

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Container(
        height: 48,
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(AppTheme.r12),
        ),
        child: const Center(
          child: Text(
            'Nothing',
            style: TextStyle(
              fontSize: 11,
              color: AppTheme.textDisabled,
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$label (${items.length})',
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: AppTheme.textMuted,
          ),
        ),
        const SizedBox(height: 4),
        SizedBox(
          height: 40,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: items.length > 4 ? 5 : items.length,
            itemBuilder: (_, i) {
              if (i == 4 && items.length > 4) {
                return Container(
                  width: 36,
                  height: 36,
                  margin: const EdgeInsets.only(right: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.surface,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Center(
                    child: Text(
                      '+${items.length - 4}',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ),
                );
              }
              final item = items[i];
              return Container(
                width: 36,
                height: 36,
                margin: const EdgeInsets.only(right: 4),
                decoration: BoxDecoration(
                  color: AppTheme.surface,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: item.fullIconUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: item.fullIconUrl,
                        fit: BoxFit.contain,
                        errorWidget: (_, _, _) => const Icon(
                            Icons.image_not_supported,
                            size: 14,
                            color: AppTheme.textDisabled),
                      )
                    : const Icon(Icons.image_not_supported,
                        size: 14, color: AppTheme.textDisabled),
              );
            },
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

class _StatusBadge extends StatelessWidget {
  final String status;

  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final (Color color, String label) = switch (status) {
      'pending' => (AppTheme.warning, 'Pending'),
      'accepted' => (AppTheme.profit, 'Accepted'),
      'declined' => (AppTheme.loss, 'Declined'),
      'cancelled' => (AppTheme.textMuted, 'Cancelled'),
      'expired' => (AppTheme.textMuted, 'Expired'),
      'countered' => (AppTheme.steamBlue, 'Countered'),
      'error' => (AppTheme.loss, 'Error'),
      _ => (AppTheme.textMuted, status),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppTheme.r8),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}
