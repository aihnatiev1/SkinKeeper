import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';
import '../../../models/profit_loss.dart';
import 'rarity_gem.dart';

// ── Wear pill colors ─────────────────────────────────────────────────
const _wearPillColors = <String, Color>{
  'FN': Color(0xFF10B981),
  'MW': Color(0xFF06B6D4),
  'FT': Color(0xFF3B82F6),
  'WW': Color(0xFFF59E0B),
  'BS': Color(0xFFEF4444),
};

class ItemCard extends StatelessWidget {
  final InventoryItem item;
  final bool compact;
  final VoidCallback? onTap;
  final VoidCallback? onInfoTap;
  final ItemPL? itemPL;
  final CurrencyInfo? currency;
  final int? groupCount;
  final bool isSelected;

  const ItemCard({
    super.key,
    required this.item,
    this.compact = false,
    this.onTap,
    this.onInfoTap,
    this.itemPL,
    this.currency,
    this.groupCount,
    this.isSelected = false,
  });

  @override
  Widget build(BuildContext context) {
    final rarityColor = item.rarityColor != null
        ? Color(int.parse('FF${item.rarityColor}', radix: 16))
        : AppTheme.textDisabled;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          // Glass card background
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              const Color(0xFF1A2540),
              const Color(0xFF131C35),
            ],
          ),
          border: Border.all(
            color: isSelected
                ? AppTheme.primary
                : rarityColor.withValues(alpha: 0.2),
            width: isSelected ? 1.5 : 0.5,
          ),
          boxShadow: [
            // Subtle rarity glow
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
                    children: [
                      // Price
                      Expanded(
                        child: item.steamPrice != null
                            ? FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: Text(
                                  currency?.format(item.steamPrice!) ??
                                      '\$${item.steamPrice!.toStringAsFixed(2)}',
                                  style: TextStyle(
                                    fontSize: compact ? 11 : 17,
                                    fontWeight: FontWeight.w900,
                                    color: Colors.white,
                                    letterSpacing: compact ? -0.3 : -0.5,
                                    shadows: [
                                      Shadow(
                                        color: Colors.white
                                            .withValues(alpha: 0.25),
                                        blurRadius: 12,
                                      ),
                                    ],
                                    fontFeatures: const [
                                      FontFeature.tabularFigures()
                                    ],
                                  ),
                                  maxLines: 1,
                                ),
                              )
                            : const SizedBox.shrink(),
                      ),
                      // P/L badge
                      if (!compact &&
                          itemPL != null &&
                          itemPL!.totalProfitCents != 0)
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
                              color:
                                  AppTheme.plColor(itemPL!.totalProfitCents),
                            ),
                          ),
                        ),
                      // Info button
                      if (!compact)
                        GestureDetector(
                          onTap: onInfoTap,
                          behavior: HitTestBehavior.opaque,
                          child: Container(
                            width: 24,
                            height: 24,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.05),
                              shape: BoxShape.circle,
                            ),
                            child: const Center(
                              child: Icon(
                                Icons.info_outline_rounded,
                                size: 14,
                                color: AppTheme.textMuted,
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
                                  rarityColor.withValues(alpha: compact ? 0.18 : 0.25),
                                  rarityColor.withValues(alpha: 0.05),
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
                      // Group count badge (top-right of image area)
                      if (groupCount != null)
                        Positioned(
                          top: 4,
                          right: 6,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 5, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppTheme.primary.withValues(alpha: 0.25),
                              borderRadius: BorderRadius.circular(5),
                              border: Border.all(
                                color: AppTheme.primary.withValues(alpha: 0.4),
                                width: 0.5,
                              ),
                            ),
                            child: Text(
                              'x$groupCount',
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: AppTheme.primaryLight,
                              ),
                            ),
                          ),
                        ),
                      // Stickers (only for weapons, not for sticker items themselves)
                      if (!compact && !item.isNonWeapon && item.stickers.isNotEmpty)
                        Positioned(
                          left: 6,
                          bottom: 2,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              for (int i = 0;
                                  i < item.stickers.length && i < 5;
                                  i++)
                                Padding(
                                  padding: const EdgeInsets.only(right: 2),
                                  child: _StickerThumb(
                                      sticker: item.stickers[i]),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),

                // ── Footer ──
                _FooterSection(item: item, compact: compact),
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

// ─── Footer ──────────────────────────────────────────────────────────
class _FooterSection extends StatelessWidget {
  final InventoryItem item;
  final bool compact;

  const _FooterSection({required this.item, required this.compact});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        compact ? 7 : 10,
        compact ? 4 : 6,
        compact ? 5 : 8,
        compact ? 5 : 7,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: compact ? _buildCompactInfo() : _buildFullInfo(),
          ),
          // Right: charm + lock
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (!compact && item.charms.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: _CharmThumb(charm: item.charms.first),
                ),
              if (!item.tradable)
                _TradeBanBadge(item: item, compact: compact)
              else
                Icon(
                  Icons.lock_open_rounded,
                  size: compact ? 11 : 13,
                  color: Colors.white.withValues(alpha: 0.12),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCompactInfo() {
    // Non-weapon items (stickers, patches, etc.) don't show wear/float
    if (item.isNonWeapon) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            if (item.isSouvenir)
              Text(
                'SV ',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.warning.withValues(alpha: 0.9),
                ),
              )
            else if (item.isStatTrak)
              Text(
                'ST ',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.warning.withValues(alpha: 0.9),
                ),
              ),
            if (item.wearShort != null)
              _WearPill(wear: item.wearShort!, compact: true),
          ],
        ),
        if (item.floatValue != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              item.floatValue!.toStringAsFixed(5),
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                fontFamily: 'monospace',
                color: Colors.white.withValues(alpha: 0.55),
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildFullInfo() {
    // Non-weapon items (stickers, patches, etc.) don't show wear/float/rarity
    if (item.isNonWeapon) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Wear row
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (item.isRareDoppler) ...[
              DopplerPhaseGem(
                phase: item.dopplerPhase!,
                color: item.dopplerColor!,
                size: 12,
              ),
              const SizedBox(width: 4),
            ] else if (item.isRareItem) ...[
              const RarityGem(size: 12),
              const SizedBox(width: 4),
            ],
            if (item.isSouvenir)
              const Text(
                'SV',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.warning,
                ),
              )
            else if (item.isStatTrak)
              const Text(
                'ST',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.warning,
                ),
              ),
            if ((item.isStatTrak || item.isSouvenir) && item.wearShort != null)
              const SizedBox(width: 4),
            if (item.wearShort != null)
              _WearPill(wear: item.wearShort!),
            if (item.isDoppler && item.dopplerPhase != null) ...[
              const SizedBox(width: 4),
              Text(
                item.dopplerPhase!,
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  color: item.dopplerColor ?? AppTheme.textMuted,
                ),
              ),
            ],
          ],
        ),
        // Float value
        if (item.floatValue != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              item.floatValue!.toStringAsFixed(7),
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                fontFamily: 'monospace',
                letterSpacing: 0.3,
                color: Colors.white.withValues(alpha: 0.6),
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
      ],
    );
  }
}

