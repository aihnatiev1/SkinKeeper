import 'dart:developer' as dev;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/account_scope_provider.dart';
import '../../core/api_client.dart';
import '../../models/market_listing.dart';
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
  final int? selectedAccountId;

  const TradesState({
    this.offers = const [],
    this.hasMore = true,
    this.total = 0,
    this.isLoadingMore = false,
    this.selectedAccountId,
  });

  TradesState copyWith({
    List<TradeOffer>? offers,
    bool? hasMore,
    int? total,
    bool? isLoadingMore,
    Object? selectedAccountId = _sentinel,
  }) =>
      TradesState(
        offers: offers ?? this.offers,
        hasMore: hasMore ?? this.hasMore,
        total: total ?? this.total,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
        selectedAccountId: selectedAccountId == _sentinel
            ? this.selectedAccountId
            : selectedAccountId as int?,
      );
}

const _sentinel = Object();

// ---------------------------------------------------------------------------
// Trade offers list with pagination
// ---------------------------------------------------------------------------

const _pageSize = 20;

final tradesProvider =
    AutoDisposeAsyncNotifierProvider<TradesNotifier, TradesState>(
        TradesNotifier.new);

class TradesNotifier extends AutoDisposeAsyncNotifier<TradesState> {
  @override
  Future<TradesState> build() async {
    // Re-fetch when account scope changes
    final scope = ref.watch(accountScopeProvider);
    final result = await _fetchPage(0, accountId: scope);

    // Auto-sync from Steam in background
    Future.microtask(() async {
      try {
        final api = ref.read(apiClientProvider);
        await api.post('/trades/sync');
        final currentScope = ref.read(accountScopeProvider);
        final fresh = await _fetchPage(0, accountId: currentScope);
        if (state.hasValue) {
          state = AsyncData(fresh);
        }
      } catch (_) {}
    });

    return result;
  }

  Future<TradesState> _fetchPage(int offset, {int? accountId}) async {
    final api = ref.read(apiClientProvider);
    final params = <String, String>{
      'limit': _pageSize.toString(),
      'offset': offset.toString(),
    };
    if (accountId != null) params['accountId'] = accountId.toString();
    final response = await api.get('/trades', queryParameters: params);
    final data = response.data as Map<String, dynamic>;
    final list = data['offers'] as List<dynamic>;
    final offers = list
        .map((e) => TradeOffer.fromJson(e as Map<String, dynamic>))
        .toList();
    final hasMore = data['hasMore'] as bool? ?? false;
    final total = data['total'] as int? ?? offers.length;
    return TradesState(offers: offers, hasMore: hasMore, total: total, selectedAccountId: accountId);
  }

  Future<void> setAccountFilter(int? accountId) async {
    state = const AsyncLoading();
    state = AsyncData(await _fetchPage(0, accountId: accountId));
  }

  Future<void> loadMore() async {
    final current = state.valueOrNull;
    if (current == null || !current.hasMore || current.isLoadingMore) return;

    state = AsyncData(current.copyWith(isLoadingMore: true));
    try {
      final api = ref.read(apiClientProvider);
      final offset = current.offers.length;
      final params = <String, String>{
        'limit': _pageSize.toString(),
        'offset': offset.toString(),
      };
      if (current.selectedAccountId != null) {
        params['accountId'] = current.selectedAccountId.toString();
      }
      final response = await api.get('/trades', queryParameters: params);
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
    final accountId = state.valueOrNull?.selectedAccountId;
    state = const AsyncLoading();
    state = AsyncData(await _fetchPage(0, accountId: accountId));
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

// ---------------------------------------------------------------------------
// Market listings (active sell listings on Steam Market)
// ---------------------------------------------------------------------------

@immutable
class ListingsState {
  final List<MarketListing> listings;
  final int totalCount;

  const ListingsState({
    this.listings = const [],
    this.totalCount = 0,
  });
}

final listingsProvider =
    AutoDisposeAsyncNotifierProvider<ListingsNotifier, ListingsState>(
        ListingsNotifier.new);

class ListingsNotifier extends AutoDisposeAsyncNotifier<ListingsState> {
  @override
  Future<ListingsState> build() => _fetch();

  Future<ListingsState> _fetch() async {
    // ignore: avoid_print
    print('[Listings] _fetch called');
    final api = ref.read(apiClientProvider);
    late final Response response;
    try {
      response = await api.get('/market/listings');
      // ignore: avoid_print
      print('[Listings] response ${response.statusCode}');
    } catch (e) {
      // ignore: avoid_print
      print('[Listings] ERROR: $e');
      rethrow;
    }
    final data = response.data as Map<String, dynamic>;
    final list = (data['listings'] as List<dynamic>?) ?? [];
    // ignore: avoid_print
    print('[Listings] list.length=${list.length}');
    if (list.isNotEmpty) {
      // ignore: avoid_print
      print('[Listings] first item keys: ${(list.first as Map).keys.toList()}');
    }
    final listings = <MarketListing>[];
    for (int i = 0; i < list.length; i++) {
      try {
        listings.add(MarketListing.fromJson(list[i] as Map<String, dynamic>));
      } catch (e) {
        // ignore: avoid_print
        print('[Listings] fromJson error at $i: $e | data: ${list[i]}');
      }
    }
    return ListingsState(
      listings: listings,
      totalCount: data['totalCount'] as int? ?? listings.length,
    );
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_fetch);
  }

  Future<bool> cancelListing(String listingId) async {
    final api = ref.read(apiClientProvider);
    try {
      await api.delete('/market/listings/$listingId');
      // Optimistically remove from list
      final current = state.valueOrNull;
      if (current != null) {
        state = AsyncData(ListingsState(
          listings: current.listings.where((l) => l.listingId != listingId).toList(),
          totalCount: current.totalCount - 1,
        ));
      }
      return true;
    } catch (_) {
      return false;
    }
  }
}
