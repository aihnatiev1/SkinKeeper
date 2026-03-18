enum AlertCondition { above, below, changePct, bargain, sellNow, arbitrage }

enum AlertSource { steam, skinport, csfloat, dmarket, any }

class PriceAlert {
  final int id;
  final String marketHashName;
  final AlertCondition condition;
  final double threshold;
  final AlertSource source;
  final bool isActive;
  final int cooldownMinutes;
  final DateTime? lastTriggeredAt;
  final DateTime createdAt;

  const PriceAlert({
    required this.id,
    required this.marketHashName,
    required this.condition,
    required this.threshold,
    this.source = AlertSource.any,
    this.isActive = true,
    this.cooldownMinutes = 60,
    this.lastTriggeredAt,
    required this.createdAt,
  });

  factory PriceAlert.fromJson(Map<String, dynamic> json) {
    return PriceAlert(
      id: json['id'] as int,
      marketHashName: json['market_hash_name'] as String,
      condition: AlertCondition.values.firstWhere(
        (e) => e.name == json['condition'],
      ),
      threshold: double.parse(json['threshold'].toString()),
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

  Map<String, dynamic> toCreateJson() => {
        'market_hash_name': marketHashName,
        'condition': condition.name,
        'threshold': threshold,
        'source': source.name,
        'cooldown_minutes': cooldownMinutes,
      };
}

class AlertHistoryItem {
  final int id;
  final int alertId;
  final String marketHashName;
  final String condition;
  final double threshold;
  final String source;
  final double priceUsd;
  final String message;
  final DateTime sentAt;

  const AlertHistoryItem({
    required this.id,
    required this.alertId,
    required this.marketHashName,
    required this.condition,
    required this.threshold,
    required this.source,
    required this.priceUsd,
    required this.message,
    required this.sentAt,
  });

  factory AlertHistoryItem.fromJson(Map<String, dynamic> json) {
    return AlertHistoryItem(
      id: json['id'] as int,
      alertId: json['alert_id'] as int,
      marketHashName: json['market_hash_name'] as String,
      condition: json['condition'] as String,
      threshold: double.parse(json['threshold'].toString()),
      source: json['source'] as String,
      priceUsd: (json['price_usd'] as num).toDouble(),
      message: json['message'] as String,
      sentAt: DateTime.parse(json['sent_at'] as String),
    );
  }
}
