import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';

class SteamSessionStatus {
  final bool hasSession;
  final bool hasToken;
  final bool configured;

  const SteamSessionStatus({
    this.hasSession = false,
    this.hasToken = false,
    this.configured = false,
  });

  factory SteamSessionStatus.fromJson(Map<String, dynamic> json) {
    return SteamSessionStatus(
      hasSession: json['hasSession'] as bool? ?? false,
      hasToken: json['hasToken'] as bool? ?? false,
      configured: json['configured'] as bool? ?? false,
    );
  }
}

final steamSessionStatusProvider =
    AsyncNotifierProvider<SteamSessionNotifier, SteamSessionStatus>(
        SteamSessionNotifier.new);

class SteamSessionNotifier extends AsyncNotifier<SteamSessionStatus> {
  @override
  Future<SteamSessionStatus> build() async {
    final api = ref.read(apiClientProvider);
    try {
      final response = await api.get('/market/session/status');
      return SteamSessionStatus.fromJson(
          response.data as Map<String, dynamic>);
    } catch (_) {
      return const SteamSessionStatus();
    }
  }

  /// Submit clientjstoken JSON from steamcommunity.com/chat/clientjstoken
  Future<String> submitClientToken(String jsonStr) async {
    final api = ref.read(apiClientProvider);

    // Parse the JSON
    final Map<String, dynamic> tokenData;
    try {
      tokenData = jsonDecode(jsonStr) as Map<String, dynamic>;
    } catch (_) {
      throw Exception('Invalid JSON. Copy the full response from the page.');
    }

    if (tokenData['logged_in'] != true) {
      throw Exception('Token shows not logged in. Log into Steam first.');
    }

    final steamid = tokenData['steamid'] as String?;
    final token = tokenData['token'] as String?;

    if (steamid == null || token == null) {
      throw Exception('Missing steamid or token in the JSON.');
    }

    final response = await api.post('/market/clienttoken', data: {
      'steamid': steamid,
      'token': token,
      'account_name': tokenData['account_name'],
    });

    final data = response.data as Map<String, dynamic>;

    // Refresh status
    state = AsyncData(await build());

    return data['message'] as String? ?? 'Session configured successfully!';
  }

  /// Submit manual cookies
  Future<void> submitManualSession(
      String sessionId, String steamLoginSecure) async {
    final api = ref.read(apiClientProvider);
    await api.post('/market/session', data: {
      'sessionId': sessionId,
      'steamLoginSecure': steamLoginSecure,
    });
    state = AsyncData(await build());
  }
}
