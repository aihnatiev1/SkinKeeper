import 'dart:async';
import 'dart:convert';
import 'dart:developer' as dev;
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import '../../core/api_client.dart';
import '../auth/steam_auth_service.dart';

const _kMonthlyId = 'skinkeeper_pro_monthly';
const _kYearlyId = 'skinkeeper_pro_yearly';
const _kProductIds = {_kMonthlyId, _kYearlyId};

// ---- Subscription Status Model ----

class SubscriptionStatus {
  final bool isPremium;
  final String? premiumUntil;
  final String? productId;
  final String? store;
  final bool isExpired;

  const SubscriptionStatus({
    this.isPremium = false,
    this.premiumUntil,
    this.productId,
    this.store,
    this.isExpired = false,
  });

  factory SubscriptionStatus.fromJson(Map<String, dynamic> json) {
    return SubscriptionStatus(
      isPremium: json['isPremium'] as bool? ?? false,
      premiumUntil: json['premiumUntil'] as String?,
      productId: json['productId'] as String?,
      store: json['store'] as String?,
      isExpired: json['isExpired'] as bool? ?? false,
    );
  }
}

// ---- Premium Provider (reactive, auto-refreshes from auth state) ----

final premiumProvider =
    AsyncNotifierProvider<PremiumNotifier, bool>(PremiumNotifier.new);

class PremiumNotifier extends AsyncNotifier<bool> {
  @override
  Future<bool> build() async {
    // Watch auth state — updates reactively when user re-authenticates
    final user = ref.watch(authStateProvider).valueOrNull;
    return user?.isPremium ?? false;
  }

  void setPremium(bool value) {
    state = AsyncData(value);
  }

  Future<void> refreshFromServer() async {
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.get('/purchases/status');
      final status =
          SubscriptionStatus.fromJson(res.data as Map<String, dynamic>);
      state = AsyncData(status.isPremium);
    } catch (e) {
      dev.log('Failed to refresh premium status: $e', name: 'IAP');
    }
  }
}

// ---- IAP Service Provider ----

final iapServiceProvider = Provider<IAPService>((ref) {
  final service = IAPService(ref);
  ref.onDispose(() => service.dispose());
  return service;
});

class IAPService {
  final Ref _ref;
  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _subscription;
  List<ProductDetails> _products = [];

  IAPService(this._ref) {
    _init();
  }

  List<ProductDetails> get products => _products;

  ProductDetails? get monthlyProduct =>
      _products.where((p) => p.id == _kMonthlyId).firstOrNull;

  ProductDetails? get yearlyProduct =>
      _products.where((p) => p.id == _kYearlyId).firstOrNull;

  Future<void> _init() async {
    final available = await _iap.isAvailable();
    if (!available) {
      dev.log('IAP not available on this device', name: 'IAP');
      return;
    }

    // Listen for purchase updates
    _subscription = _iap.purchaseStream.listen(
      _onPurchaseUpdate,
      onDone: () => _subscription?.cancel(),
      onError: (error) => dev.log('IAP stream error: $error', name: 'IAP'),
    );

    // Load products
    await loadProducts();
  }

  Future<void> loadProducts() async {
    try {
      final response = await _iap.queryProductDetails(_kProductIds);
      if (response.notFoundIDs.isNotEmpty) {
        dev.log('Products not found: ${response.notFoundIDs}', name: 'IAP');
      }
      _products = response.productDetails;
      dev.log('Loaded ${_products.length} products', name: 'IAP');
    } catch (e) {
      dev.log('Failed to load products: $e', name: 'IAP');
    }
  }

  Future<bool> buyMonthly() => _buy(_kMonthlyId);
  Future<bool> buyYearly() => _buy(_kYearlyId);

