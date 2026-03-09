import 'package:flutter/material.dart';
import '../core/cache_service.dart';

/// Compact sync status indicator showing last sync time.
///
/// Displays "Just now", "5m ago", etc. with a cloud icon.
/// Turns orange when data is stale (>1 hour old) or never synced.
class SyncIndicator extends StatelessWidget {
  const SyncIndicator({super.key});

  @override
  Widget build(BuildContext context) {
    final label = CacheService.lastSyncLabel;
    final ls = CacheService.lastSync;
    final isStale =
        ls == null || DateTime.now().difference(ls).inHours >= 1;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isStale ? Icons.cloud_off : Icons.cloud_done,
            size: 14,
            color: isStale ? Colors.orangeAccent : Colors.white38,
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: isStale ? Colors.orangeAccent : Colors.white38,
            ),
          ),
        ],
      ),
    );
  }
}
