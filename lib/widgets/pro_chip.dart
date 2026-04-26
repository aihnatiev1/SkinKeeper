import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Size variants for [ProChip].
///
/// Each variant tunes padding, font size, and icon size while preserving
/// the gold gradient + inner border contract defined in PLAN §3.
enum ProChipSize { small, medium, large }

/// Gold gradient PRO badge used by [PremiumGate] locked state and teaser cards.
///
/// Visual contract (PLAN §3):
/// - Gradient `#F59E0B → #FBBF24` (AppTheme.warning → AppTheme.warningLight)
/// - 1px inner gold-tinted border
/// - Radius [AppTheme.r8]
/// - Horizontal padding 6 / 10 / 14 for small / medium / large
/// - Uppercase label, weight 700, letter-spacing 1.2
class ProChip extends StatelessWidget {
  const ProChip({
    super.key,
    this.size = ProChipSize.medium,
    this.label = 'PRO',
    this.icon,
  });

  final ProChipSize size;
  final String label;
  final IconData? icon;

  double get _horizontalPadding => switch (size) {
        ProChipSize.small => 6,
        ProChipSize.medium => 10,
        ProChipSize.large => 14,
      };

  double get _verticalPadding => switch (size) {
        ProChipSize.small => 2,
        ProChipSize.medium => 4,
        ProChipSize.large => 6,
      };

  double get _fontSize => switch (size) {
        ProChipSize.small => 9,
        ProChipSize.medium => 11,
        ProChipSize.large => 13,
      };

  double get _iconSize => switch (size) {
        ProChipSize.small => 10,
        ProChipSize.medium => 12,
        ProChipSize.large => 14,
      };

  double get _iconGap => switch (size) {
        ProChipSize.small => 3,
        ProChipSize.medium => 4,
        ProChipSize.large => 6,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: _horizontalPadding,
        vertical: _verticalPadding,
      ),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppTheme.warning, AppTheme.warningLight],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(AppTheme.r8),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.28),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.warning.withValues(alpha: 0.35),
            blurRadius: 8,
            spreadRadius: -2,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: _iconSize, color: Colors.white),
            SizedBox(width: _iconGap),
          ],
          Text(
            label.toUpperCase(),
            style: TextStyle(
              fontSize: _fontSize,
              fontWeight: FontWeight.w700,
              color: Colors.white,
              letterSpacing: 1.2,
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }
}
