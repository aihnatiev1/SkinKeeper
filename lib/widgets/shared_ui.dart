/// SkinKeeper Shared UI Components
/// Premium glassmorphic widgets, shimmer loading, gradient buttons, etc.
library;

import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../core/theme.dart';

export 'shared_ui/buttons.dart';
export 'shared_ui/chips.dart';
export 'shared_ui/indicators.dart';
export 'shared_ui/skeletons.dart';

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




