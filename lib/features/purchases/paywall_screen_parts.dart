import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/analytics_service.dart';
import '../../core/theme.dart';

class PaywallHeader extends StatelessWidget {
  final VoidCallback onClose;

  const PaywallHeader({super.key, required this.onClose});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded,
                size: 20, color: AppTheme.textSecondary),
            onPressed: onClose,
          ),
          const Expanded(
            child: Text(
              'SKINKEEPER PRO',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppTheme.textDisabled,
                letterSpacing: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Hero rewrite (P6.T1) — outcome-led, automation-first.
///
/// Headline "Sell at the peak." set in a gold gradient large-title.
/// Subhead frames auto-sell as the value prop. Visual: an animated chart
/// line that rises and crosses a gold trigger threshold, lighting up a
/// "FIRED" indicator. Reduce-motion paints a static gold line + crossing
/// indicator (no animation).
class PaywallHero extends StatelessWidget {
  const PaywallHero({super.key});

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    final headline = ShaderMask(
      shaderCallback: (bounds) => const LinearGradient(
        colors: [AppTheme.warning, AppTheme.warningLight],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ).createShader(bounds),
      blendMode: BlendMode.srcIn,
      child: const Text(
        'Sell at the peak.',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 30,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.5,
          height: 1.15,
          color: Colors.white,
        ),
      ),
    );
    const subhead = Padding(
      padding: EdgeInsets.symmetric(horizontal: 12),
      child: Text(
        'Auto-sell rules fire when CS2 prices cross your trigger. '
        'You sell when the market wants to buy — not when you remember.',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 14,
          height: 1.5,
          color: AppTheme.textSecondary,
        ),
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const _HeroChart(),
        const SizedBox(height: 24),
        if (reduceMotion) headline else headline.animate().fadeIn(duration: 400.ms),
        const SizedBox(height: 12),
        if (reduceMotion)
          subhead
        else
          subhead.animate().fadeIn(duration: 400.ms, delay: 120.ms),
      ],
    );
  }
}

/// Animated chart visual: a price line climbs from lower-left to upper-right,
/// crosses a horizontal gold trigger line, and a "FIRED" pill appears at the
/// crossing point. Wrapped in [RepaintBoundary] to isolate repaints from the
/// scrollable paywall body.
class _HeroChart extends StatefulWidget {
  const _HeroChart();

  @override
  State<_HeroChart> createState() => _HeroChartState();
}

class _HeroChartState extends State<_HeroChart>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    if (reduceMotion) {
      _controller?.dispose();
      _controller = null;
      return;
    }
    if (_controller != null) return;
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..forward();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return RepaintBoundary(
      child: SizedBox(
        height: 140,
        width: double.infinity,
        child: reduceMotion
            ? const _HeroChartPainterHost(progress: 1)
            : AnimatedBuilder(
                animation: _controller!,
                builder: (_, _) =>
                    _HeroChartPainterHost(progress: _controller!.value),
              ),
      ),
    );
  }
}

class _HeroChartPainterHost extends StatelessWidget {
  const _HeroChartPainterHost({required this.progress});

  final double progress;

  @override
  Widget build(BuildContext context) {
    // CustomPaint sizes itself to its child when one is provided; we let
    // the parent SizedBox define the box.
    return CustomPaint(
      painter: _HeroChartPainter(progress: progress),
      child: const SizedBox.expand(child: _FiredPillOverlay()),
    );
  }
}

class _HeroChartPainter extends CustomPainter {
  _HeroChartPainter({required this.progress});

  final double progress;

  // Trigger line at 62% of height (so the climbing line crosses it ~70% in).
  static const double _triggerY = 0.42;

