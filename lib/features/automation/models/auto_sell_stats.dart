/// Aggregate stats for the auto-sell dashboard. Mirrors the response shape
/// of `GET /api/auto-sell/stats?days=N` (see `backend/src/routes/autoSell.ts`).
///
/// Hand-rolled JSON parser — same convention as the rest of `lib/features/`
/// (no `freezed` wired in this codebase).
library;

class RefusalReasonStat {
  /// Raw error code from the engine (e.g. `INSUFFICIENT_INVENTORY`,
  /// `PRICE_MOVED_DURING_WINDOW`). The dashboard humanises these via
  /// `humanizeRefusalReason()` for display — keep the raw value here so the
  /// mapping table is the single source of truth and unknown codes can fall
  /// back to the raw string.
  final String reason;
  final int count;

  const RefusalReasonStat({required this.reason, required this.count});

  factory RefusalReasonStat.fromJson(Map<String, dynamic> json) =>
      RefusalReasonStat(
        reason: json['reason'] as String? ?? 'unknown',
        count: (json['count'] as num?)?.toInt() ?? 0,
      );
}

/// One row per day with at least one fire — the API does NOT pad zero-fire
/// days, so chart code must fill gaps if a continuous x-axis is required.
class DailyHistoryPoint {
  /// Date in ISO `YYYY-MM-DD` form (UTC date of the fire). Parsed as a local
  /// `DateTime` at midnight for plotting convenience — the user's timezone
  /// matters more for display than UTC alignment of the bucket boundary.
  final DateTime date;

  /// Total fires that day (any action).
  final int fires;

  /// Subset of [fires] where the listing actually went out.
  final int listed;

  /// Sum of `intended_list_price_usd` for `listed` fires that day. USD.
  final double listedValue;

  const DailyHistoryPoint({
    required this.date,
    required this.fires,
    required this.listed,
    required this.listedValue,
  });

  factory DailyHistoryPoint.fromJson(Map<String, dynamic> json) =>
      DailyHistoryPoint(
        date: DateTime.parse(json['date'] as String),
        fires: (json['fires'] as num?)?.toInt() ?? 0,
        listed: (json['listed'] as num?)?.toInt() ?? 0,
        listedValue: (json['listed_value'] as num?)?.toDouble() ?? 0,
      );
}

class AutoSellStats {
  /// Total active (non-cancelled) rules right now — NOT scoped to the
  /// period. Same number the rule-counter chip on the list screen shows.
  final int activeRules;

  /// Subset of [activeRules] where `mode = auto_list` (vs notify-only).
  /// Used for the "X of Y rules will auto-list" subtitle.
  final int autoListRules;

  // Period counters — last N days.
  final int totalFires;
  final int listedCount;
  final int cancelledCount;
  final int failedCount;
  final int notifiedCount;

  /// Sum of `intended_list_price_usd` across all `listed` fires in the
  /// period. The hero number on the dashboard.
  final double totalListedValueUsd;

  /// Avg `intended_list_price_usd - trigger_price_usd` across `listed`
  /// fires. Positive → user is listing above their trigger (good).
  final double avgPremiumOverTrigger;

  /// Top 5 refusal reasons across `failed` and `notified` (MIN-guard)
  /// outcomes. Empty if no refusals.
  final List<RefusalReasonStat> topRefusalReasons;

  /// Per-day fire count for the chart. Sparse — see [DailyHistoryPoint].
  final List<DailyHistoryPoint> history;

  /// Period (in days) the API computed over. Echoes the `?days=N` query
  /// param. Used by the UI to display "in the last N days" copy without
  /// trusting the local selection (server is source of truth).
  final int periodDays;

  const AutoSellStats({
    required this.activeRules,
    required this.autoListRules,
    required this.totalFires,
    required this.listedCount,
    required this.cancelledCount,
    required this.failedCount,
    required this.notifiedCount,
    required this.totalListedValueUsd,
    required this.avgPremiumOverTrigger,
    required this.topRefusalReasons,
    required this.history,
    required this.periodDays,
  });

  /// Empty stats — used as a fallback when the API call fails so the UI
  /// can render an "all zeros" state instead of an error page.
  factory AutoSellStats.empty(int periodDays) => AutoSellStats(
        activeRules: 0,
        autoListRules: 0,
        totalFires: 0,
        listedCount: 0,
        cancelledCount: 0,
        failedCount: 0,
        notifiedCount: 0,
        totalListedValueUsd: 0,
        avgPremiumOverTrigger: 0,
        topRefusalReasons: const [],
        history: const [],
        periodDays: periodDays,
      );

