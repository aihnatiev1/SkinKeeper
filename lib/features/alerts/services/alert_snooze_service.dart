import 'dart:convert';
import 'dart:developer' as dev;

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/api_client.dart';

/// Server-side snooze for price alerts with a SharedPreferences fallback.
///
/// **Migration note (#15):** P5 ran this entirely against `SharedPreferences`
/// because the backend lacked a `snooze_until` column. Migration 036 added the
/// column and `POST /api/alerts/:id/snooze` / `unsnooze`, so the service now
/// drives the server first and only falls back to local prefs when the call
/// fails (offline, 5xx, etc.). Pending offline snoozes are replayed via
/// [replayPendingSnoozes] when the user comes back online.
///
/// Local prefs schema (versioned to allow lossless v1→v2 migration on first
/// launch):
///
/// ```
/// {
///   "v": 2,
///   "entries": {
///     "<alertId>": {
///       "wakeAtIso": "2026-04-25T18:00:00.000Z",
///       "synced": true|false,         // false ⇒ snooze never reached server
///       "hours": 24                   // only meaningful when synced=false
///     }
///   }
/// }
/// ```
///
/// `synced=true` rows are purely a "snoozed until …" hint for the UI.
/// `synced=false` rows are pending writes the next replay must flush.
class AlertSnoozeService {
  AlertSnoozeService(this._api);

  final ApiClient _api;

  static const _prefsKey = 'alert_snooze_v2';
  // P5 key — we read it once on first launch to migrate any in-flight snoozes
  // forward, then leave it alone (writing back to v2 only).
  static const _legacyPrefsKey = 'alert_snooze_v1';

  // ── Public API ─────────────────────────────────────────────────────────

  /// Snooze [alertId] for [duration] (default 24h). Tries the server first;
  /// on failure, persists a `synced=false` entry locally so [replayPendingSnoozes]
  /// can flush it later. Returns `(ok, online)` where `online=false` means
  /// "we degraded to local fallback" — the UI uses that to surface a
  /// "Snoozed offline; will sync when online" toast.
  Future<SnoozeResult> snooze(
    int alertId, {
    Duration duration = const Duration(hours: 24),
  }) async {
    final hours = _hoursFromDuration(duration);
    if (hours <= 0) {
      // Treat zero/negative as a "clear pending" no-op — keep the legacy
      // call-site (`Relist`) working, but route it through unsnooze().
      await unsnooze(alertId);
      return const SnoozeResult.online();
    }

    try {
      await _api.post('/alerts/$alertId/snooze', data: {'hours': hours});
      // Wake-time mirrored locally for "Snoozed until …" badge — server is
      // source of truth, this is just a presentation cache.
      await _writeEntry(
        alertId,
        wakeAt: DateTime.now().toUtc().add(duration),
        synced: true,
        hours: hours,
      );
      return const SnoozeResult.online();
    } catch (e) {
      dev.log(
        'snooze backend call failed (alert $alertId), falling back to local: $e',
        name: 'AlertSnooze',
      );
      await _writeEntry(
        alertId,
        wakeAt: DateTime.now().toUtc().add(duration),
        synced: false,
        hours: hours,
      );
      return const SnoozeResult.offline();
    }
  }

  /// Clear snooze for [alertId] both server-side and locally. Best-effort:
  /// always clears the local entry even if the server call fails (next
  /// replay or eval cycle will reconcile).
  Future<bool> unsnooze(int alertId) async {
    var ok = true;
    try {
      await _api.post('/alerts/$alertId/unsnooze');
    } catch (e) {
      dev.log('unsnooze failed for alert $alertId: $e', name: 'AlertSnooze');
      ok = false;
    }
    await _removeEntry(alertId);
    return ok;
  }

  /// Returns the wake time for [alertId] if currently snoozed, else null.
  /// Used by the actions sheet to render "Snoozed until …".
  Future<DateTime?> snoozedUntil(int alertId) async {
    final prefs = await SharedPreferences.getInstance();
    final entries = await _readEntries(prefs);
    final entry = entries[alertId.toString()];
    if (entry == null) return null;
    return DateTime.tryParse(entry['wakeAtIso'] as String? ?? '');
  }

  /// Walk all locally-stored entries, replay any unsynced snoozes to the
  /// server, and drop entries whose wake time has passed. Call this on app
  /// launch and on auth identity change. Best-effort — silent on failure;
  /// next launch retries.
  Future<void> replayPendingSnoozes() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await _migrateLegacyIfNeeded(prefs);

      final entries = await _readEntries(prefs);
      if (entries.isEmpty) return;

      final now = DateTime.now().toUtc();
      var dirty = false;

