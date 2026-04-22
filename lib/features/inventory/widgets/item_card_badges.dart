import 'package:flutter/material.dart';

import '../../../core/theme.dart';
import 'rarity_gem.dart';

class ArbitrageBadge extends StatelessWidget {
  final double steamPrice;
  final double buffPrice;

  const ArbitrageBadge({
    super.key,
    required this.steamPrice,
    required this.buffPrice,
  });

  @override
  Widget build(BuildContext context) {
    if (steamPrice <= 0) return const SizedBox.shrink();
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

class RareBadge extends StatelessWidget {
  final String reason;

  const RareBadge({super.key, required this.reason});

  @override
  Widget build(BuildContext context) {
    final color = switch (reason) {
      'Blue Gem' => const Color(0xFF3B82F6),
      'Ruby' => const Color(0xFFEF4444),
      'Sapphire' => const Color(0xFF06B6D4),
      'Emerald' => const Color(0xFF10B981),
      'Black Pearl' => const Color(0xFF9B59B6),
      _ => const Color(0xFFF59E0B),
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

class DopplerPhasePill extends StatelessWidget {
  final String phase;
  final Color? color;
  const DopplerPhasePill({super.key, required this.phase, this.color});

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
          fontSize: 9,
          fontWeight: FontWeight.w800,
          color: c,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}
