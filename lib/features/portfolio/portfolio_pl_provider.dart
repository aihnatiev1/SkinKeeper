import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/analytics_service.dart';
import '../../core/account_scope_provider.dart';
import '../../core/api_client.dart';
import '../../models/profit_loss.dart';

/// null = "All portfolios" (no filter)
final selectedPortfolioIdProvider = StateProvider<int?>((ref) => null);

// Portfolio P/L summary (free tier)
final portfolioPLProvider =
    AsyncNotifierProvider<PortfolioPLNotifier, PortfolioPL>(
        PortfolioPLNotifier.new);

class PortfolioPLNotifier extends AsyncNotifier<PortfolioPL> {
  @override
  Future<PortfolioPL> build() {
    ref.watch(selectedPortfolioIdProvider); // re-fetch when portfolio selection changes
    ref.watch(accountScopeProvider);        // re-fetch when account scope changes
    return _fetch();
  }

  Future<PortfolioPL> _fetch({int retries = 2}) async {
    final api = ref.read(apiClientProvider);
    final portfolioId = ref.read(selectedPortfolioIdProvider);
    final accountScope = ref.read(accountScopeProvider);
    final params = <String, String>{};
    if (portfolioId != null) params['portfolioId'] = portfolioId.toString();
    if (accountScope != null) params['accountId'] = accountScope.toString();
    try {
      final res = await api.get('/portfolio/pl', queryParameters: params);
      return PortfolioPL.fromJson(res.data as Map<String, dynamic>);
    } catch (e) {
      if (retries > 0) {
        await Future.delayed(const Duration(seconds: 2));
        return _fetch(retries: retries - 1);
      }
      rethrow;
    }
  }

  Future<void> recalculate() async {
    state = const AsyncLoading();
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.post('/portfolio/pl/recalculate');
      state = AsyncData(PortfolioPL.fromJson(res.data as Map<String, dynamic>));
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    try {
      state = AsyncData(await _fetch());
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }
}

// Per-account P/L breakdown (premium)
final accountsPLProvider = FutureProvider<List<AccountPL>>((ref) async {
  final api = ref.read(apiClientProvider);
  final res = await api.get('/portfolio/pl/by-account');
  final data = res.data as Map<String, dynamic>;
  return (data['accounts'] as List<dynamic>)
      .map((e) => AccountPL.fromJson(e as Map<String, dynamic>))
      .toList();
});

// Per-item P/L state (supports progressive background loading)
class ItemsPLState {
  final List<ItemPL> items;
  final int total;
  final bool isLoadingMore;

  const ItemsPLState({
    required this.items,
    required this.total,
    this.isLoadingMore = false,
  });

  bool get hasMore => items.length < total;

  ItemsPLState copyWith({
    List<ItemPL>? items,
    int? total,
    bool? isLoadingMore,
  }) =>
      ItemsPLState(
        items: items ?? this.items,
        total: total ?? this.total,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      );
}

final itemsPLProvider =
    AsyncNotifierProvider<ItemsPLNotifier, ItemsPLState>(ItemsPLNotifier.new);

class ItemsPLNotifier extends AsyncNotifier<ItemsPLState> {
  static const _pageSize = 100;
  int _buildId = 0;

  @override
  Future<ItemsPLState> build() {
    ref.watch(selectedPortfolioIdProvider);
    ref.watch(accountScopeProvider);
    final myBuildId = ++_buildId;
    return _fetchFirst(myBuildId);
  }

  Future<ItemsPLState> _fetchFirst(int buildId) async {
    final result = await _fetchPage(0);
    final s = ItemsPLState(
      items: result.items,
      total: result.total,
      isLoadingMore: result.items.length < result.total,
    );
    if (s.hasMore) {
      _fetchRemaining(result.items, result.total, buildId);
    }
    return s;
  }

  void _fetchRemaining(List<ItemPL> loaded, int total, int buildId) async {
    var allItems = [...loaded];
    var offset = _pageSize;
    while (allItems.length < total) {
      if (_buildId != buildId) return;
      try {
        final result = await _fetchPage(offset);
        if (_buildId != buildId) return;
        if (result.items.isEmpty) break;
        allItems = [...allItems, ...result.items];
        state = AsyncData(ItemsPLState(
          items: allItems,
          total: total,
          isLoadingMore: allItems.length < total,
        ));
        offset += _pageSize;
      } catch (_) {
        break;
      }
    }
    if (_buildId == buildId) {
      state = AsyncData(ItemsPLState(
        items: allItems,
        total: total,
        isLoadingMore: false,
      ));
    }
  }

