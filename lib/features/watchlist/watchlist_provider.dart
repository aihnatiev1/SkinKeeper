import 'dart:developer' as dev;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/steam_image.dart';

class WatchlistItem {
  final int id;
  final String marketHashName;
  final int targetPriceCents;
  final int? currentPriceCents;
  final String source;
  final String? iconUrl;
  final bool isActive;

  WatchlistItem({
    required this.id,
    required this.marketHashName,
    required this.targetPriceCents,
    this.currentPriceCents,
    required this.source,
    this.iconUrl,
    required this.isActive,
  });

  String get displayName {
    final parts = marketHashName.split(' | ');
    return parts.length > 1 ? parts[1].split(' (').first : marketHashName;
  }

  String get weaponName => marketHashName.split(' | ').first;

  String? get imageUrl => iconUrl != null && iconUrl!.isNotEmpty
      ? SteamImage.url(iconUrl!, size: '128fx128f')
      : null;

  bool get isBelowTarget =>
      currentPriceCents != null && currentPriceCents! <= targetPriceCents;

  /// Distance from current to target as a percentage (unchanged semantics,
  /// int arithmetic avoids float drift on the difference).
  double? get distancePct =>
      currentPriceCents != null && currentPriceCents! > 0
          ? ((currentPriceCents! - targetPriceCents) / currentPriceCents!) * 100
          : null;

  factory WatchlistItem.fromJson(Map<String, dynamic> json) => WatchlistItem(
        id: json['id'] as int,
        marketHashName: json['market_hash_name'] as String,
        targetPriceCents: _cents(json['threshold']),
        currentPriceCents: json['current_price'] == null
            ? null
            : _cents(json['current_price']),
        source: json['source'] as String? ?? 'any',
        iconUrl: json['icon_url'] as String?,
        isActive: json['is_active'] as bool? ?? true,
      );

  static int _cents(Object? raw) =>
      ((raw as num).toDouble() * 100).round();
}

class WatchlistNotifier extends AsyncNotifier<List<WatchlistItem>> {
  @override
  Future<List<WatchlistItem>> build() async {
    final api = ref.read(apiClientProvider);
    try {
      final resp = await api.get('/alerts/watchlist');
      final list = resp.data['items'] as List<dynamic>;
      return list
          .map((e) => WatchlistItem.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      dev.log('Failed to fetch watchlist: $e', name: 'Watchlist');
      return [];
    }
  }

  Future<void> add(String marketHashName, int targetPriceCents,
      {String? source, String? iconUrl}) async {
    final api = ref.read(apiClientProvider);
    final data = <String, dynamic>{
      'marketHashName': marketHashName,
      // Backend API still expects USD doubles; convert at the boundary.
      'targetPrice': targetPriceCents / 100,
    };
    if (source != null) data['source'] = source;
    if (iconUrl != null) data['iconUrl'] = iconUrl;
    await api.post('/alerts/watchlist', data: data);
    ref.invalidateSelf();
  }

  Future<void> remove(int id) async {
    // Optimistic removal
    state = AsyncData(
      (state.valueOrNull ?? []).where((i) => i.id != id).toList(),
    );
    try {
      final api = ref.read(apiClientProvider);
      await api.delete('/alerts/watchlist/$id');
    } catch (e) {
      ref.invalidateSelf();
    }
  }
}

final watchlistProvider =
    AsyncNotifierProvider<WatchlistNotifier, List<WatchlistItem>>(
        WatchlistNotifier.new);

// Item search for adding to watchlist — debounced via .family cache
final itemSearchProvider =
    FutureProvider.family<List<Map<String, dynamic>>, String>(
        (ref, query) async {
  if (query.length < 2) return [];
  final api = ref.read(apiClientProvider);
  final resp =
      await api.get('/alerts/search-items', queryParameters: {'q': query});
  return (resp.data['items'] as List<dynamic>).cast<Map<String, dynamic>>();
});
