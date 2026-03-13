import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/steam_image.dart';

class TransactionItem {
  final String id;
  final String type; // 'buy', 'sell', or 'trade'
  final String marketHashName;
  final int priceCents;
  final DateTime date;
  final String? tradeDirection; // 'incoming' or 'outgoing'
  final String? tradeStatus;
  final int? valueGiveCents;
  final int? valueRecvCents;
  final int? giveCount;
  final int? recvCount;
  final int? giveTotal;
  final int? recvTotal;
  final String? iconUrl;
  final int? currentPriceCents;
  final String? note;

  const TransactionItem({
    required this.id,
    required this.type,
    required this.marketHashName,
    required this.priceCents,
    required this.date,
    this.tradeDirection,
    this.tradeStatus,
    this.valueGiveCents,
    this.valueRecvCents,
    this.giveCount,
    this.recvCount,
    this.giveTotal,
    this.recvTotal,
    this.iconUrl,
    this.currentPriceCents,
    this.note,
  });

  double get priceUsd => priceCents / 100.0;
  bool get isBuy => type == 'buy';
  bool get isSell => type == 'sell';
  bool get isTrade => type == 'trade';

  String? get imageUrl =>
      iconUrl != null && iconUrl!.isNotEmpty
          ? SteamImage.url(iconUrl!, size: '128fx128f')
          : null;

  double? get currentPriceUsd =>
      currentPriceCents != null ? currentPriceCents! / 100.0 : null;

  /// P/L delta in cents (current price - transaction price)
  int? get plDeltaCents =>
      currentPriceCents != null ? currentPriceCents! - priceCents : null;

  double? get plDeltaPct =>
      currentPriceCents != null && priceCents > 0
          ? ((currentPriceCents! - priceCents) / priceCents) * 100
          : null;

  /// Trade diff in cents (positive = user gains)
  int get tradeDiffCents => (recvTotal ?? 0) - (giveTotal ?? 0);
  double get tradeDiffPct {
    final give = giveTotal ?? 0;
    if (give == 0) return recvTotal != null && recvTotal! > 0 ? 100 : 0;
    return (tradeDiffCents / give) * 100;
  }

  factory TransactionItem.fromJson(Map<String, dynamic> json) {
    return TransactionItem(
      id: json['id'] as String,
      type: json['type'] as String,
      marketHashName: json['market_hash_name'] as String,
      priceCents: (json['price'] as num?)?.toInt() ?? 0,
      date: DateTime.parse(json['date'] as String),
      tradeDirection: json['trade_direction'] as String?,
      tradeStatus: json['trade_status'] as String?,
      valueGiveCents: (json['value_give_cents'] as num?)?.toInt(),
      valueRecvCents: (json['value_recv_cents'] as num?)?.toInt(),
      giveCount: (json['give_count'] as num?)?.toInt(),
      recvCount: (json['recv_count'] as num?)?.toInt(),
      giveTotal: (json['give_total'] as num?)?.toInt(),
      recvTotal: (json['recv_total'] as num?)?.toInt(),
      iconUrl: json['icon_url'] as String?,
      currentPriceCents: (json['current_price_cents'] as num?)?.toInt(),
      note: json['note'] as String?,
    );
  }
}

class TransactionStats {
  final int totalBought;
  final int totalSold;
  final int totalTraded;
  final int spentCents;
  final int earnedCents;
  final int profitCents;
  final int tradedValueCents;

  const TransactionStats({
    required this.totalBought,
    required this.totalSold,
    required this.totalTraded,
    required this.spentCents,
    required this.earnedCents,
    required this.profitCents,
    required this.tradedValueCents,
  });

  double get spent => spentCents / 100.0;
  double get earned => earnedCents / 100.0;
  double get profit => profitCents / 100.0;
  double get tradedValue => tradedValueCents / 100.0;

