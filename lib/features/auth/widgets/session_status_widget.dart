import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../session_provider.dart';

class SessionStatusWidget extends ConsumerWidget {
  const SessionStatusWidget({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusAsync = ref.watch(sessionStatusProvider);

    return GestureDetector(
      onTap: () => context.push('/session'),
      child: statusAsync.when(
        data: (status) => _buildIndicator(context, status),
        loading: () => _buildIndicator(context, 'loading'),
        error: (_, _) => _buildIndicator(context, 'none'),
      ),
    );
  }

  Widget _buildIndicator(BuildContext context, String status) {
    final (IconData icon, Color color, String label) = switch (status) {
      'valid' => (Icons.check_circle, const Color(0xFF00E676), 'Active'),
      'expiring' => (Icons.warning_rounded, const Color(0xFFFFAB00), 'Expiring'),
      'expired' => (Icons.error_rounded, const Color(0xFFFF5252), 'Expired'),
      'loading' => (Icons.sync, Colors.white38, '...'),
      _ => (Icons.help_outline, Colors.white38, 'No Session'),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      margin: const EdgeInsets.only(right: 8),
      decoration: BoxDecoration(
        color: color.withAlpha(25),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withAlpha(60), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
