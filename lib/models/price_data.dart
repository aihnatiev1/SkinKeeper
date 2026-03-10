class PriceData {
  final String marketHashName;
  final String source;
  final double priceUsd;
  final DateTime recordedAt;

  const PriceData({
    required this.marketHashName,
    required this.source,
    required this.priceUsd,
    required this.recordedAt,
  });

  factory PriceData.fromJson(Map<String, dynamic> json) {
    return PriceData(
      marketHashName: json['market_hash_name'] as String,
      source: json['source'] as String,
      priceUsd: (json['price_usd'] as num).toDouble(),
      recordedAt: DateTime.parse(json['recorded_at'] as String),
    );
  }
}

class PriceSummary {
  final String marketHashName;
  final Map<String, double> currentPrices; // source -> price
  final double? change24h; // percentage
  final double? change7d;

  const PriceSummary({
    required this.marketHashName,
    required this.currentPrices,
    this.change24h,
    this.change7d,
  });

  factory PriceSummary.fromJson(Map<String, dynamic> json) {
    return PriceSummary(
      marketHashName: json['market_hash_name'] as String,
      currentPrices: (json['current_prices'] as Map<String, dynamic>).map(
        (k, v) => MapEntry(k, (v as num).toDouble()),
      ),
      change24h: (json['change_24h'] as num?)?.toDouble(),
      change7d: (json['change_7d'] as num?)?.toDouble(),
    );
  }
}
