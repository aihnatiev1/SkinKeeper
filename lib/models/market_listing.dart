import '../core/steam_image.dart';

class MarketListing {
  final String listingId;
  final String? assetId;
  final String? marketHashName;
  final String? name;
  final String? iconUrl;
  final int sellerPriceCents;
  final int buyerPriceCents;
  final int currencyId;
  final DateTime createdAt;
  /// 'active' | 'to_confirm' | 'on_hold'
  final String state;
  final int? accountId;
  final String? accountName;

  const MarketListing({
    required this.listingId,
    this.assetId,
    this.marketHashName,
    this.name,
    this.iconUrl,
    required this.sellerPriceCents,
    required this.buyerPriceCents,
    required this.currencyId,
    required this.createdAt,
    this.state = 'active',
    this.accountId,
    this.accountName,
  });

  bool get needsConfirmation => state == 'to_confirm';
  bool get isOnHold => state == 'on_hold';

  factory MarketListing.fromJson(Map<String, dynamic> json) {
    return MarketListing(
      listingId: json['listingId'].toString(),
      assetId: json['assetId']?.toString(),
      marketHashName: json['marketHashName'] as String?,
      name: json['name'] as String?,
      iconUrl: json['iconUrl'] as String?,
      sellerPriceCents: _parseInt(json['sellerPrice']),
      buyerPriceCents: _parseInt(json['buyerPrice']),
      currencyId: _parseInt(json['currencyId'], fallback: 1),
      createdAt: json['timeCreated'] != null
          ? DateTime.fromMillisecondsSinceEpoch(_parseInt(json['timeCreated']) * 1000)
          : DateTime.now(),
      state: json['state'] as String? ?? 'active',
      accountId: (json['accountId'] as num?)?.toInt(),
      accountName: json['accountName']?.toString(),
    );
  }

  static int _parseInt(dynamic v, {int fallback = 0}) {
    if (v == null) return fallback;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString()) ?? fallback;
  }

  String get displayName =>
      (name != null && name!.isNotEmpty) ? name! : (marketHashName ?? 'Unknown Item');

  String get fullIconUrl => SteamImage.url(iconUrl ?? '', size: '360fx360f');
}