  @override
  void paint(Canvas canvas, Size size) {
    // Background grid — very subtle, dotted horizontal lines.
    final gridPaint = Paint()
      ..color = AppTheme.borderLight.withValues(alpha: 0.18)
      ..strokeWidth = 1;
    for (int i = 1; i < 4; i++) {
      final y = size.height * (i / 4);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    // Gold trigger line (dashed).
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

    // Trigger label "TRIGGER" floating above the dashed line.
    final triggerLabel = TextPainter(
      text: const TextSpan(
        text: 'TRIGGER',
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

    // Price line — sampled curve climbing through trigger.
    final samples = <Offset>[];
    const totalPoints = 60;
    for (int i = 0; i <= totalPoints; i++) {
      final t = i / totalPoints;
      final dx = size.width * t;
      // Compose a curve that drifts then climbs: low-frequency sine + linear ramp.
      final wobble = math.sin(t * math.pi * 2.3) * 0.06;
      final ramp = math.pow(t, 0.85) as double;
      final norm = 0.78 - ramp * 0.62 + wobble; // y in [0,1], lower = higher on screen
      final clamped = norm.clamp(0.05, 0.95);
      samples.add(Offset(dx, size.height * clamped));
    }

    // Draw only the prefix corresponding to current `progress`.
    final visibleCount = (samples.length * progress).round().clamp(2, samples.length);
    final visiblePath = Path()..moveTo(samples.first.dx, samples.first.dy);
    for (int i = 1; i < visibleCount; i++) {
      visiblePath.lineTo(samples[i].dx, samples[i].dy);
    }

    // Glow under the line: gradient fill from line to bottom.
    if (visibleCount > 2) {
      final fillPath = Path.from(visiblePath)
        ..lineTo(samples[visibleCount - 1].dx, size.height)
        ..lineTo(samples.first.dx, size.height)
        ..close();
      final fillPaint = Paint()
        ..shader = LinearGradient(
          colors: [
            AppTheme.warning.withValues(alpha: 0.28),
            AppTheme.warning.withValues(alpha: 0),
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ).createShader(Offset.zero & size);
      canvas.drawPath(fillPath, fillPaint);
    }

    // The line itself: gold gradient stroke.
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
    canvas.drawPath(visiblePath, linePaint);

    // Pulse dot at the leading point of the line (helps eyes track).
    final tip = samples[visibleCount - 1];
    final dotPaint = Paint()..color = AppTheme.warningLight;
    canvas.drawCircle(tip, 4, dotPaint);
    canvas.drawCircle(
      tip,
      8,
      Paint()..color = AppTheme.warningLight.withValues(alpha: 0.25),
    );
  }

  @override
  bool shouldRepaint(covariant _HeroChartPainter oldDelegate) =>
      oldDelegate.progress != progress;
}

/// Floating "FIRED" pill that pops in once the rising line has plausibly
/// crossed the trigger threshold (>= 75% of the timeline). Painted as a
/// child of [_HeroChartPainterHost] so it's kept inside the chart's
/// repaint boundary and inherits its layout box.
class _FiredPillOverlay extends StatelessWidget {
  const _FiredPillOverlay();

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    final pill = Container(
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

    return Align(
      alignment: const Alignment(0.7, -0.85),
      child: reduceMotion
          ? pill
          : pill
              .animate(delay: 1700.ms)
              .fadeIn(duration: 250.ms)
              .scale(begin: const Offset(0.6, 0.6), end: const Offset(1, 1)),
    );
  }
}

/// PRO active badge shown to existing subscribers when they revisit the
/// paywall (e.g. via Settings → Manage subscription).
class PaywallActiveBadge extends StatelessWidget {
  const PaywallActiveBadge({super.key});

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    final badge = Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(AppTheme.r16),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_circle, color: Colors.white, size: 20),
          SizedBox(width: 8),
          Text(
            'PRO Active',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
          ),
        ],
      ),
    );
    if (reduceMotion) return badge;
    return badge
        .animate()
        .fadeIn(duration: 400.ms)
        .scale(begin: const Offset(0.9, 0.9), end: const Offset(1, 1));
  }
}

/// P6.T2 — three value props as the primary content. Each card has a gold
/// gradient border, an icon, a title (16pt bold) and body (13pt, 1.5 line
/// height). These replace the feature matrix as the lead message.
class PaywallValueProps extends StatelessWidget {
  const PaywallValueProps({super.key});

