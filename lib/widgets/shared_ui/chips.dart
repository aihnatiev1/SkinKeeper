import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme.dart';

/// Compact stat display with label + value, used in dashboard rows.
class StatChip extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  final IconData? icon;

  const StatChip({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.s12,
          vertical: AppTheme.s12,
        ),
        decoration: AppTheme.glass(radius: AppTheme.r12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 12, color: AppTheme.textMuted),
                  const SizedBox(width: 4),
                ],
                Text(
                  label.toUpperCase(),
                  style: AppTheme.label,
                ),
              ],
            ),
            const SizedBox(height: AppTheme.s6),
            Text(
              value,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: valueColor ?? AppTheme.textPrimary,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Segmented pill tab selector matching portfolio design.
/// Glass container with accent gradient on active tab + glow shadow.
class PillTabSelector extends StatelessWidget {
  final List<String> tabs;
  final int selected;
  final ValueChanged<int> onChanged;
  final List<bool>? premiumTabs;

  const PillTabSelector({
    super.key,
    required this.tabs,
    required this.selected,
    required this.onChanged,
    this.premiumTabs,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 42,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.05),
          width: 0.5,
        ),
      ),
      child: Row(
        children: List.generate(tabs.length, (i) {
          final isSelected = i == selected;
          final isPremium =
              premiumTabs != null && i < premiumTabs!.length && premiumTabs![i];
          return Expanded(
            child: GestureDetector(
              onTap: () {
                HapticFeedback.selectionClick();
                onChanged(i);
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOutCubic,
                decoration: BoxDecoration(
                  gradient: isSelected ? AppTheme.primaryGradient : null,
                  borderRadius: BorderRadius.circular(11),
                  boxShadow: isSelected ? [
                    BoxShadow(
                      color: AppTheme.primary.withValues(alpha: 0.35),
                      blurRadius: 12,
                      offset: const Offset(0, 3),
                    ),
                  ] : [],
                ),
                child: Center(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        tabs[i],
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: isSelected ? Colors.white : AppTheme.textMuted,
                        ),
                      ),
                      if (isPremium) ...[
                        const SizedBox(width: 4),
                        Icon(
                          Icons.workspace_premium,
                          size: 12,
                          color: isSelected
                              ? Colors.white.withValues(alpha: 0.8)
                              : AppTheme.textDisabled,
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

class AppBadge extends StatelessWidget {
  final String text;
  final Color? color;
  final Color? textColor;
  final IconData? icon;
  final double fontSize;

  const AppBadge({
    super.key,
    required this.text,
    this.color,
    this.textColor,
    this.icon,
    this.fontSize = 11,
  });

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppTheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(AppTheme.r6),
        border: Border.all(color: c.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: fontSize + 2, color: textColor ?? c),
            const SizedBox(width: 4),
          ],
          Text(
            text,
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.w600,
              color: textColor ?? c,
            ),
          ),
        ],
      ),
    );
  }
}

/// Themed status chip with color-coded icon for trade/transaction status.
class StatusChip extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;

  const StatusChip({
    super.key,
    required this.label,
    required this.color,
    this.icon,
  });

  /// Create status chip from trade status string.
  factory StatusChip.fromTradeStatus(String status) {
    final (Color c, String l, IconData i) = switch (status) {
      'pending' => (AppTheme.warning, 'Pending', Icons.hourglass_top_rounded),
      'awaiting_confirmation' => (
        const Color(0xFFFB923C),
        'Awaiting',
        Icons.phone_android_rounded
      ),
      'on_hold' => (AppTheme.warning, 'On Hold', Icons.pause_circle_rounded),
      'accepted' => (AppTheme.profit, 'Accepted', Icons.check_circle_rounded),
      'declined' => (AppTheme.loss, 'Declined', Icons.cancel_rounded),
      'cancelled' => (
        AppTheme.textMuted,
        'Cancelled',
        Icons.block_rounded
      ),
      'expired' => (
        AppTheme.textMuted,
        'Expired',
        Icons.timer_off_rounded
      ),
      'countered' => (
        AppTheme.steamBlue,
        'Countered',
        Icons.swap_horiz_rounded
      ),
      'error' => (AppTheme.loss, 'Error', Icons.error_rounded),
      _ => (AppTheme.textMuted, status, Icons.info_outline_rounded),
    };
    return StatusChip(label: l, color: c, icon: i);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppTheme.r8),
        border: Border.all(
          color: color.withValues(alpha: 0.2),
          width: 0.5,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
