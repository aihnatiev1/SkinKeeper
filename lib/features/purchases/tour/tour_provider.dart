import 'dart:async';
import 'dart:developer' as dev;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/api_client.dart';
import 'tour_models.dart';

/// Snapshot returned by `GET /api/purchases/feature-previews`.
///
/// Mirrored from `backend/src/services/featurePreviews.ts`. Stays JSON-shaped
/// (no Freezed dependency) because the tour is the only surface that consumes
/// it and we want zero generated-code overhead for one screen.
class FeaturePreviewsData {
  const FeaturePreviewsData({
    required this.topItem,
    required this.inventoryStats,
    required this.trackedItemsCount,
    required this.alertsActive,
    required this.potentialAutoSellCandidates,
  });

  final TopItemPreview? topItem;
  final InventoryStatsData inventoryStats;
  final int trackedItemsCount;
  final int alertsActive;
  final int potentialAutoSellCandidates;

  factory FeaturePreviewsData.fromJson(Map<String, dynamic> json) {
    final topRaw = json['topItem'];
    final invRaw = json['inventoryStats'] as Map<String, dynamic>? ?? const {};
    return FeaturePreviewsData(
      topItem: topRaw is Map<String, dynamic>
          ? TopItemPreview.fromJson(topRaw)
          : null,
      inventoryStats: InventoryStatsData.fromJson(invRaw),
      trackedItemsCount: (json['trackedItemsCount'] as num?)?.toInt() ?? 0,
      alertsActive: (json['alertsActive'] as num?)?.toInt() ?? 0,
      potentialAutoSellCandidates:
          (json['potentialAutoSellCandidates'] as num?)?.toInt() ?? 0,
    );
  }

  /// Empty fallback used when feature-previews fails — the tour must still
  /// render, just without personalization.
  static const FeaturePreviewsData empty = FeaturePreviewsData(
    topItem: null,
    inventoryStats: InventoryStatsData(
      totalItems: 0,
      totalValueUsd: 0,
      uniqueItems: 0,
    ),
    trackedItemsCount: 0,
    alertsActive: 0,
    potentialAutoSellCandidates: 0,
  );
}

class TopItemPreview {
  const TopItemPreview({
    required this.marketHashName,
    required this.iconUrl,
    required this.currentPriceUsd,
    required this.trend7d,
  });

  final String marketHashName;
  final String? iconUrl;
  final double currentPriceUsd;
  final String? trend7d; // formatted "+8.2%" / "-3.1%" / null

  factory TopItemPreview.fromJson(Map<String, dynamic> json) {
    return TopItemPreview(
      marketHashName: json['marketHashName'] as String? ?? '',
      iconUrl: json['iconUrl'] as String?,
      currentPriceUsd: (json['currentPriceUsd'] as num?)?.toDouble() ?? 0,
      trend7d: json['trend7d'] as String?,
    );
  }
}

class InventoryStatsData {
  const InventoryStatsData({
    required this.totalItems,
    required this.totalValueUsd,
    required this.uniqueItems,
  });

  final int totalItems;
  final double totalValueUsd;
  final int uniqueItems;

  factory InventoryStatsData.fromJson(Map<String, dynamic> json) {
    return InventoryStatsData(
      totalItems: (json['totalItems'] as num?)?.toInt() ?? 0,
      totalValueUsd: (json['totalValueUsd'] as num?)?.toDouble() ?? 0,
      uniqueItems: (json['uniqueItems'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Fetches `/purchases/feature-previews` with a 5s timeout. The tour MUST NOT
/// block on this — slide 2 degrades to generic copy on failure / timeout.
///
/// Implementation note: we use a raw `FutureProvider.autoDispose` rather than
/// codegen because the tour module avoids Riverpod generation for build
/// simplicity. Auto-dispose so re-entering the tour (extremely rare) refetches.
final featurePreviewsProvider =
    FutureProvider.autoDispose<FeaturePreviewsData>((ref) async {
  final api = ref.read(apiClientProvider);
  try {
    final res = await api
        .get('/purchases/feature-previews')
        .timeout(const Duration(seconds: 5));
    final data = res.data;
    if (data is Map<String, dynamic>) {
      return FeaturePreviewsData.fromJson(data);
    }
    dev.log(
      'feature-previews returned non-map payload: $data',
      name: 'Tour',
    );
    return FeaturePreviewsData.empty;
  } on TimeoutException {
    dev.log('feature-previews timed out after 5s', name: 'Tour');
    return FeaturePreviewsData.empty;
  } catch (e) {
    dev.log('feature-previews failed: $e', name: 'Tour');
    return FeaturePreviewsData.empty;
  }
});

// ─── Tour completion flag ──────────────────────────────────────────

/// Persisted "user has seen the tour" flag. Read at trigger time (in
/// [IAPService]) and on every app launch in the listener; written on any
/// tour exit (Done, Skip, or "Try it now").
class TourCompletionService {
  const TourCompletionService();

  Future<bool> isCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(kTourCompletedKey) ?? false;
  }

  Future<void> markCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(kTourCompletedKey, true);
  }

  /// Test-only helper — clears the flag so a test can re-trigger the tour
  /// without spawning a fresh SharedPreferences instance.
  Future<void> reset() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(kTourCompletedKey);
  }
}

final tourCompletionServiceProvider =
    Provider<TourCompletionService>((_) => const TourCompletionService());