  static const List<_ValueProp> _props = [
    _ValueProp(
      icon: Icons.bolt_rounded,
      title: 'Auto-sell rules',
      body:
          "Set 'sell AK Redline above \$15' once. Engine watches the market 24/7 "
          'and lists it the moment your trigger fires. You\'re in control: '
          '60-second cancel window before every listing.',
    ),
    _ValueProp(
      icon: Icons.notifications_active_rounded,
      title: 'Smart alerts',
      body:
          'Get pushed the second your watched skin crosses your target. '
          'Tap Relist / Snooze / Edit straight from the app — no Steam grinding.',
    ),
    _ValueProp(
      icon: Icons.bar_chart_rounded,
      title: 'Per-account P&L',
      body:
          'See profit/loss broken down by Steam account, time-bucketed. '
          'Know if your alt is bleeding or printing.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (int i = 0; i < _props.length; i++) ...[
          _ValuePropCard(prop: _props[i]),
          if (i < _props.length - 1) const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _ValueProp {
  const _ValueProp({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;
}

class _ValuePropCard extends StatelessWidget {
  const _ValuePropCard({required this.prop});

  final _ValueProp prop;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(AppTheme.r16),
        border: Border.all(
          color: AppTheme.warning.withValues(alpha: 0.35),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.warning.withValues(alpha: 0.06),
            blurRadius: 16,
            spreadRadius: -4,
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppTheme.warning, AppTheme.warningLight],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(AppTheme.r10),
            ),
            child: Icon(prop.icon, color: Colors.white, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  prop.title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textPrimary,
                    height: 1.25,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  prop.body,
                  style: const TextStyle(
                    fontSize: 13,
                    height: 1.5,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// P6.T3 — the feature matrix is demoted under a tap-to-expand disclosure.
/// Collapsed by default. Expanding fires `Analytics.paywallMatrixExpanded()`
/// exactly once per mount.
class PaywallMatrixDisclosure extends StatefulWidget {
  const PaywallMatrixDisclosure({super.key});

  @override
  State<PaywallMatrixDisclosure> createState() =>
      _PaywallMatrixDisclosureState();
}

class _PaywallMatrixDisclosureState extends State<PaywallMatrixDisclosure>
    with SingleTickerProviderStateMixin {
  bool _expanded = false;
  bool _hasLoggedExpand = false;

  void _toggle() {
    setState(() => _expanded = !_expanded);
    if (_expanded && !_hasLoggedExpand) {
      _hasLoggedExpand = true;
      Analytics.paywallMatrixExpanded();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: _toggle,
          borderRadius: BorderRadius.circular(AppTheme.r12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Compare all features',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ),
                AnimatedRotation(
                  turns: _expanded ? 0.5 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: const Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: AppTheme.textSecondary,
                    size: 20,
                  ),
                ),
              ],
            ),
          ),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeInOut,
          alignment: Alignment.topCenter,
          child: _expanded
              ? const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: _FeatureMatrix(),
                )
              : const SizedBox(width: double.infinity),
        ),
      ],
    );
  }
}

/// Feature comparison matrix. No longer the lead content — used only inside
/// [PaywallMatrixDisclosure] under the "Compare all features" disclosure.
class _FeatureMatrix extends StatelessWidget {
  const _FeatureMatrix();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: AppTheme.glass(),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              children: const [
                Expanded(child: SizedBox.shrink()),
                SizedBox(
                  width: 44,
                  child: Center(
                    child: Text(
                      'Free',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ),
                ),
                SizedBox(
                  width: 44,
                  child: Center(
                    child: Text(
                      'PRO',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.warning,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const _FeatureRow(feature: 'Steam price tracking', free: true, pro: true),
          const _FeatureRow(feature: 'Inventory management', free: true, pro: true),
          const _FeatureRow(feature: 'Trade history sync', free: true, pro: true),
          const _FeatureRow(feature: 'Up to 5 price alerts', free: true, pro: true),
          const _FeatureRow(feature: 'Up to 2 Steam accounts', free: true, pro: true),
          const Divider(height: 24),
          const _FeatureRow(feature: 'Auto-sell rules', free: false, pro: true),
          const _FeatureRow(feature: 'Smart push alerts', free: false, pro: true),
          const _FeatureRow(feature: 'Multi-source pricing', free: false, pro: true),
          const _FeatureRow(feature: 'Per-account P&L breakdown', free: false, pro: true),
          const _FeatureRow(feature: 'Portfolio profit & charts', free: false, pro: true),
          const _FeatureRow(feature: 'Per-item profit breakdown', free: false, pro: true),
          const _FeatureRow(feature: 'Up to 20 price alerts', free: false, pro: true),
          const _FeatureRow(feature: 'Bulk sell items', free: false, pro: true),
          const _FeatureRow(feature: 'Unlimited accounts', free: false, pro: true),
          const _FeatureRow(feature: 'CSV/Excel export', free: false, pro: true),
        ],
      ),
    );
  }
}

class _FeatureRow extends StatelessWidget {
  final String feature;
  final bool free;
  final bool pro;

  const _FeatureRow({required this.feature, required this.free, required this.pro});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              feature,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
          SizedBox(
            width: 44,
            child: Center(
              child: Icon(
                free ? Icons.check_circle : Icons.remove_circle_outline,
                size: 18,
                color: free ? AppTheme.profit : AppTheme.textDisabled,
              ),
            ),
          ),
          SizedBox(
            width: 44,
            child: Center(
              child: Icon(
                pro ? Icons.check_circle : Icons.remove_circle_outline,
                size: 18,
                color: AppTheme.warning,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Subscription disclosure block. App Store rules require this above the
/// purchase CTA on the paywall (or at least visible without scrolling) —
/// missing or buried disclosure is a common 3.1.2 rejection.
class PaywallLegalFooter extends StatelessWidget {
  const PaywallLegalFooter({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Text(
          'Free trial available for yearly plan. No charge during trial period. '
          'Cancel anytime before trial ends. After trial, \$34.99/year auto-renews '
          'unless cancelled at least 24 hours before the end of the current period. '
          'Payment will be charged to your Apple ID account. '
          'Manage subscriptions in Settings > Apple ID > Subscriptions.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 10,
            color: AppTheme.textMuted,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            GestureDetector(
              onTap: () => launchUrl(Uri.parse('https://api.skinkeeper.store/legal/privacy'),
                  mode: LaunchMode.externalApplication),
              child: const Text('Privacy Policy',
                  style: TextStyle(fontSize: 10, color: AppTheme.textDisabled, decoration: TextDecoration.underline)),
            ),
            const Text('  •  ', style: TextStyle(fontSize: 10, color: AppTheme.textDisabled)),
            GestureDetector(
              onTap: () => launchUrl(Uri.parse('https://api.skinkeeper.store/legal/terms'),
                  mode: LaunchMode.externalApplication),
              child: const Text('Terms of Service',
                  style: TextStyle(fontSize: 10, color: AppTheme.textDisabled, decoration: TextDecoration.underline)),
            ),
          ],
        ),
      ],
    );
  }
}
