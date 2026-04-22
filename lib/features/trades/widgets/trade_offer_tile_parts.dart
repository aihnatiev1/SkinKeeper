import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/trade_offer.dart';
import '../../../widgets/shared_ui.dart';
import 'account_badge.dart';

class TradeOfferHeaderRow extends StatelessWidget {
  final TradeOffer offer;

  const TradeOfferHeaderRow({super.key, required this.offer});

  @override
  Widget build(BuildContext context) {
    return Row(
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
    );
  }

  String _shortSteamId(String steamId) {
    if (steamId.length > 8) return '...${steamId.substring(steamId.length - 6)}';
    return steamId;
  }
}

class TradeOfferTransferLabel extends StatelessWidget {
  final TradeOffer offer;

  const TradeOfferTransferLabel({super.key, required this.offer});

  @override
  Widget build(BuildContext context) {
    return Padding(
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
    );
  }
}

class TradeOfferAccountBadgeRow extends StatelessWidget {
  final TradeOffer offer;

  const TradeOfferAccountBadgeRow({super.key, required this.offer});

  @override
  Widget build(BuildContext context) {
    if (offer.isInternal &&
        (offer.accountFromName != null || offer.accountToName != null)) {
      return Padding(
        padding: const EdgeInsets.only(top: 3, left: 22),
        child: AccountBadge(
          fromName: offer.accountFromName,
          toName: offer.accountToName,
        ),
      );
    }
    if (!offer.isInternal && offer.ownerAccountName != null) {
      return Padding(
        padding: const EdgeInsets.only(top: 3, left: 22),
        child: AccountBadge(fromName: offer.ownerAccountName),
      );
    }
    return const SizedBox.shrink();
  }
}

class TradeOfferItemsRow extends StatelessWidget {
  final List<TradeOfferItem> giveItems;
  final List<TradeOfferItem> recvItems;

  const TradeOfferItemsRow({
    super.key,
    required this.giveItems,
    required this.recvItems,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: TradeOfferItemsPreview(items: giveItems, label: 'Give', alignEnd: true)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Icon(Icons.arrow_forward,
              size: 16, color: AppTheme.textDisabled),
        ),
        Expanded(
          child: TradeOfferItemsPreview(items: recvItems, label: 'Receive'),
        ),
      ],
    );
  }
}

class TradeOfferValueRow extends StatelessWidget {
  final TradeOffer offer;
  final CurrencyInfo currency;

  const TradeOfferValueRow({
    super.key,
    required this.offer,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
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
    );
  }
}

class TradeOfferScamWarning extends StatelessWidget {
  const TradeOfferScamWarning({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
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
    );
  }
}

class TradeOfferAwaitingConfirmationHint extends StatelessWidget {
  const TradeOfferAwaitingConfirmationHint({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
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
    );
  }
}

class TradeOfferPendingActions extends StatelessWidget {
  final bool isIncoming;
  final VoidCallback onAccept;
  final VoidCallback onDecline;
  final VoidCallback onCancel;

  const TradeOfferPendingActions({
    super.key,
    required this.isIncoming,
    required this.onAccept,
    required this.onDecline,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (isIncoming) ...[
          Expanded(
            child: SizedBox(
              height: 36,
              child: ElevatedButton(
                onPressed: onAccept,
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
                onPressed: onDecline,
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
                onPressed: onCancel,
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
    );
  }
}

class TradeOfferItemsPreview extends StatelessWidget {
  final List<TradeOfferItem> items;
  final String label;
  final bool alignEnd;

  const TradeOfferItemsPreview({
    super.key,
    required this.items,
    required this.label,
    this.alignEnd = false,
  });

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
