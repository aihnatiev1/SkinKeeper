import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/account_scope_provider.dart';
import '../../core/api_client.dart';
import '../../core/cache_service.dart';
import '../../models/inventory_item.dart';
import '../auth/session_provider.dart';
import '../purchases/iap_service.dart';

/// Whether the active account has a valid Steam session.
/// Used to gate sell/trade UI elements without blocking inventory display.
final hasSessionProvider = Provider<bool>((ref) {
  final status = ref.watch(sessionStatusProvider).valueOrNull;
  if (status == null) return false;
  return status.status == 'valid' || status.status == 'expiring';
});

/// Whether current inventory data is stale (e.g. Steam returned 429/503 or data > 15min old).
final inventoryStaleProvider = StateProvider<bool>((ref) => false);

final inventoryProvider =
    AsyncNotifierProvider<InventoryNotifier, List<InventoryItem>>(
        InventoryNotifier.new);

enum SortOption {
  dateDesc,       // Date: newest first
  dateAsc,        // Date: oldest first
  priceDesc,      // Price: high → low
  priceAsc,       // Price: low → high
  floatAsc,       // Float: low → high
  floatDesc,      // Float: high → low
  stickerValue,   // Sticker value: high → low
  nameAsc,        // Name A→Z (kept but not in menu)
  rarity,         // Rarity (kept but not in menu)
}

final sortOptionProvider = StateProvider<SortOption>((ref) => SortOption.priceDesc);
final searchQueryProvider = StateProvider<String>((ref) => '');
final gridColumnsProvider = StateProvider<int>((ref) => 2);
final hideNoPriceProvider = StateProvider<bool>((ref) => false);
final groupingEnabledProvider = StateProvider<bool>((ref) => true);
final tradableOnlyProvider = StateProvider<bool>((ref) => false);

// TODO: gate behind premium when IAP is ready
/// Wear filter — set of wear codes (FN, MW, FT, WW, BS). Empty = show all.
final wearFilterProvider = StateProvider<Set<String>>((ref) => {});

/// Sticker name search — empty means inactive
final stickerSearchProvider = StateProvider<String>((ref) => '');

/// Whether any advanced filter is active.
final advancedFiltersActiveProvider = Provider<bool>((ref) {
  final wears = ref.watch(wearFilterProvider);
  final stickerQuery = ref.watch(stickerSearchProvider);
  return wears.isNotEmpty || stickerQuery.isNotEmpty;
});

enum InventoryCategory { all, knives, weapons, stickers, containers }
final categoryProvider = StateProvider<InventoryCategory>((ref) => InventoryCategory.all);

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

/// All users see all price sources. Premium gate moved to specific features (alerts, etc).
final gatedInventoryProvider = Provider<AsyncValue<List<InventoryItem>>>((ref) {
  return ref.watch(filteredInventoryProvider);
});

