import 'dart:async';
import 'dart:developer' as dev;
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/analytics_service.dart';
import '../../core/api_client.dart';
import '../../core/steam_image.dart';

// ---------------------------------------------------------------------------
// Fee calculation (pure Dart, mirrors backend logic)
// ---------------------------------------------------------------------------

class FeeBreakdownData {
  final int buyerPaysCents;
  final int steamFeeCents;
  final int cs2FeeCents;
  final int sellerReceivesCents;

  const FeeBreakdownData({
    required this.buyerPaysCents,
    required this.steamFeeCents,
    required this.cs2FeeCents,
    required this.sellerReceivesCents,
  });
}

/// Given the amount the seller wants to receive, calculate what the buyer
/// must pay and the individual fee components.
///
/// Steam fee: max(1, floor(buyerPays * 0.05))
/// CS2 fee:   max(1, floor(buyerPays * 0.10))
/// Seller receives: buyerPays - steamFee - cs2Fee
FeeBreakdownData calculateFees(int sellerReceivesCents) {
  if (sellerReceivesCents <= 0) {
    return const FeeBreakdownData(
      buyerPaysCents: 0,
      steamFeeCents: 0,
      cs2FeeCents: 0,
      sellerReceivesCents: 0,
    );
  }

  // Reverse-engineer buyer pays from seller receives.
  // sellerReceives = buyerPays - floor(buyerPays*0.05).max(1) - floor(buyerPays*0.10).max(1)
  // Approximate: sellerReceives ≈ buyerPays * 0.8696
  int buyerPays = (sellerReceivesCents / 0.8696).ceil();

  // Verify and adjust if needed
  for (int attempt = 0; attempt < 10; attempt++) {
    final steamFee = math.max(1, (buyerPays * 0.05).floor());
    final cs2Fee = math.max(1, (buyerPays * 0.10).floor());
    final computed = buyerPays - steamFee - cs2Fee;
    if (computed >= sellerReceivesCents) {
      // Try one less to see if it still works
      final steamFeeLower = math.max(1, ((buyerPays - 1) * 0.05).floor());
      final cs2FeeLower = math.max(1, ((buyerPays - 1) * 0.10).floor());
      final computedLower = (buyerPays - 1) - steamFeeLower - cs2FeeLower;
      if (computedLower >= sellerReceivesCents) {
        buyerPays--;
        continue;
      }
      return FeeBreakdownData(
        buyerPaysCents: buyerPays,
        steamFeeCents: steamFee,
        cs2FeeCents: cs2Fee,
        sellerReceivesCents: buyerPays - steamFee - cs2Fee,
      );
    }
    buyerPays++;
  }

  final steamFee = math.max(1, (buyerPays * 0.05).floor());
  final cs2Fee = math.max(1, (buyerPays * 0.10).floor());
  return FeeBreakdownData(
    buyerPaysCents: buyerPays,
    steamFeeCents: steamFee,
    cs2FeeCents: cs2Fee,
    sellerReceivesCents: buyerPays - steamFee - cs2Fee,
  );
}

/// Calculate fees from buyer-pays perspective (for custom price input).
FeeBreakdownData calculateFeesFromBuyerPays(int buyerPaysCents) {
  if (buyerPaysCents <= 0) {
    return const FeeBreakdownData(
      buyerPaysCents: 0,
      steamFeeCents: 0,
      cs2FeeCents: 0,
      sellerReceivesCents: 0,
    );
  }
  final steamFee = math.max(1, (buyerPaysCents * 0.05).floor());
  final cs2Fee = math.max(1, (buyerPaysCents * 0.10).floor());
  return FeeBreakdownData(
    buyerPaysCents: buyerPaysCents,
    steamFeeCents: steamFee,
    cs2FeeCents: cs2Fee,
    sellerReceivesCents: buyerPaysCents - steamFee - cs2Fee,
  );
}

// ---------------------------------------------------------------------------
// Sell operation models
// ---------------------------------------------------------------------------

enum SellItemStatus { queued, listing, listed, failed, uncertain }

