import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/cache_service.dart';
import '../../models/user.dart';
import '../alerts/alerts_provider.dart';
import '../auth/session_provider.dart';
import '../auth/steam_auth_service.dart';
import '../inventory/inventory_provider.dart';
import '../portfolio/portfolio_pl_provider.dart';
import '../trades/trades_provider.dart';
import '../transactions/transactions_provider.dart';

final accountsProvider =
    AsyncNotifierProvider<AccountsNotifier, List<SteamAccount>>(
        () => AccountsNotifier());

class AccountsNotifier extends AsyncNotifier<List<SteamAccount>> {
  @override
  Future<List<SteamAccount>> build() async {
    final api = ref.read(apiClientProvider);
    final response = await api.get('/auth/accounts');
    final data = response.data;
    return (data['accounts'] as List)
        .map((a) => SteamAccount.fromJson(a as Map<String, dynamic>))
        .toList();
  }

  Future<void> setActive(int accountId) async {
    final api = ref.read(apiClientProvider);
    await api.put('/auth/accounts/$accountId/active');
    // Wipe all account-specific caches so no stale data from previous account
    await CacheService.clearAccountData();
    ref.invalidateSelf();
    // Refresh auth state so activeAccountId updates
    ref.invalidate(authStateProvider);
    // Reset all account-specific data
    ref.invalidate(inventoryProvider);
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
  }

  Future<void> unlinkAccount(int accountId) async {
    final api = ref.read(apiClientProvider);
    await api.delete('/auth/accounts/$accountId');
    ref.invalidateSelf();
    ref.invalidate(inventoryProvider);
  }

  Future<Map<String, dynamic>> startLinkAccount() async {
    final api = ref.read(apiClientProvider);
    final response = await api.post('/auth/accounts/link');
    return response.data as Map<String, dynamic>;
  }
}
