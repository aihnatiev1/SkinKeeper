class StickerInfo {
  final int slot;
  final int stickerId;
  final String name;
  final double? wear;
  final String image;

  const StickerInfo({
    required this.slot,
    required this.stickerId,
    required this.name,
    this.wear,
    required this.image,
  });

  factory StickerInfo.fromJson(Map<String, dynamic> json) {
    return StickerInfo(
      slot: json['slot'] as int? ?? 0,
      stickerId: json['sticker_id'] as int? ?? 0,
      name: json['name'] as String? ?? '',
      wear: (json['wear'] as num?)?.toDouble(),
      image: json['image'] as String? ?? '',
    );
  }
}

class CharmInfo {
  final int slot;
  final int pattern;
  final String name;
  final String image;

  const CharmInfo({
    required this.slot,
    required this.pattern,
    required this.name,
    required this.image,
  });

  factory CharmInfo.fromJson(Map<String, dynamic> json) {
    return CharmInfo(
      slot: json['slot'] as int? ?? 0,
      pattern: json['pattern'] as int? ?? 0,
      name: json['name'] as String? ?? '',
      image: json['image'] as String? ?? '',
    );
  }
}

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
  final String? inspectLink;
  final int? paintSeed;
  final List<StickerInfo> stickers;
  final List<CharmInfo> charms;
  final int? accountId;
  final String? accountSteamId;
  final String? accountName;

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
    this.inspectLink,
    this.paintSeed,
    this.stickers = const [],
    this.charms = const [],
    this.accountId,
    this.accountSteamId,
    this.accountName,
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
    return prices.values.reduce((a, b) => a > b ? a : b);
  }

  String? get bestPriceSource {
    if (prices.isEmpty) return null;
    return prices.entries.reduce((a, b) => a.value > b.value ? a : b).key;
  }

  double? get csfloatPrice => prices['csfloat'];
  double? get dmarketPrice => prices['dmarket'];

  String get fullIconUrl =>
      iconUrl.isNotEmpty
          ? 'https://community.steamstatic.com/economy/image/$iconUrl/360fx360f'
          : '';

  /// Returns a copy with updated inspect data
  InventoryItem withInspectData({
    required double floatValue,
    required int paintSeed,
    required List<StickerInfo> stickers,
    required List<CharmInfo> charms,
  }) {
    return InventoryItem(
      assetId: assetId,
      marketHashName: marketHashName,
      iconUrl: iconUrl,
      wear: wear,
      floatValue: floatValue,
      tradable: tradable,
      rarity: rarity,
      rarityColor: rarityColor,
      prices: prices,
      inspectLink: inspectLink,
      paintSeed: paintSeed,
      stickers: stickers,
      charms: charms,
      accountId: accountId,
      accountSteamId: accountSteamId,
      accountName: accountName,
    );
  }

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
      inspectLink: json['inspect_link'] as String?,
      paintSeed: json['paint_seed'] as int?,
      accountId: json['account_id'] as int?,
      accountSteamId: json['account_steam_id'] as String?,
      accountName: json['account_name'] as String?,
      stickers: (json['stickers'] as List<dynamic>?)
              ?.map((e) => StickerInfo.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      charms: (json['charms'] as List<dynamic>?)
              ?.map((e) => CharmInfo.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}
