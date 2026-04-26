import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../../../models/alert.dart';
import '../alerts_provider.dart';
import '../services/alert_snooze_service.dart';

/// Bottom sheet with three smart-alert actions: Relist (re-arm), Snooze 24h,
/// and Edit (jump to the create flow with the symbol pre-filled).
///
/// Per P3-PLAN §2.4 the platform native push actions are deferred — taps on
/// a triggered alert open this sheet instead. Backend currently has no
/// `snooze_until` column, so Snooze is a local-only disable + scheduled
/// reactivate (see [AlertSnoozeService]).
class AlertActionsSheet extends ConsumerStatefulWidget {
  const AlertActionsSheet({super.key, required this.alert});

  final PriceAlert alert;

  /// Show as a Material modal bottom sheet. Returns when the user taps an
  /// action or dismisses; the [Future] resolves with the chosen action key
  /// for callers that want to chain analytics, or `null` on dismiss.
  static Future<String?> show(BuildContext context, PriceAlert alert) {
    HapticFeedback.lightImpact();
    return showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppTheme.bgSecondary,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => AlertActionsSheet(alert: alert),
    );
  }

  @override
  ConsumerState<AlertActionsSheet> createState() => _AlertActionsSheetState();
}

class _AlertActionsSheetState extends ConsumerState<AlertActionsSheet> {
  bool _busy = false;
  String? _error;

  Future<void> _onRelist() async {
    HapticFeedback.lightImpact();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // "Relist" semantics: a triggered alert sits at `is_active=true` already
      // (we don't auto-disable on fire). The user-visible promise is "remind
      // me again next time it crosses" — done by clearing any pending snooze
      // and ensuring the alert is enabled. Cooldown then governs spacing.
      final api = ref.read(apiClientProvider);
      await api.patch('/alerts/${widget.alert.id}', data: {'is_active': true});
      await AlertSnoozeService(api).snooze(
        widget.alert.id,
        duration: Duration.zero, // clears any pending snooze immediately
      );
      ref.invalidate(alertsProvider);
      if (mounted) Navigator.of(context).pop('relist');
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Failed to re-arm — try again';
        });
      }
    }
  }

  Future<void> _onSnooze() async {
    HapticFeedback.lightImpact();
    setState(() {
      _busy = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final ok = await AlertSnoozeService(api).snooze(widget.alert.id);
    if (!mounted) return;
    if (ok) {
      ref.invalidate(alertsProvider);
      Navigator.of(context).pop('snooze');
    } else {
      setState(() {
        _busy = false;
        _error = 'Failed to snooze — try again';
      });
    }
  }

  void _onEdit() {
    HapticFeedback.lightImpact();
    // No dedicated edit screen exists yet — route to the create flow with
    // the symbol pre-filled. User can adjust threshold and resave.
    Navigator.of(context).pop('edit');
    context.push('/alerts/create', extra: widget.alert.marketHashName);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag handle for affordance
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: AppTheme.textDisabled.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(
              widget.alert.marketHashName,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 14),
            _ActionTile(
              icon: Icons.refresh_rounded,
              color: AppTheme.profit,
              label: 'Relist',
              subtitle: 'Re-arm so it fires again on the next cross',
              onTap: _busy ? null : _onRelist,
            ),
            const SizedBox(height: 8),
            _ActionTile(
              icon: Icons.snooze_rounded,
              color: AppTheme.warning,
              label: 'Snooze 24h',
              subtitle: 'Disable, then auto-enable in 24 hours',
              onTap: _busy ? null : _onSnooze,
            ),
            const SizedBox(height: 8),
            _ActionTile(
              icon: Icons.edit_outlined,
              color: AppTheme.accent,
              label: 'Edit',
              subtitle: 'Adjust threshold or source',
              onTap: _busy ? null : _onEdit,
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(
                  color: AppTheme.loss,
                  fontSize: 12,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.color,
    required this.label,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String label;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    return Opacity(
      opacity: disabled ? 0.5 : 1.0,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppTheme.r12),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.bg.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(AppTheme.r12),
              border: Border.all(
                color: color.withValues(alpha: 0.18),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(AppTheme.r10),
                  ),
                  child: Icon(icon, color: color, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.chevron_right_rounded,
                  color: AppTheme.textDisabled,
                  size: 20,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