  /// Success rate — `listed / total` × 100. Returns 0 (not NaN) when there
  /// were no fires, so the UI can render "0%" gracefully without a guard.
  double get successRatePercent {
    if (totalFires == 0) return 0;
    return (listedCount / totalFires) * 100;
  }

  factory AutoSellStats.fromJson(Map<String, dynamic> json) {
    final stats = (json['stats'] as Map?)?.cast<String, dynamic>() ??
        const <String, dynamic>{};
    final rawHistory = (json['history'] as List?) ?? const <dynamic>[];
    final rawReasons = (stats['top_refusal_reasons'] as List?) ?? const <dynamic>[];

    return AutoSellStats(
      activeRules: (stats['active_rules'] as num?)?.toInt() ?? 0,
      autoListRules: (stats['auto_list_rules'] as num?)?.toInt() ?? 0,
      totalFires: (stats['total_fires'] as num?)?.toInt() ?? 0,
      listedCount: (stats['listed_count'] as num?)?.toInt() ?? 0,
      cancelledCount: (stats['cancelled_count'] as num?)?.toInt() ?? 0,
      failedCount: (stats['failed_count'] as num?)?.toInt() ?? 0,
      notifiedCount: (stats['notified_count'] as num?)?.toInt() ?? 0,
      totalListedValueUsd:
          (stats['total_listed_value_usd'] as num?)?.toDouble() ?? 0,
      avgPremiumOverTrigger:
          (stats['avg_premium_over_trigger'] as num?)?.toDouble() ?? 0,
      topRefusalReasons: rawReasons
          .map((e) => RefusalReasonStat.fromJson(e as Map<String, dynamic>))
          .toList(),
      history: rawHistory
          .map((e) => DailyHistoryPoint.fromJson(e as Map<String, dynamic>))
          .toList(),
      periodDays: (json['period_days'] as num?)?.toInt() ?? 30,
    );
  }
}

// ─── Refusal-reason humanisation ─────────────────────────────────────────

class RefusalReasonCopy {
  /// Short user-friendly title. Always set.
  final String title;

  /// Optional explanation — shown in a tooltip / expansion when the user
  /// taps for more detail. `null` for unknown codes (we don't want to
  /// invent wrong help for codes we haven't classified).
  final String? help;

  const RefusalReasonCopy({required this.title, this.help});
}

/// Maps engine error codes (the `errorMessage` column on `auto_sell_executions`)
/// to friendly UI copy. Unknown codes round-trip the raw string truncated to
/// 60 chars with no help text — better than showing nothing or claiming to
/// know what a new code means.
///
/// New engine reasons → add here AND consider whether the existing rules-
/// edit UI needs a hint for the user to fix it.
RefusalReasonCopy humanizeRefusalReason(String raw) {
  return switch (raw) {
    'INSUFFICIENT_INVENTORY' => const RefusalReasonCopy(
        title: 'Item not in inventory',
        help: "The rule fired but the item wasn't in your active account "
            'when listing.',
      ),
    'PRICE_MOVED_DURING_WINDOW' => const RefusalReasonCopy(
        title: 'Price moved during cancel window',
        help: 'Market dropped >30% between trigger and listing.',
      ),
    'PRICE_UNAVAILABLE_AT_LISTING' => const RefusalReasonCopy(
        title: 'Price unavailable',
        help: "We couldn't fetch a fresh market price when listing.",
      ),
    'INVALID_PERCENT_OUT_OF_RANGE' => const RefusalReasonCopy(
        title: 'Invalid % strategy',
        help: "Rule's percent is outside the safe 70-99 band. Edit the rule.",
      ),
    'STALE_PRICE' => const RefusalReasonCopy(
        title: 'Price data was too old',
        help: 'Market data was older than 30 minutes — fire skipped for safety.',
      ),
    'COOLDOWN_ACTIVE' => const RefusalReasonCopy(
        title: 'Cooldown active',
        help: 'The rule fired within its cooldown window — skipped.',
      ),
    'MIN_GUARD_REFUSED' => const RefusalReasonCopy(
        title: 'Below minimum threshold',
        help: 'Computed list price was below your safety floor.',
      ),
    _ => RefusalReasonCopy(
        title: raw.length > 60 ? '${raw.substring(0, 60)}…' : raw,
      ),
  };
}
