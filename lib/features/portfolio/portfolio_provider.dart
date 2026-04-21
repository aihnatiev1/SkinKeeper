import 'dart:developer' as dev;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/account_scope_provider.dart';
import '../../core/api_client.dart';
import '../../core/cache_service.dart';
import '../../core/settings_provider.dart';
import '../../core/widget_service.dart';
import '../purchases/iap_service.dart';

class PortfolioSummary {
  final int totalValueCents;
  final int change24hCents;
  /// 24h change as a percent (not money — stays double).
  final double change24hPct;
  final int change7dCents;
  /// 7d change as a percent (not money — stays double).
  final double change7dPct;
  final int itemCount;
  final List<PortfolioHistoryPoint> history;

  const PortfolioSummary({
    required this.totalValueCents,
    required this.change24hCents,
    required this.change24hPct,
    required this.change7dCents,
    required this.change7dPct,
    required this.itemCount,
    required this.history,
  });

  factory PortfolioSummary.fromJson(Map<String, dynamic> json) {
    return PortfolioSummary(
      totalValueCents: _cents(json['total_value']),
      change24hCents: _cents(json['change_24h']),
      change24hPct: (json['change_24h_pct'] as num).toDouble(),
      change7dCents: _cents(json['change_7d']),
      change7dPct: (json['change_7d_pct'] as num).toDouble(),
      itemCount: json['item_count'] as int,
      history: (json['history'] as List<dynamic>)
          .map((e) =>
              PortfolioHistoryPoint.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  static int _cents(Object? raw) =>
      ((raw as num).toDouble() * 100).round();
}

class PortfolioHistoryPoint {
  final DateTime date;
  final int valueCents;

  const PortfolioHistoryPoint({required this.date, required this.valueCents});

  factory PortfolioHistoryPoint.fromJson(Map<String, dynamic> json) {
    return PortfolioHistoryPoint(
      date: DateTime.parse(json['date'] as String),
      valueCents: ((json['value'] as num).toDouble() * 100).round(),
    );
  }
}

final portfolioProvider =
    AsyncNotifierProvider<PortfolioNotifier, PortfolioSummary>(
        PortfolioNotifier.new);

class PortfolioNotifier extends AsyncNotifier<PortfolioSummary> {
  @override
  Future<PortfolioSummary> build() async {
    // Re-fetch when account scope changes
    ref.watch(accountScopeProvider);

    // 1. Try cache first for instant display (only for "all accounts" scope)
    final scope = ref.read(accountScopeProvider);
    if (scope == null) {
      try {
        final cached = CacheService.getPortfolio();
        if (cached != null) {
          final summary = PortfolioSummary.fromJson(cached);
          _pushToWidget(summary);
          _refreshInBackground();
          return summary;
        }
      } catch (_) {}
    }

    // 2. Fetch from API
    return await _fetchFromApi();
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
    final scope = ref.read(accountScopeProvider);
    final params = <String, dynamic>{};
    if (scope != null) params['accountId'] = scope;
    final response = await api.get('/portfolio/summary', queryParameters: params);
    final json = response.data as Map<String, dynamic>;
    // Cache only "all accounts" view
    if (scope == null) {
      CacheService.putPortfolio(json);
      CacheService.lastSync = DateTime.now();
    }
    final summary = PortfolioSummary.fromJson(json);
    if (scope == null) _pushToWidget(summary);
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

      final currency = ref.read(currencyProvider);
      WidgetService.updateWidget(
        totalValue: currency.formatCents(summary.totalValueCents),
        change24h: currency.formatCentsWithSign(summary.change24hCents),
        change24hPct:
            '${summary.change24hPct >= 0 ? "+" : ""}${summary.change24hPct.toStringAsFixed(1)}%',
        isPositive: summary.change24hCents >= 0,
        itemCount: summary.itemCount,
        totalProfit: isPremium && totalProfit != null
            ? currency.formatWithSign(totalProfit)
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