class SellOperationItem {
  final String assetId;
  final String marketHashName;
  final int priceCents;
  final int? accountId;
  final SellItemStatus status;
  final String? errorMessage;
  final bool requiresConfirmation;

  const SellOperationItem({
    required this.assetId,
    required this.marketHashName,
    required this.priceCents,
    this.accountId,
    this.status = SellItemStatus.queued,
    this.errorMessage,
    this.requiresConfirmation = false,
  });

  factory SellOperationItem.fromJson(Map<String, dynamic> json) {
    return SellOperationItem(
      assetId: json['assetId'] as String,
      marketHashName: json['marketHashName'] as String,
      priceCents: json['priceCents'] as int? ?? 0,
      accountId: json['accountId'] as int?,
      status: _parseStatus(json['status'] as String?),
      errorMessage: json['errorMessage'] as String?,
      requiresConfirmation: json['requiresConfirmation'] as bool? ?? false,
    );
  }

  static SellItemStatus _parseStatus(String? s) => switch (s) {
        'queued' => SellItemStatus.queued,
        'listing' => SellItemStatus.listing,
        'listed' => SellItemStatus.listed,
        'failed' => SellItemStatus.failed,
        'uncertain' => SellItemStatus.uncertain,
        _ => SellItemStatus.queued,
      };
}

class SellOperation {
  final String operationId;
  final String status; // 'pending' | 'processing' | 'completed' | 'cancelled'
  final int totalItems;
  final int succeeded;
  final int failed;
  final List<SellOperationItem> items;

  const SellOperation({
    required this.operationId,
    required this.status,
    required this.totalItems,
    this.succeeded = 0,
    this.failed = 0,
    this.items = const [],
  });

  bool get isActive => status == 'pending' || status == 'processing';
  bool get isCompleted => status == 'completed' || status == 'cancelled';

  factory SellOperation.fromJson(Map<String, dynamic> json) {
    final itemsList = (json['items'] as List<dynamic>?)
            ?.map((e) =>
                SellOperationItem.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    return SellOperation(
      operationId: json['operationId'] as String? ?? json['id'] as String? ?? '',
      status: json['status'] as String? ?? 'pending',
      totalItems: json['totalItems'] as int? ?? 0,
      succeeded: json['succeeded'] as int? ?? 0,
      failed: json['failed'] as int? ?? 0,
      items: itemsList,
    );
  }
}

// ---------------------------------------------------------------------------
// Sell operation provider
// ---------------------------------------------------------------------------

final sellOperationProvider =
    AsyncNotifierProvider<SellOperationNotifier, SellOperation?>(
        SellOperationNotifier.new);

class SellOperationNotifier extends AsyncNotifier<SellOperation?> {
  Timer? _pollTimer;

  @override
  Future<SellOperation?> build() async {
    ref.onDispose(() {
      _pollTimer?.cancel();
    });
    return null;
  }

  Future<void> startOperation(
      List<Map<String, dynamic>> items) async {
    try {
      final api = ref.read(apiClientProvider);
      final response = await api.post('/market/sell-operation', data: {
        'items': items,
      });
      final operation = SellOperation.fromJson(
          response.data as Map<String, dynamic>);
      state = AsyncData(operation);
      Analytics.sellStarted(itemCount: items.length, source: 'sell_sheet');
      _startPolling(operation.operationId);
    } catch (e, st) {
      dev.log('Sell operation start failed: $e', name: 'Sell');
      Analytics.recordError(e, st, reason: 'sell_start_failed');
      state = AsyncError(e, st);
    }
  }

  void _startPolling(String operationId) {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      _pollProgress(operationId);
    });
  }

  Future<void> _pollProgress(String operationId) async {
    try {
      final api = ref.read(apiClientProvider);
      final response = await api.get('/market/sell-operation/$operationId');
      final operation = SellOperation.fromJson(
          response.data as Map<String, dynamic>);
      state = AsyncData(operation);

      if (operation.isCompleted) {
        _pollTimer?.cancel();
        Analytics.sellCompleted(succeeded: operation.succeeded, failed: operation.failed);
      }
    } catch (e) {
      dev.log('Sell operation poll failed: $e', name: 'Sell');
      // Don't stop polling on transient errors
    }
  }

  Future<void> cancelOperation() async {
    final current = state.valueOrNull;
    if (current == null) return;

    try {
      final api = ref.read(apiClientProvider);
      await api.post('/market/sell-operation/${current.operationId}/cancel');
      _pollTimer?.cancel();
      // One final poll to get updated state
      await _pollProgress(current.operationId);
    } catch (e) {
      dev.log('Sell operation cancel failed: $e', name: 'Sell');
    }
  }

  void reset() {
    _pollTimer?.cancel();
    state = const AsyncData(null);
  }
}

