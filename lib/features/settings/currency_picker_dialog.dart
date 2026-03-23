import 'dart:developer' as dev;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';

const _kCurrencyPickerShown = 'currency_picker_shown';

/// Check if we should show the currency picker (first time after onboarding)
Future<bool> shouldShowCurrencyPicker() async {
  final prefs = await SharedPreferences.getInstance();
  return !(prefs.getBool(_kCurrencyPickerShown) ?? false);
}

Future<void> markCurrencyPickerShown() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(_kCurrencyPickerShown, true);
}

/// Steam currencies for the picker — fetched from backend or fallback
class _SteamCurrency {
  final int id;
  final String code;
  final String symbol;
  const _SteamCurrency(this.id, this.code, this.symbol);
}

const _fallbackCurrencies = [
  _SteamCurrency(1, 'USD', '\$'),
  _SteamCurrency(2, 'GBP', '£'),
  _SteamCurrency(3, 'EUR', '€'),
  _SteamCurrency(18, 'UAH', '₴'),
  _SteamCurrency(5, 'RUB', '₽'),
  _SteamCurrency(17, 'TRY', '₺'),
  _SteamCurrency(6, 'PLN', 'zł'),
  _SteamCurrency(23, 'CNY', '¥'),
  _SteamCurrency(7, 'BRL', 'R\$'),
  _SteamCurrency(24, 'INR', '₹'),
  _SteamCurrency(16, 'KRW', '₩'),
  _SteamCurrency(37, 'KZT', '₸'),
];

/// Shows a bottom sheet asking user to pick their Steam wallet currency.
/// Returns true if user picked something, false if dismissed.
Future<bool> showCurrencyPickerDialog(BuildContext context, WidgetRef ref) async {
  await markCurrencyPickerShown();

  // Try to fetch currencies from backend
  List<_SteamCurrency> currencies = _fallbackCurrencies;
  try {
    final api = ref.read(apiClientProvider);
    final response = await api.get('/market/currencies');
    final list = (response.data['currencies'] as List?) ?? [];
    if (list.isNotEmpty) {
      currencies = list
          .map((c) => _SteamCurrency(
                c['id'] as int,
                c['code'] as String,
                c['symbol'] as String,
              ))
          .toList();
    }
  } catch (e) {
    dev.log('Failed to fetch currencies: $e', name: 'CurrencyPicker');
  }

  if (!context.mounted) return false;

  final selected = await showModalBottomSheet<int>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) {
      return _CurrencyPickerSheet(currencies: currencies);
    },
  );

  if (selected != null && context.mounted) {
    // Save to backend
    try {
      final api = ref.read(apiClientProvider);
      await api.put('/market/wallet-currency', data: {'currencyId': selected});
    } catch (e) {
      dev.log('Failed to save wallet currency: $e', name: 'CurrencyPicker');
    }

    // Also update display currency to match
    final cur = currencies.firstWhere((c) => c.id == selected, orElse: () => currencies.first);
    ref.read(currencyProvider.notifier).setCurrency(cur.code);

    return true;
  }

  return false;
}

class _CurrencyPickerSheet extends StatefulWidget {
  final List<_SteamCurrency> currencies;
  const _CurrencyPickerSheet({required this.currencies});

  @override
  State<_CurrencyPickerSheet> createState() => _CurrencyPickerSheetState();
}

class _CurrencyPickerSheetState extends State<_CurrencyPickerSheet> {
  String _search = '';

  List<_SteamCurrency> get _filtered {
    if (_search.isEmpty) return widget.currencies;
    final q = _search.toLowerCase();
    return widget.currencies
        .where((c) =>
            c.code.toLowerCase().contains(q) ||
            c.symbol.contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.5,
      maxChildSize: 0.65,
      minChildSize: 0.35,
      expand: false,
      builder: (_, scrollCtrl) {
        return Container(
          decoration: const BoxDecoration(
            color: AppTheme.surface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: SafeArea(
            child: Column(
              children: [
                const SizedBox(height: 8),
                Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppTheme.textDisabled,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 16),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    children: [
                      Text(
                        '💰 Steam Wallet Currency',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      SizedBox(height: 6),
                      Text(
                        'Exact prices without conversion — more accurate selling and tracking.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: GridView.builder(
                    controller: scrollCtrl,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: 2.2,
                    ),
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) {
                      final cur = _filtered[i];
                      return Material(
                        color: AppTheme.surfaceLight,
                        borderRadius: BorderRadius.circular(12),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () {
                            HapticFeedback.selectionClick();
                            Navigator.pop(context, cur.id);
                          },
                          child: Center(
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  cur.symbol,
                                  style: const TextStyle(
                                    fontSize: 18,
                                    color: AppTheme.primary,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  cur.code,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    color: AppTheme.textPrimary,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
