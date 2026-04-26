import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../../core/theme.dart';
import 'slide_widgets.dart';

/// Slide 3 — auto-sell pitch.
///
/// Visual: an animated demo chart that climbs through a gold trigger line and
/// pops a "FIRED" pill — same language as the paywall hero. The bullet list
/// underneath repeats the three guarantees we make (one-time setup, 60-second
/// cancel, MIN guard). Two CTAs — primary ("Try it now") drives users
/// straight to the auto-sell list.
class SlideAutosellPitch extends StatelessWidget {
  const SlideAutosellPitch({
    super.key,
    required this.onTryNow,
    required this.onContinue,
  });

  final VoidCallback onTryNow;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 4),
            const Text(
              'Auto-sell rules fire while you sleep.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: AppTheme.textPrimary,
                letterSpacing: -0.3,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 20),
            const _AutosellDemoChart(),
            const SizedBox(height: 24),
            const _GuaranteeBullets(),
            const Spacer(),
            TourPrimaryButton(label: 'Try it now', onTap: onTryNow),
            const SizedBox(height: 10),
            TourSecondaryButton(label: 'Continue', onTap: onContinue),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _GuaranteeBullets extends StatelessWidget {
  const _GuaranteeBullets();

  static const _bullets = [
    "Set 'sell AK Redline above \$15' once.",
    '60-second cancel window before every listing.',
    'MIN guard: never lists below 50% of market.',
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final b in _bullets) _BulletRow(text: b),
      ],
    );
  }
}

