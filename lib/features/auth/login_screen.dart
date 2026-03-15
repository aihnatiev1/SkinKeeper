import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../settings/accounts_provider.dart';
import '../../widgets/shared_ui.dart';
import 'session_provider.dart';
import 'steam_auth_service.dart';
import 'widgets/clienttoken_auth_tab.dart';

// ─── QR state ────────────────────────────────────────────────────────────

class _QrState {
  final String? qrImage;
  final String? nonce;
  final String status; // idle | loading | ready | pending | authenticated | expired | error
  final String? error;

  const _QrState({
    this.qrImage,
    this.nonce,
    this.status = 'idle',
    this.error,
  });

  _QrState copyWith({String? qrImage, String? nonce, String? status, String? error}) =>
      _QrState(
        qrImage: qrImage ?? this.qrImage,
        nonce: nonce ?? this.nonce,
        status: status ?? this.status,
        error: error,
      );
}

final _qrProvider = StateNotifierProvider<_QrNotifier, _QrState>((ref) => _QrNotifier(ref));

class _QrNotifier extends StateNotifier<_QrState> {
  final Ref _ref;
  _QrNotifier(this._ref) : super(const _QrState());

  Future<void> startQR({bool isLinking = false}) async {
    state = state.copyWith(status: 'loading', error: null);
    try {
      final api = _ref.read(apiClientProvider);
      // Linking: use session endpoint (requires JWT, returns accountId on success)
      // Initial login: use auth endpoint (no JWT required)
      final endpoint = isLinking
          ? '/session/qr/start?linkMode=true'
          : '/auth/qr/start';
      final response = await api.post(endpoint);
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

  Future<String> pollQR({bool isLinking = false}) async {
    final nonce = state.nonce;
    if (nonce == null) return 'error';
    try {
      final api = _ref.read(apiClientProvider);
      final endpoint = isLinking
          ? '/session/qr/poll/$nonce?linkMode=true'
          : '/auth/qr/poll/$nonce';
      final response = await api.get(endpoint);
      final data = response.data as Map<String, dynamic>;
      final pollStatus = data['status'] as String? ?? 'pending';
      state = state.copyWith(status: pollStatus);

      if (pollStatus == 'authenticated' && !isLinking) {
        final token = data['token'] as String?;
        if (token != null) await api.saveToken(token);
      }

      return pollStatus;
    } catch (e) {
      return 'error';
    }
  }

  void reset() => state = const _QrState();
}

// ─── Login Screen ────────────────────────────────────────────────────────

class LoginScreen extends ConsumerStatefulWidget {
  final bool isLinking;
  const LoginScreen({super.key, this.isLinking = false});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  int _selectedTab = 0; // 0 = Login, 1 = Webtoken, 2 = QR
  late final PageController _pageCtrl;
  Timer? _pollTimer;
  bool _qrStarted = false;

  @override
  void initState() {
    super.initState();
    _pageCtrl = PageController();
  }

  void _onTabChanged(int i) {
    setState(() => _selectedTab = i);
    _pageCtrl.animateToPage(i,
        duration: const Duration(milliseconds: 1), curve: Curves.linear);
    _maybeStartQr(i);
  }

  void _onPageChanged(int i) {
    setState(() => _selectedTab = i);
    _maybeStartQr(i);
  }

  void _maybeStartQr(int i) {
    if (i == 2 && !_qrStarted) {
      _qrStarted = true;
      ref.read(_qrProvider.notifier)
          .startQR(isLinking: widget.isLinking)
          .then((_) { if (mounted) _startPolling(); });
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      final status = await ref.read(_qrProvider.notifier).pollQR(isLinking: widget.isLinking);
      if (!mounted) return;
      if (status == 'authenticated') {
        _pollTimer?.cancel();
        if (widget.isLinking) {
          ref.invalidate(accountsProvider);
          if (mounted) context.pop();
        } else {
          await ref.read(sessionStatusProvider.notifier).refresh();
          ref.invalidate(authStateProvider);
          if (!mounted) return;
          context.canPop() ? context.pop() : context.go('/portfolio');
        }
      } else if (status == 'expired') {
        _pollTimer?.cancel();
      }
    });
  }

  Future<void> _startSteamLoginWithPolling() async {
    final nonce = await ref.read(authServiceProvider).openSteamLogin();
    final api = ref.read(apiClientProvider);
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      final token = await SteamAuthService.pollLogin(api, nonce);
      if (!mounted) return;
      if (token != null) {
        _pollTimer?.cancel();
        await api.saveToken(token);
        ref.invalidate(authStateProvider);
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

    ref.listen(authStateProvider, (_, next) {
      if (next.hasError) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Login failed: ${friendlyError(next.error)}'),
          backgroundColor: AppTheme.loss,
        ));
      }
    });

