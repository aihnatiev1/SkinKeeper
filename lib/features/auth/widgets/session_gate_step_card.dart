import 'package:flutter/material.dart';

import '../../../core/theme.dart';

class SessionGateFeatureChip extends StatelessWidget {
  final String label;
  const SessionGateFeatureChip(this.label, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppTheme.primary.withValues(alpha: 0.9),
        ),
      ),
    );
  }
}

/// Numbered "step X of N" card with status (done / current / locked) and an
/// optional action button. Used by the browser-fallback flow.
class SessionGateStepCard extends StatelessWidget {
  final int step;
  final int currentStep;
  final String title;
  final String description;
  final String buttonLabel;
  final IconData buttonIcon;
  final VoidCallback? onTap;

  const SessionGateStepCard({
    super.key,
    required this.step,
    required this.currentStep,
    required this.title,
    required this.description,
    required this.buttonLabel,
    required this.buttonIcon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDone = step < currentStep;
    final isCurrent = step == currentStep;
    final isLocked = step > currentStep;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDone
            ? const Color(0xFF00E676).withValues(alpha: 0.04)
            : isCurrent
                ? Colors.white.withValues(alpha: 0.04)
                : Colors.white.withValues(alpha: 0.02),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDone
              ? const Color(0xFF00E676).withValues(alpha: 0.15)
              : isCurrent
                  ? Colors.white.withValues(alpha: 0.1)
                  : Colors.white.withValues(alpha: 0.04),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: isDone
                      ? const Color(0xFF00E676).withValues(alpha: 0.15)
                      : isCurrent
                          ? AppTheme.primary.withValues(alpha: 0.15)
                          : Colors.white.withValues(alpha: 0.05),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: isDone
                      ? const Icon(Icons.check,
                          size: 16, color: Color(0xFF00E676))
                      : Text(
                          '$step',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: isCurrent
                                ? AppTheme.primary
                                : Colors.white.withValues(alpha: 0.25),
                          ),
                        ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                title,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: isLocked
                      ? Colors.white.withValues(alpha: 0.25)
                      : Colors.white,
                ),
              ),
              if (isDone) ...[
                const Spacer(),
                Text(
                  'Done',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF00E676).withValues(alpha: 0.8),
                  ),
                ),
              ],
            ],
          ),
          if (!isDone) ...[
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.only(left: 40),
              child: Text(
                description,
                style: TextStyle(
                  fontSize: 13,
                  color: isLocked
                      ? Colors.white.withValues(alpha: 0.2)
                      : Colors.white.withValues(alpha: 0.5),
                  height: 1.5,
                ),
              ),
            ),
            if (isCurrent) ...[
              const SizedBox(height: 14),
              Padding(
                padding: const EdgeInsets.only(left: 40),
                child: GestureDetector(
                  onTap: onTap,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1B2838),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFF2A475E)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(buttonIcon, size: 16, color: Colors.white),
                        const SizedBox(width: 8),
                        Text(
                          buttonLabel,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
