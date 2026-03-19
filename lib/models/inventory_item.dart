import 'dart:convert';
import 'package:flutter/material.dart';
import '../core/steam_image.dart';

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

  String get fullImageUrl => SteamImage.url(image);
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

  String get fullImageUrl => SteamImage.url(image);
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
  final int? paintIndex;
  final List<StickerInfo> stickers;
  final List<CharmInfo> charms;
  final DateTime? tradeBanUntil;
  final double? stickerValue;
  final double? fadePercentage;
  final Map<String, String>? marketplaceLinks;
  final int? accountId;
  final String? accountSteamId;
  final String? accountName;
  final String? accountAvatarUrl;

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
    this.paintIndex,
    this.stickers = const [],
    this.charms = const [],
    this.tradeBanUntil,
    this.stickerValue,
    this.fadePercentage,
    this.marketplaceLinks,
    this.accountId,
    this.accountSteamId,
    this.accountName,
    this.accountAvatarUrl,
  });

  String get displayName {
    final parts = marketHashName.split(' | ');
    return parts.length > 1 ? parts[1].split(' (').first : marketHashName;
  }

  String get weaponName {
    return marketHashName.split(' | ').first;
  }

  /// Doppler phase name based on paint_index
  String? get dopplerPhase {
    if (paintIndex == null) return null;
    return switch (paintIndex!) {
      415 => 'Ruby',
      416 => 'Sapphire',
      417 => 'Black Pearl',
      418 => 'Phase 1',
      419 => 'Phase 2',
      420 => 'Phase 3',
      421 => 'Phase 4',
      568 => 'Phase 1', // Gamma Doppler
      569 => 'Phase 2',
      570 => 'Phase 3',
      571 => 'Phase 4',
      618 => 'Emerald', // Gamma Doppler Emerald
      _ => null,
    };
  }

  Color? get dopplerColor {
    if (paintIndex == null) return null;
    return switch (paintIndex!) {
      415 => const Color(0xFFE74C3C), // Ruby
      416 => const Color(0xFF3498DB), // Sapphire
      417 => const Color(0xFF9B59B6), // Black Pearl
      418 || 568 => const Color(0xFFE67E22), // Phase 1
      419 || 569 => const Color(0xFF1ABC9C), // Phase 2
      420 || 570 => const Color(0xFF27AE60), // Phase 3
      421 || 571 => const Color(0xFF2980B9), // Phase 4
      618 => const Color(0xFF2ECC71), // Gamma Emerald
      _ => null,
    };
  }

  bool get isStatTrak => marketHashName.contains('StatTrak™');
  bool get isSouvenir => marketHashName.startsWith('Souvenir ');

  /// Whether this is a standalone sticker, patch, graffiti, music kit, etc.
  /// These items don't have meaningful float/wear/sticker data.
  bool get isNonWeapon {
    final name = marketHashName;
    return name.startsWith('Sticker |') ||
        name.startsWith('Sealed Graffiti |') ||
        name.startsWith('Graffiti |') ||
        name.startsWith('Patch |') ||
        name.startsWith('Music Kit |') ||
        name.startsWith('StatTrak™ Music Kit |') ||
        name.startsWith('Charm |') ||
        name.startsWith('Pin |') ||
        name == 'Charm Remover' ||
        name == 'Storage Unit';
  }

  /// Trade ban countdown text (e.g. "6d", "12h", "2d")
  /// Returns null if tradable or no ban date set
  String? get tradeBanText {
    if (tradable || tradeBanUntil == null) return null;
    final now = DateTime.now().toUtc();
    final diff = tradeBanUntil!.difference(now);
    if (diff.isNegative) return null;
    if (diff.inDays > 0) return '${diff.inDays}d';
    if (diff.inHours > 0) return '${diff.inHours}h';
    return '<1h';
  }

  /// Wear abbreviation: FN, MW, FT, WW, BS
  String? get wearShort {
    if (wear == null) return null;
    return switch (wear!) {
      'Factory New' => 'FN',
      'Minimal Wear' => 'MW',
      'Field-Tested' => 'FT',
      'Well-Worn' => 'WW',
      'Battle-Scarred' => 'BS',
      _ => wear,
    };
  }

  /// Wear color matching the WearBar segments
  Color? get wearColor {
    return switch (wearShort) {
      'FN' => const Color(0xFF10B981),
      'MW' => const Color(0xFF34D399),
      'FT' => const Color(0xFFF59E0B),
      'WW' => const Color(0xFFF97316),
      'BS' => const Color(0xFFEF4444),
      _ => null,
    };
  }

  bool get isDoppler =>
      marketHashName.contains('Doppler') ||
      marketHashName.contains('Gamma Doppler');

  /// Whether this is a rare/special Doppler (Ruby, Sapphire, Black Pearl, Emerald)
  bool get isRareDoppler {
    if (paintIndex == null) return false;
    return const {415, 416, 417, 618}.contains(paintIndex);
  }

  /// Whether this item has rare properties worth highlighting.
  bool get isRareItem {
    if (isNonWeapon) return false;
    return rareReason != null;
  }

  /// Human-readable reason why item is rare, or null if not rare.
  String? get rareReason {
    if (isNonWeapon) return null;
    if (isRareDoppler) return dopplerPhase; // "Ruby", "Sapphire", etc.
    if (isDoppler && dopplerPhase != null) return dopplerPhase;
    // Extreme floats
    if (floatValue != null) {
      if (floatValue! < 0.001) return 'Low Float';
      if (floatValue! > 0.999) return 'High Float';
      // Near-perfect FN
      if (floatValue! < 0.01 && wear == 'Factory New') return 'Clean FN';
    }
    // Fade — use actual percentage if available, otherwise heuristic
    if (marketHashName.contains('Fade')) {
      if (fadePercentage != null) return '${fadePercentage!.round()}% Fade';
      if (paintSeed != null && paintSeed! >= 990) return 'Full Fade';
    }
    // Case Hardened blue gem patterns (most famous seeds)
    if (marketHashName.contains('Case Hardened') && paintSeed != null) {
      if (const {661, 670, 387, 321, 955, 592, 868, 179}.contains(paintSeed)) {
        return 'Blue Gem';
      }
    }
    return null;
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
  double? get bitskinsPrice => prices['bitskins'];

  String get fullIconUrl => SteamImage.url(iconUrl, size: '360fx360f');

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
      paintIndex: paintIndex,
      stickers: stickers,
      charms: charms,
      tradeBanUntil: tradeBanUntil,
      stickerValue: stickerValue,
      fadePercentage: fadePercentage,
      marketplaceLinks: marketplaceLinks,
      accountId: accountId,
      accountSteamId: accountSteamId,
      accountName: accountName,
      accountAvatarUrl: accountAvatarUrl,
    );
  }

  factory InventoryItem.fromJson(Map<String, dynamic> json) {
    // Robust parsing for stickers/charms as they might arrive as JSON strings from the API
    List<dynamic> parseList(dynamic val) {
      if (val == null) return [];
      if (val is List) return val;
      if (val is String && val.isNotEmpty) {
        try {
          final decoded = jsonDecode(val);
          if (decoded is List) return decoded;
        } catch (_) {
          return [];
        }
      }
      return [];
    }

    return InventoryItem(
      assetId: json['asset_id'] as String,
      marketHashName: json['market_hash_name'] as String,
      iconUrl: json['icon_url'] as String,
      wear: json['wear'] as String?,
      floatValue: json['float_value'] != null
          ? double.tryParse(json['float_value'].toString())
          : null,
      tradable: json['tradable'] as bool? ?? true,
      tradeBanUntil: json['trade_ban_until'] != null
          ? DateTime.tryParse(json['trade_ban_until'] as String)
          : null,
      rarity: json['rarity'] as String?,
      rarityColor: json['rarity_color'] as String?,
      prices: (json['prices'] as Map<String, dynamic>?)?.map(
            (k, v) => MapEntry(k, (v as num).toDouble()),
          ) ??
          {},
      inspectLink: json['inspect_link'] as String?,
      paintSeed: json['paint_seed'] as int?,
      paintIndex: json['paint_index'] as int?,
      stickerValue: json['sticker_value'] != null
          ? double.tryParse(json['sticker_value'].toString())
          : null,
      fadePercentage: json['fade_percentage'] != null
          ? double.tryParse(json['fade_percentage'].toString())
          : null,
      marketplaceLinks: (json['links'] as Map<String, dynamic>?)?.map(
            (k, v) => MapEntry(k, v.toString()),
          ),
      accountId: json['account_id'] as int?,
      accountSteamId: json['account_steam_id'] as String?,
      accountName: json['account_name'] as String?,
      accountAvatarUrl: json['account_avatar_url'] as String?,
      stickers: parseList(json['stickers'])
          .map((e) => StickerInfo.fromJson(e as Map<String, dynamic>))
          .toList(),
      charms: parseList(json['charms'])
          .map((e) => CharmInfo.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
