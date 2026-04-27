import 'dart:async';
import 'dart:convert';
import 'dart:developer' as dev;
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import '../../core/api_client.dart';
import '../auth/steam_auth_service.dart';
import 'tour/tour_provider.dart';

const _kMonthlyId = 'skinkeeper_pro_monthly';
const _kYearlyId = 'skinkeeper_pro_yearly';
const _kProductIds = {_kMonthlyId, _kYearlyId};

/// Pure computation of the yearly-vs-monthly savings %, exposed as a
/// top-level function so it can be unit-tested without bringing up
/// `IAPService` (whose constructor wires the `in_app_purchase` plugin
/// and can't run in flutter_test).
///
/// Rules — see [IAPService.yearlySavingsPercent] dartdoc for the
/// reasoning. Returns null on any of:
/// - either product missing
/// - currency code mismatch (cross-currency ratio is meaningless)
/// - non-positive raw price (sentinel/test data)
/// - result <=0 or >=100 (misconfigured pricing — yearly costlier than
///   12× monthly, or essentially free)
@visibleForTesting
int? computeYearlySavingsPercent(
  ProductDetails? monthly,
  ProductDetails? yearly,
) {
  if (monthly == null || yearly == null) return null;
  if (monthly.currencyCode != yearly.currencyCode) return null;
  final monthlyRaw = monthly.rawPrice;
  final yearlyRaw = yearly.rawPrice;
  if (monthlyRaw <= 0 || yearlyRaw <= 0) return null;
  final fullYear = monthlyRaw * 12;
  if (fullYear <= 0) return null;
  final saved = (fullYear - yearlyRaw) / fullYear * 100;
  if (saved <= 0 || saved >= 100) return null;
  final rounded = saved.round();
  // Belt-and-braces: even if `saved` is 99.5+, rounding can lift it to
  // 100, which is misleading copy ("Save 100%" suggests free). Drop to
  // null so the badge falls back to the unqualified "BEST VALUE".
  if (rounded <= 0 || rounded >= 100) return null;
  return rounded;
}

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

// ---- Premium cache invalidation ----

/// Refreshes premium status from the server and invalidates dependent auth
/// state. Callers (paywall, purchase verification, App Store notifications)
/// should await this to ensure UI reflects the authoritative backend state
/// before reacting — critical for the `PremiumGate` false → true unlock
/// animation, which MUST NOT fire on an optimistic local flip.
///
/// Contract: returns only after `premiumProvider` has been updated with a
/// fresh server response. Safe to call during async work.
Future<void> invalidatePremiumCache(WidgetRef ref) async {
  final notifier = ref.read(premiumProvider.notifier);
  await notifier.refreshFromServer();
  ref.invalidate(authStateProvider);
}

// ---- IAP Service Provider ----

final iapServiceProvider = Provider<IAPService>((ref) {
  final service = IAPService(ref);
  ref.onDispose(() => service.dispose());
  return service;
});

