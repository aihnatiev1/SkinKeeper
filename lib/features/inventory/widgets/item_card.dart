import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';
import '../../../models/profit_loss.dart';
import 'price_comparison_table.dart' show sourceColor, sourceDisplayName;
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
                                  _ArbitrageBadge(
                                    steamPrice: item.steamPrice!,
                                    buffPrice: item.prices['buff']!,
                                  ),
                                ],
                              ),
                            ],
                            // Secondary: best external (hidden in compact/ultraCompact)
                            if (!compact && !ultraCompact && item.steamPrice != null) _BestExternalPrice(item: item, currency: currency),
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
                      // Trade ban lock — bottom-right of image (all modes)
                      if (!item.tradable)
                        Positioned(
                          bottom: 4,
                          right: compact ? 4 : 6,
                          child: _TradeBanBadge(item: item, compact: compact),
                        ),

                      // Phase badge — top-right of image (below the (i) button), full mode only
                      // In compact mode there's no space — phase stays in footer
                      if (!compact) ...[
                        if (item.isRareDoppler && item.dopplerPhase != null && item.dopplerColor != null)
                          Positioned(
                            top: 4,
                            right: 6,
                            child: DopplerPhaseGem(
                              phase: item.dopplerPhase!,
                              color: item.dopplerColor!,
                              size: 13,
                            ),
                          )
                        else if (item.isDoppler && item.dopplerPhase != null)
                          Positioned(
                            top: 4,
                            right: 6,
                            child: _DopplerPhasePill(phase: item.dopplerPhase!, color: item.dopplerColor),
                          )
                        else if (item.isRareItem && item.rareReason != null)
                          Positioned(
                            top: 4,
                            right: 6,
                            child: _RareBadge(reason: item.rareReason!),
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
                              // Sticker premium indicator
                              if (item.stickerValue != null && item.stickerValue! > 10)
                                Padding(
                                  padding: const EdgeInsets.only(left: 4),
                                  child: _StickerValueBadge(
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
                _FooterSection(item: item, compact: compact, ultraCompact: ultraCompact),
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

// ─── Account Name Badge (3D square style) ────────────────────────────
class _AccountNameBadge extends StatelessWidget {
  final String? accountName;
  final bool compact;
  const _AccountNameBadge({required this.accountName, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final name = accountName ?? '?';
    final maxLen = compact ? 8 : 14;
    final display = name.length > maxLen ? '${name.substring(0, maxLen)}…' : name;
    const color = AppTheme.primary;
    return Container(
      margin: const EdgeInsets.only(right: 4),
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 4 : 5,
        vertical: compact ? 1 : 2,
      ),
      decoration: BoxDecoration(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: color.withValues(alpha: 0.5), width: 0.8),
      ),
      child: Text(
        display,
        style: TextStyle(
          fontSize: compact ? 8 : 9,
          fontWeight: FontWeight.w700,
          color: AppTheme.primaryLight,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

// ─── Account Letter Dot (compact mode) ───────────────────────────────
/// Circular account avatar — shows Steam avatar image or letter fallback
class _AccountAvatar extends StatelessWidget {
  final String? avatarUrl;
  final String? name;
  final double size;

  const _AccountAvatar({this.avatarUrl, this.name, this.size = 16});

  @override
  Widget build(BuildContext context) {
    final letter = (name?.isNotEmpty == true ? name![0] : '?').toUpperCase();
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: AppTheme.primary.withValues(alpha: 0.4), width: 0.8),
      ),
      child: ClipOval(
        child: avatarUrl != null && avatarUrl!.isNotEmpty
            ? CachedNetworkImage(
                imageUrl: avatarUrl!,
                fit: BoxFit.cover,
                placeholder: (_, _) => _letterFallback(letter),
                errorWidget: (_, _, _) => _letterFallback(letter),
              )
            : _letterFallback(letter),
      ),
    );
  }

  Widget _letterFallback(String letter) => Container(
        color: AppTheme.primary.withValues(alpha: 0.2),
        alignment: Alignment.center,
        child: Text(
          letter,
          style: TextStyle(
            fontSize: size * 0.5,
            fontWeight: FontWeight.w800,
            color: AppTheme.primaryLight,
            height: 1,
          ),
        ),
      );
}

class _AccountLetterDot extends StatelessWidget {
  final String? name;
  const _AccountLetterDot({this.name});

  @override
  Widget build(BuildContext context) {
    final letter = (name?.isNotEmpty == true ? name![0] : '?').toUpperCase();
    return Container(
      width: 14,
      height: 14,
      decoration: BoxDecoration(
        color: AppTheme.primary.withValues(alpha: 0.25),
        shape: BoxShape.circle,
        border: Border.all(
          color: AppTheme.primary.withValues(alpha: 0.5),
          width: 0.5,
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        letter,
        style: const TextStyle(
          fontSize: 8,
          fontWeight: FontWeight.w800,
          color: AppTheme.primaryLight,
          height: 1,
        ),
      ),
    );
  }
}

// ─── Footer ──────────────────────────────────────────────────────────
class _FooterSection extends StatelessWidget {
  final InventoryItem item;
  final bool compact;
  final bool ultraCompact;

  const _FooterSection({required this.item, required this.compact, this.ultraCompact = false});

  @override
  Widget build(BuildContext context) {
    final hasWear = !item.isNonWeapon && item.wearShort != null;
    final hasBan = !item.tradable;
    final hasAccount = item.accountName != null && item.accountName!.isNotEmpty;
    if (!hasWear && !hasBan && !hasAccount) return const SizedBox.shrink();

    return Container(
      padding: EdgeInsets.fromLTRB(
        compact ? 7 : 10,
        compact ? 6 : 6,
        compact ? 5 : 8,
        compact ? 5 : 7,
      ),
      child: ultraCompact
          ? _buildUltraCompactFooter()
          : compact
              ? _buildCompactFooter(hasBan, hasAccount)
              : _buildFullFooter(hasBan, hasAccount),
    );
  }

  // Ultra-compact: just wear pill + float bar (5 columns)
  Widget _buildUltraCompactFooter() {
    final hasWear = !item.isNonWeapon && item.wearShort != null;
    if (!hasWear) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.max,
          children: [
            if (item.isStatTrak)
              const Text('ST ', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: AppTheme.warning)),
            Flexible(child: _WearPill(wear: item.wearShort!, compact: true)),
            const Spacer(),
            if (!item.tradable)
              Icon(Icons.lock_clock, size: 9, color: AppTheme.warning.withValues(alpha: 0.8)),
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: _MiniFloatBar(floatValue: item.floatValue, wearShort: item.wearShort!),
        ),
      ],
    );
  }

  Widget _buildCompactFooter(bool hasBan, bool hasAccount) {
    final hasWear = !item.isNonWeapon && item.wearShort != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Use Row with Spacer — no inner Row(min) to avoid overflow
        Row(
          mainAxisSize: MainAxisSize.max,
          children: [
            // ST/SV + wear — left side, Flexible to prevent overflow
            if (hasWear) ...[
              if (item.isStatTrak)
                const Text('ST ', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: AppTheme.warning))
              else if (item.isSouvenir)
                const Text('SV ', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: AppTheme.warning)),
              Flexible(child: _WearPill(wear: item.wearShort!, compact: true)),
            ],
            const Spacer(),
            // Account avatar — right side
            if (hasAccount)
              _AccountAvatar(avatarUrl: item.accountAvatarUrl, name: item.accountName, size: 14),
          ],
        ),
        if (hasWear)
          Padding(
            padding: const EdgeInsets.only(top: 3, right: 4),
            child: _MiniFloatBar(floatValue: item.floatValue, wearShort: item.wearShort!),
          ),
      ],
    );
  }

  Widget _buildFullFooter(bool hasBan, bool hasAccount) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Row 1: special badges + wear + trade ban + account
        Row(
          children: [
            Flexible(
              child: Wrap(
                spacing: 4,
                runSpacing: 3,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  // StatTrak / Souvenir
                  if (!item.isNonWeapon && item.wearShort != null) ...[
                    if (item.isSouvenir)
                      const Text('SV', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppTheme.warning))
                    else if (item.isStatTrak)
                      const Text('ST', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppTheme.warning)),
                    _WearPill(wear: item.wearShort!),
                  ],
                  if (item.floatValue != null && item.floatValue! < 0.01 && item.wear == 'Factory New')
                    const Text('🔥', style: TextStyle(fontSize: 10)),
                  // Phase + lock moved to image Stack (top-right and bottom-right)
                ],
              ),
            ),
            // Lock moved to image Stack (bottom-right Positioned)
            if (hasAccount) ...[
              const SizedBox(width: 4),
              _AccountAvatar(avatarUrl: item.accountAvatarUrl, name: item.accountName, size: 18),
            ],
          ],
        ),
        // Row 2: float text
        if (!item.isNonWeapon && item.floatValue != null)
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  item.floatValue!.toStringAsFixed(7),
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    fontFamily: 'monospace',
                    letterSpacing: 0.3,
                    color: item.floatValue! < 0.01
                        ? const Color(0xFFF59E0B)
                        : Colors.white.withValues(alpha: 0.6),
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
        // Row 3: float bar
        if (!item.isNonWeapon && item.wearShort != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, right: 4),
            child: _MiniFloatBar(floatValue: item.floatValue, wearShort: item.wearShort!),
          ),
        // Row 4: fade bar
        if (item.fadePercentage != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: _MiniFadeBar(fadePercent: item.fadePercentage!),
          ),
      ],
    );
  }

}

