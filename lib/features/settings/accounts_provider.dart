import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../models/user.dart';
import '../inventory/inventory_provider.dart';

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
    ref.invalidateSelf();
    ref.invalidate(inventoryProvider);
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