    final canPop = context.canPop();

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
              if (canPop)
                Align(
                  alignment: Alignment.centerLeft,
                  child: IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 20, color: AppTheme.textSecondary),
                    onPressed: () => context.pop(),
                  ),
                ),
              SizedBox(height: canPop ? 8 : 32),
              _buildHeader(),
              const SizedBox(height: 24),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: PillTabSelector(
                  tabs: const ['Login', 'Webtoken', 'QR'],
                  selected: _selectedTab,
                  onChanged: _onTabChanged,
                ),
              ).animate().fadeIn(duration: 400.ms, delay: 400.ms),
              Expanded(
                child: PageView(
                  controller: _pageCtrl,
                  onPageChanged: _onPageChanged,
                  children: [
                    _buildBrowserTab(isLoading),
                    ClientTokenAuthTab(isLinking: widget.isLinking),
                    _buildQrTab(),
                  ],
                ),
              ),
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
        ).animate().fadeIn(duration: 600.ms).scale(
              begin: const Offset(0.8, 0.8),
              duration: 600.ms,
              curve: Curves.easeOutBack,
            ),
        const SizedBox(height: 20),
        Text(
          widget.isLinking ? 'Link Account' : 'SkinKeeper',
          style: AppTheme.h1,
        ).animate().fadeIn(duration: 500.ms, delay: 200.ms),
        const SizedBox(height: 8),
        Text(
          widget.isLinking
              ? 'Sign in with another Steam account\nto link it to your profile.'
              : 'Track your CS2 inventory value\nacross all markets',
          textAlign: TextAlign.center,
          style: AppTheme.subtitle.copyWith(height: 1.5),
        ).animate().fadeIn(duration: 500.ms, delay: 350.ms),
      ],
    );
  }

  Widget _buildQrTab() {
    final qrState = ref.watch(_qrProvider);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const SizedBox(height: 8),
          Text('Scan with Steam Mobile App',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  )),
          const SizedBox(height: 8),
          Text(
            'Open the Steam app → Guard section → scan the QR code below.',
            textAlign: TextAlign.center,
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: Colors.white60),
          ),
          const SizedBox(height: 24),
          _buildQrArea(qrState),
          const SizedBox(height: 20),
          _buildQrStatus(qrState),
          if (qrState.status == 'expired') ...[
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () {
                setState(() => _qrStarted = false);
                ref.read(_qrProvider.notifier).reset();
                _onTabChanged(2);
              },
              icon: const Icon(Icons.refresh, size: 20),
              label: const Text('Generate New QR Code'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildQrArea(_QrState state) {
    if (state.status == 'loading') {
      return Container(
        width: 220, height: 220,
        decoration: BoxDecoration(
            color: Colors.white.withAlpha(10),
            borderRadius: BorderRadius.circular(16)),
        child: const Center(child: CircularProgressIndicator()),
      );
    }
    if (state.error != null) {
      return Container(
        width: 220, height: 280,
        decoration: BoxDecoration(
            color: Colors.white.withAlpha(10),
            borderRadius: BorderRadius.circular(16)),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
                const SizedBox(height: 12),
                Text('Failed to load QR',
                    style: TextStyle(color: Colors.red[300], fontSize: 14)),
                const SizedBox(height: 8),
                Text(state.error!,
                    style: TextStyle(color: Colors.red[200], fontSize: 11),
                    textAlign: TextAlign.center,
                    maxLines: 5,
                    overflow: TextOverflow.ellipsis),
              ],
            ),
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
            color: Colors.white, borderRadius: BorderRadius.circular(16)),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.memory(bytes, width: 196, height: 196, fit: BoxFit.contain),
        ),
      ).animate().fadeIn(duration: 300.ms).scale(
            begin: const Offset(0.95, 0.95), duration: 300.ms);
    }
    return Container(
      width: 220, height: 220,
      decoration: BoxDecoration(
          color: Colors.white.withAlpha(10),
          borderRadius: BorderRadius.circular(16)),
      child: const Center(child: Icon(Icons.qr_code_2, size: 64, color: Colors.white24)),
    );
  }

  Widget _buildQrStatus(_QrState state) {
    final (String text, Color color) = switch (state.status) {
      'ready' || 'polling' || 'pending' => ('Waiting for scan...', Colors.white60),
      'authenticated' => ('Authenticated!', const Color(0xFF00E676)),
      'expired' => ('QR code expired', const Color(0xFFFF5252)),
      'error' => ('Something went wrong', const Color(0xFFFF5252)),
      _ => ('', Colors.transparent),
    };
    if (text.isEmpty) return const SizedBox.shrink();
    return Text(text,
        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: color));
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
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: Colors.white60, height: 1.5),
            ),
            const SizedBox(height: 32),
            if (isLoading)
              const Padding(
                padding: EdgeInsets.only(bottom: 24),
                child: SizedBox(
                  width: 24, height: 24,
                  child: CircularProgressIndicator(
                      strokeWidth: 2.5, color: AppTheme.primary),
                ),
              ),
            GestureDetector(
              onTap: isLoading
                  ? null
                  : () {
                      HapticFeedback.mediumImpact();
                      if (widget.isLinking) {
                        ref.read(authServiceProvider).openSteamLinkLogin(ref);
                      } else {
                        _startSteamLoginWithPolling();
                      }
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
                    Text('Sign in with Steam',
                        style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w600,
                            color: Colors.white)),
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
