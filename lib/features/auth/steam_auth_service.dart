import 'dart:developer' as dev;
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/analytics_service.dart';
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
      final user = SteamUser.fromJson(response.data as Map<String, dynamic>);
      Analytics.setUserId(user.steamId);
      return user;
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
      final user = SteamUser.fromJson(data['user'] as Map<String, dynamic>);
      Analytics.setUserId(user.steamId);
      Analytics.login(method: 'steam_openid');
      state = AsyncData(user);
    } catch (e, st) {
      Analytics.recordError(e, st, reason: 'login_failed');
      state = AsyncError(e, st);
    }
  }

  /// Set authenticated user directly (used by deep link handler)
  void setUser(SteamUser user) {
    state = AsyncData(user);
  }

  /// Clear user state (used by logout)
  void clearUser() {
    state = const AsyncData(null);
  }

  Future<void> logout() async {
    final api = ref.read(apiClientProvider);
    await PushService.unregister(api);
    await api.clearToken();
    await CacheService.clearAll();
    state = const AsyncData(null);
  }

  /// Permanently delete user account and all data (GDPR).
  Future<bool> deleteAccount() async {
    try {
      final api = ref.read(apiClientProvider);
      await api.delete('/auth/user');
      await PushService.unregister(api);
      await api.clearToken();
      await CacheService.clearAll();
      Analytics.setUserId(null);
      state = const AsyncData(null);
      return true;
    } catch (e, st) {
      Analytics.recordError(e, st, reason: 'account_deletion_failed');
      return false;
    }
  }
}

class SteamAuthService {
  /// Generate a random hex nonce for polling-based login.
  String _generateNonce() {
    final random = Random.secure();
    return List.generate(32, (_) => random.nextInt(16).toRadixString(16)).join();
  }

  /// Open Steam login in Safari — callback redirects via Universal Link
  Future<void> openSteamLogin() async {
    final returnTo = '${AppConstants.apiBaseUrl}/auth/steam/callback';
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

  /// Open Steam login and return nonce for polling fallback.
  /// Primary flow: Universal Link deep link fires -> app receives token directly.
  /// Fallback: App polls /auth/steam/poll/:nonce every 3s.
  Future<String> openSteamLoginWithPolling() async {
    final nonce = _generateNonce();
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
    return nonce;
  }

  /// Poll backend for Steam login result. Returns token string or null.
  Future<String?> pollSteamLogin(String nonce, ApiClient api) async {
    try {
      final response = await api.get('/auth/steam/poll/$nonce');
      final data = response.data as Map<String, dynamic>;
      final status = data['status'] as String?;
      if (status == 'authenticated') {
        return data['token'] as String?;
      }
      if (status == 'error') {
        throw Exception(data['error'] ?? 'Login failed');
      }
      return null; // still pending
    } catch (e) {
      if (e is Exception && e.toString().contains('Login failed')) rethrow;
      return null; // network error, keep polling
    }
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