// ─── Wear Pill ───────────────────────────────────────────────────────
const _wearFullNames = <String, String>{
  'FN': 'Factory New',
  'MW': 'Minimal Wear',
  'FT': 'Field-Tested',
  'WW': 'Well-Worn',
  'BS': 'Battle-Scarred',
};

class _WearPill extends StatelessWidget {
  final String wear;
  final bool compact;

  const _WearPill({required this.wear, this.compact = false});

  @override
  Widget build(BuildContext context) {
    // Web style: plain muted text, no border/background
    return Text(
      wear,
      style: TextStyle(
        fontSize: compact ? 9 : 10,
        fontWeight: FontWeight.w300,
        color: const Color(0xFF64748B),
        letterSpacing: 0.5,
      ),
    );
  }
}

// ─── Mini Float Bar (inline on card) ─────────────────────────────────
// Segmented bar with colors matching quality zones.
class _MiniFloatBar extends StatelessWidget {
  final double? floatValue;
  final String wearShort;

  const _MiniFloatBar({required this.wearShort, this.floatValue});

  // Midpoint of each wear range — used when exact float is unknown
  static const _wearMidpoints = <String, double>{
    'FN': 0.035,
    'MW': 0.11,
    'FT': 0.265,
    'WW': 0.415,
    'BS': 0.725,
  };

