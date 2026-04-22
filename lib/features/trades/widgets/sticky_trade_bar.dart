import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/trade_offer.dart';

class StickyTradeBar extends StatefulWidget {
  final List<TradeOfferItem> giveItems;
  final List<TradeOfferItem> recvItems;
  final CurrencyInfo currency;
  final ValueChanged<String> onRemoveGive;
  final ValueChanged<String> onRemoveRecv;
  final VoidCallback onContinue;

  const StickyTradeBar({
    super.key,
    required this.giveItems,
    required this.recvItems,
    required this.currency,
    required this.onRemoveGive,
    required this.onRemoveRecv,
    required this.onContinue,
  });

  @override
  State<StickyTradeBar> createState() => _StickyTradeBarState();
}

class _StickyTradeBarState extends State<StickyTradeBar> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final giveCount = widget.giveItems.length;
    final recvCount = widget.recvItems.length;
    final total = giveCount + recvCount;
    final hasSelection = total > 0;

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface,
        border: Border(top: BorderSide(color: AppTheme.border)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (hasSelection)
              GestureDetector(
                onTap: () => setState(() => _expanded = !_expanded),
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.only(top: 6, bottom: 2),
                  child: Center(
                    child: Container(
                      width: 36,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppTheme.textDisabled.withValues(alpha: 0.4),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                ),
              ),

            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          hasSelection
                              ? '$total ${total == 1 ? 'item' : 'items'} selected'
                              : 'No items selected',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: hasSelection
                                ? AppTheme.textPrimary
                                : AppTheme.textMuted,
                          ),
                        ),
                        if (hasSelection)
                          Text(
                            'Give $giveCount, Get $recvCount',
                            style: const TextStyle(
                                fontSize: 12, color: AppTheme.textMuted),
                          ),
                      ],
                    ),
                  ),
                  SizedBox(
                    height: 44,
                    child: ElevatedButton.icon(
                      onPressed: hasSelection ? widget.onContinue : null,
                      icon: const Icon(Icons.arrow_forward, size: 18),
                      label: const Text('Continue',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primary,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor:
                            AppTheme.primary.withValues(alpha: 0.12),
                        shape: RoundedRectangleBorder(
                            borderRadius:
                                BorderRadius.circular(AppTheme.r12)),
                        padding:
                            const EdgeInsets.symmetric(horizontal: 20),
                        elevation: 0,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            if (hasSelection && _expanded) ...[
              if (giveCount > 0) ...[
                _TraySection(
                  label: 'Give',
                  color: AppTheme.loss,
                  items: widget.giveItems,
                  currency: widget.currency,
                  onRemove: widget.onRemoveGive,
                ),
              ],
              if (recvCount > 0) ...[
                _TraySection(
                  label: 'Get',
                  color: AppTheme.profit,
                  items: widget.recvItems,
                  currency: widget.currency,
                  onRemove: widget.onRemoveRecv,
                ),
              ],
              const SizedBox(height: 4),
            ]
            else if (hasSelection) ...[
              SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  children: [
                    ...widget.giveItems.map((item) => _TinyThumb(
                          item: item,
                          borderColor: AppTheme.loss,
                          onTap: () {
                            HapticFeedback.lightImpact();
                            widget.onRemoveGive(item.assetId);
                          },
                        )),
                    if (giveCount > 0 && recvCount > 0)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        child: Center(
                          child: Icon(Icons.swap_horiz,
                              size: 16, color: AppTheme.textDisabled),
                        ),
                      ),
                    ...widget.recvItems.map((item) => _TinyThumb(
                          item: item,
                          borderColor: AppTheme.profit,
                          onTap: () {
                            HapticFeedback.lightImpact();
                            widget.onRemoveRecv(item.assetId);
                          },
                        )),
                  ],
                ),
              ),
              const SizedBox(height: 6),
            ],
          ],
        ),
      ),
    );
  }
}

class _TraySection extends StatelessWidget {
  final String label;
  final Color color;
  final List<TradeOfferItem> items;
  final CurrencyInfo currency;
  final ValueChanged<String> onRemove;

  const _TraySection({
    required this.label,
    required this.color,
    required this.items,
    required this.currency,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 4),
          child: Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                '$label (${items.length})',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 72,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            itemCount: items.length,
            itemBuilder: (_, index) {
              final item = items[index];
              return Padding(
                padding: const EdgeInsets.only(right: 6),
                child: _TradeMiniCard(
                  item: item,
                  borderColor: color,
                  currency: currency,
                  onTap: () {
                    HapticFeedback.lightImpact();
                    onRemove(item.assetId);
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _TinyThumb extends StatelessWidget {
  final TradeOfferItem item;
  final Color borderColor;
  final VoidCallback onTap;

  const _TinyThumb({
    required this.item,
    required this.borderColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        margin: const EdgeInsets.only(right: 5),
        decoration: BoxDecoration(
          color: AppTheme.bgSecondary,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: borderColor.withValues(alpha: 0.4),
            width: 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Padding(
          padding: const EdgeInsets.all(3),
          child: item.fullIconUrl.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: item.fullIconUrl,
                  fit: BoxFit.contain,
                  errorWidget: (_, _, _) => const SizedBox.shrink(),
                )
              : const SizedBox.shrink(),
        ),
      ),
    );
  }
}

class _TradeMiniCard extends StatelessWidget {
  final TradeOfferItem item;
  final Color borderColor;
  final CurrencyInfo currency;
  final VoidCallback onTap;

  const _TradeMiniCard({
    required this.item,
    required this.borderColor,
    required this.currency,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 64,
        decoration: BoxDecoration(
          color: AppTheme.bgSecondary,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: borderColor.withValues(alpha: 0.35),
            width: 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 3, 4, 0),
              child: Text(
                item.priceCents > 0
                    ? currency.formatCents(item.priceCents)
                    : '—',
                style: const TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                  letterSpacing: -0.3,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: item.fullIconUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: item.fullIconUrl,
                        fit: BoxFit.contain,
                        errorWidget: (_, _, _) => const Icon(
                          Icons.image_not_supported_rounded,
                          size: 12,
                          color: AppTheme.textDisabled,
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
            ),
            if (item.floatValue != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                color: Colors.black.withValues(alpha: 0.2),
                child: Text(
                  item.floatValue!.toStringAsFixed(4),
                  style: TextStyle(
                    fontSize: 7,
                    fontFamily: 'monospace',
                    color: Colors.white.withValues(alpha: 0.5),
                  ),
                  maxLines: 1,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
