import 'dart:math' as math;

/// Steam fee calculation utilities.
/// Mirrors the backend logic for consistent client-side display.

/// Calculate Steam marketplace fee from buyer-pays amount.
int calculateSteamFee(int buyerPaysCents) =>
    math.max(1, (buyerPaysCents * 0.05).floor());

/// Calculate CS2 game fee from buyer-pays amount.
int calculateCs2Fee(int buyerPaysCents) =>
    math.max(1, (buyerPaysCents * 0.10).floor());

/// Calculate total fee from buyer-pays amount.
int calculateTotalFee(int buyerPaysCents) =>
    calculateSteamFee(buyerPaysCents) + calculateCs2Fee(buyerPaysCents);

/// Calculate what seller receives from buyer-pays amount.
int calculateSellerReceives(int buyerPaysCents) =>
    buyerPaysCents - calculateTotalFee(buyerPaysCents);

/// Format cents as a price string (e.g., 1234 -> "$12.34").
String formatCentsUsd(int cents) => '\$${(cents / 100).toStringAsFixed(2)}';