// ─── Wear Pill ───────────────────────────────────────────────────────
class _WearPill extends StatelessWidget {
  final String wear;
  final bool compact;

  const _WearPill({required this.wear, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final color = _wearPillColors[wear] ?? AppTheme.textMuted;
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 4 : 6,
        vertical: compact ? 1 : 2,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(
          color: color.withValues(alpha: 0.5),
          width: 0.8,
        ),
      ),
      child: Text(
        wear,
        style: TextStyle(
          fontSize: compact ? 9 : 11,
          fontWeight: FontWeight.w800,
          color: color,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

// ─── Sticker Thumbnail ──────────────────────────────────────────────
class _StickerThumb extends StatelessWidget {
  final StickerInfo sticker;

  const _StickerThumb({required this.sticker});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 22,
      height: 17,
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(3),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.06),
          width: 0.5,
        ),
      ),
      child: sticker.fullImageUrl.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: sticker.fullImageUrl,
              fit: BoxFit.contain,
              placeholder: (_, _) => const SizedBox.shrink(),
              errorWidget: (_, _, _) => const Icon(
                Icons.sticky_note_2_rounded,
                size: 10,
                color: AppTheme.warningLight,
              ),
            )
          : const Icon(
              Icons.sticky_note_2_rounded,
              size: 10,
              color: AppTheme.warningLight,
            ),
    );
  }
}

// ─── Charm Thumbnail ────────────────────────────────────────────────
class _CharmThumb extends StatelessWidget {
  final CharmInfo charm;

  const _CharmThumb({required this.charm});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(4),
      ),
      child: charm.fullImageUrl.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: charm.fullImageUrl,
              fit: BoxFit.contain,
              placeholder: (_, _) => const SizedBox.shrink(),
              errorWidget: (_, _, _) => const Icon(
                Icons.auto_awesome_rounded,
                size: 12,
                color: AppTheme.primaryLight,
              ),
            )
          : const Icon(
              Icons.auto_awesome_rounded,
              size: 12,
              color: AppTheme.primaryLight,
            ),
    );
  }
}

// ─── Trade Ban Badge ────────────────────────────────────────────────
class _TradeBanBadge extends StatelessWidget {
  final InventoryItem item;
  final bool compact;

  const _TradeBanBadge({required this.item, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final text = item.tradeBanText;
    if (compact) {
      return Icon(Icons.lock_clock,
          size: 11, color: AppTheme.warning.withValues(alpha: 0.7));
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      decoration: BoxDecoration(
        color: AppTheme.warning.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(
          color: AppTheme.warning.withValues(alpha: 0.15),
          width: 0.5,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.lock_clock,
              size: 10, color: AppTheme.warning.withValues(alpha: 0.8)),
          if (text != null) ...[
            const SizedBox(width: 2),
            Text(
              text,
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w700,
                color: AppTheme.warning.withValues(alpha: 0.8),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
