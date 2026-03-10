import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme.dart';

/// Visual wear bar showing float value position on the 0-1 scale.
/// Segments: FN (0-0.07), MW (0.07-0.15), FT (0.15-0.38), WW (0.38-0.45), BS (0.45-1.0)
class WearBar extends StatelessWidget {
  final double floatValue;
  final double height;

  const WearBar({
    super.key,
    required this.floatValue,
    this.height = 22,
  });

  static const _segments = [
    (label: 'FN', end: 0.07, color: Color(0xFF10B981)),
    (label: 'MW', end: 0.15, color: Color(0xFF34D399)),
    (label: 'FT', end: 0.38, color: Color(0xFFF59E0B)),
    (label: 'WW', end: 0.45, color: Color(0xFFF97316)),
    (label: 'BS', end: 1.00, color: Color(0xFFEF4444)),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Float value header
        Row(
          children: [
            Text('FLOAT VALUE', style: AppTheme.label),
            const Spacer(),
            Text(
              floatValue.toStringAsFixed(8),
              style: AppTheme.mono.copyWith(fontSize: 13),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.s8),
        // Bar
        SizedBox(
          height: height,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final totalWidth = constraints.maxWidth;
              return ClipRRect(
                borderRadius: BorderRadius.circular(AppTheme.r6),
                child: Stack(
                  children: [
                    // Segments
                    Row(
                      children: _segments.map((seg) {
                        final prevEnd = _segments.indexOf(seg) > 0
                            ? _segments[_segments.indexOf(seg) - 1].end
                            : 0.0;
                        final fraction = seg.end - prevEnd;
                        return Expanded(
                          flex: (fraction * 1000).round(),
                          child: Container(
                            decoration: BoxDecoration(
                              color: seg.color.withValues(alpha: 0.2),
                              border: Border(
                                right: seg.end < 1.0
                                    ? BorderSide(
                                        color: AppTheme.bg.withValues(alpha: 0.5),
                                        width: 1,
                                      )
                                    : BorderSide.none,
                              ),
                            ),
                            child: Center(
                              child: Text(
                                seg.label,
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w600,
                                  color: seg.color.withValues(alpha: 0.7),
                                ),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    // Animated indicator
                    TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: floatValue.clamp(0.0, 1.0)),
                      duration: 600.ms,
                      curve: Curves.easeOutCubic,
                      builder: (context, val, _) {
                        return Positioned(
                          left: (val * totalWidth) - 1.5,
                          top: 0,
                          bottom: 0,
                          child: Container(
                            width: 3,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(1.5),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.white.withValues(alpha: 0.5),
                                  blurRadius: 6,
                                ),
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.4),
                                  blurRadius: 4,
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        const SizedBox(height: AppTheme.s4),
        // Scale labels
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('0', style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled)),
            Text('1', style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled)),
          ],
        ),
      ],
    );
  }
}
