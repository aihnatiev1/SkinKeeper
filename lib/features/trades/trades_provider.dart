import 'dart:developer' as dev;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../models/trade_offer.dart';

// ---------------------------------------------------------------------------
// Paginated trades state
// ---------------------------------------------------------------------------

@immutable
class TradesState {
  final List<TradeOffer> offers;
  final bool hasMore;
  final int total;
  final bool isLoadingMore;

  const TradesState({
    this.offers = const [],
    this.hasMore = true,
    this.total = 0,
    this.isLoadingMore = false,
  });

  TradesState copyWith({
    List<TradeOffer>? offers,
    bool? hasMore,
    int? total,
    bool? isLoadingMore,
  }) =>
      TradesState(
        offers: offers ?? this.offers,
        hasMore: hasMore ?? this.hasMore,
        total: total ?? this.total,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      );
}

// ---------------------------------------------------------------------------
// Trade offers list with pagination
// ---------------------------------------------------------------------------

const _pageSize = 20;

final tradesProvider =
    AutoDisposeAsyncNotifierProvider<TradesNotifier, TradesState>(
        TradesNotifier.new);

class TradesNotifier extends AutoDisposeAsyncNotifier<TradesState> {
  @override
  Future<TradesState> build() => _fetchPage(0);

  Future<TradesState> _fetchPage(int offset) async {
    final api = ref.read(apiClientProvider);
    final response = await api.get('/trades', queryParameters: {
      'limit': _pageSize.toString(),
      'offset': offset.toString(),
    });
    final data = response.data as Map<String, dynamic>;
    final list = data['offers'] as List<dynamic>;
    final offers = list
        .map((e) => TradeOffer.fromJson(e as Map<String, dynamic>))
        .toList();
    final hasMore = data['hasMore'] as bool? ?? false;
    final total = data['total'] as int? ?? offers.length;
    return TradesState(offers: offers, hasMore: hasMore, total: total);
  }

  Future<void> loadMore() async {
    final current = state.valueOrNull;
    if (current == null || !current.hasMore || current.isLoadingMore) return;

    state = AsyncData(current.copyWith(isLoadingMore: true));
    try {
      final api = ref.read(apiClientProvider);
      final offset = current.offers.length;
      final response = await api.get('/trades', queryParameters: {
        'limit': _pageSize.toString(),
        'offset': offset.toString(),
      });
      final data = response.data as Map<String, dynamic>;
      final list = data['offers'] as List<dynamic>;
      final newOffers = list
          .map((e) => TradeOffer.fromJson(e as Map<String, dynamic>))
          .toList();
      final hasMore = data['hasMore'] as bool? ?? false;
      final total = data['total'] as int? ?? offset + newOffers.length;
      state = AsyncData(TradesState(
        offers: [...current.offers, ...newOffers],
        hasMore: hasMore,
        total: total,
      ));
    } catch (e) {
      // Restore previous state without loading flag
      state = AsyncData(current.copyWith(isLoadingMore: false));
      dev.log('Failed to load more trades: $e', name: 'Trades');
    }
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _fetchPage(0));
  }

  /// Trigger a sync from Steam, then refresh the list.
  Future<void> syncFromSteam() async {
    final api = ref.read(apiClientProvider);
    await api.post('/trades/sync');
    await refresh();
  }

  Future<void> acceptOffer(String offerId) async {
    final api = ref.read(apiClientProvider);
    await api.post('/trades/$offerId/accept');
    await refresh();
  }

  Future<void> declineOffer(String offerId) async {
    final api = ref.read(apiClientProvider);
    await api.post('/trades/$offerId/decline');
    await refresh();
  }

  Future<void> cancelOffer(String offerId) async {
    final api = ref.read(apiClientProvider);
    await api.post('/trades/$offerId/cancel');
    await refresh();
  }
}

// ---------------------------------------------------------------------------
// Single trade offer detail
// ---------------------------------------------------------------------------

