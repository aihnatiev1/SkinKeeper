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
  final VoidCallback? onLongPress;
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
    this.onLongPress,
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
              const Color(0xFF1E2A48),
              const Color(0xFF161F3A),
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
                    children: [
                      // Price
                      Expanded(
                        child: item.steamPrice != null
                            ? Text(
                                currency?.format(item.steamPrice!) ??
                                    '\$${item.steamPrice!.toStringAsFixed(2)}',
                                style: TextStyle(
                                  fontSize: compact ? 10 : 13,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white.withValues(alpha: 0.85),
                                  letterSpacing: compact ? -0.3 : -0.3,
                                  fontFeatures: const [
                                    FontFeature.tabularFigures()
                                  ],
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              )
                            : const SizedBox.shrink(),
                      ),
                      // P/L badge
                      if (!compact &&
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
                      // Stickers + charm row (only for weapons)
                      if (!compact && !item.isNonWeapon &&
                          (item.stickers.isNotEmpty || item.charms.isNotEmpty))
                        Positioned(
                          left: 6,
                          right: 6,
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
                                _CharmThumb(charm: item.charms.first),
                              ],
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
          // Right: lock
          if (!item.tradable)
            _TradeBanBadge(item: item, compact: compact),
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
            child: _MiniFloatBar(floatValue: item.floatValue!),
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
        Wrap(
          spacing: 4,
          runSpacing: 3,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (item.isRareDoppler)
              DopplerPhaseGem(
                phase: item.dopplerPhase!,
                color: item.dopplerColor!,
                size: 12,
              )
            else if (item.isRareItem)
              _RareBadge(reason: item.rareReason!),
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
            if (item.wearShort != null)
              _WearPill(wear: item.wearShort!),
          ],
        ),
        // Float value + mini bar
        if (item.floatValue != null)
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.floatValue!.toStringAsFixed(7),
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    fontFamily: 'monospace',
                    letterSpacing: 0.3,
                    color: Colors.white.withValues(alpha: 0.6),
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 3),
                _MiniFloatBar(floatValue: item.floatValue!),
              ],
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

// ─── Mini Float Bar (inline on card) ─────────────────────────────────
class _MiniFloatBar extends StatelessWidget {
  final double floatValue;

  const _MiniFloatBar({required this.floatValue});

  static const _segments = [
    (end: 0.07, color: Color(0xFF10B981)),  // FN
    (end: 0.15, color: Color(0xFF34D399)),  // MW
    (end: 0.38, color: Color(0xFFF59E0B)),  // FT
    (end: 0.45, color: Color(0xFFF97316)),  // WW
    (end: 1.00, color: Color(0xFFEF4444)),  // BS
  ];

  @override
  Widget build(BuildContext context) {
    final clamped = floatValue.clamp(0.0, 1.0);
    return SizedBox(
      height: 4,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final w = constraints.maxWidth;
          return ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: Stack(
              children: [
                // Segment backgrounds
                Row(
                  children: _segments.map((seg) {
                    final idx = _segments.indexOf(seg);
                    final prevEnd = idx > 0 ? _segments[idx - 1].end : 0.0;
                    return Expanded(
                      flex: ((seg.end - prevEnd) * 1000).round(),
                      child: Container(
                        color: seg.color.withValues(alpha: 0.2),
                      ),
                    );
                  }).toList(),
                ),
                // Position indicator
                Positioned(
                  left: (clamped * w) - 1,
                  top: 0,
                  bottom: 0,
                  child: Container(
                    width: 2,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(1),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.white.withValues(alpha: 0.6),
                          blurRadius: 3,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
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

// ─── Rare Badge ─────────────────────────────────────────────────────
class _RareBadge extends StatelessWidget {
  final String reason;

  const _RareBadge({required this.reason});

  @override
  Widget build(BuildContext context) {
    const color = Color(0xFFF59E0B); // amber
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(
          color: color.withValues(alpha: 0.4),
          width: 0.5,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const RarityGem(size: 9, glow: false),
          const SizedBox(width: 3),
          Text(
            reason,
            style: const TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: color,
              letterSpacing: 0.3,
            ),
          ),
        ],
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
