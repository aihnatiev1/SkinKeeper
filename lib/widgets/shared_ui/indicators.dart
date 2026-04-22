import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../core/theme.dart';

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
