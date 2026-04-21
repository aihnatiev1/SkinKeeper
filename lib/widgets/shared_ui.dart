/// SkinKeeper Shared UI Components
/// Premium glassmorphic widgets, shimmer loading, gradient buttons, etc.
library;

import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../core/theme.dart';

// ─── Glass Card ──────────────────────────────────────────────────

/// Glassmorphic container with optional blur backdrop, gradient border,
/// and subtle shadow. The primary building block of the UI.
class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final double radius;
  final Color? color;
  final Color? borderColor;
  final double borderOpacity;
  final VoidCallback? onTap;
  final bool elevated;

  const GlassCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.radius = AppTheme.r16,
    this.color,
    this.borderColor,
    this.borderOpacity = 0.06,
    this.onTap,
    this.elevated = false,
  });

  /// Interactive card with press feedback (scale + glow).
  const GlassCard.interactive({
    super.key,
    required this.child,
    required this.onTap,
    this.padding,
    this.margin,
    this.radius = AppTheme.r16,
    this.color,
    this.borderColor,
    this.borderOpacity = 0.06,
    this.elevated = false,
  });

  /// Outlined card for selected / emphasized states.
  const GlassCard.outlined({
    super.key,
    required this.child,
    Color accentColor = AppTheme.primary,
    this.padding,
    this.margin,
    this.radius = AppTheme.r16,
    this.color,
    this.onTap,
    this.elevated = false,
  })  : borderColor = accentColor,
        borderOpacity = 0.3;

  @override
  Widget build(BuildContext context) {
    final decoration = elevated
        ? AppTheme.glassElevated(color: color, radius: radius)
        : AppTheme.glass(
            color: color,
            borderOpacity: borderOpacity,
            radius: radius,
            borderColor: borderColor,
          );

    final container = Container(
      margin: margin,
      padding: padding ?? const EdgeInsets.all(AppTheme.s16),
      decoration: decoration,
      child: child,
    );

    if (onTap != null) {
      return _InteractiveWrapper(
        onTap: onTap!,
        child: container,
      );
    }
    return container;
  }
}

/// Adds scale + haptic feedback on press for interactive cards.
class _InteractiveWrapper extends StatefulWidget {
  final VoidCallback onTap;
  final Widget child;

  const _InteractiveWrapper({required this.onTap, required this.child});

  @override
  State<_InteractiveWrapper> createState() => _InteractiveWrapperState();
}

class _InteractiveWrapperState extends State<_InteractiveWrapper> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        widget.onTap();
      },
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 100),
        curve: Curves.easeOutCubic,
        child: widget.child,
      ),
    );
  }
}

// ─── Shimmer Loading ─────────────────────────────────────────────

/// Shimmer placeholder for loading states. Way better than spinners.
class ShimmerBox extends StatelessWidget {
  final double width;
  final double height;
  final double radius;

  const ShimmerBox({
    super.key,
    this.width = double.infinity,
    required this.height,
    this.radius = AppTheme.r12,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(radius),
      ),
    )
        .animate(onPlay: (c) => c.repeat())
        .shimmer(
          duration: 1500.ms,
          color: AppTheme.surfaceLight.withValues(alpha: 0.5),
        );
  }
}

/// Card-shaped shimmer placeholder
class ShimmerCard extends StatelessWidget {
  final double height;

  const ShimmerCard({super.key, this.height = 120});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: AppTheme.glass(),
    )
        .animate(onPlay: (c) => c.repeat())
        .shimmer(
          duration: 1500.ms,
          color: AppTheme.surfaceLight.withValues(alpha: 0.3),
        );
  }
}

// ─── Gradient Button ─────────────────────────────────────────────

