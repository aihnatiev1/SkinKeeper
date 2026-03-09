import 'dart:developer' as dev;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/cache_service.dart';
import '../../core/widget_service.dart';
import '../purchases/iap_service.dart';

class PortfolioSummary {
  final double totalValue;
  final double change24h;
  final double change24hPct;
  final double change7d;
  final double change7dPct;
  final int itemCount;
  final List<PortfolioHistoryPoint> history;

  const PortfolioSummary({
    required this.totalValue,
    required this.change24h,
    required this.change24hPct,
    required this.change7d,
    required this.change7dPct,
    required this.itemCount,
    required this.history,
  });

  factory PortfolioSummary.fromJson(Map<String, dynamic> json) {
    return PortfolioSummary(
      totalValue: (json['total_value'] as num).toDouble(),
      change24h: (json['change_24h'] as num).toDouble(),
      change24hPct: (json['change_24h_pct'] as num).toDouble(),
      change7d: (json['change_7d'] as num).toDouble(),
      change7dPct: (json['change_7d_pct'] as num).toDouble(),
      itemCount: json['item_count'] as int,
      history: (json['history'] as List<dynamic>)
          .map((e) =>
              PortfolioHistoryPoint.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class PortfolioHistoryPoint {
  final DateTime date;
  final double value;

  const PortfolioHistoryPoint({required this.date, required this.value});

  factory PortfolioHistoryPoint.fromJson(Map<String, dynamic> json) {
    return PortfolioHistoryPoint(
      date: DateTime.parse(json['date'] as String),
      value: (json['value'] as num).toDouble(),
    );
  }
}

final portfolioProvider =
    AsyncNotifierProvider<PortfolioNotifier, PortfolioSummary>(
        PortfolioNotifier.new);

class PortfolioNotifier extends AsyncNotifier<PortfolioSummary> {
  @override
  Future<PortfolioSummary> build() async {
    // 1. Try cache first for instant display
    final cached = CacheService.getPortfolio();
    if (cached != null) {
      final summary = PortfolioSummary.fromJson(cached);
      _pushToWidget(summary);
      // Start background refresh (don't await)
      _refreshInBackground();
      return summary;
    }

    // 2. No cache — fetch from API
    try {
      return await _fetchFromApi();
    } on DioException {
      rethrow;
    }
  }

  Future<void> _refreshInBackground() async {
    try {
      final fresh = await _fetchFromApi();
      state = AsyncData(fresh);
    } catch (_) {
      // Keep showing cached data on network error
    }
  }

  Future<PortfolioSummary> _fetchFromApi() async {
    final api = ref.read(apiClientProvider);
    final response = await api.get('/portfolio/summary');
    final json = response.data as Map<String, dynamic>;
    // Cache the raw JSON for next launch
    CacheService.putPortfolio(json);
    CacheService.lastSync = DateTime.now();
    final summary = PortfolioSummary.fromJson(json);
    _pushToWidget(summary);
    return summary;
  }

  /// Push current portfolio data to the home screen widget.
  void _pushToWidget(PortfolioSummary summary) {
    try {
      final isPremium =
          ref.read(premiumProvider).valueOrNull ?? false;

      // Format P/L for premium users only
      final cached = CacheService.getPortfolio();
      final totalProfit = (cached?['total_profit'] as num?)?.toDouble();

      WidgetService.updateWidget(
        totalValue: '\$${summary.totalValue.toStringAsFixed(2)}',
        change24h:
            '${summary.change24h >= 0 ? "+" : ""}\$${summary.change24h.toStringAsFixed(2)}',
        change24hPct:
            '${summary.change24hPct >= 0 ? "+" : ""}${summary.change24hPct.toStringAsFixed(1)}%',
        isPositive: summary.change24h >= 0,
        itemCount: summary.itemCount,
        totalProfit: isPremium && totalProfit != null
            ? '${totalProfit >= 0 ? "+" : ""}\$${totalProfit.toStringAsFixed(2)}'
            : null,
        isProfitable: isPremium && totalProfit != null
            ? totalProfit >= 0
            : null,
      );
    } catch (e) {
      dev.log('Failed to push to widget: $e', name: 'Portfolio');
    }
  }
}
