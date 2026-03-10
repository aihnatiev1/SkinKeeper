import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../widgets/shared_ui.dart';
import 'steam_auth_service.dart';

// ─── Login QR state ──────────────────────────────────────────────────────

class _LoginQrState {
  final String? qrImage;
  final String? nonce;
  final String status; // idle | loading | ready | pending | authenticated | expired | error
  final String? error;

  const _LoginQrState({
    this.qrImage,
    this.nonce,
    this.status = 'idle',
    this.error,
  });

  _LoginQrState copyWith({String? qrImage, String? nonce, String? status, String? error}) =>
      _LoginQrState(
        qrImage: qrImage ?? this.qrImage,
        nonce: nonce ?? this.nonce,
        status: status ?? this.status,
        error: error,
      );
}

final _loginQrProvider =
    StateNotifierProvider<_LoginQrNotifier, _LoginQrState>((ref) {
  return _LoginQrNotifier(ref);
});

class _LoginQrNotifier extends StateNotifier<_LoginQrState> {
  final Ref _ref;
  _LoginQrNotifier(this._ref) : super(const _LoginQrState());

  Future<void> startQR() async {
    state = state.copyWith(status: 'loading', error: null);
    try {
      final api = _ref.read(apiClientProvider);
      final response = await api.post('/auth/qr/start');
      final data = response.data as Map<String, dynamic>;
      state = state.copyWith(
        qrImage: data['qrImage'] as String?,
        nonce: data['nonce'] as String?,
        status: 'ready',
      );
    } catch (e) {
      state = state.copyWith(status: 'error', error: e.toString());
    }
  }

  /// Returns status string. If 'authenticated', also saves JWT.
  Future<String> pollQR() async {
    final nonce = state.nonce;
    if (nonce == null) return 'error';
    try {
      final api = _ref.read(apiClientProvider);
      final response = await api.get('/auth/qr/poll/$nonce');
      final data = response.data as Map<String, dynamic>;
      final pollStatus = data['status'] as String? ?? 'pending';
      state = state.copyWith(status: pollStatus);

      if (pollStatus == 'authenticated') {
        final token = data['token'] as String?;
        if (token != null) {
          await api.saveToken(token);
        }
      }

      return pollStatus;
    } catch (e) {
      return 'error';
    }
  }

  void reset() => state = const _LoginQrState();
}

