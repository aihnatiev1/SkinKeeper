import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme.dart';
import '../session_provider.dart';

class SessionStatusWidget extends ConsumerWidget {
  const SessionStatusWidget({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusAsync = ref.watch(sessionStatusProvider);

    return statusAsync.when(
      data: (sessionStatus) => _buildIndicator(context, sessionStatus),
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }

  Widget _buildIndicator(BuildContext context, SessionStatus sessionStatus) {
    final status = sessionStatus.status;
    if (status == 'valid' || status == 'loading') {
      return const SizedBox.shrink();
    }

    final name = sessionStatus.activeAccountName;
    final prefix = name != null ? '$name: ' : '';

    final (IconData icon, Color color, String label) = switch (status) {
      'expiring' => (Icons.schedule_rounded, AppTheme.warning, '${prefix}Expiring'),
      'expired' => (Icons.error_outline_rounded, AppTheme.loss, '${prefix}Expired'),
      _ => (Icons.link_off_rounded, AppTheme.textMuted, '${prefix}No Session'),
    };

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        context.push('/session');
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        margin: const EdgeInsets.only(right: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(AppTheme.r20),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    )
        .animate(onPlay: (c) => c.repeat(reverse: true))
        .fade(
          begin: 1.0,
          end: 0.6,
          duration: 2000.ms,
          curve: Curves.easeInOut,
        );
  }
}
