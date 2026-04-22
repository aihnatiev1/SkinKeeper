import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';
import '../../../models/profit_loss.dart';
import 'item_card_badges.dart';
import 'item_card_best_price.dart';
import 'item_card_footer.dart';
import 'item_card_stickers.dart';
import 'rarity_gem.dart';

class ItemCard extends StatelessWidget {
  final InventoryItem item;
  final bool compact;
  /// Ultra-compact mode for 5-column grids: hides non-essential elements
  final bool ultraCompact;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final VoidCallback? onInfoTap;
  final ItemPL? itemPL;
  final CurrencyInfo? currency;
  final int? groupCount;
  final int? selectedCount;
  final bool isSelected;
  final bool showAccountBadge;
  final VoidCallback? onAccountBadgeTap;

  const ItemCard({
    super.key,
    required this.item,
    this.compact = false,
    this.ultraCompact = false,
    this.onTap,
    this.onLongPress,
    this.onInfoTap,
    this.itemPL,
    this.currency,
    this.groupCount,
    this.selectedCount,
    this.isSelected = false,
    this.showAccountBadge = false,
    this.onAccountBadgeTap,
  });

  @override
  Widget build(BuildContext context) {
    final rarityColor = item.rarityColor != null
        ? Color(int.parse('FF${item.rarityColor!.replaceAll('#', '')}', radix: 16))
        : AppTheme.textDisabled;

    final borderWidth = isSelected ? 1.5 : 0.5;

    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          // Lighter card background for contrast
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              AppTheme.surface,
              AppTheme.bgSecondary,
            ],
          ),
          border: Border.all(
            color: isSelected
                ? AppTheme.primary
                : rarityColor.withValues(alpha: 0.15),
            width: borderWidth,
          ),
          boxShadow: [
            // Rarity glow
            BoxShadow(
              color: rarityColor.withValues(alpha: 0.08),
              blurRadius: 12,
              spreadRadius: -2,
            ),
            // Depth shadow
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.3),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            // ── Glass noise overlay ──
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.white.withValues(alpha: 0.03),
                      Colors.transparent,
                      rarityColor.withValues(alpha: 0.04),
                    ],
                    stops: const [0.0, 0.5, 1.0],
                  ),
                ),
              ),
            ),

            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── Header: price + badges ──
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    compact ? 7 : 10,
                    compact ? 6 : 8,
                    compact ? 5 : 7,
                    0,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Price block: Steam + best external
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Primary: Steam price (always)
                            // FittedBox auto-scales long prices (e.g. ₴59,564) without overflow
                            FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.centerLeft,
                              child: Text(
                                item.steamPrice != null
                                    ? (currency?.format(item.steamPrice!) ??
                                        '\$${item.steamPrice!.toStringAsFixed(2)}')
                                    : (item.bestPrice != null
                                        ? (currency?.format(item.bestPrice!) ??
                                            '\$${item.bestPrice!.toStringAsFixed(2)}')
                                        : '—'),
                                style: TextStyle(
                                  fontSize: compact ? 10 : 13,
                                  fontWeight: FontWeight.w700,
                                  color: item.steamPrice != null
                                      ? Colors.white.withValues(alpha: 0.85)
                                      : AppTheme.textMuted,
                                  letterSpacing: -0.3,
                                  fontFeatures: const [
                                    FontFeature.tabularFigures()
                                  ],
                                ),
                                maxLines: 1,
                              ),
                            ),
                            // BUFF arbitrage badge — below price (hidden in compact/ultraCompact)
                            if (!compact && !ultraCompact && item.prices.containsKey('buff') && item.steamPrice != null) ...[
                              const SizedBox(height: 2),
                              Row(
                                children: [
                                  ArbitrageBadge(
                                    steamPrice: item.steamPrice!,
                                    buffPrice: item.prices['buff']!,
                                  ),
                                ],
                              ),
                            ],
                            // Secondary: best external (hidden in compact/ultraCompact)
                            if (!compact && !ultraCompact && item.steamPrice != null) BestExternalPrice(item: item, currency: currency),
                          ],
                        ),
                      ),
                      // P/L badge (hidden in ultraCompact)
                      if (!compact && !ultraCompact &&
                          itemPL != null &&
                          itemPL!.totalProfitCents != 0 &&
                          itemPL!.profitPct.abs() >= 0.5)
                        Container(
                          margin: const EdgeInsets.only(right: 4),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 5, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppTheme.plColor(itemPL!.totalProfitCents)
                                .withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'P/L ${itemPL!.profitPct > 0 ? '+' : ''}${itemPL!.profitPct.toStringAsFixed(0)}%',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.plColor(itemPL!.totalProfitCents),
                            ),
                          ),
                        ),
                      // Info button — hidden in ultraCompact (long-press still works)
                      if (!ultraCompact)
                      GestureDetector(
                        onTap: onInfoTap,
                        behavior: HitTestBehavior.opaque,
                        child: Padding(
                          padding: EdgeInsets.only(left: 4, right: compact ? 0 : 2, top: 0, bottom: 12),
                          child: Container(
                          width: compact ? 18 : 26,
                          height: compact ? 18 : 26,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: Colors.white.withValues(alpha: compact ? 0.12 : 0.2),
                              width: 0.8,
                            ),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            'i',
                            style: TextStyle(
                              fontSize: compact ? 9 : 12,
                              fontWeight: FontWeight.w500,
                              color: Colors.white.withValues(alpha: 0.35),
                              height: 1,
                            ),
                          ),
                        ),
                        ),
                      ),
                    ],
                  ),
                ),

                // ── Image ──
                Expanded(
                  child: Stack(
                    children: [
                      // Rarity glow — radial gradient behind item
                      Positioned.fill(
                        child: IgnorePointer(
                          child: Container(
                            decoration: BoxDecoration(
                              gradient: RadialGradient(
                                center: Alignment.center,
                                radius: 0.6,
                                colors: [
                                  rarityColor.withValues(alpha: compact ? 0.10 : 0.14),
                                  rarityColor.withValues(alpha: 0.03),
                                  Colors.transparent,
                                ],
                                stops: const [0.0, 0.5, 1.0],
                              ),
                            ),
                          ),
                        ),
                      ),
                      // Item image
                      Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: compact ? 8 : 14,
                          vertical: compact ? 4 : 6,
                        ),
                        child: Center(
                          child: Hero(
                            tag: 'item_image_${item.assetId}',
                            child: item.fullIconUrl.isNotEmpty
                                ? CachedNetworkImage(
                                    imageUrl: item.fullIconUrl,
                                    fit: BoxFit.contain,
                                    placeholder: (_, _) => SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 1.5,
                                        color: rarityColor
                                            .withValues(alpha: 0.3),
                                      ),
                                    ),
                                    errorWidget: (_, _, _) => const Icon(
                                      Icons.image_not_supported_rounded,
                                      size: 22,
                                      color: AppTheme.textDisabled,
                                    ),
                                  )
                                : const Icon(
                                    Icons.image_not_supported_rounded,
                                    size: 22,
                                    color: AppTheme.textDisabled,
                                  ),
                          ),
                        ),
                      ),
                      // Phase badge — top-right of image (full mode only)
                      if (!compact) ...[
                        if (item.isRareDoppler && item.dopplerPhase != null && item.dopplerColor != null)
                          Positioned(
                            top: 4, right: 6,
                            child: DopplerPhaseGem(phase: item.dopplerPhase!, color: item.dopplerColor!, size: 13),
                          )
                        else if (item.isDoppler && item.dopplerPhase != null)
                          Positioned(
                            top: 4, right: 6,
                            child: DopplerPhasePill(phase: item.dopplerPhase!, color: item.dopplerColor),
                          )
                        else if (item.isRareItem && item.rareReason != null)
                          Positioned(
                            top: 4, right: 6,
                            child: RareBadge(reason: item.rareReason!),
                          ),
                      ],

                      // Group count badge (top-right of image area)
                      if (groupCount != null)
                        Positioned(
                          top: 4,
                          right: 6,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 5, vertical: 2),
                            decoration: BoxDecoration(
                              color: selectedCount != null
                                  ? AppTheme.profit.withValues(alpha: 0.25)
                                  : AppTheme.primary.withValues(alpha: 0.25),
                              borderRadius: BorderRadius.circular(5),
                              border: Border.all(
                                color: selectedCount != null
                                    ? AppTheme.profit.withValues(alpha: 0.5)
                                    : AppTheme.primary.withValues(alpha: 0.4),
                                width: 0.5,
                              ),
                            ),
                            child: Text(
                              selectedCount != null
                                  ? '$selectedCount/$groupCount'
                                  : 'x$groupCount',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: selectedCount != null
                                    ? AppTheme.profitLight
                                    : AppTheme.primaryLight,
                              ),
                            ),
                          ),
                        ),
                      // Account badge removed from image Stack — now in footer
                      // Stickers + charm row (only for weapons, hidden in ultraCompact)
                      if (!compact && !ultraCompact && !item.isNonWeapon &&
                          (item.stickers.isNotEmpty || item.charms.isNotEmpty))
                        Positioned(
                          left: 6,
                          right: 6,
                          bottom: 2,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // Limit stickers shown to avoid overflow (4 max if value badge present)
                              for (int i = 0;
                                  i < item.stickers.length &&
                                  i < (item.stickerValue != null && item.stickerValue! > 10 ? 4 : 5);
                                  i++)
                                Padding(
                                  padding: const EdgeInsets.only(right: 2),
                                  child: StickerThumb(
                                      sticker: item.stickers[i]),
                                ),
                              if (item.charms.isNotEmpty) ...[
                                if (item.stickers.isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 2),
                                    child: Text(
                                      '+',
                                      style: TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.white.withValues(alpha: 0.3),
                                      ),
                                    ),
                                  ),
                                CharmThumb(charm: item.charms.first),
                              ],
                              // Sticker premium indicator
                              if (item.stickerValue != null && item.stickerValue! > 10)
                                Padding(
                                  padding: const EdgeInsets.only(left: 4),
                                  child: StickerValueBadge(
                                    value: item.stickerValue!,
                                    currency: currency,
                                  ),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),

                // ── Footer ──
                ItemCardFooter(item: item, compact: compact, ultraCompact: ultraCompact),
              ],
            ),

            // ── Selection overlay ──
            if (isSelected)
              Positioned.fill(
                child: Container(
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  alignment: Alignment.center,
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: AppTheme.primary,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.primary.withValues(alpha: 0.5),
                          blurRadius: 14,
                        ),
                      ],
                    ),
                    child: const Icon(Icons.check,
                        size: 18, color: Colors.white),
                  ),
                ),
              ),

          ],
        ),
      ),
    );
  }
}
