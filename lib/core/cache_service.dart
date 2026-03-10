import 'package:hive_flutter/hive_flutter.dart';

/// Persistent local cache backed by Hive.
///
/// Boxes:
///   prices    - market_hash_name -> {prices: {...}, cachedAt: ISO}
///   inventory - 'items' -> [{...}], 'cachedAt' -> ISO
///   portfolio - 'summary' -> {...}, 'cachedAt' -> ISO
///   cacheMeta - 'lastSync' -> ISO, bookkeeping
///
/// TTLs: prices 1 h, inventory 24 h, portfolio 1 h.
class CacheService {
  static late Box _priceBox;
  static late Box _inventoryBox;
  static late Box _portfolioBox;
  static late Box _metaBox;

  /// Call once before runApp().
  static Future<void> init() async {
    await Hive.initFlutter();
    _priceBox = await Hive.openBox('prices');
    _inventoryBox = await Hive.openBox('inventory');
    _portfolioBox = await Hive.openBox('portfolio');
    _metaBox = await Hive.openBox('cacheMeta');
  }

  // ─── Prices ───────────────────────────────────────────────────────

  /// Returns cached multi-source prices for [marketHashName], or null if
  /// missing / expired (1 h TTL).
  static Map<String, double>? getPrices(String marketHashName) {
    final entry = _priceBox.get(marketHashName);
    if (entry == null) return null;
    if (_isExpired(entry['cachedAt'], const Duration(hours: 1))) return null;
    final prices = _deepCast(entry['prices']) as Map<String, dynamic>;
    return prices.map((k, v) => MapEntry(k, (v as num).toDouble()));
  }

  /// Persist multi-source prices for a single item.
  static void putPrices(String marketHashName, Map<String, double> prices) {
    _priceBox.put(marketHashName, {
      'prices': prices,
      'cachedAt': DateTime.now().toIso8601String(),
    });
  }

  // ─── Inventory ────────────────────────────────────────────────────

  /// Returns the cached inventory item list, or null if missing / expired
  /// (24 h TTL).
  static List<Map<String, dynamic>>? getInventory() {
    final cachedAt = _inventoryBox.get('cachedAt');
    if (cachedAt == null) return null;
    if (_isExpired(cachedAt as String, const Duration(hours: 24))) return null;
    final items = _inventoryBox.get('items');
    if (items == null) return null;
    return (items as List)
        .map((e) => _deepCast(e) as Map<String, dynamic>)
        .toList();
  }

  /// Persist the full inventory snapshot.
  static void putInventory(List<Map<String, dynamic>> items) {
    _inventoryBox.put('items', items);
    _inventoryBox.put('cachedAt', DateTime.now().toIso8601String());
  }

  // ─── Portfolio ────────────────────────────────────────────────────

  /// Returns the cached portfolio summary, or null if missing / expired
  /// (1 h TTL).
  static Map<String, dynamic>? getPortfolio() {
    final entry = _portfolioBox.get('summary');
    if (entry == null) return null;
    final cachedAt = _portfolioBox.get('cachedAt');
    if (_isExpired(cachedAt as String?, const Duration(hours: 1))) return null;
    return _deepCast(entry) as Map<String, dynamic>;
  }

  /// Returns the cached portfolio summary ignoring TTL (for widget background
  /// refresh where stale data is better than no data).
  static Map<String, dynamic>? getPortfolioRaw() {
    final entry = _portfolioBox.get('summary');
    if (entry == null) return null;
    return _deepCast(entry) as Map<String, dynamic>;
  }

  /// Persist the portfolio summary snapshot.
  static void putPortfolio(Map<String, dynamic> summary) {
    _portfolioBox.put('summary', summary);
    _portfolioBox.put('cachedAt', DateTime.now().toIso8601String());
  }

  // ─── Meta / Sync Info ─────────────────────────────────────────────

  /// Timestamp of the last successful full sync, or null.
  static DateTime? get lastSync {
    final v = _metaBox.get('lastSync');
    return v != null ? DateTime.parse(v as String) : null;
  }

  static set lastSync(DateTime? dt) {
    _metaBox.put('lastSync', dt?.toIso8601String());
  }

  /// Human-readable label: "Just now", "12m ago", "3h ago", "2d ago", etc.
  static String get lastSyncLabel {
    final ls = lastSync;
    if (ls == null) return 'Never synced';
    final diff = DateTime.now().difference(ls);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  // ─── Flags ──────────────────────────────────────────────────────

  static bool get sessionInfoDismissed =>
      _metaBox.get('sessionInfoDismissed', defaultValue: false) as bool;

  static void setSessionInfoDismissed(bool v) =>
      _metaBox.put('sessionInfoDismissed', v);

  // ─── Eviction / Maintenance ───────────────────────────────────────

  /// Compact all boxes to reclaim disk space (call periodically, e.g. on
  /// app resume).
  static Future<void> evictIfNeeded({
    int maxBytes = 50 * 1024 * 1024,
  }) async {
    await _priceBox.compact();
    await _inventoryBox.compact();
    await _portfolioBox.compact();
  }

  /// Wipe every cache box (call on logout).
  static Future<void> clearAll() async {
    await _priceBox.clear();
    await _inventoryBox.clear();
    await _portfolioBox.clear();
    await _metaBox.clear();
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  static bool _isExpired(String? cachedAt, Duration ttl) {
    if (cachedAt == null) return true;
    final cached = DateTime.parse(cachedAt);
    return DateTime.now().difference(cached) > ttl;
  }

  /// Deep-cast Hive's Map<dynamic, dynamic> → Map<String, dynamic> recursively.
  static dynamic _deepCast(dynamic value) {
    if (value is Map) {
      return value.map<String, dynamic>(
        (k, v) => MapEntry(k.toString(), _deepCast(v)),
      );
    }
    if (value is List) {
      return value.map(_deepCast).toList();
    }
    return value;
  }
}