/// Live yearly-vs-monthly savings %, derived from real store prices.
///
/// `null` whenever [IAPService.yearlySavingsPercent] returns null —
/// products not loaded, currency mismatch, sentinel prices, or out-of-
/// range result. Consumers (paywall badge) treat `null` as "show the
/// badge text without a percent" so the UI never makes a numerical
/// claim it can't back up with the active store price.
///
/// Note: this is a thin pass-through over `iapServiceProvider`. Because
/// `IAPService.products` mutates in place after `loadProducts`, Riverpod
/// won't auto-recompute — callers should `ref.read` after the paywall's
/// loading state has flipped (paywall does this via its own
/// `setState(() => _loadingProducts = false)`), or `ref.watch` inside a
/// widget that already rebuilds on that flip.
final yearlySavingsPercentProvider = Provider<int?>((ref) {
  return ref.watch(iapServiceProvider).yearlySavingsPercent;
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

  /// Percentage savings of the yearly plan vs paying the monthly plan
  /// 12 times, derived from real StoreKit / Play Billing prices.
  ///
  /// Returns `null` when the calculation can't be trusted:
  /// - either product is missing (products not loaded yet, region with
  ///   only one SKU configured, etc.)
  /// - either price is non-positive (sentinel/test data)
  /// - currency codes mismatch (ratio across currencies is meaningless)
  /// - the result is non-positive or >=100% (yearly priced higher than
  ///   12× monthly, or essentially free — both indicate misconfigured
  ///   pricing rather than a real saving)
  ///
  /// Apple/Google can apply regional pricing — a hardcoded "Save 40%"
  /// can be a lie in markets where the yearly discount differs, and
  /// Apple's review can flag misleading claims. Computing live prevents
  /// that.
  int? get yearlySavingsPercent =>
      computeYearlySavingsPercent(monthlyProduct, yearlyProduct);

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

  Future<bool> _buy(String productId) async {
    final product = _products.where((p) => p.id == productId).firstOrNull;
    if (product == null) {
      dev.log('Product $productId not found', name: 'IAP');
      return false;
    }

    // CRIT-3: bind the purchase to the authenticated user.
    //
    // On Android, `applicationUserName` populates Google Play's
    // `obfuscatedExternalAccountId` field on the resulting purchase record.
    // The backend (`verifyGoogleReceipt` in `purchases.ts`) compares it
    // against the JWT-authenticated caller — without a match, an attacker
    // could replay user A's purchase token under user B and steal Premium.
    //
    // On iOS, `applicationUserName` maps to StoreKit's `applicationUsername`
    // (which Apple hashes and exposes as `appAccountToken`). We don't rely
    // on it for Apple right now (Apple's verification chain is signed and
    // tied to the purchasing Apple ID), but setting it is harmless and
    // future-proofs us if we add appAccountToken-based binding later.
    //
    // Constraint (Google): ≤ 64 chars, no PII. Numeric backend user id is
    // an opaque DB row id, not a Steam id — safe to use as-is. Hashing was
    // considered but adds nothing here: the backend compares string-to-
    // string, and a hash would have to be deterministic across devices,
    // which means an attacker who knows the userId can recompute it
    // anyway. Plain stringified userId keeps the backend check simple
    // (`info.obfuscatedExternalAccountId !== String(expectedUserId)`).
    //
    // If `userId` is null (forward-compat for stale backend builds that
    // didn't return `id` on /auth/me), we still attempt the purchase but
    // log loudly — backend will reject with RECEIPT_NOT_BOUND and the user
    // will be prompted to re-login.
    final user = _ref.read(authStateProvider).valueOrNull;
    final userId = user?.userId;
    if (userId == null) {
      dev.log(
        'No authenticated userId — purchase will fail backend user-binding check (CRIT-3)',
        name: 'IAP',
      );
    }

    final purchaseParam = PurchaseParam(
      productDetails: product,
      applicationUserName: userId?.toString(),
    );
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
          _verifyAndDeliver(purchase, isRestore: false);
        case PurchaseStatus.restored:
          _verifyAndDeliver(purchase, isRestore: true);
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

  /// Hook invoked after a fresh purchase has been verified and premium is
  /// confirmed. Set by app shell at startup; defaults to a no-op so unit
  /// tests don't have to provide a context.
  ///
  /// CRITICAL: this fires only on `PurchaseStatus.purchased` — NEVER on
  /// `restored`. The post-purchase tour is a one-shot welcome experience and
  /// re-running it on restore (e.g. user re-installed the app) would be
  /// confusing. The hook itself also checks the `tour_v1_completed`
  /// SharedPreferences flag so the tour only ever shows once per device per
  /// user.
  void Function()? onFreshPurchaseSuccess;

  Future<void> _verifyAndDeliver(
    PurchaseDetails purchase, {
    required bool isRestore,
  }) async {
    try {
      final api = _ref.read(apiClientProvider);

      final store = Platform.isIOS ? 'apple' : 'google';
      final body = <String, dynamic>{'store': store};

      if (store == 'apple') {
        // Send transactionId for server-side verification via Apple App Store Server API.
        // Backend will call Apple directly to validate — no need to fabricate expiry dates.
        body['receiptData'] = jsonEncode({
          'transactionId': purchase.purchaseID,
          'productId': purchase.productID,
        });
      } else {
        body['purchaseToken'] = purchase.verificationData.serverVerificationData;
        body['productId'] = purchase.productID;
      }

      final res = await api.post('/purchases/verify', data: body);
      final data = res.data as Map<String, dynamic>;

      if (data['success'] == true) {
        // Server is the source of truth — refresh FIRST so the
        // PremiumGate `false → true` listener never sees a transient
        // optimistic flip that the server hasn't confirmed.
        //
        // Without this ordering: an optimistic `setPremium(true)` would
        // make `premiumProvider` emit `true`, fire the 650ms unlock
        // choreography, then snap back to `false` when `refreshFromServer`
        // returns the authoritative state — a P0 UX bug (PLAN §9 risk #1).
        //
        // After: animation fires only once `refreshFromServer` has applied
        // the confirmed status. The explicit `setPremium(true)` below is a
        // guard for the rare case where `/purchases/verify` reports success
        // but `/purchases/status` lags behind (entitlement propagation
        // race). It's a no-op when the refresh already produced `true`.
        final notifier = _ref.read(premiumProvider.notifier);
        await notifier.refreshFromServer();
        final freshPremium = _ref.read(premiumProvider).valueOrNull ?? false;
        if (!freshPremium) {
          notifier.setPremium(true);
        }
        // Cascade auth-state invalidation last — downstream consumers
        // (e.g. `authStateProvider`) read the now-fresh premium flag.
        _ref.invalidate(authStateProvider);
        dev.log('Premium activated!', name: 'IAP');

        // P8: post-purchase tour trigger. Restore path skips this entirely
        // — only first-time purchases get the welcome flow. The hook also
        // checks `tour_v1_completed` so a user who already saw the tour
        // (e.g. resubscribed after a churn) won't see it again.
        if (!isRestore) {
          _maybeTriggerTour();
        }
      }
    } catch (e) {
      dev.log('Verification failed: $e', name: 'IAP');
    }

    // Complete the purchase
    if (purchase.pendingCompletePurchase) {
      await _iap.completePurchase(purchase);
    }
  }

  /// Fire the post-purchase tour callback if all guards pass. Failure modes
  /// (no completion service available, hook not set, flag already set) are
  /// silent — the tour is a nice-to-have, never a blocker.
  Future<void> _maybeTriggerTour() async {
    final hook = onFreshPurchaseSuccess;
    if (hook == null) {
      dev.log(
        'Tour trigger skipped: onFreshPurchaseSuccess not wired',
        name: 'IAP',
      );
      return;
    }
    try {
      final completion = _ref.read(tourCompletionServiceProvider);
      if (await completion.isCompleted()) {
        dev.log('Tour trigger skipped: already completed', name: 'IAP');
        return;
      }
      hook();
    } catch (e) {
      dev.log('Tour trigger failed: $e', name: 'IAP');
    }
  }

  void dispose() {
    _subscription?.cancel();
  }
}
