import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/review_service.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/trade_offer.dart';
import '../../../widgets/shared_ui.dart';
import '../../auth/session_gate.dart';
import '../trades_provider.dart';
import 'account_badge.dart';

class TradeOfferTile extends ConsumerWidget {
  final TradeOffer offer;
  final bool showActions;

  const TradeOfferTile({
    super.key,
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
                  child: AccountBadge(
                    fromName: offer.accountFromName,
                    toName: offer.accountToName,
                  ),
                )
              else if (!offer.isInternal && offer.ownerAccountName != null)
                Padding(
                  padding: const EdgeInsets.only(top: 3, left: 22),
                  child: AccountBadge(fromName: offer.ownerAccountName),
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
                      currency.formatCents(offer.valueGiveCents),
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
                      currency.formatCents(offer.valueRecvCents),
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
                        '${currency.formatCentsWithSign(offer.valueDiffCents)} (${offer.valueDiffPct >= 0 ? '+' : ''}${offer.valueDiffPct.toStringAsFixed(1)}%)',
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
