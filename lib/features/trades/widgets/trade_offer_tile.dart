import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/review_service.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/trade_offer.dart';
import '../../auth/session_gate.dart';
import '../trades_provider.dart';
import 'trade_offer_tile_parts.dart';

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
              TradeOfferHeaderRow(offer: offer),

              if (offer.isInternal || offer.isQuickTransfer)
                TradeOfferTransferLabel(offer: offer),

              TradeOfferAccountBadgeRow(offer: offer),

              const SizedBox(height: 10),

              TradeOfferItemsRow(giveItems: giveItems, recvItems: recvItems),

              if (offer.valueGiveCents > 0 || offer.valueRecvCents > 0) ...[
                const SizedBox(height: 8),
                TradeOfferValueRow(offer: offer, currency: currency),
              ],

              if (isScamWarning && offer.isPending) ...[
                const SizedBox(height: 8),
                const TradeOfferScamWarning(),
              ],

              if (offer.status == 'awaiting_confirmation') ...[
                const SizedBox(height: 10),
                const TradeOfferAwaitingConfirmationHint(),
              ]
              else if (showActions && offer.isPending) ...[
                const SizedBox(height: 10),
                TradeOfferPendingActions(
                  isIncoming: offer.isIncoming,
                  onAccept: () => _accept(ref, context),
                  onDecline: () => _decline(ref, context),
                  onCancel: () => _cancel(ref, context),
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
}