final tradeDetailProvider =
    AutoDisposeFutureProvider.family<TradeOffer?, String>((ref, offerId) async {
  try {
    final api = ref.read(apiClientProvider);
    final response = await api.get('/trades/$offerId');
    return TradeOffer.fromJson(response.data as Map<String, dynamic>);
  } catch (e) {
    dev.log('Failed to load trade detail: $e', name: 'Trades');
    return null;
  }
});

// ---------------------------------------------------------------------------
// Partner inventory (for creating trades)
// ---------------------------------------------------------------------------

final partnerInventoryProvider = AutoDisposeFutureProvider.family<
    List<TradeOfferItem>, String>((ref, steamId) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get('/trades/partner-inventory/$steamId');
  final data = response.data as Map<String, dynamic>;
  final list = data['items'] as List<dynamic>;
  return list.map((e) {
    final item = e as Map<String, dynamic>;
    return TradeOfferItem(
      id: 0,
      side: 'receive',
      assetId: item['assetId'] as String,
      marketHashName: item['marketHashName'] as String?,
      iconUrl: item['iconUrl'] as String?,
    );
  }).toList();
});

// ---------------------------------------------------------------------------
// Steam friends list (for creating trades)
// ---------------------------------------------------------------------------

class SteamFriend {
  final String steamId;
  final String personaName;
  final String avatarUrl;
  final String profileUrl;
  final String onlineStatus;

  const SteamFriend({
    required this.steamId,
    required this.personaName,
    required this.avatarUrl,
    required this.profileUrl,
    required this.onlineStatus,
  });

  bool get isOnline => onlineStatus != 'offline';
  bool get isLookingToTrade => onlineStatus == 'looking_to_trade';

  factory SteamFriend.fromJson(Map<String, dynamic> json) {
    return SteamFriend(
      steamId: json['steamId'].toString(),
      personaName: json['personaName'].toString(),
      avatarUrl: json['avatarUrl'].toString(),
      profileUrl: json['profileUrl']?.toString() ?? '',
      onlineStatus: json['onlineStatus']?.toString() ?? 'offline',
    );
  }
}

final steamFriendsProvider =
    AutoDisposeFutureProvider<List<SteamFriend>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get('/trades/friends');
  final data = response.data as Map<String, dynamic>;
  final list = data['friends'] as List<dynamic>;
  return list
      .map((e) => SteamFriend.fromJson(e as Map<String, dynamic>))
      .toList();
});

// ---------------------------------------------------------------------------
// Send trade offer
// ---------------------------------------------------------------------------

Future<void> sendTradeOffer(
  ApiClient api, {
  required String partnerSteamId,
  String? tradeToken,
  required List<Map<String, dynamic>> itemsToGive,
  required List<Map<String, dynamic>> itemsToReceive,
  String? message,
}) async {
  final data = <String, dynamic>{
    'partnerSteamId': partnerSteamId,
    'itemsToGive': itemsToGive,
    'itemsToReceive': itemsToReceive,
  };
  if (tradeToken != null) data['tradeToken'] = tradeToken;
  if (message != null) data['message'] = message;
  await api.post('/trades/send', data: data);
}

// ---------------------------------------------------------------------------
// User's linked accounts (for quick transfer)
// ---------------------------------------------------------------------------

class LinkedAccount {
  final int id;
  final String steamId;
  final String? displayName;
  final String? avatarUrl;
  final bool hasTradeToken;

  const LinkedAccount({
    required this.id,
    required this.steamId,
    this.displayName,
    this.avatarUrl,
    this.hasTradeToken = false,
  });

  factory LinkedAccount.fromJson(Map<String, dynamic> json) {
    return LinkedAccount(
      id: json['id'] as int,
      steamId: json['steam_id'] as String,
      displayName: json['display_name'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      hasTradeToken: json['has_trade_token'] as bool? ?? false,
    );
  }
}

final linkedAccountsProvider =
    AutoDisposeFutureProvider<List<LinkedAccount>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get('/trades/accounts');
  final data = response.data as Map<String, dynamic>;
  final list = data['accounts'] as List<dynamic>;
  return list
      .map((e) => LinkedAccount.fromJson(e as Map<String, dynamic>))
      .toList();
});
