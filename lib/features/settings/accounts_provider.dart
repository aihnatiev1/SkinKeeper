import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/account_scope_provider.dart';
import '../../core/api_client.dart';
import '../../core/analytics_service.dart';
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

    // All linked accounts are always visible — server is the source of truth
    return all;
  }

  Future<void> setActive(int accountId) async {
    final api = ref.read(apiClientProvider);
    await api.put('/auth/accounts/$accountId/active');
    Analytics.accountSwitched();
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
    ref.invalidateSelf();
    ref.invalidate(inventoryProvider);
  }

  Future<Map<String, dynamic>> startLinkAccount() async {
    final api = ref.read(apiClientProvider);
    try {
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
}