  @override
  Widget build(BuildContext context) {
    final pos = (floatValue ?? _wearMidpoints[wearShort] ?? 0.5).clamp(0.0, 1.0);
    final hasExactFloat = floatValue != null;

    return Column(
      children: [
        Container(
          height: 4,
          width: double.infinity,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(2),
            color: Colors.white.withValues(alpha: 0.05),
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final w = constraints.maxWidth;
              return Stack(
                children: [
                  // Wear segments
                  Row(
                    children: [
                      _buildSegment(0.07, const Color(0xFF10B981)), // FN
                      _buildSegment(0.08, const Color(0xFF06B6D4)), // MW
                      _buildSegment(0.23, const Color(0xFF3B82F6)), // FT
                      _buildSegment(0.07, const Color(0xFFF59E0B)), // WW
                      _buildSegment(0.55, const Color(0xFFEF4444)), // BS
                    ],
                  ),
                  // Marker — solid when exact float, semi-transparent when estimated
                  Positioned(
                    left: (pos * w - 1.5).clamp(0.0, w - 3),
                    top: -1,
                    bottom: -1,
                    child: Container(
                      width: 3,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: hasExactFloat ? 1.0 : 0.5),
                        borderRadius: BorderRadius.circular(1.5),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.5),
                            blurRadius: 2,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildSegment(double flex, Color color) {
    return Expanded(
      flex: (flex * 1000).toInt(),
      child: Container(
        height: 4,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.6),
        ),
      ),
    );
  }
}

// ─── Sticker Value Badge (on card) ───────────────────────────────────
class _StickerValueBadge extends StatelessWidget {
  final double value;
  final CurrencyInfo? currency;

  const _StickerValueBadge({required this.value, this.currency});

  @override
  Widget build(BuildContext context) {
    final text = currency?.format(value, decimals: 0) ??
        '\$${value.toStringAsFixed(0)}';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
      decoration: BoxDecoration(
        color: AppTheme.warning.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(3),
      ),
      child: Text(
        '✨$text',
        style: TextStyle(
          fontSize: 8,
          fontWeight: FontWeight.w800,
          color: AppTheme.warning.withValues(alpha: 0.9),
        ),
      ),
    );
  }
}

// ─── Best External Price (card header) ───────────────────────────────
class _BestExternalPrice extends StatelessWidget {
  final InventoryItem item;
  final CurrencyInfo? currency;

  const _BestExternalPrice({required this.item, this.currency});

  @override
  Widget build(BuildContext context) {
    // Find best (cheapest) non-steam, non-seed price source
    final external = item.prices.entries
        .where((e) => e.key != 'steam' && e.key != 'csgotrader' && e.key != 'buff_bid' && e.value > 0)
        .toList();
    if (external.isEmpty) return const SizedBox.shrink();

    // Lowest price = best deal for buying
    external.sort((a, b) => a.value.compareTo(b.value));
    final best = external.first;
    final color = sourceColor(best.key);

    // Short source label
    const shortNames = <String, String>{
      'buff': 'Buff',
      'skinport': 'SP',
      'csfloat': 'CSF',
      'dmarket': 'DM',
      'bitskins': 'BS',
      'csmoney': 'CSM',
      'youpin': 'YP',
      'lisskins': 'LS',
    };
    final label = shortNames[best.key] ?? best.key;
    final priceText = currency?.format(best.value) ??
        '\$${best.value.toStringAsFixed(2)}';

    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 5,
            height: 5,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 3),
          Flexible(
            child: Text(
              '$label $priceText',
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: color.withValues(alpha: 0.8),
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Arbitrage Badge ──────────────────────────────────────────────────
class _ArbitrageBadge extends StatelessWidget {
  final double steamPrice;
  final double buffPrice;

  const _ArbitrageBadge({required this.steamPrice, required this.buffPrice});

  @override
  Widget build(BuildContext context) {
    if (steamPrice <= 0) return const SizedBox.shrink();
    // Buff price is usually lower than Steam.
    // We show how much cheaper it is on Buff (e.g. -25%)
    final diff = ((buffPrice / steamPrice) - 1) * 100;
    if (diff.abs() < 1) return const SizedBox.shrink();

    final color = diff < -15 ? const Color(0xFF10B981) : AppTheme.textDisabled;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1.5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withValues(alpha: 0.2), width: 0.5),
      ),
      child: Text(
        'BUFF ${diff > 0 ? '+' : ''}${diff.toStringAsFixed(0)}%',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 8,
          fontWeight: FontWeight.w800,
          color: color,
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
    return Tooltip(
      message: sticker.name.isNotEmpty ? sticker.name : 'Sticker',
      child: Container(
        width: 30,
        height: 22,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(5),
          border: Border.all(
            color: const Color(0xFFFBBF24).withValues(alpha: 0.25),
            width: 0.8,
          ),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFFFBBF24).withValues(alpha: 0.12),
              blurRadius: 4,
              spreadRadius: 0,
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(2),
          child: sticker.fullImageUrl.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: sticker.fullImageUrl,
                  fit: BoxFit.contain,
                  placeholder: (_, _) => const SizedBox.shrink(),
                  errorWidget: (_, _, _) => const Icon(
                    Icons.sticky_note_2_rounded,
                    size: 12,
                    color: AppTheme.warningLight,
                  ),
                )
              : const Icon(
                  Icons.sticky_note_2_rounded,
                  size: 12,
                  color: AppTheme.warningLight,
                ),
        ),
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
  final bool compact;

  const _RareBadge({required this.reason, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final color = switch (reason) {
      'Blue Gem' => const Color(0xFF3B82F6),
      'Ruby' => const Color(0xFFEF4444),
      'Sapphire' => const Color(0xFF06B6D4),
      'Emerald' => const Color(0xFF10B981),
      'Black Pearl' => const Color(0xFF9B59B6),
      _ => const Color(0xFFF59E0B), // amber for others
    };

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
            reason.toUpperCase(),
            style: TextStyle(
              fontSize: 8,
              fontWeight: FontWeight.w900,
              color: color,
              letterSpacing: 0.5,
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
    // Days remaining until trade unlock
    final daysLeft = item.tradeBanUntil != null
        ? item.tradeBanUntil!.difference(DateTime.now()).inDays
        : null;

    // Web style: icon + Xd in red, no border/box
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.lock_rounded,
          size: compact ? 9 : 10,
          color: const Color(0xFFEF4444),
        ),
        if (daysLeft != null && daysLeft > 0) ...[
          const SizedBox(width: 2),
          Text(
            '${daysLeft}d',
            style: TextStyle(
              fontSize: compact ? 8 : 9,
              fontWeight: FontWeight.w700,
              color: const Color(0xFFEF4444),
            ),
          ),
        ],
      ],
    );
  }
}

// ─── Doppler Phase Pill (non-rare phases) ─────────────────────────
class _DopplerPhasePill extends StatelessWidget {
  final String phase;
  final Color? color;
  final bool compact;
  const _DopplerPhasePill({required this.phase, this.color, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppTheme.textMuted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: c.withValues(alpha: 0.4), width: 0.5),
      ),
      child: Text(
        phase,
        style: TextStyle(
          fontSize: compact ? 8 : 9,
          fontWeight: FontWeight.w800,
          color: c,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

// ─── Mini Fade Bar ────────────────────────────────────────────────
class _MiniFadeBar extends StatelessWidget {
  final double fadePercent;
  const _MiniFadeBar({required this.fadePercent});

  @override
  Widget build(BuildContext context) {
    final pct = fadePercent.clamp(0.0, 100.0);
    final isHigh = pct >= 90;

    return Row(
      children: [
        Text(
          '${pct.round()}%',
          style: TextStyle(
            fontSize: 8,
            fontWeight: FontWeight.w700,
            color: isHigh ? const Color(0xFFF59E0B) : AppTheme.textDisabled,
          ),
        ),
        const SizedBox(width: 4),
        Expanded(
          child: Container(
            height: 3,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(1.5),
              color: Colors.white.withValues(alpha: 0.05),
            ),
            child: FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: pct / 100,
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(1.5),
                  gradient: const LinearGradient(
                    colors: [Color(0xFFEF4444), Color(0xFFF59E0B), Color(0xFF3B82F6)],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
