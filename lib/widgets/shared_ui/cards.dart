import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme.dart';

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
