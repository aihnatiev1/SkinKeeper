import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
    return _fetch();
  }

  Future<PortfolioPL> _fetch() async {
    final api = ref.read(apiClientProvider);
    final portfolioId = ref.read(selectedPortfolioIdProvider);
    final params = portfolioId != null ? {'portfolioId': portfolioId.toString()} : <String, String>{};
    final res = await api.get('/portfolio/pl', queryParameters: params);
    return PortfolioPL.fromJson(res.data as Map<String, dynamic>);
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

// Per-item P/L (premium — returns 403 for free users)
final itemsPLProvider = FutureProvider<List<ItemPL>>((ref) async {
  final portfolioId = ref.watch(selectedPortfolioIdProvider);
  final api = ref.read(apiClientProvider);
  final params = portfolioId != null ? {'portfolioId': portfolioId.toString()} : <String, String>{};
  final res = await api.get('/portfolio/pl/items', queryParameters: params);
  final data = res.data as Map<String, dynamic>;
  return (data['items'] as List<dynamic>)
      .map((e) => ItemPL.fromJson(e as Map<String, dynamic>))
      .toList();
});

// P/L history for chart (premium)
final plHistoryProvider =
    FutureProvider.family<List<PLHistoryPoint>, int>((ref, days) async {
  final api = ref.read(apiClientProvider);
  final res =
      await api.get('/portfolio/pl/history', queryParameters: {'days': days});
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
        data: (items) =>
            {for (final item in items) item.marketHashName: item},
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
