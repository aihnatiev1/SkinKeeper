enum AlertCondition { above, below, changePct, bargain, sellNow, arbitrage }

enum AlertSource { steam, skinport, csfloat, dmarket, any }

/// A price alert stored on the backend.
///
/// `threshold` is semantically polymorphic on the wire: USD for every
/// condition except [AlertCondition.changePct], where it's a raw percent.
/// This model splits it into typed fields so callers don't have to guess:
///   • [thresholdCents] — populated for money conditions; null for changePct.
///   • [thresholdPct]   — populated for changePct; null otherwise.
/// Exactly one is non-null per instance.
class PriceAlert {
  final int id;
  final String marketHashName;
  final AlertCondition condition;
  final int? thresholdCents;
  final double? thresholdPct;
  final AlertSource source;
  final bool isActive;
  final int cooldownMinutes;
  final DateTime? lastTriggeredAt;
  final DateTime createdAt;

  const PriceAlert({
    required this.id,
    required this.marketHashName,
    required this.condition,
    this.thresholdCents,
    this.thresholdPct,
    this.source = AlertSource.any,
    this.isActive = true,
    this.cooldownMinutes = 60,
    this.lastTriggeredAt,
    required this.createdAt,
  });

  factory PriceAlert.fromJson(Map<String, dynamic> json) {
    final condition = AlertCondition.values.firstWhere(
      (e) => e.name == json['condition'],
    );
    final raw = double.parse(json['threshold'].toString());
    final isPct = condition == AlertCondition.changePct;
    return PriceAlert(
      id: json['id'] as int,
      marketHashName: json['market_hash_name'] as String,
      condition: condition,
      thresholdCents: isPct ? null : (raw * 100).round(),
      thresholdPct: isPct ? raw : null,
      source: AlertSource.values.firstWhere(
        (e) => e.name == (json['source'] ?? 'any'),
        orElse: () => AlertSource.any,
      ),
      isActive: json['is_active'] as bool? ?? true,
      cooldownMinutes: json['cooldown_minutes'] as int? ?? 60,
      lastTriggeredAt: json['last_triggered_at'] != null
          ? DateTime.parse(json['last_triggered_at'] as String)
          : null,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}

class AlertHistoryItem {
  final int id;
  final int alertId;
  final String marketHashName;
  final String condition;
  final int? thresholdCents;
  final double? thresholdPct;
  final String source;
  final int priceCents;
  final String message;
  final DateTime sentAt;

  const AlertHistoryItem({
    required this.id,
    required this.alertId,
    required this.marketHashName,
    required this.condition,
    this.thresholdCents,
    this.thresholdPct,
    required this.source,
    required this.priceCents,
    required this.message,
    required this.sentAt,
  });

  factory AlertHistoryItem.fromJson(Map<String, dynamic> json) {
    final condition = json['condition'] as String;
    final raw = double.parse(json['threshold'].toString());
    final isPct = condition == 'changePct';
    return AlertHistoryItem(
      id: json['id'] as int,
      alertId: json['alert_id'] as int,
      marketHashName: json['market_hash_name'] as String,
      condition: condition,
      thresholdCents: isPct ? null : (raw * 100).round(),
      thresholdPct: isPct ? raw : null,
      source: json['source'] as String,
      priceCents: ((json['price_usd'] as num).toDouble() * 100).round(),
      message: json['message'] as String,
      sentAt: DateTime.parse(json['sent_at'] as String),
    );
  }
}