  Future<({List<ItemPL> items, int total})> _fetchPage(int offset) async {
    final api = ref.read(apiClientProvider);
    final portfolioId = ref.read(selectedPortfolioIdProvider);
    final accountScope = ref.read(accountScopeProvider);
    final params = <String, String>{
      'limit': '$_pageSize',
      'offset': '$offset',
    };
    if (portfolioId != null) params['portfolioId'] = portfolioId.toString();
    if (accountScope != null) params['accountId'] = accountScope.toString();
    final res = await api.get('/portfolio/pl/items', queryParameters: params);
    final data = res.data as Map<String, dynamic>;
    final items = (data['items'] as List<dynamic>)
        .map((e) => ItemPL.fromJson(e as Map<String, dynamic>))
        .toList();
    final total = data['total'] as int;
    return (items: items, total: total);
  }
}

// P/L history for chart (premium)
final plHistoryProvider =
    FutureProvider.family<List<PLHistoryPoint>, int>((ref, days) async {
  final accountScope = ref.watch(accountScopeProvider);
  final api = ref.read(apiClientProvider);
  final params = <String, dynamic>{'days': days};
  if (accountScope != null) params['accountId'] = accountScope;
  final res =
      await api.get('/portfolio/pl/history', queryParameters: params);
  final data = res.data as Map<String, dynamic>;
  return (data['history'] as List<dynamic>)
      .map((e) => PLHistoryPoint.fromJson(e as Map<String, dynamic>))
      .toList();
});

// Sort column enum
enum PlSortCol { recent, qty, buyPrice, currentPrice, invested, worth, pct, gain, afterFees }

// Sort state: column + direction
class PlSort {
  final PlSortCol col;
  final bool desc;
  const PlSort(this.col, {this.desc = true});
  PlSort withCol(PlSortCol c) => c == col ? PlSort(c, desc: !desc) : PlSort(c);
}

final plSortProvider = StateProvider<PlSort>((ref) => const PlSort(PlSortCol.recent));

// Active / Sold tab
enum PlTab { active, sold }
final plTabProvider = StateProvider<PlTab>((ref) => PlTab.active);

// Item P/L lookup map (for item cards)
final itemPLMapProvider = Provider<Map<String, ItemPL>>((ref) {
  final itemsPL = ref.watch(itemsPLProvider);
  return itemsPL.whenOrNull(
        data: (s) => {for (final item in s.items) item.marketHashName: item},
      ) ??
      {};
});

/// Family provider: each card watches only its own P/L, avoiding full-map rebuild.
final itemPLFamilyProvider = Provider.family<ItemPL?, String>((ref, marketHashName) {
  return ref.watch(itemPLMapProvider.select((map) => map[marketHashName]));
});

// Named portfolios CRUD
final portfoliosProvider =
    AsyncNotifierProvider<PortfoliosNotifier, List<Portfolio>>(
        PortfoliosNotifier.new);

class PortfoliosNotifier extends AsyncNotifier<List<Portfolio>> {
  @override
  Future<List<Portfolio>> build() => _fetch();

  Future<List<Portfolio>> _fetch() async {
    final api = ref.read(apiClientProvider);
    final res = await api.get('/portfolios');
    final data = res.data as Map<String, dynamic>;
    return (data['portfolios'] as List<dynamic>)
        .map((e) => Portfolio.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Portfolio> createPortfolio(String name, Color color) async {
    final api = ref.read(apiClientProvider);
    final hex = '#${color.toARGB32().toRadixString(16).substring(2).toUpperCase()}';
    final res = await api.post('/portfolios', data: {'name': name, 'color': hex});
    Analytics.portfolioCreated();
    ref.invalidateSelf();
    return Portfolio.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> updatePortfolio(int id, String name, Color color) async {
    final api = ref.read(apiClientProvider);
    final hex = '#${color.toARGB32().toRadixString(16).substring(2).toUpperCase()}';
    await api.put('/portfolios/$id', data: {'name': name, 'color': hex});
    ref.invalidateSelf();
  }

  Future<void> deletePortfolio(int id) async {
    final api = ref.read(apiClientProvider);
    await api.delete('/portfolios/$id');
    ref.invalidateSelf();
  }
}
