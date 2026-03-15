import 'dart:developer' as dev;
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api_client.dart';
import '../../core/cache_service.dart';
import '../../core/constants.dart';
import '../../core/push_service.dart';
import '../../models/user.dart';

final authServiceProvider = Provider<SteamAuthService>((ref) {
  return SteamAuthService();
});

final authStateProvider =
    AsyncNotifierProvider<AuthNotifier, SteamUser?>(AuthNotifier.new);

class AuthNotifier extends AsyncNotifier<SteamUser?> {
  @override
  Future<SteamUser?> build() async {
    final api = ref.read(apiClientProvider);
    if (!await api.hasToken()) {
      dev.log('No token found', name: 'Auth');
      return null;
    }
    try {
      dev.log('Token found, fetching /auth/me', name: 'Auth');
      final response = await api.get('/auth/me');
      return SteamUser.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      dev.log('Auth/me failed: $e', name: 'Auth');
      await api.clearToken();
      return null;
    }
  }

  Future<void> loginWithSteamCallback(Map<String, String> params) async {
    state = const AsyncLoading();
    try {
      final api = ref.read(apiClientProvider);
      final response = await api.post('/auth/steam/verify', data: params);
      final data = response.data as Map<String, dynamic>;
      await api.saveToken(data['token'] as String);
      state = AsyncData(
        SteamUser.fromJson(data['user'] as Map<String, dynamic>),
      );
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<void> logout() async {
    final api = ref.read(apiClientProvider);
    await PushService.unregister(api);
    await api.clearToken();
    await CacheService.clearAll();
    state = const AsyncData(null);
  }
}

class SteamAuthService {
  String generateNonce() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final rng = Random.secure();
    return List.generate(24, (_) => chars[rng.nextInt(chars.length)]).join();
  }

  /// Open Steam login in Safari with nonce for polling
  Future<void> openSteamWithNonce(String nonce) async {
    final returnTo = '${AppConstants.apiBaseUrl}/auth/steam/callback?nonce=$nonce';
    final returnUri = Uri.parse(returnTo);
    final realm =
        '${returnUri.scheme}://${returnUri.host}${returnUri.hasPort ? ':${returnUri.port}' : ''}/';

    final params = {
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': realm,
      'openid.identity':
          'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id':
          'http://specs.openid.net/auth/2.0/identifier_select',
    };

    final uri = Uri.parse(AppConstants.steamOpenIdUrl)
        .replace(queryParameters: params);

    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  /// Open Steam login for linking a new account.
  Future<void> openSteamLinkLogin(WidgetRef ref) async {
    try {
      final api = ref.read(apiClientProvider);
      final response = await api.post('/auth/accounts/link');
      final data = response.data as Map<String, dynamic>;
      final url = data['url'] as String?;
      if (url != null) {
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      dev.log('Link login failed: $e', name: 'SteamAuth');
    }
  }
}
