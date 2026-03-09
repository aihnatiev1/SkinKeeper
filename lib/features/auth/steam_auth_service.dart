import 'dart:developer' as dev;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api_client.dart';
import '../../core/cache_service.dart';
import '../../core/constants.dart';
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
      dev.log('Got user: ${response.data}', name: 'Auth');
      return SteamUser.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      dev.log('Auth/me failed: $e', name: 'Auth');
      await api.clearToken();
      return null;
    }
  }

  /// Dev login — saves token and creates user without server call
  Future<void> devLogin() async {
    state = const AsyncLoading();
    try {
      final api = ref.read(apiClientProvider);
      await api.saveToken(AppConstants.devToken);
      dev.log('Dev token saved, fetching /auth/me', name: 'Auth');
      final response = await api.get('/auth/me');
      dev.log('Dev login response: ${response.data}', name: 'Auth');
      state = AsyncData(
        SteamUser.fromJson(response.data as Map<String, dynamic>),
      );
    } catch (e, st) {
      dev.log('Dev login failed: $e', name: 'Auth');
      state = AsyncError(e, st);
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
    await api.clearToken();
    await CacheService.clearAll();
    state = const AsyncData(null);
  }
}

class SteamAuthService {
  Future<void> openSteamLogin() async {
    // Steam OpenID requires http(s) return_to — use backend as intermediary
    final returnTo = '${AppConstants.apiBaseUrl}/auth/steam/callback';
    // Realm must match the return_to scheme+host (with trailing slash)
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

    dev.log('Steam login URL: $uri', name: 'SteamAuth');
    dev.log('return_to: $returnTo', name: 'SteamAuth');
    dev.log('realm: $realm', name: 'SteamAuth');

    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
