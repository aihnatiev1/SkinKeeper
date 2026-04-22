import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/trade_offer.dart';
import '../trades_provider.dart';

class ReviewStep extends StatelessWidget {
  final SteamFriend friend;
  final List<TradeOfferItem> myItems;
  final List<TradeOfferItem> partnerItems;
  final Set<String> giveAssetIds;
  final Set<String> recvAssetIds;
  final String message;
  final ValueChanged<String> onMessageChanged;
  final VoidCallback onSend;
  final bool sending;
  final CurrencyInfo currency;

  const ReviewStep({
    super.key,
    required this.friend,
    required this.myItems,
    required this.partnerItems,
    required this.giveAssetIds,
    required this.recvAssetIds,
    required this.message,
    required this.onMessageChanged,
    required this.onSend,
    required this.sending,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    final giveItems =
        myItems.where((i) => giveAssetIds.contains(i.assetId)).toList();
    final recvItems =
        partnerItems.where((i) => recvAssetIds.contains(i.assetId)).toList();

    final giveValue = giveItems.fold<int>(0, (s, i) => s + i.priceCents);
    final recvValue = recvItems.fold<int>(0, (s, i) => s + i.priceCents);
    final diff = recvValue - giveValue;

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: AppTheme.glass(),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 20,
                        backgroundImage:
                            CachedNetworkImageProvider(friend.avatarUrl),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(friend.personaName,
                                style: const TextStyle(
                                    fontSize: 15, fontWeight: FontWeight.w600)),
                            Text(friend.steamId,
                                style: const TextStyle(
                                    fontSize: 11,
                                    color: AppTheme.textMuted)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ).animate().fadeIn(duration: 300.ms),

                if (giveValue > 0 || recvValue > 0) ...[
                  const SizedBox(height: 12),
                  _buildValueSummary(giveValue, recvValue, diff, currency)
                      .animate().fadeIn(duration: 300.ms, delay: 50.ms),
                ],

                const SizedBox(height: 16),
                _ReviewSectionHeader(
                    title: 'Items You Give',
                    count: giveItems.length,
                    color: AppTheme.loss),
                const SizedBox(height: 6),
                ...giveItems.map((item) => _ReviewItemTile(item: item, currency: currency)),
                if (giveItems.isEmpty) _emptySection('Nothing (gift)'),

                const SizedBox(height: 16),
                _ReviewSectionHeader(
                    title: 'Items You Receive',
                    count: recvItems.length,
                    color: AppTheme.profit),
                const SizedBox(height: 6),
                ...recvItems.map((item) => _ReviewItemTile(item: item, currency: currency)),
                if (recvItems.isEmpty) _emptySection('Nothing'),

                const SizedBox(height: 16),
                TextField(
                  onChanged: onMessageChanged,
                  maxLength: 128,
                  decoration: InputDecoration(
                    hintText: 'Add a message (optional)',
                    filled: true,
                    fillColor: AppTheme.surface,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppTheme.r12),
                      borderSide: BorderSide.none,
                    ),
                    counterStyle: const TextStyle(
                        fontSize: 10, color: AppTheme.textDisabled),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),

        Container(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 12,
            bottom: MediaQuery.of(context).padding.bottom + 12,
          ),
          decoration: BoxDecoration(
            color: AppTheme.surface,
            border: Border(top: BorderSide(color: AppTheme.border)),
          ),
          child: SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              onPressed: sending ? null : onSend,
              icon: sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.black),
                    )
                  : const Icon(Icons.send, size: 20),
              label: Text(
                sending ? 'Sending...' : 'Send Trade Offer',
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                disabledBackgroundColor:
                    AppTheme.primary.withValues(alpha: 0.15),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.r16)),
                elevation: 0,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildValueSummary(int giveValue, int recvValue, int diff, CurrencyInfo currency) {
    final diffPct = giveValue > 0
        ? (diff / giveValue) * 100
        : recvValue > 0
            ? 100.0
            : 0.0;
    final diffColor = diff > 0
        ? AppTheme.profit
        : diff < 0
            ? AppTheme.loss
            : AppTheme.textMuted;

    String verdict;
    if (diffPct >= 15) {
      verdict = const [
        'Bro, you absolutely cooked here',
        'Free money glitch activated',
        'W trade. Hall of fame material'
      ][giveValue % 3];
    } else if (diffPct >= 3) {
      verdict = const [
        'Nice one! You came out on top',
        'Solid trade, clean profit',
        'GG, you won this round'
      ][giveValue % 3];
    } else if (diffPct >= -3) {
      verdict = const [
        'Fair trade. Both happy, nobody scammed',
        'Perfectly balanced, as all things should be',
        "A gentleman's agreement"
      ][giveValue % 3];
    } else if (diffPct >= -15) {
      verdict = const [
        "I'd think twice about this one...",
        'Not your best trade, chief',
        'You might be leaving money on the table'
      ][giveValue % 3];
    } else {
      verdict = const [
        'Bro... who hurt you?',
        "I'm calling the trade police",
        'My brother in Christ, what are you doing?'
      ][giveValue % 3];
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: AppTheme.glass(),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _ReviewValueCol(
                  label: 'You Give',
                  cents: giveValue,
                  color: AppTheme.loss,
                  currency: currency),
              Icon(Icons.swap_horiz,
                  color: AppTheme.textDisabled, size: 24),
              _ReviewValueCol(
                  label: 'You Get',
                  cents: recvValue,
                  color: AppTheme.profit,
                  currency: currency),
              Container(
                  width: 1, height: 36, color: AppTheme.border),
              Column(
                children: [
                  const Text('Diff',
                      style: TextStyle(
                          fontSize: 11, color: AppTheme.textMuted)),
                  const SizedBox(height: 2),
                  Text(
                    currency.formatWithSign(diff / 100),
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: diffColor),
                  ),
                  Text(
                    '${diffPct >= 0 ? '+' : ''}${diffPct.toStringAsFixed(1)}%',
                    style: TextStyle(fontSize: 11, color: diffColor),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: diffColor.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(AppTheme.r12),
            ),
            child: Row(
              children: [
                Icon(diff >= 0 ? Icons.trending_up : Icons.trending_down,
                    size: 18, color: diffColor),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(verdict,
                      style: TextStyle(
                          fontSize: 13,
                          fontStyle: FontStyle.italic,
                          color: diffColor)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptySection(String text) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(AppTheme.r12),
      ),
      child: Center(
        child: Text(text,
            style:
                const TextStyle(fontSize: 13, color: AppTheme.textMuted)),
      ),
    );
  }
}

class _ReviewSectionHeader extends StatelessWidget {
  final String title;
  final int count;
  final Color color;

  const _ReviewSectionHeader({
    required this.title,
    required this.count,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title,
            style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(AppTheme.r8),
          ),
          child: Text('$count',
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600, color: color)),
        ),
      ],
    );
  }
}

