/// Auto-sell rule (premium feature, P4 UI / P3 backend).
///
/// Mirrors the row shape returned by `GET /api/auto-sell/rules` and `POST
/// /api/auto-sell/rules` — see `backend/src/routes/autoSell.ts`. We hand-roll
/// the JSON parser because the project doesn't pull in `freezed` / `retrofit`
/// (CLAUDE.md tech stack lists them but they're not actually wired — every
/// existing model in `lib/models/` is plain Dart with `factory fromJson`).
library;

/// Direction of the price comparison: `above` fires when the market price
/// climbs above [AutoSellRule.triggerPriceUsd]; `below` fires on dips.
enum AutoSellTriggerType { above, below }

/// How the listing price is computed once a rule fires.
///
/// - [fixed]: list at [AutoSellRule.sellPriceUsd] verbatim.
/// - [marketMax]: 1 % undercut of current market (P3 MVP — see P3-PLAN §2.3).
/// - [percentOfMarket]: list at `currentPrice * sellPriceUsd / 100`. The
///   backend stores the percent in `sell_price_usd`; UI clamps it 50-99.
enum AutoSellStrategy { fixed, marketMax, percentOfMarket }

/// What happens when a rule's trigger condition is met.
///
/// Default is [notifyOnly] per P3-PLAN decision §2 — opt-in to [autoList]
/// surfaces a confirmation modal that explains the 60-second cancel window.
enum AutoSellMode { notifyOnly, autoList }

/// String mappings — kept symmetric with the backend Zod enums so we don't
/// need a separate adapter layer. `wireValue` is what we POST/PATCH.
extension AutoSellTriggerTypeWire on AutoSellTriggerType {
  String get wireValue => switch (this) {
        AutoSellTriggerType.above => 'above',
        AutoSellTriggerType.below => 'below',
      };

  static AutoSellTriggerType fromWire(String s) => switch (s) {
        'above' => AutoSellTriggerType.above,
        'below' => AutoSellTriggerType.below,
        _ => AutoSellTriggerType.above,
      };
}

extension AutoSellStrategyWire on AutoSellStrategy {
  String get wireValue => switch (this) {
        AutoSellStrategy.fixed => 'fixed',
        AutoSellStrategy.marketMax => 'market_max',
        AutoSellStrategy.percentOfMarket => 'percent_of_market',
      };

  static AutoSellStrategy fromWire(String s) => switch (s) {
        'fixed' => AutoSellStrategy.fixed,
        'market_max' => AutoSellStrategy.marketMax,
        'percent_of_market' => AutoSellStrategy.percentOfMarket,
        _ => AutoSellStrategy.fixed,
      };
}

extension AutoSellModeWire on AutoSellMode {
  String get wireValue => switch (this) {
        AutoSellMode.notifyOnly => 'notify_only',
        AutoSellMode.autoList => 'auto_list',
      };

  static AutoSellMode fromWire(String s) => switch (s) {
        'notify_only' => AutoSellMode.notifyOnly,
        'auto_list' => AutoSellMode.autoList,
        _ => AutoSellMode.notifyOnly,
      };
}

/// User-defined auto-sell rule. The user owns at most 10 active rules
/// (premium limit, P3-PLAN §2.5).
class AutoSellRule {
  /// Server-issued primary key. Stable across sessions.
  final int id;

  /// Steam account this rule scopes to. Multi-account users can have
  /// different rules per linked Steam account; switching active account
  /// reveals only that account's rules.
  final int accountId;

  /// Skin name on Steam Market (e.g. `AK-47 | Redline (Field-Tested)`).
  /// Same field used as inventory key + price-history key.
  final String marketHashName;

  /// Direction of the trigger comparison.
  final AutoSellTriggerType triggerType;

  /// Threshold price in USD that the rule watches.
  final double triggerPriceUsd;

  /// For [AutoSellStrategy.fixed]: the listing price.
  /// For [AutoSellStrategy.percentOfMarket]: the percent (50-99).
  /// `null` for [AutoSellStrategy.marketMax].
  final double? sellPriceUsd;

  final AutoSellStrategy sellStrategy;
  final AutoSellMode mode;

  /// Whether the rule is currently armed. Disabled rules are kept for the
  /// user to re-enable; deleted rules become soft-deleted (`cancelled_at`)
  /// and never come back.
  final bool enabled;

  /// Rate-limit between fires for the same rule, in minutes. Default 360
  /// (6 h) per P3-PLAN. Range 15..10080 enforced server-side.
  final int cooldownMinutes;

  /// Last time the rule actually fired (null until first fire).
  final DateTime? lastFiredAt;

  /// Total fire count across the rule's lifetime.
  final int timesFired;

  final DateTime createdAt;

  const AutoSellRule({
    required this.id,
    required this.accountId,
    required this.marketHashName,
    required this.triggerType,
    required this.triggerPriceUsd,
    this.sellPriceUsd,
    required this.sellStrategy,
    required this.mode,
    required this.enabled,
    required this.cooldownMinutes,
    this.lastFiredAt,
    required this.timesFired,
    required this.createdAt,
  });

  factory AutoSellRule.fromJson(Map<String, dynamic> json) {
    return AutoSellRule(
      id: json['id'] as int,
      accountId: json['account_id'] as int,
      marketHashName: json['market_hash_name'] as String,
      triggerType: AutoSellTriggerTypeWire.fromWire(
        json['trigger_type'] as String,
      ),
      triggerPriceUsd: (json['trigger_price_usd'] as num).toDouble(),
      sellPriceUsd: (json['sell_price_usd'] as num?)?.toDouble(),
      sellStrategy: AutoSellStrategyWire.fromWire(
        json['sell_strategy'] as String,
      ),
      mode: AutoSellModeWire.fromWire(json['mode'] as String),
      enabled: json['enabled'] as bool? ?? true,
      cooldownMinutes: json['cooldown_minutes'] as int? ?? 360,
      lastFiredAt: json['last_fired_at'] != null
          ? DateTime.parse(json['last_fired_at'] as String)
          : null,
      timesFired: json['times_fired'] as int? ?? 0,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  /// Used by the rule notifier to apply optimistic toggle updates without
  /// re-fetching the whole list.
  AutoSellRule copyWith({
    bool? enabled,
    AutoSellMode? mode,
    double? triggerPriceUsd,
    double? sellPriceUsd,
    AutoSellStrategy? sellStrategy,
    int? cooldownMinutes,
  }) {
    return AutoSellRule(
      id: id,
      accountId: accountId,
      marketHashName: marketHashName,
      triggerType: triggerType,
      triggerPriceUsd: triggerPriceUsd ?? this.triggerPriceUsd,
      sellPriceUsd: sellPriceUsd ?? this.sellPriceUsd,
      sellStrategy: sellStrategy ?? this.sellStrategy,
      mode: mode ?? this.mode,
      enabled: enabled ?? this.enabled,
      cooldownMinutes: cooldownMinutes ?? this.cooldownMinutes,
      lastFiredAt: lastFiredAt,
      timesFired: timesFired,
      createdAt: createdAt,
    );
  }
}