class _BulletRow extends StatelessWidget {
  const _BulletRow({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppTheme.warning, AppTheme.warningLight],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(11),
            ),
            child: const Icon(
              Icons.check_rounded,
              size: 14,
              color: Colors.white,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Text(
                text,
                style: const TextStyle(
                  fontSize: 14,
                  color: AppTheme.textPrimary,
                  height: 1.45,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Animated demo chart — the line climbs, crosses the gold trigger, the
/// "FIRED" pill spawns, and a small "Listed for $15.42" card slides in.
/// Reduce-motion: paint at progress=1 with no animation.
class _AutosellDemoChart extends StatefulWidget {
  const _AutosellDemoChart();

  @override
  State<_AutosellDemoChart> createState() => _AutosellDemoChartState();
}

class _AutosellDemoChartState extends State<_AutosellDemoChart>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;
  bool _reduceMotion = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotion = MediaQuery.of(context).disableAnimations;
    if (_reduceMotion) {
      _controller?.dispose();
      _controller = null;
      return;
    }
    if (_controller != null) return;
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..forward();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _controller;
    return RepaintBoundary(
      child: SizedBox(
        height: 180,
        width: double.infinity,
        child: Stack(
          children: [
            Positioned.fill(
              child: c == null
                  ? const _ChartPaintHost(progress: 1)
                  : AnimatedBuilder(
                      animation: c,
                      builder: (_, _) =>
                          _ChartPaintHost(progress: c.value),
                    ),
            ),
            // "Listed for $15.42" card slides in once trigger has fired.
            Align(
              alignment: const Alignment(0.95, 0.95),
              child: _reduceMotion
                  ? const _ListedCard()
                  : const _ListedCard()
                      .animate(delay: 1900.ms)
                      .fadeIn(duration: 280.ms)
                      .slideX(begin: 0.4, end: 0),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChartPaintHost extends StatelessWidget {
  const _ChartPaintHost({required this.progress});
  final double progress;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _ChartPainter(progress: progress),
      child: Stack(
        children: [
          if (progress >= 0.72)
            const Align(
              alignment: Alignment(0.55, -0.85),
              child: _FiredPill(),
            ),
        ],
      ),
    );
  }
}

class _ChartPainter extends CustomPainter {
  _ChartPainter({required this.progress});
  final double progress;

  static const double _triggerY = 0.42;

  @override
  void paint(Canvas canvas, Size size) {
    // Light background grid.
    final gridPaint = Paint()
      ..color = AppTheme.borderLight.withValues(alpha: 0.18)
      ..strokeWidth = 1;
    for (int i = 1; i < 4; i++) {
      final y = size.height * (i / 4);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    // Dashed gold trigger.
    final triggerY = size.height * _triggerY;
    final triggerPaint = Paint()
      ..color = AppTheme.warning.withValues(alpha: 0.65)
      ..strokeWidth = 1.5;
    const dashWidth = 6.0;
    const dashGap = 5.0;
    double x = 0;
    while (x < size.width) {
      canvas.drawLine(
        Offset(x, triggerY),
        Offset(math.min(x + dashWidth, size.width), triggerY),
        triggerPaint,
      );
      x += dashWidth + dashGap;
    }
    final triggerLabel = TextPainter(
      text: const TextSpan(
        text: 'TRIGGER \$15.00',
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          color: AppTheme.warning,
          letterSpacing: 1.4,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    triggerLabel.paint(canvas, Offset(8, triggerY - triggerLabel.height - 2));

    // Sample a rising curve.
    final samples = <Offset>[];
    const totalPoints = 70;
    for (int i = 0; i <= totalPoints; i++) {
      final t = i / totalPoints;
      final dx = size.width * t;
      final wobble = math.sin(t * math.pi * 2.6) * 0.05;
      final ramp = math.pow(t, 0.85) as double;
      final norm = 0.78 - ramp * 0.62 + wobble;
      final clamped = norm.clamp(0.05, 0.95);
      samples.add(Offset(dx, size.height * clamped));
    }
    final visibleCount =
        (samples.length * progress).round().clamp(2, samples.length);
    final path = Path()..moveTo(samples.first.dx, samples.first.dy);
    for (int i = 1; i < visibleCount; i++) {
      path.lineTo(samples[i].dx, samples[i].dy);
    }

    // Glow fill.
    if (visibleCount > 2) {
      final fill = Path.from(path)
        ..lineTo(samples[visibleCount - 1].dx, size.height)
        ..lineTo(samples.first.dx, size.height)
        ..close();
      final fillPaint = Paint()
        ..shader = LinearGradient(
          colors: [
            AppTheme.warning.withValues(alpha: 0.28),
            AppTheme.warning.withValues(alpha: 0.0),
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ).createShader(Offset.zero & size);
      canvas.drawPath(fill, fillPaint);
    }

    // Gold gradient stroke.
    final linePaint = Paint()
      ..shader = const LinearGradient(
        colors: [AppTheme.warning, AppTheme.warningLight],
        begin: Alignment.bottomLeft,
        end: Alignment.topRight,
      ).createShader(Offset.zero & size)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(path, linePaint);

    // Pulse dot at the leading edge.
    final tip = samples[visibleCount - 1];
    canvas.drawCircle(tip, 4, Paint()..color = AppTheme.warningLight);
    canvas.drawCircle(
      tip,
      8,
      Paint()..color = AppTheme.warningLight.withValues(alpha: 0.25),
    );
  }

  @override
  bool shouldRepaint(covariant _ChartPainter old) => old.progress != progress;
}

class _FiredPill extends StatelessWidget {
  const _FiredPill();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppTheme.warning, AppTheme.warningLight],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(AppTheme.r8),
        boxShadow: [
          BoxShadow(
            color: AppTheme.warning.withValues(alpha: 0.45),
            blurRadius: 12,
            spreadRadius: -2,
          ),
        ],
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.bolt_rounded, size: 12, color: Colors.white),
          SizedBox(width: 4),
          Text(
            'FIRED',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              letterSpacing: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}

class _ListedCard extends StatelessWidget {
  const _ListedCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppTheme.bg.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(AppTheme.r10),
        border: Border.all(
          color: AppTheme.warning.withValues(alpha: 0.45),
        ),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.local_offer_rounded,
            size: 12,
            color: AppTheme.warningLight,
          ),
          SizedBox(width: 6),
          Text(
            'Listed for \$15.42',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
