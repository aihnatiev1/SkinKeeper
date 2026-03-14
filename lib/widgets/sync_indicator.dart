import 'package:flutter/material.dart';
import '../core/cache_service.dart';
import '../core/theme.dart';

class SyncIndicator extends StatefulWidget {
  final Future<void> Function()? onTap;
  const SyncIndicator({super.key, this.onTap});

  @override
  State<SyncIndicator> createState() => _SyncIndicatorState();
}

class _SyncIndicatorState extends State<SyncIndicator> {
  bool _syncing = false;

  Future<void> _handleTap() async {
    if (_syncing || widget.onTap == null) return;
    setState(() => _syncing = true);
    try {
      await widget.onTap!();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                Icon(Icons.cloud_done_rounded, color: AppTheme.profit, size: 18),
                SizedBox(width: 10),
                Text('Synced successfully'),
              ],
            ),
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error_outline, color: AppTheme.loss, size: 18),
                const SizedBox(width: 10),
                const Expanded(child: Text('Sync failed')),
              ],
            ),
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = CacheService.lastSyncLabel;
    final ls = CacheService.lastSync;
    final isStale =
        ls == null || DateTime.now().difference(ls).inHours >= 1;

    final color = _syncing
        ? AppTheme.accent
        : isStale
            ? AppTheme.warning
            : AppTheme.textDisabled;

    return GestureDetector(
      onTap: _handleTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(AppTheme.r8),
          border: Border.all(color: color.withValues(alpha: 0.12)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_syncing)
              SizedBox(
                width: 13, height: 13,
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  color: color,
                ),
              )
            else
              Icon(
                Icons.refresh_rounded,
                size: 14,
                color: color,
              ),
            const SizedBox(width: 5),
            Text(
              _syncing ? 'Syncing...' : label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
