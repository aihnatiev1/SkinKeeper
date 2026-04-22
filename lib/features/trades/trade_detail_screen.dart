import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/review_service.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../models/trade_offer.dart';
import '../inventory/inventory_provider.dart';
import 'trades_provider.dart';
import 'widgets/trade_detail_parts.dart';

class TradeDetailScreen extends ConsumerWidget {
  final String offerId;

  const TradeDetailScreen({super.key, required this.offerId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offerAsync = ref.watch(tradeDetailProvider(offerId));

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 16, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 20, color: AppTheme.textSecondary),
                    onPressed: () => context.pop(),
                  ),
                  Expanded(
                    child: Text(
                      'Trade Details'.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.5,
                        color: AppTheme.textDisabled,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: offerAsync.when(
                data: (offer) {
                  if (offer == null) {
                    return const Center(child: Text('Trade not found'));
                  }
                  return _TradeDetailBody(offer: offer);
                },
                loading: () => const Center(
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppTheme.accent)),
                error: (e, _) => Center(child: Text('Failed to load trade', style: TextStyle(color: AppTheme.textSecondary))),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TradeDetailBody extends ConsumerWidget {
  final TradeOffer offer;

  const _TradeDetailBody({required this.offer});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final giveItems = offer.giveItems;
    final recvItems = offer.receiveItems;
    final isScamWarning =
        offer.valueDiffCents < 0 &&
        offer.valueDiffCents.abs() > (offer.valueGiveCents * 0.15);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: AppTheme.glassElevated(),
            child: Column(
              children: [
                Row(
                  children: [
                    Icon(
                      offer.isIncoming ? Icons.call_received : Icons.call_made,
                      color: offer.isIncoming
                          ? AppTheme.accent
                          : AppTheme.warning,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            offer.isIncoming ? 'Incoming Trade' : 'Outgoing Trade',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            'Partner: ${offer.partnerName ?? offer.partnerSteamId}',
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    _buildStatusBadge(offer.status),
                  ],
                ),
                if (offer.message != null && offer.message!.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      borderRadius: BorderRadius.circular(AppTheme.r12),
                    ),
                    child: Text(
                      '"${offer.message}"',
                      style: const TextStyle(
                        fontSize: 13,
                        fontStyle: FontStyle.italic,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05, end: 0),

          // Scam warning
          if (isScamWarning) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.loss.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(AppTheme.r12),
                border: Border.all(color: AppTheme.loss.withValues(alpha: 0.2)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber, color: AppTheme.loss, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Value Warning',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.loss,
                          ),
                        ),
                        Text(
                          'You are giving ${currency.formatCents(offer.valueGiveCents)} and receiving ${currency.formatCents(offer.valueRecvCents)} (${currency.formatCentsWithSign(offer.valueDiffCents)})',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.loss.withValues(alpha: 0.8),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ).animate().fadeIn(duration: 300.ms, delay: 50.ms),
          ],

          // Value summary
          if (offer.valueGiveCents > 0 || offer.valueRecvCents > 0) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: AppTheme.glass(),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  TradeDetailValueColumn(
                    label: 'You Give',
                    valueCents: offer.valueGiveCents,
                    color: AppTheme.loss,
                    currency: currency,
                  ),
                  Icon(Icons.swap_horiz,
                      color: AppTheme.textDisabled, size: 24),
                  TradeDetailValueColumn(
                    label: 'You Get',
                    valueCents: offer.valueRecvCents,
                    color: AppTheme.profit,
                    currency: currency,
                  ),
                  Container(
                    width: 1,
                    height: 36,
                    color: AppTheme.border,
                  ),
                  TradeDetailValueColumn(
                    label: 'Diff',
                    valueCents: offer.valueDiffCents,
                    color: offer.valueDiffCents >= 0
                        ? AppTheme.profit
                        : AppTheme.loss,
                    showSign: true,
                    currency: currency,
                  ),
                ],
              ),
            ).animate().fadeIn(duration: 300.ms, delay: 100.ms).slideY(begin: 0.05, end: 0),
          ],

          // Give items
          const SizedBox(height: 16),
          TradeDetailSectionHeader(
            title: 'Items You Give',
            count: giveItems.length,
            color: AppTheme.loss,
          ),
          const SizedBox(height: 8),
          ...giveItems.asMap().entries.map((entry) =>
            TradeDetailItemTile(item: entry.value, currency: currency)
                .animate()
                .fadeIn(duration: 200.ms, delay: (150 + entry.key * 30).ms),
          ),

          // Receive items
          const SizedBox(height: 16),
          TradeDetailSectionHeader(
            title: 'Items You Receive',
            count: recvItems.length,
            color: AppTheme.profit,
          ),
          const SizedBox(height: 8),
          if (recvItems.isEmpty)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(AppTheme.r12),
              ),
              child: const Center(
                child: Text(
                  'Nothing (gift)',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppTheme.textMuted,
                  ),
                ),
              ),
            )
          else
            ...recvItems.asMap().entries.map((entry) =>
              TradeDetailItemTile(item: entry.value, currency: currency)
                  .animate()
                  .fadeIn(duration: 200.ms, delay: (200 + entry.key * 30).ms),
            ),

          // Actions
          if (offer.status == 'awaiting_confirmation') ...[
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.orange.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(AppTheme.r12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.phone_android_rounded, color: Colors.orange, size: 22),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Open Steam mobile app to confirm or revoke this trade offer',
                      style: TextStyle(color: Colors.orange, fontSize: 13, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
          ] else if (offer.isPending) ...[
            const SizedBox(height: 24),
            _buildActions(context, ref),
          ],

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    final (Color color, String label) = switch (status) {
      'pending' => (AppTheme.warning, 'Pending'),
      'awaiting_confirmation' => (Colors.orange, 'Awaiting Confirmation'),
      'on_hold' => (AppTheme.warning, 'On Hold'),
      'accepted' => (AppTheme.profit, 'Accepted'),
      'declined' => (AppTheme.loss, 'Declined'),
      'cancelled' => (AppTheme.textMuted, 'Cancelled'),
      'expired' => (AppTheme.textMuted, 'Expired'),
      _ => (AppTheme.textMuted, status),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppTheme.r12),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }

  Widget _buildActions(BuildContext context, WidgetRef ref) {
    if (offer.isIncoming) {
      return Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 48,
              child: ElevatedButton.icon(
                onPressed: () => _accept(ref, context),
                icon: const Icon(Icons.check, size: 18),
                label: const Text('Accept',
                    style:
                        TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.profit,
                  foregroundColor: Colors.black,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppTheme.r16)),
                  elevation: 0,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 48,
              child: OutlinedButton.icon(
                onPressed: () => _decline(ref, context),
                icon: const Icon(Icons.close, size: 18),
                label: const Text('Decline',
                    style:
                        TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppTheme.loss),
                  foregroundColor: AppTheme.loss,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppTheme.r16)),
                ),
              ),
            ),
          ),
        ],
      );
    } else {
      return SizedBox(
        width: double.infinity,
        height: 48,
        child: OutlinedButton.icon(
          onPressed: () => _cancel(ref, context),
          icon: const Icon(Icons.cancel_outlined, size: 18),
          label: const Text('Cancel Offer',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: AppTheme.warning),
            foregroundColor: AppTheme.warning,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppTheme.r16)),
          ),
        ),
      );
    }
  }

  Future<void> _accept(WidgetRef ref, BuildContext context) async {
    HapticFeedback.mediumImpact();
    try {
      await ref.read(tradesProvider.notifier).acceptOffer(offer.id);
      ReviewService.maybeRequestReview();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Trade accepted')),
        );
        ref.invalidate(tradeDetailProvider(offer.id));
        ref.read(inventoryProvider.notifier).refresh();
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
        ref.invalidate(tradeDetailProvider(offer.id));
        ref.read(inventoryProvider.notifier).refresh();
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
        ref.invalidate(tradeDetailProvider(offer.id));
        ref.read(inventoryProvider.notifier).refresh();
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

// ---------------------------------------------------------------------------
// Supporting widgets