class _ReviewValueCol extends StatelessWidget {
  final String label;
  final int cents;
  final Color color;
  final CurrencyInfo currency;

  const _ReviewValueCol({
    required this.label,
    required this.cents,
    required this.color,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    final value = cents / 100;
    return Column(
      children: [
        Text(label,
            style:
                const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
        const SizedBox(height: 2),
        Text(
          currency.format(value),
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.bold,
            color: color,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}

class _ReviewItemTile extends StatelessWidget {
  final TradeOfferItem item;
  final CurrencyInfo currency;

  const _ReviewItemTile({required this.item, required this.currency});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(10),
      decoration: AppTheme.glass(radius: AppTheme.r12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(AppTheme.r8),
            ),
            child: item.fullIconUrl.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: item.fullIconUrl,
                    fit: BoxFit.contain,
                    errorWidget: (_, _, _) => const Icon(
                        Icons.image_not_supported,
                        size: 16,
                        color: AppTheme.textDisabled),
                  )
                : const Icon(Icons.image_not_supported,
                    size: 16, color: AppTheme.textDisabled),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              item.marketHashName ?? 'Unknown',
              style:
                  const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (item.priceCents > 0)
            Text(
              currency.formatCents(item.priceCents),
              style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary),
            ),
        ],
      ),
    );
  }
}
