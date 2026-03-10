import 'package:flutter/material.dart';

/// Diamond-shaped gem icon for rare items (like CSFloat's orange diamond).
/// Shows on items with rare float, rare Doppler phases, etc.
class RarityGem extends StatelessWidget {
  final double size;
  final Color color;
  final bool glow;

  const RarityGem({
    super.key,
    this.size = 14,
    this.color = const Color(0xFFF59E0B), // amber/orange default
    this.glow = true,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _DiamondPainter(color: color, glow: glow),
      ),
    );
  }
}

class _DiamondPainter extends CustomPainter {
  final Color color;
  final bool glow;

  _DiamondPainter({required this.color, required this.glow});

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final path = Path()
      ..moveTo(w * 0.5, 0) // top
      ..lineTo(w, h * 0.4) // right
      ..lineTo(w * 0.5, h) // bottom
      ..lineTo(0, h * 0.4) // left
      ..close();

    // Glow
    if (glow) {
      canvas.drawPath(
        path,
        Paint()
          ..color = color.withValues(alpha: 0.4)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
      );
    }

    // Fill with gradient
    final gradient = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        Color.lerp(color, Colors.white, 0.3)!,
        color,
        Color.lerp(color, Colors.black, 0.2)!,
      ],
    );
    canvas.drawPath(
      path,
      Paint()
        ..shader = gradient.createShader(Rect.fromLTWH(0, 0, w, h)),
    );

    // Inner highlight
    final highlightPath = Path()
      ..moveTo(w * 0.5, h * 0.08)
      ..lineTo(w * 0.75, h * 0.38)
      ..lineTo(w * 0.5, h * 0.55)
      ..lineTo(w * 0.25, h * 0.38)
      ..close();

    canvas.drawPath(
      highlightPath,
      Paint()..color = Colors.white.withValues(alpha: 0.25),
    );
  }

  @override
  bool shouldRepaint(_DiamondPainter oldDelegate) =>
      color != oldDelegate.color || glow != oldDelegate.glow;
}

/// Doppler phase gem icon — colored circle with inner shine.
/// Used for Ruby (red), Sapphire (blue), Emerald (green), Black Pearl (purple).
class DopplerPhaseGem extends StatelessWidget {
  final String phase;
  final Color color;
  final double size;

  const DopplerPhaseGem({
    super.key,
    required this.phase,
    required this.color,
    this.size = 12,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          center: const Alignment(-0.3, -0.3),
          colors: [
            Color.lerp(color, Colors.white, 0.4)!,
            color,
            Color.lerp(color, Colors.black, 0.3)!,
          ],
          stops: const [0.0, 0.5, 1.0],
        ),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.5),
            blurRadius: 4,
            spreadRadius: 0.5,
          ),
        ],
      ),
    );
  }
}