// ---------------------------------------------------------------------------
// Sell volume provider
// ---------------------------------------------------------------------------

class SellVolume {
  final int today;
  final int limit;
  final int warningAt;
  final int remaining;

  const SellVolume({
    required this.today,
    required this.limit,
    required this.warningAt,
    required this.remaining,
  });

  bool get isWarning => today >= warningAt;
  bool get isAtLimit => remaining <= 0;

  factory SellVolume.fromJson(Map<String, dynamic> json) {
    return SellVolume(
      today: json['today'] as int? ?? 0,
      limit: json['limit'] as int? ?? 200,
      warningAt: json['warningAt'] as int? ?? 180,
      remaining: json['remaining'] as int? ?? 200,
    );
  }
}

final sellVolumeProvider =
    AutoDisposeAsyncNotifierProvider<SellVolumeNotifier, SellVolume>(
        SellVolumeNotifier.new);

class SellVolumeNotifier extends AutoDisposeAsyncNotifier<SellVolume> {
  @override
  Future<SellVolume> build() async {
    return _fetch();
  }

  Future<SellVolume> _fetch() async {
    final api = ref.read(apiClientProvider);
    final response = await api.get('/market/volume');
    return SellVolume.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _fetch());
  }
}

// ---------------------------------------------------------------------------
// Duplicates provider
// ---------------------------------------------------------------------------

class DuplicateGroup {
  final String marketHashName;
  final int count;
  final List<String> assetIds;
  final String iconUrl;
  final int bestPriceCents;

  const DuplicateGroup({
    required this.marketHashName,
    required this.count,
    required this.assetIds,
    required this.iconUrl,
    required this.bestPriceCents,
  });

  String get fullIconUrl =>
      SteamImage.url(iconUrl);

  factory DuplicateGroup.fromJson(Map<String, dynamic> json) {
    return DuplicateGroup(
      marketHashName: json['marketHashName'] as String,
      count: json['count'] as int? ?? 0,
      assetIds: (json['assetIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      iconUrl: json['iconUrl'] as String? ?? '',
      bestPriceCents: (((json['bestPrice'] as num?)?.toDouble() ?? 0) * 100).round(),
    );
  }
}

final duplicatesProvider =
    AutoDisposeFutureProvider<List<DuplicateGroup>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get('/inventory/duplicates');
  final data = response.data as Map<String, dynamic>;
  final list = data['duplicates'] as List<dynamic>;
  return list
      .map((e) => DuplicateGroup.fromJson(e as Map<String, dynamic>))
      .toList();
});

// ---------------------------------------------------------------------------
// Wallet info provider
// ---------------------------------------------------------------------------

class WalletInfo {
  final bool detected;
  final int currencyId;
  final String code;
  final String symbol;
  final double? rate;

  const WalletInfo({
    required this.detected,
    required this.currencyId,
    required this.code,
    required this.symbol,
    this.rate,
  });

  bool get isUsd => currencyId == 1;

  /// Format a USD cents amount in wallet currency
  String formatWalletPrice(int usdCents) {
    if (isUsd || rate == null) return '\$${(usdCents / 100).toStringAsFixed(2)}';
    final walletAmount = (usdCents * rate!) / 100;
    return '$symbol${walletAmount.toStringAsFixed(2)}';
  }

  /// Convert USD cents to wallet cents
  int convertToWallet(int usdCents) {
    if (isUsd || rate == null) return usdCents;
    return (usdCents * rate!).round();
  }