// ─── Login Screen ────────────────────────────────────────────────────────

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  int _selectedTab = 0;
  late final PageController _pageCtrl;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _pageCtrl = PageController();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(_loginQrProvider.notifier).startQR().then((_) {
        _startPolling();
      });
    });
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      final status = await ref.read(_loginQrProvider.notifier).pollQR();
      if (!mounted) return;
      if (status == 'authenticated') {
        _pollTimer?.cancel();
        ref.invalidate(authStateProvider);
      } else if (status == 'expired') {
        _pollTimer?.cancel();
      }
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _pageCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final isLoading = authState.isLoading;

    ref.listen(authStateProvider, (prev, next) {
      if (next.hasError) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Login failed: ${friendlyError(next.error)}'),
            backgroundColor: AppTheme.loss,
          ),
        );
      }
    });

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF0A0E1A), Color(0xFF0F1629), Color(0xFF131A30)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              const SizedBox(height: 32),
              _buildHeader(),
              const SizedBox(height: 24),

              // Tab bar
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: PillTabSelector(
                  tabs: const ['QR Login', 'Steam Browser'],
                  selected: _selectedTab,
                  onChanged: (i) {
                    setState(() => _selectedTab = i);
                    _pageCtrl.animateToPage(i, duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
                  },
                ),
              ).animate().fadeIn(duration: 400.ms, delay: 400.ms),

              Expanded(
                child: PageView(
                  controller: _pageCtrl,
                  onPageChanged: (i) => setState(() => _selectedTab = i),
                  children: [
                    _buildQrTab(),
                    _buildBrowserTab(isLoading),
                  ],
                ),
              ),

              // Dev login
              Padding(
                padding: const EdgeInsets.fromLTRB(32, 0, 32, 16),
                child: GestureDetector(
                  onTap: isLoading
                      ? null
                      : () {
                          HapticFeedback.lightImpact();
                          ref.read(authStateProvider.notifier).devLogin();
                        },
                  child: Container(
                    width: double.infinity,
                    height: 44,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(AppTheme.r16),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: const Center(
                      child: Text(
                        'Dev Login (Quake 3)',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: AppTheme.textMuted,
                        ),
                      ),
                    ),
                  ),
                ),
              ).animate().fadeIn(duration: 400.ms, delay: 600.ms),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      children: [
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            gradient: AppTheme.primaryGradient,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: AppTheme.primary.withValues(alpha: 0.35),
                blurRadius: 40,
                spreadRadius: -4,
              ),
            ],
          ),
          child: const Icon(Icons.shield_rounded, size: 40, color: Colors.white),
        )
            .animate()
            .fadeIn(duration: 600.ms)
            .scale(
              begin: const Offset(0.8, 0.8),
              duration: 600.ms,
              curve: Curves.easeOutBack,
            ),
        const SizedBox(height: 20),
        const Text('SkinKeeper', style: AppTheme.h1)
            .animate()
            .fadeIn(duration: 500.ms, delay: 200.ms),
        const SizedBox(height: 8),
        Text(
          'Track your CS2 inventory value\nacross all markets',
          textAlign: TextAlign.center,
          style: AppTheme.subtitle.copyWith(height: 1.5),
        ).animate().fadeIn(duration: 500.ms, delay: 350.ms),
      ],
    );
  }

  Widget _buildQrTab() {
    final qrState = ref.watch(_loginQrProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const SizedBox(height: 8),
          Text(
            'Scan with Steam Mobile App',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Open the Steam app → Guard section → scan the QR code below.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.white60,
                ),
          ),
          const SizedBox(height: 24),
          _buildQrArea(qrState),
          const SizedBox(height: 20),
          _buildStatusText(qrState),
          if (qrState.status == 'expired') ...[
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () {
                ref.read(_loginQrProvider.notifier).startQR().then((_) {
                  _startPolling();
                });
              },
              icon: const Icon(Icons.refresh, size: 20),
              label: const Text('Generate New QR Code'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildQrArea(_LoginQrState state) {
    if (state.status == 'loading') {
      return Container(
        width: 220,
        height: 220,
        decoration: BoxDecoration(
          color: Colors.white.withAlpha(10),
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Center(child: CircularProgressIndicator()),
      );
    }

    if (state.error != null) {
      return Container(
        width: 220,
        height: 220,
        decoration: BoxDecoration(
          color: Colors.white.withAlpha(10),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
              const SizedBox(height: 12),
              Text(
                'Failed to load QR',
                style: TextStyle(color: Colors.red[300], fontSize: 14),
              ),
            ],
          ),
        ),
      );
    }

    if (state.qrImage != null) {
      final raw = state.qrImage!;
      final base64Str = raw.contains(',') ? raw.split(',').last : raw;
      final bytes = base64Decode(base64Str);

      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.memory(bytes, width: 196, height: 196, fit: BoxFit.contain),
        ),
      )
          .animate()
          .fadeIn(duration: 300.ms)
          .scale(begin: const Offset(0.95, 0.95), duration: 300.ms);
    }

    return Container(
      width: 220,
      height: 220,
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(10),
        borderRadius: BorderRadius.circular(16),
      ),
      child: const Center(
        child: Icon(Icons.qr_code_2, size: 64, color: Colors.white24),
      ),
    );
  }

  Widget _buildStatusText(_LoginQrState state) {
    final (String text, Color color) = switch (state.status) {
      'ready' || 'polling' || 'pending' => ('Waiting for scan...', Colors.white60),
      'authenticated' => ('Authenticated!', const Color(0xFF00E676)),
      'expired' => ('QR code expired', const Color(0xFFFF5252)),
      'error' => ('Something went wrong', const Color(0xFFFF5252)),
      _ => ('', Colors.transparent),
    };

    if (text.isEmpty) return const SizedBox.shrink();
    return Text(text, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: color));
  }

  Widget _buildBrowserTab(bool isLoading) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.open_in_browser, size: 64, color: Colors.white24),
            const SizedBox(height: 20),
            Text(
              'Opens Steam login in your browser.\nAfter signing in, you\'ll be redirected back.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Colors.white60,
                    height: 1.5,
                  ),
            ),
            const SizedBox(height: 32),
            if (isLoading)
              const Padding(
                padding: EdgeInsets.only(bottom: 24),
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2.5, color: AppTheme.primary),
                ),
              ),
            GestureDetector(
              onTap: isLoading
                  ? null
                  : () {
                      HapticFeedback.mediumImpact();
                      ref.read(authServiceProvider).openSteamLogin();
                    },
              child: Container(
                width: double.infinity,
                height: 56,
                decoration: BoxDecoration(
                  color: const Color(0xFF1B2838),
                  borderRadius: BorderRadius.circular(AppTheme.r16),
                  border: Border.all(color: const Color(0xFF2A475E)),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF1B2838).withValues(alpha: 0.4),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.login_rounded, size: 22, color: Colors.white),
                    SizedBox(width: 12),
                    Text(
                      'Sign in with Steam',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}