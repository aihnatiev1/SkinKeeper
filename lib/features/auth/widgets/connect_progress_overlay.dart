import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme.dart';

/// Animated 3-step progress overlay shown after successful session connect.
///
/// Steps:
/// 1. "Syncing your session..."
/// 2. "Loading inventory..."
/// 3. "You're all set!"
///
/// Each step appears with a 600ms delay after the previous.  After all steps
/// complete (~2s total), [onComplete] is called so the gate screen can pop.
class ConnectProgressOverlay extends StatefulWidget {
  final VoidCallback onComplete;

  const ConnectProgressOverlay({super.key, required this.onComplete});

  @override
  State<ConnectProgressOverlay> createState() => _ConnectProgressOverlayState();
}

class _ConnectProgressOverlayState extends State<ConnectProgressOverlay> {
  int _completedSteps = 0;
  Timer? _timer;

  static const _steps = [
    'Syncing your session...',
    'Loading inventory...',
    "You're all set!",
  ];

  @override
  void initState() {
    super.initState();
    _advanceSteps();
  }

  void _advanceSteps() {
    _timer = Timer.periodic(const Duration(milliseconds: 600), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() => _completedSteps++);
      if (_completedSteps >= _steps.length) {
        timer.cancel();
        // Small pause on the final "all set" state before popping
        Future.delayed(const Duration(milliseconds: 400), () {
          if (mounted) widget.onComplete();
        });
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppTheme.bg.withValues(alpha: 0.85),
      child: Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 32),
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
          decoration: AppTheme.glassElevated(
            color: AppTheme.bgSecondary,
            radius: AppTheme.r20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (int i = 0; i < _steps.length; i++)
                if (i <= _completedSteps)
                  _StepRow(
                    label: _steps[i],
                    isDone: i < _completedSteps,
                    isFinal: i == _steps.length - 1,
                  )
                      .animate()
                      .fadeIn(duration: 300.ms)
                      .slideY(begin: 0.15, end: 0, duration: 300.ms),
            ],
          ),
        ),
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  final String label;
  final bool isDone;
  final bool isFinal;

  const _StepRow({
    required this.label,
    required this.isDone,
    this.isFinal = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 24,
            height: 24,
            child: isDone || isFinal
                ? const Icon(
                    Icons.check_circle,
                    color: Color(0xFF00E676),
                    size: 22,
                  )
                : const CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppTheme.primary,
                  ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: isFinal ? FontWeight.w700 : FontWeight.w500,
                color: isDone || isFinal
                    ? const Color(0xFF00E676)
                    : AppTheme.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
