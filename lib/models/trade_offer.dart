import '../core/steam_image.dart';

class TradeOfferItem {
  final int id;
  final String side; // 'give' | 'receive'
  final String assetId;
  final String? marketHashName;
  final String? iconUrl;
  final double? floatValue;
  final int priceCents;

  const TradeOfferItem({
    required this.id,
    required this.side,
    required this.assetId,
    this.marketHashName,
    this.iconUrl,
    this.floatValue,
    this.priceCents = 0,
  });

  String get fullIconUrl => SteamImage.url(iconUrl ?? '', size: '360fx360f');

  String get displayName {
    if (marketHashName == null) return 'Unknown Item';
    final parts = marketHashName!.split(' | ');
    return parts.length > 1 ? parts[1].split(' (').first : marketHashName!;
  }

  factory TradeOfferItem.fromJson(Map<String, dynamic> json) {
    return TradeOfferItem(
      id: (json['id'] as num?)?.toInt() ?? 0,
      side: json['side'].toString(),
      assetId: json['assetId'].toString(),
      marketHashName: json['marketHashName']?.toString(),
      iconUrl: json['iconUrl']?.toString(),
      floatValue: (json['floatValue'] as num?)?.toDouble(),
      priceCents: (json['priceCents'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Strip HTML tags from a string.
String _stripHtml(String html) {
  return html
      .replaceAll(RegExp(r'&nbsp;'), ' ')
      .replaceAll(RegExp(r'<[^>]*>'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

class TradeOffer {
  final String id;
  final String direction; // 'incoming' | 'outgoing'
  final String? steamOfferId;
  final String partnerSteamId;
  final String? partnerName;
  final String? message;
  final String status;
  final bool isQuickTransfer;
  final bool isInternal;
  final int? accountIdFrom;
  final int? accountIdTo;
  final String? accountFromName;
  final String? accountToName;
  final int valueGiveCents;
  final int valueRecvCents;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<TradeOfferItem> items;

  const TradeOffer({
    required this.id,
    required this.direction,
    this.steamOfferId,
    required this.partnerSteamId,
    this.partnerName,
    this.message,
    required this.status,
    this.isQuickTransfer = false,
    this.isInternal = false,
    this.accountIdFrom,
    this.accountIdTo,
    this.accountFromName,
    this.accountToName,
    this.valueGiveCents = 0,
    this.valueRecvCents = 0,
    required this.createdAt,
    required this.updatedAt,
    this.items = const [],
  });

  bool get isIncoming => direction == 'incoming';

  /// Display name of our account for external trades. Null for internal trades (show both).
  String? get ownerAccountName {
    if (isInternal) return null;
    return accountFromName ?? accountToName;
  }
  bool get isPending => status == 'pending' || status == 'awaiting_confirmation' || status == 'on_hold';

  List<TradeOfferItem> get giveItems =>
      items.where((i) => i.side == 'give').toList();
  List<TradeOfferItem> get receiveItems =>
      items.where((i) => i.side == 'receive').toList();

  /// Value difference from user's perspective. Negative = losing value.
  int get valueDiffCents => valueRecvCents - valueGiveCents;

  /// Profit/loss percentage relative to what you're giving.
  double get valueDiffPct =>
      valueGiveCents > 0 ? (valueDiffCents / valueGiveCents) * 100 : 0;

  factory TradeOffer.fromJson(Map<String, dynamic> json) {
    return TradeOffer(
      id: json['id'].toString(),
      direction: json['direction'].toString(),
      steamOfferId: json['steamOfferId']?.toString(),
      partnerSteamId: json['partnerSteamId'].toString(),
      partnerName: json['partnerName']?.toString(),
      message: json['message'] != null ? _stripHtml(json['message'].toString()) : null,
      status: json['status'].toString(),
      isQuickTransfer: json['isQuickTransfer'] as bool? ?? false,
      isInternal: json['isInternal'] as bool? ?? false,
      accountIdFrom: (json['accountIdFrom'] as num?)?.toInt(),
      accountIdTo: (json['accountIdTo'] as num?)?.toInt(),
      accountFromName: json['accountFromName']?.toString(),
      accountToName: json['accountToName']?.toString(),
      valueGiveCents: (json['valueGiveCents'] as num?)?.toInt() ?? 0,
      valueRecvCents: (json['valueRecvCents'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.parse(json['createdAt'].toString()),
      updatedAt: DateTime.parse(json['updatedAt'].toString()),
      items: (json['items'] as List<dynamic>?)
              ?.map((e) => TradeOfferItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}
