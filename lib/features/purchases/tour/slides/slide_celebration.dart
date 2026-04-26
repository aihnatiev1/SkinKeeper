import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../../core/theme.dart';
import '../../../../widgets/pro_chip.dart';

/// Slide 1 — celebration / welcome.
///
/// Visual: large [ProChip], gold-gradient headline "Welcome to PRO", a short
/// subhead, and a centred radial gold burst behind the chip. We do NOT pull
/// in the `confetti` package (not in pubspec); the burst is painted with a
/// [CustomPainter] so reduce-motion fallback is just `progress=1`.
///
/// Skip button is intentionally hidden on this slide — App Store onboarding
/// guidance allows the very first slide to be unskippable as long as the
/// rest of the flow is skippable.
class SlideCelebration extends StatelessWidget {
  const SlideCelebration({super.key, required this.onContinue});

  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Spacer(),
          SizedBox(
            height: 220,
            width: 220,
            child: Stack(
              alignment: Alignment.center,
              children: [
                _RadialBurst(reduceMotion: reduceMotion),
                const ProChip(size: ProChipSize.large),
              ],
            ),
          ),
          const SizedBox(height: 32),
          ShaderMask(
            shaderCallback: (bounds) => const LinearGradient(
              colors: [AppTheme.warning, AppTheme.warningLight],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ).createShader(bounds),
            blendMode: BlendMode.srcIn,
            child: const Text(
              'Welcome to PRO',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                letterSpacing: -0.5,
                height: 1.15,
              ),
            ),
          ),
          const SizedBox(height: 14),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              'Auto-sell, smart alerts, and the data you need to trade smarter.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 15,
                height: 1.5,
                color: AppTheme.textSecondary,
              ),
            ),
          ),
          const Spacer(),
          _ContinueButton(label: 'Continue', onTap: onContinue)
              .animate(autoPlay: !reduceMotion)
              .fadeIn(duration: reduceMotion ? Duration.zero : 350.ms, delay: 200.ms),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

/// Radial gold burst painted as a CustomPainter — pattern lifted from
/// `_HeroChart` style in `paywall_screen_parts.dart`. Animates outward
/// when reduce-motion is OFF; static at full extent otherwise.
class _RadialBurst extends StatefulWidget {
  const _RadialBurst({required this.reduceMotion});
  final bool reduceMotion;

  @override
  State<_RadialBurst> createState() => _RadialBurstState();
}

class _RadialBurstState extends State<_RadialBurst>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;

  @override
  void initState() {
    super.initState();
    if (!widget.reduceMotion) {
      _controller = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1400),
      )..forward();
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) {
      return const _BurstPainterHost(progress: 1);
    }
    return AnimatedBuilder(
      animation: controller,
      builder: (_, _) => _BurstPainterHost(progress: controller.value),
    );
  }
}

class _BurstPainterHost extends StatelessWidget {
  const _BurstPainterHost({required this.progress});
  final double progress;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _BurstPainter(progress: progress),
      child: const SizedBox.expand(),
    );
  }
}

class _BurstPainter extends CustomPainter {
  _BurstPainter({required this.progress});
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final maxRadius = size.shortestSide / 2;

    // Halo: radial gradient that pulses outward.
    final haloRadius = maxRadius * (0.6 + 0.4 * progress);
    final haloPaint = Paint()
      ..shader = RadialGradient(
        colors: [
          AppTheme.warning.withValues(alpha: 0.55 * progress),
          AppTheme.warning.withValues(alpha: 0.18 * progress),
          AppTheme.warning.withValues(alpha: 0.0),
        ],
        stops: const [0.0, 0.55, 1.0],
      ).createShader(Rect.fromCircle(center: center, radius: haloRadius));
    canvas.drawCircle(center, haloRadius, haloPaint);

    // Outward rays — 12 short gold spokes, easing out as progress completes.
    if (progress > 0.05) {
      final rayPaint = Paint()
        ..color = AppTheme.warningLight
            .withValues(alpha: (1.0 - progress).clamp(0.0, 1.0) * 0.85)
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round;
      const rayCount = 12;
      for (int i = 0; i < rayCount; i++) {
        final angle = (i / rayCount) * 2 * math.pi;
        final inner = maxRadius * (0.45 + 0.25 * progress);
        final outer = maxRadius * (0.55 + 0.40 * progress);
        canvas.drawLine(
          center +
              Offset(math.cos(angle) * inner, math.sin(angle) * inner),
          center +
              Offset(math.cos(angle) * outer, math.sin(angle) * outer),
          rayPaint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _BurstPainter old) => old.progress != progress;
}

class _ContinueButton extends StatelessWidget {
  const _ContinueButton({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppTheme.warning, AppTheme.warningLight],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(AppTheme.r16),
            boxShadow: [
              BoxShadow(
                color: AppTheme.warning.withValues(alpha: 0.4),
                blurRadius: 20,
                spreadRadius: -4,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}
