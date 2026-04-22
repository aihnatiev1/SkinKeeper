import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../core/theme.dart';

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
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 0),
            child: ShimmerBox(height: 14, width: 60, radius: 4),
          ),
          const Expanded(child: SizedBox.shrink()),
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
