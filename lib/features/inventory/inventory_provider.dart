import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/cache_service.dart';
import '../../models/inventory_item.dart';

final inventoryProvider =
    AsyncNotifierProvider<InventoryNotifier, List<InventoryItem>>(
        InventoryNotifier.new);

enum SortOption { priceDesc, priceAsc, nameAsc, rarity }

final sortOptionProvider = StateProvider<SortOption>((ref) => SortOption.priceDesc);
final searchQueryProvider = StateProvider<String>((ref) => '');
final gridColumnsProvider = StateProvider<int>((ref) => 2);
final hideNoPriceProvider = StateProvider<bool>((ref) => true);

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

    switch (sort) {
      case SortOption.priceDesc:
        filtered.sort((a, b) => (b.bestPrice ?? 0).compareTo(a.bestPrice ?? 0));
      case SortOption.priceAsc:
        filtered.sort((a, b) => (a.bestPrice ?? 0).compareTo(b.bestPrice ?? 0));
      case SortOption.nameAsc:
        filtered.sort((a, b) => a.marketHashName.compareTo(b.marketHashName));
      case SortOption.rarity:
        filtered.sort((a, b) => (b.rarity ?? '').compareTo(a.rarity ?? ''));
    }

    return filtered;
  });
});

class InventoryNotifier extends AsyncNotifier<List<InventoryItem>> {
  @override
  Future<List<InventoryItem>> build() async {
    // 1. Try cache first for instant display
    final cached = CacheService.getInventory();
    if (cached != null) {
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
      final fresh = await _fetchFromApi();
      state = AsyncData(fresh);
    } catch (_) {
      // Keep showing cached data on network error
    }
  }

  Future<List<InventoryItem>> _fetchFromApi() async {
    final api = ref.read(apiClientProvider);
    final response = await api.get('/inventory');
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
      await api.post('/inventory/refresh');
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
