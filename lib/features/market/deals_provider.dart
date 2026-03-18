import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/steam_image.dart';

class Deal {
  final String marketHashName;
  final String buySource;
  final double buyPrice;
  final double sellPrice;
  final double profitUsd;
  final double profitPct;
  final String? iconUrl;

  Deal({
    required this.marketHashName,
    required this.buySource,
    required this.buyPrice,
    required this.sellPrice,
    required this.profitUsd,
    required this.profitPct,
    this.iconUrl,
  });

  /// Short display name: "Asiimov" from "AWP | Asiimov (Field-Tested)"
  String get displayName {
    final parts = marketHashName.split(' | ');
    return parts.length > 1 ? parts[1].split(' (').first : marketHashName;
  }

  /// Weapon prefix: "AWP" from "AWP | Asiimov (Field-Tested)"
  String get weaponName => marketHashName.split(' | ').first;

  /// Wear condition extracted from parentheses, e.g. "Field-Tested"
  String? get wear {
    final match = RegExp(r'\(([^)]+)\)$').firstMatch(marketHashName);
    return match?.group(1);
  }

  String? get imageUrl => iconUrl != null && iconUrl!.isNotEmpty
      ? SteamImage.url(iconUrl!, size: '128fx128f')
      : null;

  factory Deal.fromJson(Map<String, dynamic> json) => Deal(
        marketHashName: json['marketHashName'] as String,
        buySource: json['buySource'] as String,
        buyPrice: (json['buyPrice'] as num).toDouble(),
        sellPrice: (json['sellPrice'] as num).toDouble(),
        profitUsd: (json['profitUsd'] as num).toDouble(),
        profitPct: (json['profitPct'] as num).toDouble(),
        iconUrl: json['iconUrl'] as String?,
      );
}

final dealsProvider = FutureProvider.autoDispose<List<Deal>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get(
    '/market/deals',
    queryParameters: {'limit': 50, 'minProfit': 5},
  );
  final data = response.data as Map<String, dynamic>;
  final list = data['deals'] as List<dynamic>;
  return list
      .map((e) => Deal.fromJson(e as Map<String, dynamic>))
      .toList();
});
