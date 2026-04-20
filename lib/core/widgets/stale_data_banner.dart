import 'package:flutter/material.dart';

/// Banner signalling that the displayed prices may be outdated.
///
/// Trader-grade apps must surface price age explicitly — a stale value can
/// drive a losing trade. Two severities:
///   • 15–60 min → amber "might be outdated"
///   • > 60 min  → red "definitely stale, refresh recommended"
///
/// Pass [lastSync] so the message names the actual age; without it the banner
/// falls back to generic copy.
class StaleDataBanner extends StatelessWidget {
  final DateTime? lastSync;
  final VoidCallback? onRefresh;

  const StaleDataBanner({
    super.key,
    this.lastSync,
    this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final age = lastSync == null
        ? null
        : DateTime.now().difference(lastSync!);
    final severe = age != null && age.inMinutes >= 60;
    final color = severe ? Colors.red : Colors.amber;
    final message = _buildMessage(age, severe);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: color.withValues(alpha: 0.15),
      child: Row(
        children: [
          Icon(
            severe ? Icons.warning_amber_rounded : Icons.info_outline,
            size: 16,
            color: color,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 13, color: color),
            ),
          ),
          if (onRefresh != null)
            GestureDetector(
              onTap: onRefresh,
              child: Icon(Icons.refresh, size: 18, color: color),
            ),
        ],
      ),
    );
  }

  String _buildMessage(Duration? age, bool severe) {
    if (age == null) return 'Data may be outdated';
    if (severe) {
      if (age.inHours < 24) {
        return 'Prices are stale (${age.inHours}h old) — refresh recommended';
      }
      return 'Prices are stale (${age.inDays}d old) — refresh recommended';
    }
    return 'Prices may be outdated (updated ${age.inMinutes}m ago)';
  }
}