  factory TransactionStats.fromJson(Map<String, dynamic> json) {
    return TransactionStats(
      totalBought: (json['totalBought'] as num?)?.toInt() ?? 0,
      totalSold: (json['totalSold'] as num?)?.toInt() ?? 0,
      totalTraded: (json['totalTraded'] as num?)?.toInt() ?? 0,
      spentCents: (json['spentCents'] as num?)?.toInt() ?? 0,
      earnedCents: (json['earnedCents'] as num?)?.toInt() ?? 0,
      profitCents: (json['profitCents'] as num?)?.toInt() ?? 0,
      tradedValueCents: (json['tradedValueCents'] as num?)?.toInt() ?? 0,
    );
  }
}

// Filters
final txTypeFilterProvider = StateProvider<String?>((ref) => null);
final txItemFilterProvider = StateProvider<String?>((ref) => null);
final txDateFromProvider = StateProvider<DateTime?>((ref) => null);
final txDateToProvider = StateProvider<DateTime?>((ref) => null);

// Transaction list with pagination
const _pageSize = 10;

final transactionsProvider =
    AsyncNotifierProvider<TransactionsNotifier, List<TransactionItem>>(
        TransactionsNotifier.new);

class TransactionsNotifier extends AsyncNotifier<List<TransactionItem>> {
  int _total = 0;
  bool _loading = false;

  bool get hasMore => (state.valueOrNull?.length ?? 0) < _total;
  bool get isLoadingMore => _loading;

  @override
  Future<List<TransactionItem>> build() async {
    final items = await _fetch(0);
    return items;
  }

  Future<List<TransactionItem>> _fetch(int offset) async {
    final api = ref.read(apiClientProvider);
    final type = ref.read(txTypeFilterProvider);
    final item = ref.read(txItemFilterProvider);
    final from = ref.read(txDateFromProvider);
    final to = ref.read(txDateToProvider);

    final params = <String, dynamic>{
      'limit': _pageSize,
      'offset': offset,
    };
    if (type != null) params['type'] = type;
    if (item != null) params['item'] = item;
    if (from != null) params['from'] = from.toIso8601String();
    if (to != null) params['to'] = to.toIso8601String();

    final response = await api.get('/transactions', queryParameters: params);
    _total = (response.data['total'] as num?)?.toInt() ?? 0;
    final list = response.data['transactions'] as List<dynamic>;
    return list
        .map((e) => TransactionItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> loadMore() async {
    if (_loading || !hasMore) return;
    final current = state.valueOrNull ?? [];
    _loading = true;
    try {
      final next = await _fetch(current.length);
      state = AsyncData([...current, ...next]);
    } catch (_) {
      // silently fail, user can scroll again
    } finally {
      _loading = false;
    }
  }

  Future<void> refresh() async {
    _total = 0;
    state = const AsyncLoading();
    try {
      state = AsyncData(await _fetch(0));
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  /// Sync transactions from Steam. Pass fullSync: true to force re-fetch all pages.
  Future<void> sync({bool fullSync = false}) async {
    state = const AsyncLoading();
    try {
      final api = ref.read(apiClientProvider);
      await api.post(
        '/transactions/sync',
        queryParameters: fullSync ? {'full': '1'} : null,
        receiveTimeout: const Duration(minutes: 5),
      );
      _total = 0;
      state = AsyncData(await _fetch(0));
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }
}

// Stats
final txStatsProvider = FutureProvider<TransactionStats>((ref) async {
  final api = ref.read(apiClientProvider);
  final from = ref.read(txDateFromProvider);
  final to = ref.read(txDateToProvider);

  final params = <String, dynamic>{};
  if (from != null) params['from'] = from.toIso8601String();
  if (to != null) params['to'] = to.toIso8601String();

  final response = await api.get('/transactions/stats', queryParameters: params);
  return TransactionStats.fromJson(response.data as Map<String, dynamic>);
});

// Available items for filter
final txItemsListProvider = FutureProvider<List<String>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get('/transactions/items');
  return (response.data['items'] as List<dynamic>).cast<String>();
});
