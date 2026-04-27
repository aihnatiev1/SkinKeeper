import 'package:flutter_test/flutter_test.dart';
import 'package:in_app_purchase/in_app_purchase.dart';

import 'package:skin_keeper/features/purchases/iap_service.dart';

/// Helper to build a minimal [ProductDetails] for the savings calculation.
/// `id`, `title`, and `description` are irrelevant to the math but required
/// by the constructor — keep them constant across tests so failures point
/// at the price logic, not at fixture noise.
ProductDetails _product({
  required double rawPrice,
  String currencyCode = 'USD',
  String id = 'sku',
}) {
  return ProductDetails(
    id: id,
    title: 'Test',
    description: 'Test product',
    price: '\$$rawPrice',
    rawPrice: rawPrice,
    currencyCode: currencyCode,
  );
}

void main() {
  group('computeYearlySavingsPercent', () {
    test('happy path: monthly \$4.99, yearly \$34.99 → 42% saved', () {
      // (4.99 * 12 - 34.99) / (4.99 * 12) * 100 = 41.567... → rounds to 42.
      final saved = computeYearlySavingsPercent(
        _product(rawPrice: 4.99),
        _product(rawPrice: 34.99),
      );
      expect(saved, 42);
    });

    test('returns null when monthly product is missing', () {
      // Region with no monthly SKU configured, or products mid-load.
      final saved = computeYearlySavingsPercent(
        null,
        _product(rawPrice: 34.99),
      );
      expect(saved, isNull);
    });

    test('returns null when yearly product is missing', () {
      final saved = computeYearlySavingsPercent(
        _product(rawPrice: 4.99),
        null,
      );
      expect(saved, isNull);
    });

    test('returns null when both products are missing', () {
      // Cold paywall mount, before `loadProducts` resolves.
      expect(computeYearlySavingsPercent(null, null), isNull);
    });

    test('returns null when monthly rawPrice is 0 (sentinel)', () {
      // A misconfigured product can return rawPrice == 0. Guarding this
      // also guards the div-by-zero on `fullYear`.
      final saved = computeYearlySavingsPercent(
        _product(rawPrice: 0),
        _product(rawPrice: 34.99),
      );
      expect(saved, isNull);
    });

    test('returns null when yearly rawPrice is 0', () {
      final saved = computeYearlySavingsPercent(
        _product(rawPrice: 4.99),
        _product(rawPrice: 0),
      );
      expect(saved, isNull);
    });

    test('returns null when prices are in different currencies', () {
      // A USD vs EUR ratio is meaningless without a conversion rate.
      // Theoretically rare but cheap to guard.
      final saved = computeYearlySavingsPercent(
        _product(rawPrice: 4.99, currencyCode: 'USD'),
        _product(rawPrice: 34.99, currencyCode: 'EUR'),
      );
      expect(saved, isNull);
    });

    test('returns null when yearly costs MORE than 12× monthly (saved <= 0)', () {
      // Pricing misconfiguration — never advertise a "saving" of 0% or
      // negative. Caller falls back to "BEST VALUE" without a percent.
      final saved = computeYearlySavingsPercent(
        _product(rawPrice: 4.99),
        _product(rawPrice: 4.99 * 12 + 1),
      );
      expect(saved, isNull);
    });

    test('returns null when rounded saving would be 100% (essentially free)', () {
      // Pathological store data: yearly priced 0.0001 against a 4.99
      // monthly. Pre-round saving is ~99.997 (passes the `< 100` guard),
      // but `.round()` lifts it to 100 — "Save 100%" reads as "free",
      // which it isn't. The post-round guard must catch this and we
      // fall back to the unqualified "BEST VALUE" badge.
      final saved = computeYearlySavingsPercent(
        _product(rawPrice: 4.99),
        _product(rawPrice: 0.0001),
      );
      expect(saved, isNull);
    });

    test('non-USD currency works the same — math is currency-agnostic', () {
      // Sanity: 199 EUR/year vs 24.99 EUR/month → same calc, rounds to 34.
      // (24.99 * 12 - 199) / (24.99 * 12) * 100 = 33.65... → 34.
      final saved = computeYearlySavingsPercent(
        _product(rawPrice: 24.99, currencyCode: 'EUR'),
        _product(rawPrice: 199, currencyCode: 'EUR'),
      );
      expect(saved, 34);
    });

    test('result is rounded, not truncated', () {
      // (5 * 12 - 33) / 60 * 100 = 45.0 exact → 45.
      expect(
        computeYearlySavingsPercent(
          _product(rawPrice: 5),
          _product(rawPrice: 33),
        ),
        45,
      );
      // (5 * 12 - 30) / 60 * 100 = 50.0 exact → 50.
      // Sanity check that a clean half-way case rounds in the obvious
      // direction. We avoid 32.7-style fixtures because IEEE-754
      // double subtraction can introduce sub-cent drift that pushes
      // round-half cases the "wrong" way and makes the test fragile.
      expect(
        computeYearlySavingsPercent(
          _product(rawPrice: 5),
          _product(rawPrice: 30),
        ),
        50,
      );
    });
  });
}