final groupedInventoryProvider = Provider<AsyncValue<List<ItemGroup>>>((ref) {
  final filtered = ref.watch(gatedInventoryProvider);
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
  final category = ref.watch(categoryProvider);
  final query = ref.watch(searchQueryProvider).toLowerCase();
  final hideNoPrice = ref.watch(hideNoPriceProvider);
  final wearChips = ref.watch(wearFilterProvider);
  final tradableOnly = ref.watch(tradableOnlyProvider);
  final stickerQuery = ref.watch(stickerSearchProvider);

  return inventory.whenData((items) {
    var filtered = items.where((item) {
      // 1. Category Filter
      final name = item.marketHashName;
      switch (category) {
        case InventoryCategory.all:
          break;
        case InventoryCategory.knives:
          if (!name.contains('★')) return false;
          break;
        case InventoryCategory.weapons:
          // Not a knife, not a sticker, not a case
          if (name.contains('★') || name.contains('Sticker |') || name.contains('Case') || name.contains('Capsule') || item.isNonWeapon) return false;
          break;
        case InventoryCategory.stickers:
          if (!name.contains('Sticker |')) return false;
          break;
        case InventoryCategory.containers:
          if (!name.contains('Case') && !name.contains('Capsule') && !name.contains('Package')) return false;
          break;
      }

      // 2. Search & Detail Filters
      if (hideNoPrice && item.prices.isEmpty) return false;
      // Old single-wear filter removed — wearChips handles it now
      if (tradableOnly && !item.tradable) return false;

      // 3. Wear Chips Filter (advanced)
      if (wearChips.isNotEmpty) {
        final ws = item.wearShort;
        if (ws == null || !wearChips.contains(ws)) return false;
      }

      // 4. Sticker Search Filter
      if (stickerQuery.isNotEmpty) {
        final q = stickerQuery.toLowerCase();
        if (!item.stickers.any((s) => s.name.toLowerCase().contains(q))) return false;
      }

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
      case SortOption.stickerValue:
        filtered.sort((a, b) => (b.stickerValue ?? 0).compareTo(a.stickerValue ?? 0));
    }

    return filtered;
  });
});

class InventoryNotifier extends AsyncNotifier<List<InventoryItem>> {
  // Incremented on every build() — guards against stale background refreshes
  // writing old-account data to the shared CacheService after an account switch.
  int _generation = 0;

  @override
  Future<List<InventoryItem>> build() async {
    _generation++;
    // Re-build when account scope changes
    ref.watch(accountScopeProvider);

    // 1. Try cache first for instant display (skip if empty — means account was switched)
    final cached = CacheService.getInventory();
    if (cached != null && cached.isNotEmpty) {
      return cached.map((j) => InventoryItem.fromJson(j)).toList();
    }

    // 2. No cache — fetch from API (initial sync from _runInitialSync will
    //    call /inventory/refresh and then invalidate us for a re-fetch)
    try {
      return await _fetchFromApi();
    } on DioException {
      // No cache and no network — show error
      rethrow;
    }
  }

  Future<void> _refreshInBackground(int gen) async {
    try {
      // Sync from Steam first, then fetch updated data from DB
      final api = ref.read(apiClientProvider);
      await api.post('/inventory/refresh', queryParameters: _accountQuery);
      if (gen != _generation) return; // account switched while we were fetching
      final fresh = await _fetchFromApi();
      if (gen != _generation) return; // double-check after second async gap
      state = AsyncData(fresh);
    } catch (_) {
      // Keep showing cached data on network error — mark as stale
      ref.read(inventoryStaleProvider.notifier).state = true;
    }
  }

  Map<String, dynamic> get _accountQuery {
    final scope = ref.read(accountScopeProvider);
    return scope != null ? {'accountId': scope} : {};
  }

  Future<List<InventoryItem>> _fetchFromApi() async {
    final api = ref.read(apiClientProvider);
    final response = await api.get('/inventory', queryParameters: {
      ..._accountQuery,
      'limit': '5000',
    });
    final rawItems = response.data['items'] as List<dynamic>;
    final items = rawItems
        .map((e) => InventoryItem.fromJson(e as Map<String, dynamic>))
        .toList();

    // Track staleness from API response
    final stale = response.data['stale'] == true;
    ref.read(inventoryStaleProvider.notifier).state = stale;

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
      // Network error during refresh — try cache fallback, mark stale
      ref.read(inventoryStaleProvider.notifier).state = true;
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

  /// Optimistically remove sold items from local state without API call.
  /// The next refresh() will reconcile with actual server state.
  void removeAssets(Set<String> assetIds) {
    final current = state.valueOrNull;
    if (current == null || assetIds.isEmpty) return;
    state = AsyncData(current.where((i) => !assetIds.contains(i.assetId)).toList());
  }
}

class InventorySummary {
  final int count;
  final double totalValue;
  const InventorySummary({required this.count, required this.totalValue});
}

final inventorySummaryProvider = Provider<InventorySummary>((ref) {
  final items = ref.watch(filteredInventoryProvider).valueOrNull ?? [];
  final totalValue =
      items.fold<double>(0, (sum, item) => sum + (item.bestPrice ?? 0));
  return InventorySummary(count: items.length, totalValue: totalValue);
});

