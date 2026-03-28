import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/account_scope_provider.dart';
import '../../core/api_client.dart';
import '../../core/cache_service.dart';
import '../../models/user.dart';
import '../alerts/alerts_provider.dart';
import '../auth/session_provider.dart';
import '../inventory/inventory_provider.dart';
import '../inventory/inventory_selection_provider.dart';
import '../portfolio/portfolio_pl_provider.dart';
import '../portfolio/portfolio_provider.dart';
import '../trades/trades_provider.dart';
import '../transactions/transactions_provider.dart';

class PremiumRequiredException implements Exception {
  const PremiumRequiredException();

  @override
  String toString() => 'Upgrade to Premium to link more than 2 Steam accounts';
}

const _knownAccountsKey = 'known_account_ids';
const _linkPendingKey = 'link_pending';

final accountsProvider =
    AsyncNotifierProvider<AccountsNotifier, List<SteamAccount>>(
        () => AccountsNotifier());

class AccountsNotifier extends AsyncNotifier<List<SteamAccount>> {
  @override
  Future<List<SteamAccount>> build() async {
    final api = ref.read(apiClientProvider);
    final response = await api.get('/auth/accounts');
    final data = response.data;
    final all = (data['accounts'] as List)
        .map((a) => SteamAccount.fromJson(a as Map<String, dynamic>))
        .toList();

    var knownIds = await _getKnownIds();

    // If a link was pending, discover and add any new accounts
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_linkPendingKey) == true) {
      await prefs.remove(_linkPendingKey);
      for (final a in all) {
        if (!knownIds.contains(a.id)) {
          knownIds.add(a.id);
        }
      }
      await _saveKnownIds(knownIds);
    }

    if (knownIds.isEmpty) {
      // First load after fresh install — only show the active account
      final active = all.where((a) => a.isActive).toList();
      if (active.isNotEmpty) {
        await _saveKnownIds(active.map((a) => a.id).toList());
        return active;
      }
      // Fallback: if no active flag, show first account
      if (all.isNotEmpty) {
        await _saveKnownIds([all.first.id]);
        return [all.first];
      }
      return all;
    }

    // Filter to only known accounts
    final visible = all.where((a) => knownIds.contains(a.id)).toList();

    // If active account was removed from known (shouldn't happen), add it back
    if (visible.isEmpty && all.isNotEmpty) {
      final active = all.firstWhere((a) => a.isActive, orElse: () => all.first);
      await addKnownAccount(active.id);
      return [active];
    }

    return visible;
  }

  /// Mark that a link is in progress — next build() will accept new accounts.
  static Future<void> markLinkPending() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_linkPendingKey, true);
  }

  Future<void> setActive(int accountId) async {
    final api = ref.read(apiClientProvider);
    await api.put('/auth/accounts/$accountId/active');
    await CacheService.clearAccountData();
    ref.read(accountScopeProvider.notifier).state = null;
    ref.invalidateSelf();
    ref.invalidate(inventoryProvider);
    ref.invalidate(portfolioProvider);
    ref.invalidate(portfolioPLProvider);
    ref.invalidate(itemsPLProvider);
    ref.invalidate(plHistoryProvider);
    ref.invalidate(transactionsProvider);
    ref.invalidate(txStatsProvider);
    ref.invalidate(txItemsListProvider);
    ref.invalidate(alertsProvider);
    ref.invalidate(alertHistoryProvider);
    ref.invalidate(tradesProvider);
    ref.invalidate(steamFriendsProvider);
    ref.invalidate(linkedAccountsProvider);
    ref.invalidate(sessionStatusProvider);
    ref.invalidate(selectionProvider);
  }

  Future<void> unlinkAccount(int accountId) async {
    final api = ref.read(apiClientProvider);
    await api.delete('/auth/accounts/$accountId');
    await removeKnownAccount(accountId);
    ref.invalidateSelf();
    ref.invalidate(inventoryProvider);
  }

  Future<Map<String, dynamic>> startLinkAccount() async {
    final api = ref.read(apiClientProvider);
    try {
      await markLinkPending();
      final response = await api.post('/auth/accounts/link');
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.statusCode == 403) {
        final body = e.response?.data;
        if (body is Map && body['error'] == 'premium_required') {
          throw const PremiumRequiredException();
        }
      }
      rethrow;
    }
  }

  // ─── Known accounts persistence ─────────────────────────────────

  static Future<List<int>> _getKnownIds() async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_knownAccountsKey);
    if (list == null) return [];
    return list.map((s) => int.tryParse(s)).whereType<int>().toList();
  }

  static Future<void> _saveKnownIds(List<int> ids) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_knownAccountsKey, ids.map((i) => i.toString()).toList());
  }

  /// Add an account to the known list (called after linking).
  static Future<void> addKnownAccount(int accountId) async {
    final ids = await _getKnownIds();
    if (!ids.contains(accountId)) {
      ids.add(accountId);
      await _saveKnownIds(ids);
    }
  }

  /// Remove an account from the known list (called after unlinking).
  static Future<void> removeKnownAccount(int accountId) async {
    final ids = await _getKnownIds();
    ids.remove(accountId);
    await _saveKnownIds(ids);
  }
}
