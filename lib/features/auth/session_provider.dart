import 'dart:developer' as dev;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';

// ---------------------------------------------------------------------------
// Link mode — shared between session screen and auth providers
// ---------------------------------------------------------------------------

final sessionLinkModeProvider = StateProvider<bool>((ref) => false);

// ---------------------------------------------------------------------------
// Session status
// ---------------------------------------------------------------------------

class SessionStatus {
  final String status;
  final String? activeAccountName;
  final bool needsReauth;
  final bool refreshTokenExpired;
  final String? refreshTokenExpiresAt;

  const SessionStatus({
    this.status = 'none',
    this.activeAccountName,
    this.needsReauth = false,
    this.refreshTokenExpired = false,
    this.refreshTokenExpiresAt,
  });
}

final sessionStatusProvider =
    AsyncNotifierProvider<SessionStatusNotifier, SessionStatus>(
  SessionStatusNotifier.new,
);

class SessionStatusNotifier extends AsyncNotifier<SessionStatus> {
  @override
  Future<SessionStatus> build() async {
    return _fetchStatus();
  }

  Future<SessionStatus> _fetchStatus() async {
    try {
      final api = ref.read(apiClientProvider);
      final response = await api.get('/session/status');
      final data = response.data as Map<String, dynamic>;
      final status = data['status'] as String? ?? 'none';
      final needsReauth = data['needsReauth'] as bool? ?? false;
      final refreshTokenExpired = data['refreshTokenExpired'] as bool? ?? false;
      final refreshTokenExpiresAt = data['refreshTokenExpiresAt'] as String?;
      // Find active account name from the accounts list
      String? activeAccountName;
      final accounts = data['accounts'] as List<dynamic>?;
      if (accounts != null) {
        for (final acc in accounts) {
          final a = acc as Map<String, dynamic>;
          if (a['isActive'] == true) {
            activeAccountName = a['displayName'] as String?;
            break;
          }
        }
      }
      return SessionStatus(
        status: status,
        activeAccountName: activeAccountName,
        needsReauth: needsReauth,
        refreshTokenExpired: refreshTokenExpired,
        refreshTokenExpiresAt: refreshTokenExpiresAt,
      );
    } catch (e) {
      dev.log('Session status fetch failed: $e', name: 'Session');
      return const SessionStatus();
    }
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _fetchStatus());
  }
}

// ---------------------------------------------------------------------------
// QR auth
// ---------------------------------------------------------------------------

class QrAuthState {
  final String? qrImage;
  final String? nonce;
  final String status; // 'idle' | 'loading' | 'ready' | 'polling' | 'authenticated' | 'expired' | 'error'
  final bool loading;
  final String? error;

  const QrAuthState({
    this.qrImage,
    this.nonce,
    this.status = 'idle',
    this.loading = false,
    this.error,
  });

  QrAuthState copyWith({
    String? qrImage,
    String? nonce,
    String? status,
    bool? loading,
    String? error,
  }) {
    return QrAuthState(
      qrImage: qrImage ?? this.qrImage,
      nonce: nonce ?? this.nonce,
      status: status ?? this.status,
      loading: loading ?? this.loading,
      error: error,
    );
  }
}

final qrAuthProvider =
    StateNotifierProvider<QrAuthNotifier, QrAuthState>((ref) {
  return QrAuthNotifier(ref);
});

class QrAuthNotifier extends StateNotifier<QrAuthState> {
  final Ref _ref;

  QrAuthNotifier(this._ref) : super(const QrAuthState());

  Future<void> startQR() async {
    state = state.copyWith(loading: true, status: 'loading', error: null);
    try {
      final api = _ref.read(apiClientProvider);
      final linkMode = _ref.read(sessionLinkModeProvider);
      final query = linkMode ? '?linkMode=true' : '';
      final response = await api.post('/session/qr/start$query');
      final data = response.data as Map<String, dynamic>;
      state = state.copyWith(
        qrImage: data['qrImage'] as String?,
        nonce: data['nonce'] as String?,
        status: 'ready',
        loading: false,
      );
    } catch (e) {
      dev.log('QR start failed: $e', name: 'Session');
      state = state.copyWith(
        status: 'error',
        loading: false,
        error: e.toString(),
      );
    }
  }

  Future<String> pollQR() async {
    final nonce = state.nonce;
    if (nonce == null) return 'error';
    try {
      final api = _ref.read(apiClientProvider);
      final linkMode = _ref.read(sessionLinkModeProvider);
      final query = linkMode ? '?linkMode=true' : '';
      final response = await api.get('/session/qr/poll/$nonce$query');
      final data = response.data as Map<String, dynamic>;
      final pollStatus = data['status'] as String? ?? 'pending';

      state = state.copyWith(status: pollStatus);
      return pollStatus;
    } catch (e) {
      dev.log('QR poll failed: $e', name: 'Session');
      return 'error';
    }
  }