      for (final entry in entries.entries.toList()) {
        final id = entry.key;
        final data = entry.value;
        final wakeIso = data['wakeAtIso'] as String? ?? '';
        final wake = DateTime.tryParse(wakeIso);
        final synced = data['synced'] as bool? ?? true;
        final hours = (data['hours'] as num?)?.toInt() ?? 24;

        // Already past the wake time → engine has auto-cleared snooze server-side
        // (or will on next eval), so just drop the local hint row.
        if (wake != null && !now.isBefore(wake)) {
          entries.remove(id);
          dirty = true;
          continue;
        }

        // Pending offline snooze → flush to server. Recompute hours from the
        // remaining window so the server snooze ends at the same wall-clock
        // time the user originally intended (within ±1h granularity).
        if (!synced) {
          final remaining = wake?.difference(now);
          final replayHours = remaining == null
              ? hours
              : remaining.inHours.clamp(1, 168);
          try {
            await _api.post(
              '/alerts/$id/snooze',
              data: {'hours': replayHours},
            );
            data['synced'] = true;
            entries[id] = data;
            dirty = true;
          } catch (e) {
            // Leave entry untouched — try again next replay.
            dev.log(
              'replay snooze failed for alert $id: $e',
              name: 'AlertSnooze',
            );
          }
        }
      }

      if (dirty) await _writeEntries(prefs, entries);
    } catch (e) {
      dev.log('replayPendingSnoozes failed: $e', name: 'AlertSnooze');
    }
  }

  /// Compatibility shim: pre-036 callers said `reactivateExpiredSnoozes()`.
  /// New name is [replayPendingSnoozes]; the old one is kept so `main.dart`
  /// can be updated independently.
  Future<void> reactivateExpiredSnoozes() => replayPendingSnoozes();

  // ── Storage helpers ────────────────────────────────────────────────────

  /// Read the v2 entries map. If only v1 data exists, returns an empty map
  /// — call [_migrateLegacyIfNeeded] first if you want the legacy data.
  Future<Map<String, Map<String, dynamic>>> _readEntries(
    SharedPreferences prefs,
  ) async {
    final raw = prefs.getString(_prefsKey);
    if (raw == null || raw.isEmpty) return <String, Map<String, dynamic>>{};
    try {
      final parsed = jsonDecode(raw) as Map<String, dynamic>;
      final entries = parsed['entries'] as Map<String, dynamic>? ?? const {};
      return entries.map(
        (k, v) => MapEntry(k, Map<String, dynamic>.from(v as Map)),
      );
    } catch (e) {
      dev.log('snooze prefs corrupt, resetting: $e', name: 'AlertSnooze');
      return <String, Map<String, dynamic>>{};
    }
  }

  Future<void> _writeEntries(
    SharedPreferences prefs,
    Map<String, Map<String, dynamic>> entries,
  ) async {
    await prefs.setString(_prefsKey, jsonEncode({'v': 2, 'entries': entries}));
  }

  Future<void> _writeEntry(
    int alertId, {
    required DateTime wakeAt,
    required bool synced,
    required int hours,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final entries = await _readEntries(prefs);
    entries[alertId.toString()] = <String, dynamic>{
      'wakeAtIso': wakeAt.toUtc().toIso8601String(),
      'synced': synced,
      'hours': hours,
    };
    await _writeEntries(prefs, entries);
  }

  Future<void> _removeEntry(int alertId) async {
    final prefs = await SharedPreferences.getInstance();
    final entries = await _readEntries(prefs);
    if (entries.remove(alertId.toString()) != null) {
      await _writeEntries(prefs, entries);
    }
  }

  /// One-time migration from the P5 flat string format ("id=iso;id=iso") into
  /// the v2 JSON shape. Treats migrated entries as `synced=true` because the
  /// P5 implementation always issued a PATCH is_active=false alongside the
  /// pref write — the server already knows about them.
  Future<void> _migrateLegacyIfNeeded(SharedPreferences prefs) async {
    if (prefs.getString(_prefsKey) != null) return; // v2 already populated
    final legacy = prefs.getString(_legacyPrefsKey);
    if (legacy == null || legacy.isEmpty) return;

    final entries = <String, Map<String, dynamic>>{};
    for (final pair in legacy.split(';')) {
      if (pair.isEmpty) continue;
      final eq = pair.indexOf('=');
      if (eq < 1) continue;
      final id = pair.substring(0, eq);
      final iso = pair.substring(eq + 1);
      entries[id] = <String, dynamic>{
        'wakeAtIso': iso,
        'synced': true,
        'hours': 24,
      };
    }
    if (entries.isNotEmpty) {
      await _writeEntries(prefs, entries);
    }
    // Don't delete the legacy key — leave it as a breadcrumb in case we ever
    // need to roll back. It's a few hundred bytes max.
  }

  int _hoursFromDuration(Duration d) {
    if (d == Duration.zero) return 0;
    final h = d.inHours;
    if (h < 1) return 1;
    if (h > 168) return 168;
    return h;
  }
}

/// Result of a snooze call — discriminates "server accepted" vs "fell back
/// to local prefs". UI uses [online] to pick the toast copy.
class SnoozeResult {
  const SnoozeResult({required this.ok, required this.online});
  const SnoozeResult.online() : this(ok: true, online: true);
  const SnoozeResult.offline() : this(ok: true, online: false);
  const SnoozeResult.failed() : this(ok: false, online: false);

  final bool ok;
  final bool online;
}
