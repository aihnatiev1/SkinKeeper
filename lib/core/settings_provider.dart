import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'constants.dart';

// ─── Currency ────────────────────────────────────────────────────────

class CurrencyInfo {
  final String code;
  final String symbol;
  final double rate; // 1 USD = rate * currency

  const CurrencyInfo({
    required this.code,
    required this.symbol,
    required this.rate,
  });

  String format(double usd, {int decimals = 2}) {
    final converted = usd * rate;
    return '$symbol${_groupThousands(converted.toStringAsFixed(decimals))}';
  }

  String formatWithSign(double usd, {int decimals = 2}) {
    final converted = usd * rate;
    final prefix = converted >= 0 ? '+' : '';
    return '$prefix$symbol${_groupThousands(converted.abs().toStringAsFixed(decimals))}';
  }

  /// Insert comma as thousands separator: 15860.47 → 15,860.47
  static String _groupThousands(String formatted) {
    final parts = formatted.split('.');
    final intPart = parts[0];
    final buf = StringBuffer();
    final start = intPart.startsWith('-') ? 1 : 0;
    if (start == 1) buf.write('-');
    final digits = intPart.substring(start);
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buf.write(',');
      buf.write(digits[i]);
    }
    if (parts.length > 1) {
      buf.write('.');
      buf.write(parts[1]);
    }
    return buf.toString();
  }
}

/// Fallback rates (used when API is unreachable)
const kCurrencies = <String, CurrencyInfo>{
  'USD': CurrencyInfo(code: 'USD', symbol: '\$', rate: 1.0),
  'EUR': CurrencyInfo(code: 'EUR', symbol: '€', rate: 0.92),
  'GBP': CurrencyInfo(code: 'GBP', symbol: '£', rate: 0.79),
  'UAH': CurrencyInfo(code: 'UAH', symbol: '₴', rate: 41.5),
  'RUB': CurrencyInfo(code: 'RUB', symbol: '₽', rate: 92.0),
  'CNY': CurrencyInfo(code: 'CNY', symbol: '¥', rate: 7.25),
  'PLN': CurrencyInfo(code: 'PLN', symbol: 'zł', rate: 4.0),
  'BRL': CurrencyInfo(code: 'BRL', symbol: 'R\$', rate: 5.8),
  'TRY': CurrencyInfo(code: 'TRY', symbol: '₺', rate: 38.0),
};

/// Currency code → symbol (CSGOTrader only provides codes)
const _currencySymbols = <String, String>{
  'USD': '\$',
  'EUR': '€',
  'GBP': '£',
  'UAH': '₴',
  'RUB': '₽',
  'CNY': '¥',
  'JPY': '¥',
  'PLN': 'zł',
  'BRL': 'R\$',
  'TRY': '₺',
  'KRW': '₩',
  'CAD': 'C\$',
  'AUD': 'A\$',
  'CHF': 'CHF ',
  'SEK': 'kr',
  'NOK': 'kr',
  'DKK': 'kr',
  'CZK': 'Kč',
  'HUF': 'Ft',
  'RON': 'lei',
  'BGN': 'лв',
  'HRK': 'kn',
  'INR': '₹',
  'THB': '฿',
  'MYR': 'RM',
  'SGD': 'S\$',
  'NZD': 'NZ\$',
  'MXN': 'MX\$',
  'ARS': 'AR\$',
  'CLP': 'CL\$',
  'COP': 'CO\$',
  'PEN': 'S/',
  'PHP': '₱',
  'IDR': 'Rp',
  'VND': '₫',
  'ZAR': 'R',
  'ILS': '₪',
  'AED': 'د.إ',
  'SAR': '﷼',
  'TWD': 'NT\$',
  'HKD': 'HK\$',
  'BTC': '₿',
  'ETH': 'Ξ',
};

/// Dynamic rates fetched from the backend
Map<String, double> _dynamicRates = {};

/// Build a CurrencyInfo from dynamic or fallback rates
CurrencyInfo _buildCurrency(String code) {
  // Check dynamic rates first
  final dynamicRate = _dynamicRates[code];
  if (dynamicRate != null) {
    return CurrencyInfo(
      code: code,
      symbol: _currencySymbols[code] ?? '$code ',
      rate: dynamicRate,
    );
  }
  // Fallback to hardcoded
  return kCurrencies[code] ?? CurrencyInfo(code: code, symbol: '$code ', rate: 1.0);
}

/// Get all available currency codes (dynamic + fallback)
List<String> get availableCurrencyCodes {
  final codes = <String>{...kCurrencies.keys, ..._dynamicRates.keys};
  // Prioritize common currencies
  const priority = ['USD', 'EUR', 'GBP', 'UAH', 'RUB', 'CNY', 'PLN', 'BRL', 'TRY'];
  final sorted = <String>[];
  for (final c in priority) {
    if (codes.remove(c)) sorted.add(c);
  }
  sorted.addAll(codes.toList()..sort());
  return sorted;
}

class CurrencyNotifier extends Notifier<CurrencyInfo> {
  @override
  CurrencyInfo build() {
    _load();
    return kCurrencies['USD']!;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString('display_currency') ?? 'USD';

    // Fetch dynamic rates from API
    try {
      final dio = Dio(BaseOptions(
        baseUrl: AppConstants.apiBaseUrl,
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 5),
      ));
      final response = await dio.get('/market/exchange-rates');
      if (response.data case {'rates': Map rates}) {
        _dynamicRates = rates.map((k, v) => MapEntry(k.toString(), (v as num).toDouble()));
      }
    } catch (_) {
      // Fallback to hardcoded rates silently
    }

    state = _buildCurrency(code);
  }

  Future<void> setCurrency(String code) async {
    state = _buildCurrency(code);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('display_currency', code);
  }
}

final currencyProvider =
    NotifierProvider<CurrencyNotifier, CurrencyInfo>(CurrencyNotifier.new);

// ─── Theme Mode ──────────────────────────────────────────────────────

class ThemeModeNotifier extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    _load();
    return ThemeMode.dark;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final value = prefs.getString('theme_mode') ?? 'dark';
    state = value == 'light' ? ThemeMode.light : ThemeMode.dark;
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    state = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        'theme_mode', mode == ThemeMode.light ? 'light' : 'dark');
  }

  void toggle() {
    setThemeMode(state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark);
  }
}

final themeModeProvider =
    NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);

// ─── Locale ──────────────────────────────────────────────────────────

class LocaleNotifier extends Notifier<Locale?> {
  @override
  Locale? build() {
    _load();
    return null; // null = system locale
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString('app_locale');
    if (code != null) {
      state = Locale(code);
    }
  }

  Future<void> setLocale(Locale? locale) async {
    state = locale;
    final prefs = await SharedPreferences.getInstance();
    if (locale != null) {
      await prefs.setString('app_locale', locale.languageCode);
    } else {
      await prefs.remove('app_locale');
    }
  }
}

final localeProvider =
    NotifierProvider<LocaleNotifier, Locale?>(LocaleNotifier.new);

const kSupportedLocales = {
  'en': 'English',
  'uk': 'Українська',
  'ru': 'Русский',
};
