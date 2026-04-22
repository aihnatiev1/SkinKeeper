import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';

class ItemCardFooter extends StatelessWidget {
  final InventoryItem item;
  final bool compact;
  final bool ultraCompact;

  const ItemCardFooter({
    super.key,
    required this.item,
    required this.compact,
    this.ultraCompact = false,
  });

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
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (hasWear) ...[
              if (item.isStatTrak)
                const Text('ST ', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: AppTheme.warning))
              else if (item.isSouvenir)
                const Text('SV ', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: AppTheme.warning)),
              Flexible(child: _WearPill(wear: item.wearShort!, compact: true)),
            ],
            const Spacer(),
            if (hasAccount || hasBan)
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (hasAccount)
                    _AccountAvatar(avatarUrl: item.accountAvatarUrl, name: item.accountName, size: 13),
                  if (hasAccount && hasBan) const SizedBox(height: 2),
                  if (hasBan)
                    _TradeBanBadge(item: item, compact: true),
                ],
              ),
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
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Wrap(
                spacing: 4,
                runSpacing: 2,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (!item.isNonWeapon && item.wearShort != null) ...[
                    if (item.isSouvenir)
                      const Text('SV', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppTheme.warning))
                    else if (item.isStatTrak)
                      const Text('ST', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppTheme.warning)),
                    _WearPill(wear: item.wearShort!),
                  ],
                  if (item.floatValue != null && item.floatValue! < 0.01 && item.wear == 'Factory New')
                    const Text('🔥', style: TextStyle(fontSize: 10)),
                ],
              ),
            ),
            if (hasAccount || hasBan)
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (hasAccount)
                    _AccountAvatar(avatarUrl: item.accountAvatarUrl, name: item.accountName, size: 18),
                  if (hasAccount && hasBan) const SizedBox(height: 4),
                  if (hasBan)
                    _TradeBanBadge(item: item, compact: false),
                ],
              ),
          ],
        ),
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
        if (!item.isNonWeapon && item.wearShort != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, right: 4),
            child: _MiniFloatBar(floatValue: item.floatValue, wearShort: item.wearShort!),
          ),
        if (item.fadePercentage != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: _MiniFadeBar(fadePercent: item.fadePercentage!),
          ),
      ],
    );
  }
}

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
    return Tooltip(
      message: _wearFullNames[wear] ?? wear,
      waitDuration: const Duration(milliseconds: 400),
      child: Text(
        wear,
        style: TextStyle(
          fontSize: compact ? 9 : 10,
          fontWeight: FontWeight.w300,
          color: const Color(0xFF64748B),
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _MiniFloatBar extends StatelessWidget {
  final double? floatValue;
  final String wearShort;

  const _MiniFloatBar({required this.wearShort, this.floatValue});

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
                  Row(
                    children: [
                      _buildSegment(0.07, const Color(0xFF10B981)),
                      _buildSegment(0.08, const Color(0xFF06B6D4)),
                      _buildSegment(0.23, const Color(0xFF3B82F6)),
                      _buildSegment(0.07, const Color(0xFFF59E0B)),
                      _buildSegment(0.55, const Color(0xFFEF4444)),
                    ],
                  ),
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

class _TradeBanBadge extends StatelessWidget {
  final InventoryItem item;
  final bool compact;

  const _TradeBanBadge({required this.item, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final daysLeft = item.tradeBanUntil?.difference(DateTime.now()).inDays;

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
