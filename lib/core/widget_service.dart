import 'dart:developer' as dev;

import 'package:home_widget/home_widget.dart';

/// Cross-platform home screen widget bridge.
///
/// Uses `home_widget` to push portfolio data to:
///   - iOS: UserDefaults via App Group `group.com.skintracker.widget`
///   - Android: SharedPreferences read by [SkinTrackerWidget] AppWidgetProvider
///
/// Data keys: totalValue, change24h, change24hPct, isPositive, itemCount,
///            lastUpdated, totalProfit (premium), isProfitable (premium).
class WidgetService {
  static const _appGroupId = 'group.com.skintracker.widget';
  static const _iOSWidgetName = 'SkinTrackerWidget';
  static const _androidWidgetName = 'SkinTrackerWidget';

  /// Initialize the home_widget bridge. Call once before use.
  static Future<void> init() async {
    try {
      await HomeWidget.setAppGroupId(_appGroupId);
      dev.log('WidgetService initialized', name: 'Widget');
    } catch (e) {
      dev.log('WidgetService init error: $e', name: 'Widget');
    }
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