  void reset() {
    state = const QrAuthState();
  }
}

// ---------------------------------------------------------------------------
// Credential auth (login + guard)
// ---------------------------------------------------------------------------

class CredentialAuthState {
  final String? nonce;
  final bool guardRequired;
  final String status; // 'idle' | 'loading' | 'guard' | 'authenticated' | 'error'
  final bool loading;
  final String? error;

  const CredentialAuthState({
    this.nonce,
    this.guardRequired = false,
    this.status = 'idle',
    this.loading = false,
    this.error,
  });

  CredentialAuthState copyWith({
    String? nonce,
    bool? guardRequired,
    String? status,
    bool? loading,
    String? error,
  }) {
    return CredentialAuthState(
      nonce: nonce ?? this.nonce,
      guardRequired: guardRequired ?? this.guardRequired,
      status: status ?? this.status,
      loading: loading ?? this.loading,
      error: error,
    );
  }
}

final credentialAuthProvider =
    StateNotifierProvider<CredentialAuthNotifier, CredentialAuthState>((ref) {
  return CredentialAuthNotifier(ref);
});

class CredentialAuthNotifier extends StateNotifier<CredentialAuthState> {
  final Ref _ref;

  CredentialAuthNotifier(this._ref) : super(const CredentialAuthState());

  Future<void> login(String username, String password) async {
    state = state.copyWith(loading: true, status: 'loading', error: null);
    try {
      final api = _ref.read(apiClientProvider);
      final linkMode = _ref.read(sessionLinkModeProvider);
      final query = linkMode ? '?linkMode=true' : '';
      final response = await api.post('/session/login$query', data: {
        'username': username,
        'password': password,
      });
      final data = response.data as Map<String, dynamic>;
      final guardRequired = data['guardRequired'] as bool? ?? false;

      state = state.copyWith(
        nonce: data['nonce'] as String?,
        guardRequired: guardRequired,
        status: guardRequired ? 'guard' : 'authenticated',
        loading: false,
      );
    } catch (e) {
      dev.log('Credential login failed: $e', name: 'Session');
      state = state.copyWith(
        status: 'error',
        loading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> submitGuard(String code) async {
    state = state.copyWith(loading: true, error: null);
    try {
      final api = _ref.read(apiClientProvider);
      final response = await api.post('/session/guard', data: {
        'nonce': state.nonce,
        'code': code,
      });
      final data = response.data as Map<String, dynamic>;
      final status = data['status'] as String? ?? 'pending';

      state = state.copyWith(
        status: status,
        loading: false,
      );
    } catch (e) {
      dev.log('Guard submit failed: $e', name: 'Session');
      state = state.copyWith(
        status: 'error',
        loading: false,
        error: e.toString(),
      );
    }
  }

  void reset() {
    state = const CredentialAuthState();
  }
}

// ---------------------------------------------------------------------------
// Client token auth
// ---------------------------------------------------------------------------

class ClientTokenAuthState {
  final String status; // 'idle' | 'loading' | 'authenticated' | 'error'
  final bool loading;
  final String? error;

  const ClientTokenAuthState({
    this.status = 'idle',
    this.loading = false,
    this.error,
  });

  ClientTokenAuthState copyWith({
    String? status,
    bool? loading,
    String? error,
  }) {
    return ClientTokenAuthState(
      status: status ?? this.status,
      loading: loading ?? this.loading,
      error: error,
    );
  }
}

final clientTokenAuthProvider =
    StateNotifierProvider<ClientTokenAuthNotifier, ClientTokenAuthState>((ref) {
  return ClientTokenAuthNotifier(ref);
});

class ClientTokenAuthNotifier extends StateNotifier<ClientTokenAuthState> {
  final Ref _ref;

  ClientTokenAuthNotifier(this._ref) : super(const ClientTokenAuthState());

  Future<void> submitToken(String steamLoginSecure) async {
    state = state.copyWith(loading: true, status: 'loading', error: null);
    try {
      final api = _ref.read(apiClientProvider);
      final linkMode = _ref.read(sessionLinkModeProvider);
      final query = linkMode ? '?linkMode=true' : '';
      await api.post('/session/token$query', data: {
        'steamLoginSecure': steamLoginSecure,
      });

      state = state.copyWith(
        status: 'authenticated',
        loading: false,
      );
    } catch (e) {
      dev.log('Token submit failed: $e', name: 'Session');
      state = state.copyWith(
        status: 'error',
        loading: false,
        error: e.toString(),
      );
    }
  }

  void reset() {
    state = const ClientTokenAuthState();
  }
}