/// Premium gradient button with haptic feedback and loading state.
class GradientButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final LinearGradient? gradient;
  final bool isLoading;
  final bool expanded;
  final double height;

  const GradientButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.gradient,
    this.isLoading = false,
    this.expanded = true,
    this.height = 52,
  });

  @override
  Widget build(BuildContext context) {
    final grad = gradient ?? AppTheme.primaryGradient;

    return GestureDetector(
      onTap: isLoading
          ? null
          : () {
              HapticFeedback.mediumImpact();
              onPressed?.call();
            },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        height: height,
        width: expanded ? double.infinity : null,
        padding:
            expanded ? null : const EdgeInsets.symmetric(horizontal: AppTheme.s24),
        decoration: BoxDecoration(
          gradient: onPressed == null && !isLoading ? null : grad,
          color: onPressed == null && !isLoading ? AppTheme.surface : null,
          borderRadius: BorderRadius.circular(AppTheme.r12),
          boxShadow: onPressed != null && !isLoading
              ? [
                  BoxShadow(
                    color: (grad.colors.first).withValues(alpha: 0.3),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Center(
          child: isLoading
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: Colors.white,
                  ),
                )
              : Row(
                  mainAxisSize: expanded ? MainAxisSize.max : MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (icon != null) ...[
                      Icon(icon, size: 20, color: Colors.white),
                      const SizedBox(width: AppTheme.s8),
                    ],
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

// ─── Stat Chip ───────────────────────────────────────────────────

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

// ─── Pill Tab Selector ───────────────────────────────────────────

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

/// Glass icon button (36x36) matching portfolio header style.
class GlassIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool isActive;
  final double size;

  const GlassIconButton({
    super.key,
    required this.icon,
    required this.onTap,
    this.isActive = false,
    this.size = 36,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size, height: size,
        decoration: BoxDecoration(
          color: isActive
              ? AppTheme.primary.withValues(alpha: 0.12)
              : Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isActive
                ? AppTheme.primary.withValues(alpha: 0.25)
                : Colors.white.withValues(alpha: 0.07),
            width: 0.5,
          ),
        ),
        child: Icon(
          icon, size: 18,
          color: isActive ? AppTheme.primary : AppTheme.textMuted,
        ),
      ),
    );
  }
}

// ─── Section Header ──────────────────────────────────────────────

class SectionHeader extends StatelessWidget {
  final String title;
  final Widget? trailing;
  final EdgeInsetsGeometry? padding;

  const SectionHeader({
    super.key,
    required this.title,
    this.trailing,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding ?? const EdgeInsets.only(bottom: AppTheme.s12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: AppTheme.title),
          ?trailing,
        ],
      ),
    );
  }
}

// ─── Badge ───────────────────────────────────────────────────────

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

// ─── Empty State ─────────────────────────────────────────────────

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;
  /// Disable fade-in+scale entrance. Useful for error states that can toggle
  /// on every Retry cycle, where re-animating on each build is distracting.
  final bool animate;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
    this.animate = true,
  });

  @override
  Widget build(BuildContext context) {
    final body = Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.s40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.03),
                shape: BoxShape.circle,
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.08),
                  width: 0.5,
                ),
              ),
              child: Icon(icon, size: 32, color: AppTheme.textDisabled),
            ),
            const SizedBox(height: AppTheme.s20),
            Text(title, style: AppTheme.title, textAlign: TextAlign.center),
            if (subtitle != null) ...[
              const SizedBox(height: AppTheme.s8),
              Text(
                subtitle!,
                style: AppTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: AppTheme.s24),
              action!,
            ],
          ],
        ),
      ),
    );
    if (!animate) return body;
    return body.animate().fadeIn(duration: 400.ms).scale(
          begin: const Offset(0.95, 0.95),
          duration: 400.ms,
          curve: Curves.easeOutCubic,
        );
  }
}

// ─── Animated Number ─────────────────────────────────────────────

/// Smoothly animates between number values.
class AnimatedNumber extends StatelessWidget {
  final double value;
  final TextStyle? style;
  final String Function(double) formatter;

  const AnimatedNumber({
    super.key,
    required this.value,
    this.style,
    required this.formatter,
  });

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(end: value),
      duration: const Duration(milliseconds: 600),
      curve: Curves.easeOutCubic,
      builder: (context, val, _) => Text(
        formatter(val),
        style: style,
      ),
    );
  }
}

// ─── Frosted App Bar ─────────────────────────────────────────────

/// Custom app bar with frosted glass effect on scroll.
class FrostedAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final List<Widget>? actions;
  final Widget? leading;
  final bool showBack;

  const FrostedAppBar({
    super.key,
    required this.title,
    this.actions,
    this.leading,
    this.showBack = false,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: AppBar(
          title: Text(title),
          leading: leading,
          automaticallyImplyLeading: showBack,
          actions: actions,
          backgroundColor: AppTheme.bg.withValues(alpha: 0.85),
        ),
      ),
    );
  }

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);
}

// ─── List Item Tile ──────────────────────────────────────────────

class AppListTile extends StatelessWidget {
  final IconData? icon;
  final Color? iconColor;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  const AppListTile({
    super.key,
    this.icon,
    this.iconColor,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap != null
          ? () {
              HapticFeedback.selectionClick();
              onTap!();
            }
          : null,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.s16,
          vertical: AppTheme.s14,
        ),
        child: Row(
          children: [
            if (icon != null) ...[
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: (iconColor ?? AppTheme.primary).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppTheme.r8),
                ),
                child: Icon(
                  icon,
                  size: 18,
                  color: iconColor ?? AppTheme.primary,
                ),
              ),
              const SizedBox(width: AppTheme.s12),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppTheme.body),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!, style: AppTheme.caption),
                  ],
                ],
              ),
            ),
            ?trailing,
            if (onTap != null && trailing == null)
              const Icon(
                Icons.chevron_right,
                size: 20,
                color: AppTheme.textDisabled,
              ),
          ],
        ),
      ),
    );
  }
}

