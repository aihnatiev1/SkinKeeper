import 'dart:developer' as dev;

import 'package:home_widget/home_widget.dart';

import 'cache_service.dart';

/// Cross-platform home screen widget bridge.
///
/// Uses `home_widget` to push portfolio data to:
///   - iOS: UserDefaults via App Group `group.com.skinkeeper.widget`
///   - Android: SharedPreferences read by [SkinKeeperWidget] AppWidgetProvider
///
/// Data keys: totalValue, change24h, change24hPct, isPositive, itemCount,
///            lastUpdated, totalProfit (premium), isProfitable (premium).
class WidgetService {
  static const _appGroupId = 'group.com.skinkeeper.widget';
  static const _iOSWidgetName = 'SkinKeeperWidget';
  static const _androidWidgetName = 'SkinKeeperWidget';

  /// Initialize the home_widget bridge. Call once before use.
  static Future<void> init() async {
    try {
      await HomeWidget.setAppGroupId(_appGroupId);
      dev.log('WidgetService initialized', name: 'Widget');
    } catch (e) {
      dev.log('WidgetService init error: $e', name: 'Widget');
    }
  }

  /// Register the background callback so the OS can request widget updates
  /// even when the app is not running.
  static Future<void> registerBackgroundCallback() async {
    try {
      await HomeWidget.registerInteractivityCallback(_backgroundCallback);
      dev.log('Widget background callback registered', name: 'Widget');
    } catch (e) {
      dev.log('Widget background callback error: $e', name: 'Widget');
    }
  }

  /// Called by the OS when the widget requests a data refresh.
  ///
  /// Runs in an isolate — must re-init Hive, read cached portfolio, and push
  /// to the widget shared storage.
  @pragma('vm:entry-point')
  static Future<void> _backgroundCallback(Uri? uri) async {
    try {
      await CacheService.init();
      final portfolio = CacheService.getPortfolioRaw();
      if (portfolio == null) return;

      final totalValue = (portfolio['total_value'] as num?)?.toDouble() ?? 0;
      final change24h = (portfolio['change_24h'] as num?)?.toDouble() ?? 0;
      final change24hPct =
          (portfolio['change_24h_pct'] as num?)?.toDouble() ?? 0;
      final itemCount = (portfolio['item_count'] as int?) ?? 0;

      await updateWidget(
        totalValue: '\$${totalValue.toStringAsFixed(2)}',
        change24h:
            '${change24h >= 0 ? "+" : ""}\$${change24h.toStringAsFixed(2)}',
        change24hPct:
            '${change24hPct >= 0 ? "+" : ""}${change24hPct.toStringAsFixed(1)}%',
        isPositive: change24h >= 0,
        itemCount: itemCount,
      );
    } catch (e) {
      dev.log('Widget background refresh error: $e', name: 'Widget');
    }
  }

  /// Push cached portfolio data to the widget without needing a Ref.
  ///
  /// Reads from CacheService (ignores TTL) and formats values. Useful for
  /// app foreground resume and background refresh scenarios.
  static Future<void> pushCachedToWidget() async {
    final portfolio = CacheService.getPortfolioRaw();
    if (portfolio == null) return;

    final totalValue = (portfolio['total_value'] as num?)?.toDouble() ?? 0;
    final change24h = (portfolio['change_24h'] as num?)?.toDouble() ?? 0;
    final change24hPct =
        (portfolio['change_24h_pct'] as num?)?.toDouble() ?? 0;
    final itemCount = (portfolio['item_count'] as int?) ?? 0;

    await updateWidget(
      totalValue: '\$${totalValue.toStringAsFixed(2)}',
      change24h:
          '${change24h >= 0 ? "+" : ""}\$${change24h.toStringAsFixed(2)}',
      change24hPct:
          '${change24hPct >= 0 ? "+" : ""}${change24hPct.toStringAsFixed(1)}%',
      isPositive: change24h >= 0,
      itemCount: itemCount,
    );
  }

  /// Push portfolio data to the native widget and trigger a refresh.
  ///
  /// Call this after fetching fresh portfolio data (inventory sync,
  /// background fetch, etc.).
  static Future<void> updateWidget({
    required String totalValue,
    required String change24h,
    required String change24hPct,
    required bool isPositive,
    required int itemCount,
    String? totalProfit,
    bool? isProfitable,
  }) async {
    try {
      await Future.wait([
        HomeWidget.saveWidgetData('totalValue', totalValue),
        HomeWidget.saveWidgetData('change24h', change24h),
        HomeWidget.saveWidgetData('change24hPct', change24hPct),
        HomeWidget.saveWidgetData('isPositive', isPositive),
        HomeWidget.saveWidgetData('itemCount', itemCount),
        HomeWidget.saveWidgetData('lastUpdated', _timeLabel()),
      ]);

      if (totalProfit != null) {
        await Future.wait([
          HomeWidget.saveWidgetData('totalProfit', totalProfit),
          HomeWidget.saveWidgetData('isProfitable', isProfitable ?? false),
        ]);
      }

      await HomeWidget.updateWidget(
        iOSName: _iOSWidgetName,
        androidName: _androidWidgetName,
      );

      dev.log('Widget updated: $totalValue ($change24hPct)', name: 'Widget');
    } catch (e) {
      dev.log('Widget update error: $e', name: 'Widget');
    }
  }

  /// Format current time as HH:mm for the "last updated" label.
  static String _timeLabel() {
    final now = DateTime.now();
    return '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
  }
}
