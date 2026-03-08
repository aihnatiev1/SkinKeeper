class InventoryItem {
  final String assetId;
  final String marketHashName;
  final String iconUrl;
  final String? wear; // Factory New, Minimal Wear, etc.
  final double? floatValue;
  final bool tradable;
  final String? rarity; // Consumer, Industrial, Mil-Spec, etc.
  final String? rarityColor;
  final Map<String, double> prices; // source -> price USD

  const InventoryItem({
    required this.assetId,
    required this.marketHashName,
    required this.iconUrl,
    this.wear,
    this.floatValue,
    this.tradable = true,
    this.rarity,
    this.rarityColor,
    this.prices = const {},
  });

  String get displayName {
    final parts = marketHashName.split(' | ');
    return parts.length > 1 ? parts[1].split(' (').first : marketHashName;
  }

  String get weaponName {
    return marketHashName.split(' | ').first;
  }

  double? get steamPrice => prices['steam'];
  double? get skinportPrice => prices['skinport'];
  double? get buffPrice => prices['buff'];

  double? get bestPrice {
    if (prices.isEmpty) return null;
    return prices.values.reduce((a, b) => a < b ? a : b);
  }

  String? get bestPriceSource {
    if (prices.isEmpty) return null;
    return prices.entries.reduce((a, b) => a.value < b.value ? a : b).key;
  }

  double? get csfloatPrice => prices['csfloat'];
  double? get dmarketPrice => prices['dmarket'];

  String get fullIconUrl =>
      'https://community.steamstatic.com/economy/image/$iconUrl';

  factory InventoryItem.fromJson(Map<String, dynamic> json) {
    return InventoryItem(
      assetId: json['asset_id'] as String,
      marketHashName: json['market_hash_name'] as String,
      iconUrl: json['icon_url'] as String,
      wear: json['wear'] as String?,
      floatValue: (json['float_value'] as num?)?.toDouble(),
      tradable: json['tradable'] as bool? ?? true,
      rarity: json['rarity'] as String?,
      rarityColor: json['rarity_color'] as String?,
      prices: (json['prices'] as Map<String, dynamic>?)?.map(
            (k, v) => MapEntry(k, (v as num).toDouble()),
          ) ??
          {},
    );
  }
}