// ─── Pull-to-refresh wrapper ─────────────────────────────────────

/// Consistent pull-to-refresh with themed indicator.
class AppRefreshIndicator extends StatelessWidget {
  final Widget child;
  final Future<void> Function() onRefresh;

  const AppRefreshIndicator({
    super.key,
    required this.child,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      color: AppTheme.primary,
      backgroundColor: AppTheme.surfaceLight,
      strokeWidth: 2.5,
      displacement: 50,
      child: child,
    );
  }
}

// ─── Status Chip ────────────────────────────────────────────────

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

// ─── Pulse Indicator ────────────────────────────────────────────

/// Pulsing dot indicator for live sync / loading states.
class PulseIndicator extends StatelessWidget {
  final Color color;
  final double size;

  const PulseIndicator({
    super.key,
    this.color = AppTheme.profit,
    this.size = 8,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.5),
            blurRadius: size,
          ),
        ],
      ),
    )
        .animate(onPlay: (c) => c.repeat(reverse: true))
        .scaleXY(
          begin: 0.8,
          end: 1.2,
          duration: 1000.ms,
          curve: Curves.easeInOut,
        )
        .fade(
          begin: 0.5,
          end: 1.0,
          duration: 1000.ms,
        );
  }
}

// ─── Gradient Divider ───────────────────────────────────────────

/// Themed section separator with gradient fade.
class GradientDivider extends StatelessWidget {
  final double height;
  final EdgeInsetsGeometry? margin;

  const GradientDivider({
    super.key,
    this.height = 1,
    this.margin,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      margin: margin ?? const EdgeInsets.symmetric(vertical: AppTheme.s12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Colors.transparent,
            AppTheme.border.withValues(alpha: 0.5),
            AppTheme.border.withValues(alpha: 0.5),
            Colors.transparent,
          ],
          stops: const [0.0, 0.2, 0.8, 1.0],
        ),
      ),
    );
  }
}

// ─── Animated Counter ───────────────────────────────────────────

/// Smooth number counter animation for portfolio values.
/// Extends AnimatedNumber with currency-aware formatting.
class AnimatedCounter extends StatelessWidget {
  final double value;
  final TextStyle? style;
  final String prefix;
  final String suffix;
  final int decimals;
  final Duration duration;

  const AnimatedCounter({
    super.key,
    required this.value,
    this.style,
    this.prefix = '',
    this.suffix = '',
    this.decimals = 2,
    this.duration = const Duration(milliseconds: 800),
  });

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(end: value),
      duration: duration,
      curve: Curves.easeOutCubic,
      builder: (context, val, _) => Text(
        '$prefix${val.toStringAsFixed(decimals)}$suffix',
        style: style ?? AppTheme.priceLarge,
      ),
    );
  }
}

// ─── Skeleton Card ──────────────────────────────────────────────

/// Layout-matched skeleton placeholder for inventory grid cards.
class SkeletonItemCard extends StatelessWidget {
  const SkeletonItemCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.04),
          width: 0.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Price header shimmer
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 0),
            child: ShimmerBox(height: 14, width: 60, radius: 4),
          ),
          // Image area
          const Expanded(child: SizedBox.shrink()),
          // Footer shimmer
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 6, 10, 7),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ShimmerBox(height: 10, width: 40, radius: 3),
                const SizedBox(height: 4),
                ShimmerBox(height: 4, radius: 2),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Skeleton for portfolio stat cards row.
class SkeletonStatCards extends StatelessWidget {
  const SkeletonStatCards({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(
        3,
        (i) => Expanded(
          child: Padding(
            padding: EdgeInsets.only(left: i > 0 ? 8 : 0),
            child: Container(
              height: 80,
              decoration: AppTheme.glass(),
              padding: const EdgeInsets.all(AppTheme.s12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ShimmerBox(height: 10, width: 50, radius: 3),
                  const Spacer(),
                  ShimmerBox(height: 18, width: 70, radius: 4),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Skeleton for trade offer list items.
class SkeletonTradeTile extends StatelessWidget {
  const SkeletonTradeTile({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      padding: const EdgeInsets.all(14),
      decoration: AppTheme.glass(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ShimmerBox(height: 16, width: 16, radius: 8),
              const SizedBox(width: 8),
              ShimmerBox(height: 14, width: 120, radius: 4),
              const Spacer(),
              ShimmerBox(height: 20, width: 60, radius: 8),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Row(
                  children: List.generate(
                    3,
                    (i) => Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: ShimmerBox(height: 36, width: 36, radius: 6),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Row(
                  children: List.generate(
                    3,
                    (i) => Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: ShimmerBox(height: 36, width: 36, radius: 6),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