  /// DEV ONLY — instantly activates premium without real purchase
  Future<void> mockPurchase({bool yearly = true}) async {
    assert(kDebugMode, 'mockPurchase() only available in debug mode');
    try {
      final api = _ref.read(apiClientProvider);
      final res = await api.post('/purchases/mock', data: {
        'productId': yearly ? _kYearlyId : _kMonthlyId,
      });
      final data = res.data as Map<String, dynamic>;
      if (data['success'] == true) {
        _ref.read(premiumProvider.notifier).setPremium(true);
        _ref.invalidate(authStateProvider);
        dev.log('Mock premium activated!', name: 'IAP');
      }
    } catch (e) {
      dev.log('Mock purchase failed: $e', name: 'IAP');
      rethrow;
    }
  }

  /// DEV ONLY — revokes premium to test free-tier gating
  Future<void> mockRevoke() async {
    assert(kDebugMode, 'mockRevoke() only available in debug mode');
    try {
      final api = _ref.read(apiClientProvider);
      await api.post('/purchases/mock-revoke');
      _ref.read(premiumProvider.notifier).setPremium(false);
      _ref.invalidate(authStateProvider);
      dev.log('Mock premium revoked!', name: 'IAP');
    } catch (e) {
      dev.log('Mock revoke failed: $e', name: 'IAP');
      rethrow;
    }
  }

  Future<bool> _buy(String productId) async {
    final product = _products.where((p) => p.id == productId).firstOrNull;
    if (product == null) {
      dev.log('Product $productId not found', name: 'IAP');
      return false;
    }

    final purchaseParam = PurchaseParam(productDetails: product);
    try {
      return await _iap.buyNonConsumable(purchaseParam: purchaseParam);
    } catch (e) {
      dev.log('Purchase failed: $e', name: 'IAP');
      return false;
    }
  }

  Future<void> restorePurchases() async {
    await _iap.restorePurchases();
  }

  void _onPurchaseUpdate(List<PurchaseDetails> purchaseDetailsList) {
    for (final purchase in purchaseDetailsList) {
      dev.log(
        'Purchase update: ${purchase.productID} status=${purchase.status}',
        name: 'IAP',
      );

      switch (purchase.status) {
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          _verifyAndDeliver(purchase);
        case PurchaseStatus.error:
          dev.log('Purchase error: ${purchase.error}', name: 'IAP');
          if (purchase.pendingCompletePurchase) {
            _iap.completePurchase(purchase);
          }
        case PurchaseStatus.pending:
          dev.log('Purchase pending', name: 'IAP');
        case PurchaseStatus.canceled:
          dev.log('Purchase canceled', name: 'IAP');
      }
    }
  }

  Future<void> _verifyAndDeliver(PurchaseDetails purchase) async {
    try {
      final api = _ref.read(apiClientProvider);

      final store = Platform.isIOS ? 'apple' : 'google';
      final body = <String, dynamic>{'store': store};

      if (store == 'apple') {
        // Send transaction info as JSON
        body['receiptData'] = jsonEncode({
          'productId': purchase.productID,
          'transactionId': purchase.purchaseID,
          'purchaseDate': DateTime.now().toIso8601String(),
          // For subscriptions, set expiry based on product
          'expiresDate': DateTime.now()
              .add(purchase.productID == _kYearlyId
                  ? const Duration(days: 365)
                  : const Duration(days: 30))
              .toIso8601String(),
        });
      } else {
        body['purchaseToken'] = purchase.verificationData.serverVerificationData;
        body['productId'] = purchase.productID;
      }

      final res = await api.post('/purchases/verify', data: body);
      final data = res.data as Map<String, dynamic>;

      if (data['success'] == true) {
        // Activate premium in local state
        _ref.read(premiumProvider.notifier).setPremium(true);
        // Refresh auth state to update user model
        _ref.invalidate(authStateProvider);
        dev.log('Premium activated!', name: 'IAP');
      }
    } catch (e) {
      dev.log('Verification failed: $e', name: 'IAP');
    }

    // Complete the purchase
    if (purchase.pendingCompletePurchase) {
      await _iap.completePurchase(purchase);
    }
  }

  void dispose() {
    _subscription?.cancel();
  }
}
