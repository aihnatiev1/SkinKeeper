import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../models/profit_loss.dart';

// ──── MOCK FLAG ────────────────────────────────────────────────
// Set to true to show mock data for premium features demo
const _useMockData = false;
// ───────────────────────────────────────────────────────────────

// Portfolio P/L summary (free tier)
final portfolioPLProvider =
    AsyncNotifierProvider<PortfolioPLNotifier, PortfolioPL>(
        PortfolioPLNotifier.new);

class PortfolioPLNotifier extends AsyncNotifier<PortfolioPL> {
  @override
  Future<PortfolioPL> build() => _fetch();

  Future<PortfolioPL> _fetch() async {
    if (_useMockData) return _mockPL;
    final api = ref.read(apiClientProvider);
    final res = await api.get('/portfolio/pl');
    return PortfolioPL.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> recalculate() async {
    state = const AsyncLoading();
    try {
      if (_useMockData) {
        await Future.delayed(const Duration(milliseconds: 500));
        state = AsyncData(_mockPL);
        return;
      }
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
  if (_useMockData) return [];
  final api = ref.read(apiClientProvider);
  final res = await api.get('/portfolio/pl/by-account');
  final data = res.data as Map<String, dynamic>;
  return (data['accounts'] as List<dynamic>)
      .map((e) => AccountPL.fromJson(e as Map<String, dynamic>))
      .toList();
});

// Per-item P/L (premium — returns 403 for free users)
final itemsPLProvider = FutureProvider<List<ItemPL>>((ref) async {
  if (_useMockData) return _mockItems;
  final api = ref.read(apiClientProvider);
  final res = await api.get('/portfolio/pl/items');
  final data = res.data as Map<String, dynamic>;
  return (data['items'] as List<dynamic>)
      .map((e) => ItemPL.fromJson(e as Map<String, dynamic>))
      .toList();
});

// P/L history for chart (premium)
final plHistoryProvider =
    FutureProvider.family<List<PLHistoryPoint>, int>((ref, days) async {
  if (_useMockData) return _mockHistory(days);
  final api = ref.read(apiClientProvider);
  final res =
      await api.get('/portfolio/pl/history', queryParameters: {'days': days});
  final data = res.data as Map<String, dynamic>;
  return (data['history'] as List<dynamic>)
      .map((e) => PLHistoryPoint.fromJson(e as Map<String, dynamic>))
      .toList();
});

// Sort option for per-item list
enum PLSort { profitDesc, profitAsc, investedDesc, holdingDesc }

final plSortProvider = StateProvider<PLSort>((ref) => PLSort.profitDesc);

// Item P/L lookup map (for item cards)
final itemPLMapProvider = Provider<Map<String, ItemPL>>((ref) {
  final itemsPL = ref.watch(itemsPLProvider);
  return itemsPL.whenOrNull(
        data: (items) =>
            {for (final item in items) item.marketHashName: item},
      ) ??
      {};
});

// ──── MOCK DATA ────────────────────────────────────────────────

const _mockPL = PortfolioPL(
  totalInvestedCents: 652000,
  totalEarnedCents: 189500,
  realizedProfitCents: 47300,
  unrealizedProfitCents: 141200,
  totalProfitCents: 188500,
  totalProfitPct: 28.91,
  holdingCount: 47,
  totalCurrentValueCents: 794091,
);

const _mockItems = [
  ItemPL(
    marketHashName: 'AK-47 | Asiimov (Field-Tested)',
    avgBuyPriceCents: 3200,
    totalQuantityBought: 5,
    totalSpentCents: 16000,
    totalQuantitySold: 2,
    totalEarnedCents: 8400,
    currentHolding: 3,
    realizedProfitCents: 2000,
    unrealizedProfitCents: 3600,
    currentPriceCents: 4400,
    totalProfitCents: 5600,
    profitPct: 35.0,
  ),
  ItemPL(
    marketHashName: 'AWP | Dragon Lore (Battle-Scarred)',
    avgBuyPriceCents: 185000,
    totalQuantityBought: 1,
    totalSpentCents: 185000,
    totalQuantitySold: 0,
    totalEarnedCents: 0,
    currentHolding: 1,
    realizedProfitCents: 0,
    unrealizedProfitCents: 62000,
    currentPriceCents: 247000,
    totalProfitCents: 62000,
    profitPct: 33.51,
  ),
  ItemPL(
    marketHashName: 'M4A4 | Howl (Minimal Wear)',
    avgBuyPriceCents: 420000,
    totalQuantityBought: 1,
    totalSpentCents: 420000,
    totalQuantitySold: 0,
    totalEarnedCents: 0,
    currentHolding: 1,
    realizedProfitCents: 0,
    unrealizedProfitCents: 55000,
    currentPriceCents: 475000,
    totalProfitCents: 55000,
    profitPct: 13.1,
  ),
  ItemPL(
    marketHashName: 'Glock-18 | Fade (Factory New)',
    avgBuyPriceCents: 95000,
    totalQuantityBought: 2,
    totalSpentCents: 190000,
    totalQuantitySold: 1,
    totalEarnedCents: 112000,
    currentHolding: 1,
    realizedProfitCents: 17000,
    unrealizedProfitCents: 8500,
    currentPriceCents: 103500,
    totalProfitCents: 25500,
    profitPct: 13.42,
  ),
  ItemPL(
    marketHashName: 'USP-S | Kill Confirmed (Field-Tested)',
    avgBuyPriceCents: 1850,
    totalQuantityBought: 10,
    totalSpentCents: 18500,
    totalQuantitySold: 4,
    totalEarnedCents: 6200,
    currentHolding: 6,
    realizedProfitCents: -1200,
    unrealizedProfitCents: -900,
    currentPriceCents: 1700,
    totalProfitCents: -2100,
    profitPct: -11.35,
  ),
  ItemPL(
    marketHashName: 'Karambit | Doppler (Factory New)',
    avgBuyPriceCents: 135000,
    totalQuantityBought: 1,
    totalSpentCents: 135000,
    totalQuantitySold: 0,
    totalEarnedCents: 0,
    currentHolding: 1,
    realizedProfitCents: 0,
    unrealizedProfitCents: 18000,
    currentPriceCents: 153000,
    totalProfitCents: 18000,
    profitPct: 13.33,
  ),
  ItemPL(
    marketHashName: 'AK-47 | Redline (Field-Tested)',
    avgBuyPriceCents: 1100,
    totalQuantityBought: 20,
    totalSpentCents: 22000,
    totalQuantitySold: 12,
    totalEarnedCents: 15600,
    currentHolding: 8,
    realizedProfitCents: 2400,
    unrealizedProfitCents: -400,
    currentPriceCents: 1050,
    totalProfitCents: 2000,
    profitPct: 9.09,
  ),
];

List<PLHistoryPoint> _mockHistory(int days) {
  final now = DateTime.now();
  final points = <PLHistoryPoint>[];
  // Simulate gradual growth with some dips
  const baseInvested = 652000;
  var cumProfit = 120000; // start from some base

  for (var i = days; i >= 0; i--) {
    final date = now.subtract(Duration(days: i));
    // Sinusoidal variation + upward trend
    final dayFactor = (days - i) / days;
    final variation = (i % 7 - 3) * 2500; // weekly oscillation
    final trend = (dayFactor * 68000).toInt(); // upward trend
    cumProfit = 120000 + trend + variation;

    final realized = (47300 * dayFactor).toInt();
    final unrealized = cumProfit - realized;

    points.add(PLHistoryPoint(
      date: date,
      totalInvestedCents: baseInvested,
      totalCurrentValueCents: baseInvested + cumProfit,
      cumulativeProfitCents: cumProfit,
      realizedProfitCents: realized,
      unrealizedProfitCents: unrealized,
    ));
  }

  return points;
}
