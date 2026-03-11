import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/cache_service.dart';
import '../../models/inventory_item.dart';
import '../auth/steam_auth_service.dart';

final inventoryProvider =
    AsyncNotifierProvider<InventoryNotifier, List<InventoryItem>>(
        InventoryNotifier.new);

enum SortOption {
  dateDesc,   // Date: newest first
  dateAsc,    // Date: oldest first
  priceDesc,  // Price: high → low
  priceAsc,   // Price: low → high
  floatAsc,   // Float: low → high
  floatDesc,  // Float: high → low
  nameAsc,    // Name A→Z (kept but not in menu)
  rarity,     // Rarity (kept but not in menu)
}

final sortOptionProvider = StateProvider<SortOption>((ref) => SortOption.priceDesc);
final searchQueryProvider = StateProvider<String>((ref) => '');
final gridColumnsProvider = StateProvider<int>((ref) => 2);
final hideNoPriceProvider = StateProvider<bool>((ref) => false);
final groupingEnabledProvider = StateProvider<bool>((ref) => true);

/// A group of identical items (same marketHashName)
class ItemGroup {
  final String marketHashName;
  final List<InventoryItem> items;

  const ItemGroup({required this.marketHashName, required this.items});

  InventoryItem get representative => items.first;
  int get count => items.length;
  bool get isGroup => items.length > 1;

  double? get steamPrice => representative.steamPrice;
  double? get bestPrice => representative.bestPrice;
  double get totalValue => (bestPrice ?? 0) * count;
}

final groupedInventoryProvider = Provider<AsyncValue<List<ItemGroup>>>((ref) {
  final filtered = ref.watch(filteredInventoryProvider);
  final grouping = ref.watch(groupingEnabledProvider);

  return filtered.whenData((items) {
    if (!grouping) {
      return items.map((i) => ItemGroup(marketHashName: i.marketHashName, items: [i])).toList();
    }

    final map = <String, List<InventoryItem>>{};
    for (final item in items) {
      map.putIfAbsent(item.marketHashName, () => []).add(item);
    }

    final groups = map.entries
        .map((e) => ItemGroup(marketHashName: e.key, items: e.value))
        .toList();

    // Preserve the same sort order (use first item's position)
    // Items are already sorted by filteredInventoryProvider
    return groups;
  });
});

final filteredInventoryProvider = Provider<AsyncValue<List<InventoryItem>>>((ref) {
  final inventory = ref.watch(inventoryProvider);
  final sort = ref.watch(sortOptionProvider);
  final query = ref.watch(searchQueryProvider).toLowerCase();
  final hideNoPrice = ref.watch(hideNoPriceProvider);

  return inventory.whenData((items) {
    var filtered = items.where((item) {
      if (hideNoPrice && item.prices.isEmpty) return false;
      if (query.isEmpty) return true;
      return item.marketHashName.toLowerCase().contains(query);
    }).toList();

    // Sort: assetId is roughly chronological (higher = newer)
    int compareAssetId(InventoryItem a, InventoryItem b) {
      final aId = int.tryParse(a.assetId) ?? 0;
      final bId = int.tryParse(b.assetId) ?? 0;
      return aId.compareTo(bId);
    }

    switch (sort) {
      case SortOption.dateDesc:
        filtered.sort((a, b) => compareAssetId(b, a)); // newest first
      case SortOption.dateAsc:
        filtered.sort((a, b) => compareAssetId(a, b)); // oldest first
      case SortOption.priceDesc:
        filtered.sort((a, b) => (b.bestPrice ?? 0).compareTo(a.bestPrice ?? 0));
      case SortOption.priceAsc:
        filtered.sort((a, b) => (a.bestPrice ?? 0).compareTo(b.bestPrice ?? 0));
      case SortOption.nameAsc:
        filtered.sort((a, b) => a.marketHashName.compareTo(b.marketHashName));
      case SortOption.rarity:
        const rarityOrder = [
          'Contraband', 'Covert', 'Classified', 'Restricted',
          'Mil-Spec Grade', 'Industrial Grade', 'Consumer Grade',
          'Distinguished', 'Exceptional', 'Superior', 'Master',
          'Base Grade',
        ];
        int rarityIdx(String? r) {
          if (r == null) return 999;
          final idx = rarityOrder.indexWhere((o) => r.contains(o));
          return idx == -1 ? 998 : idx;
        }
        filtered.sort((a, b) => rarityIdx(a.rarity).compareTo(rarityIdx(b.rarity)));
      case SortOption.floatAsc:
        filtered.sort((a, b) => (a.floatValue ?? 999).compareTo(b.floatValue ?? 999));
      case SortOption.floatDesc:
        filtered.sort((a, b) => (b.floatValue ?? -1).compareTo(a.floatValue ?? -1));
    }

    return filtered;
  });
});

class InventoryNotifier extends AsyncNotifier<List<InventoryItem>> {
  @override
  Future<List<InventoryItem>> build() async {
    // 1. Try cache first for instant display (skip if empty — means account was switched)
    final cached = CacheService.getInventory();
    if (cached != null && cached.isNotEmpty) {
      // Start background refresh (don't await)
      _refreshInBackground();
      return cached.map((j) => InventoryItem.fromJson(j)).toList();
    }

    // 2. No cache — fetch from API, fall back to error
    try {
      return await _fetchFromApi();
    } on DioException {
      // No cache and no network — show error
      rethrow;
    }
  }

  Future<void> _refreshInBackground() async {
    try {
      // Sync from Steam first, then fetch updated data from DB
      final api = ref.read(apiClientProvider);
      await api.post('/inventory/refresh', queryParameters: _accountQuery);
      final fresh = await _fetchFromApi();
      state = AsyncData(fresh);
    } catch (_) {
      // Keep showing cached data on network error
    }
  }

  int? get _activeAccountId =>
      ref.read(authStateProvider).valueOrNull?.activeAccountId;

  Map<String, dynamic> get _accountQuery {
    final id = _activeAccountId;
    return id != null ? {'accountId': '$id'} : {};
  }

  Future<List<InventoryItem>> _fetchFromApi() async {
    final api = ref.read(apiClientProvider);
    final response = await api.get('/inventory', queryParameters: _accountQuery);
    final rawItems = response.data['items'] as List<dynamic>;
    final items = rawItems
        .map((e) => InventoryItem.fromJson(e as Map<String, dynamic>))
        .toList();
    // Cache the raw JSON for next launch
    CacheService.putInventory(
      rawItems
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList(),
    );
    CacheService.lastSync = DateTime.now();
    return items;
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/inventory/refresh', queryParameters: _accountQuery);
      state = AsyncData(await _fetchFromApi());
    } on DioException {
      // Network error during refresh — try cache fallback
      final cached = CacheService.getInventory();
      if (cached != null) {
        state = AsyncData(
          cached.map((j) => InventoryItem.fromJson(j)).toList(),
        );
      } else {
        state = AsyncError('Network error — no cached data available', StackTrace.current);
      }
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }
}