  factory WalletInfo.fromJson(Map<String, dynamic> json) {
    return WalletInfo(
      detected: json['detected'] as bool? ?? false,
      currencyId: json['currencyId'] as int? ?? 1,
      code: json['code'] as String? ?? 'USD',
      symbol: json['symbol'] as String? ?? '\$',
      rate: (json['rate'] as num?)?.toDouble(),
    );
  }

  static const usd = WalletInfo(
    detected: false,
    currencyId: 1,
    code: 'USD',
    symbol: '\$',
    rate: 1,
  );
}

final walletInfoProvider =
    AutoDisposeFutureProvider<WalletInfo>((ref) async {
  final api = ref.read(apiClientProvider);
  try {
    final response = await api.get('/market/wallet-info');
    return WalletInfo.fromJson(response.data as Map<String, dynamic>);
  } catch (_) {
    return WalletInfo.usd;
  }
});

// ---------------------------------------------------------------------------
// Quick price provider (per market hash name)
// ---------------------------------------------------------------------------

class QuickPriceResult {
  final int sellerReceivesCents;
  final bool stale;
  final String source; // "live", "depth", "cached", "local"
  final String? marketUrl;
  final int currencyId; // Steam currency ID (1=USD, 18=UAH, etc.)
  final String currencyCode;
  final String currencySymbol;

  const QuickPriceResult({
    required this.sellerReceivesCents,
    this.stale = false,
    this.source = 'live',
    this.marketUrl,
    this.currencyId = 1,
    this.currencyCode = 'USD',
    this.currencySymbol = '\$',
  });

  /// Format price in native currency
  String formatPrice(int cents) {
    return '$currencySymbol${(cents / 100).toStringAsFixed(2)}';
  }
}

QuickPriceResult? _localFallback(QuickPriceRequest request) {
  final price = request.fallbackPriceUsd;
  if (price == null || price <= 0) return null;
  final cents = (price * 100).round();
  final valveFee = (cents * 0.05).floor().clamp(1, cents);
  final cs2Fee = (cents * 0.10).floor().clamp(1, cents);
  final sellerReceives = cents - valveFee - cs2Fee;
  final marketUrl = 'https://steamcommunity.com/market/listings/730/${Uri.encodeComponent(request.marketHashName)}';
  return QuickPriceResult(
    sellerReceivesCents: (sellerReceives - 1).clamp(1, sellerReceives),
    stale: true,
    source: 'local',
    marketUrl: marketUrl,
  );
}

final quickPriceProvider =
    AutoDisposeFutureProvider.family<QuickPriceResult, QuickPriceRequest>((ref, request) async {
  final api = ref.read(apiClientProvider);
  final encoded = Uri.encodeComponent(request.marketHashName);
  try {
    final params = <String, dynamic>{};
    if (request.accountId != null) {
      params['accountId'] = request.accountId.toString();
    }
    // Race: backend has 3s to respond, otherwise use local fallback
    final response = await api.get(
      '/market/quickprice/$encoded',
      queryParameters: params,
    ).timeout(const Duration(seconds: 3), onTimeout: () {
      throw TimeoutException('quickprice timeout');
    });
    return QuickPriceResult(
      sellerReceivesCents: response.data['sellerReceivesCents'] as int,
      stale: response.data['stale'] as bool? ?? false,
      source: response.data['source'] as String? ?? 'live',
      marketUrl: response.data['marketUrl'] as String?,
      currencyId: response.data['currencyId'] as int? ?? 1,
      currencyCode: response.data['currencyCode'] as String? ?? 'USD',
      currencySymbol: response.data['currencySymbol'] as String? ?? '\$',
    );
  } catch (_) {
    final fallback = _localFallback(request);
    if (fallback != null) return fallback;
    rethrow;
  }
});

class QuickPriceRequest {
  final String marketHashName;
  final double? fallbackPriceUsd;
  final int? accountId;

  const QuickPriceRequest({required this.marketHashName, this.fallbackPriceUsd, this.accountId});

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is QuickPriceRequest &&
          marketHashName == other.marketHashName &&
          accountId == other.accountId;

  @override
  int get hashCode => Object.hash(marketHashName, accountId);
}
