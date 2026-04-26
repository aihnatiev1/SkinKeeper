import 'package:flutter/material.dart';

import '../../../../core/theme.dart';

/// Shared "Continue" / primary button for tour slides — gold gradient, 52px
/// tall, full width. Matches the celebration slide's button so the user sees
/// the same affordance throughout.
class TourPrimaryButton extends StatelessWidget {
  const TourPrimaryButton({
    super.key,
    required this.label,
    required this.onTap,
  });

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

/// Secondary outline-style tour button — used for "Continue" when the slide
/// also has a primary CTA (e.g. "Try it now" on slide 3).
class TourSecondaryButton extends StatelessWidget {
  const TourSecondaryButton({
    super.key,
    required this.label,
    required this.onTap,
  });

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            color: AppTheme.surface,
            borderRadius: BorderRadius.circular(AppTheme.r16),
            border: Border.all(
              color: AppTheme.borderLight,
              width: 1,
            ),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
          ),
        ),
      ),
    );
  }
}
