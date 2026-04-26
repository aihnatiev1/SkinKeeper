import 'dart:developer' as dev;

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/api_client.dart';

/// Local-only "snooze" support for price alerts.
///
/// **Backend gap (P5 finding):** the `price_alerts` table has no `snooze_until`
/// column and the alertEngine doesn't honour one. Rather than block P5 on a
/// schema migration, we degrade gracefully:
///
///   • "Snooze 24h" disables the alert via the existing PATCH endpoint and
///     stores a wakeup timestamp in `SharedPreferences`.
///   • [reactivateExpiredSnoozes] is called from app launch — for any alert
///     whose stored wakeup has passed, we PATCH `is_active=true` and clear
///     the entry.
///
/// This is intentionally device-local. If the user uninstalls or switches
/// devices the alert stays disabled — better than silently losing a snooze
/// because the backend ate it. When backend gains a `snooze_until` field
/// (P6+), this service is replaced with a single PATCH call.
class AlertSnoozeService {
  AlertSnoozeService(this._api);

  final ApiClient _api;

  static const _prefsKey = 'alert_snooze_v1';

  /// Snooze [alertId] for [duration] (default 24h). Disables the alert
  /// server-side and records a local wakeup time. Returns true on success.
  Future<bool> snooze(
    int alertId, {
    Duration duration = const Duration(hours: 24),
  }) async {
    try {
      await _api.patch('/alerts/$alertId', data: {'is_active': false});
      final prefs = await SharedPreferences.getInstance();
      final map = _readMap(prefs);
      final wake = DateTime.now().add(duration).toUtc().toIso8601String();
      map[alertId.toString()] = wake;
      await prefs.setString(_prefsKey, _encode(map));
      return true;
    } catch (e) {
      dev.log('snooze failed for alert $alertId: $e', name: 'AlertSnooze');
      return false;
    }
  }

  /// Re-arm any alert whose snooze window has elapsed. Call once at app
  /// launch (best-effort: silent if it fails).
  Future<void> reactivateExpiredSnoozes() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final map = _readMap(prefs);
      if (map.isEmpty) return;

      final now = DateTime.now().toUtc();
      final toReactivate = <String>[];
      map.forEach((id, wakeIso) {
        final wake = DateTime.tryParse(wakeIso);
        if (wake != null && !now.isBefore(wake)) {
          toReactivate.add(id);
        }
      });
      if (toReactivate.isEmpty) return;

      for (final id in toReactivate) {
        try {
          await _api.patch('/alerts/$id', data: {'is_active': true});
          map.remove(id);
        } catch (e) {
          // Leave entry — we'll retry next launch.
          dev.log('reactivate failed for alert $id: $e', name: 'AlertSnooze');
        }
      }
      await prefs.setString(_prefsKey, _encode(map));
    } catch (e) {
      dev.log('reactivateExpiredSnoozes failed: $e', name: 'AlertSnooze');
    }
  }

  /// Returns the wakeup time for [alertId] if snoozed, else null. Used by
  /// the actions sheet to hint "Snoozed until …".
  Future<DateTime?> snoozedUntil(int alertId) async {
    final prefs = await SharedPreferences.getInstance();
    final map = _readMap(prefs);
    final raw = map[alertId.toString()];
    if (raw == null) return null;
    return DateTime.tryParse(raw);
  }

  // ── encoding helpers ───────────────────────────────────────────────────
  // Stored as a flat `id=isoTime;id=isoTime` string — simpler than JSON for
  // a tiny map and avoids pulling dart:convert for one call site.

  Map<String, String> _readMap(SharedPreferences prefs) {
    final raw = prefs.getString(_prefsKey);
    if (raw == null || raw.isEmpty) return <String, String>{};
    final out = <String, String>{};
    for (final entry in raw.split(';')) {
      if (entry.isEmpty) continue;
      final eq = entry.indexOf('=');
      if (eq < 1) continue;
      out[entry.substring(0, eq)] = entry.substring(eq + 1);
    }
    return out;
  }

  String _encode(Map<String, String> map) {
    final parts = <String>[];
    map.forEach((k, v) => parts.add('$k=$v'));
    return parts.join(';');
  }
}
