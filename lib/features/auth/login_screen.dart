import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'steam_auth_service.dart';
import '../inventory/inventory_provider.dart';
import '../portfolio/portfolio_provider.dart';
import '../portfolio/portfolio_pl_provider.dart';
import '../trades/trades_provider.dart';
import '../transactions/transactions_provider.dart';
import '../../models/user.dart';

// --- Login Screen -------------------------------------------------------

class LoginScreen extends ConsumerStatefulWidget {
  final bool isLinking;
  const LoginScreen({super.key, this.isLinking = false});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  String? _nonce;
  Timer? _pollTimer;
  bool _isPolling = false;
  bool _timedOut = false;

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _startLogin() async {
    setState(() {
      _isPolling = true;
      _timedOut = false;
    });
    try {
      final authService = ref.read(authServiceProvider);
      if (widget.isLinking) {
        await authService.openSteamLinkLogin(ref);
        // Link flow uses deep link callback only, no polling
        return;
      }
      _nonce = await authService.openSteamLoginWithPolling();
      _startPolling();
    } catch (e) {
      if (mounted) {
        setState(() {
          _isPolling = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Failed to open Steam login: ${friendlyError(e)}'),
          backgroundColor: AppTheme.loss,
        ));
      }
    }
  }

  void _startPolling() {
    int attempts = 0;
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      attempts++;
      if (attempts > 20) {
        // 60 seconds
        timer.cancel();
        if (mounted) setState(() { _isPolling = false; _timedOut = true; });
        return;
      }
      // Guard: if deep link already handled auth, stop polling
      final currentUser = ref.read(authStateProvider).valueOrNull;
      if (currentUser != null) {
        timer.cancel();
        if (mounted) setState(() { _isPolling = false; });
        return;
      }
      final api = ref.read(apiClientProvider);
      final authService = ref.read(authServiceProvider);
      try {
        final token = await authService.pollSteamLogin(_nonce!, api);
        if (token != null && mounted) {
          timer.cancel();
          await _completeLogin(token);
        }
      } catch (e) {
        // Login failed error from backend
        timer.cancel();
        if (mounted) {
          setState(() { _isPolling = false; });
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Login failed: ${friendlyError(e)}'),
            backgroundColor: AppTheme.loss,
          ));
        }
      }
    });
  }

  Future<void> _completeLogin(String token) async {
    // Guard: deep link may have already set the user
    final currentUser = ref.read(authStateProvider).valueOrNull;
    if (currentUser != null) {
      if (mounted) setState(() { _isPolling = false; });
      return;
    }
    final api = ref.read(apiClientProvider);
    await api.saveToken(token);
    final resp = await api.get('/auth/me');
    final user = SteamUser.fromJson(resp.data as Map<String, dynamic>);
    ref.read(authStateProvider.notifier).setUser(user);

    // Invalidate all data providers for fresh fetch
    ref.invalidate(inventoryProvider);
    ref.invalidate(portfolioProvider);
    ref.invalidate(portfolioPLProvider);
    ref.invalidate(tradesProvider);
    ref.invalidate(transactionsProvider);

    // Background inventory sync from Steam
    Future.microtask(() async {
      try {
        await api.post('/inventory/refresh');
        ref.invalidate(inventoryProvider);
        ref.invalidate(portfolioProvider);
      } catch (_) {}
    });

    if (mounted) setState(() { _isPolling = false; });
    // Router will redirect to /portfolio automatically
  }

  Future<void> _checkNow() async {
    if (_nonce == null) return;
    final currentUser = ref.read(authStateProvider).valueOrNull;
    if (currentUser != null) {
      _pollTimer?.cancel();
      if (mounted) setState(() { _isPolling = false; });
      return;
    }
    final api = ref.read(apiClientProvider);
    final authService = ref.read(authServiceProvider);
    try {
      final token = await authService.pollSteamLogin(_nonce!, api);
      if (token != null && mounted) {
        _pollTimer?.cancel();
        await _completeLogin(token);
      }
    } catch (_) {
      // Ignore — user can retry
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(authStateProvider, (_, next) {
      if (next.hasError) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Login failed: ${friendlyError(next.error)}'),
          backgroundColor: AppTheme.loss,
        ));
      }
      // If deep link set the user while polling, stop polling
      if (next.valueOrNull != null) {
        _pollTimer?.cancel();
        if (_isPolling && mounted) {
          setState(() { _isPolling = false; });
        }
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
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              children: [
                if (canPop)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: const EdgeInsets.only(left: 0),
                      child: IconButton(
                        icon: const Icon(Icons.arrow_back_ios_new_rounded,
                            size: 20, color: AppTheme.textSecondary),
                        onPressed: () => context.pop(),
                      ),
                    ),
                  ),
                SizedBox(height: canPop ? 8 : 32),
                _buildHeader(),
                const SizedBox(height: 32),
                _buildFeaturePills(),
                const Spacer(),
                _buildSteamButton(),
                const SizedBox(height: 12),
                if (_isPolling) _buildPollingStatus(),
                if (_timedOut) _buildTimeoutStatus(),
                if (!_isPolling && !_timedOut) _buildSecurityNote(),
                SizedBox(height: MediaQuery.of(context).padding.bottom + 32),
              ],
            ),
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

  Widget _buildFeaturePills() {
    const features = [
      ('Real-time prices', Icons.trending_up_rounded),
      ('Portfolio tracking', Icons.pie_chart_rounded),
      ('Price alerts', Icons.notifications_active_rounded),
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      alignment: WrapAlignment.center,
      children: features.map((f) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: AppTheme.primary.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: AppTheme.primary.withValues(alpha: 0.15),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(f.$2, size: 14, color: AppTheme.primaryLight),
              const SizedBox(width: 6),
              Text(
                f.$1,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: AppTheme.textSecondary,
                ),
              ),
            ],
          ),
        );
      }).toList(),
    ).animate().fadeIn(duration: 500.ms, delay: 500.ms);
  }

  Widget _buildSteamButton() {
    return GestureDetector(
      onTap: _isPolling
          ? null
          : () {
              HapticFeedback.mediumImpact();
              _startLogin();
            },
      child: AnimatedOpacity(
        opacity: _isPolling ? 0.6 : 1.0,
        duration: const Duration(milliseconds: 200),
        child: Container(
          width: double.infinity,
          height: 56,
          decoration: BoxDecoration(
            color: const Color(0xFF1B2838),
            borderRadius: BorderRadius.circular(AppTheme.r16),
            border: Border.all(color: const Color(0xFF2A475E)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.login_rounded, size: 22, color: Colors.white),
              const SizedBox(width: 12),
              Text(
                widget.isLinking ? 'Link with Steam' : 'Continue with Steam',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    ).animate().fadeIn(duration: 500.ms, delay: 650.ms).slideY(
          begin: 0.1,
          duration: 500.ms,
          delay: 650.ms,
          curve: Curves.easeOut,
        );
  }

  Widget _buildPollingStatus() {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppTheme.textMuted,
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'Waiting for Steam login...',
                style: TextStyle(
                  fontSize: 13,
                  color: AppTheme.textMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: _checkNow,
            child: Text(
              'Completed login? Tap to continue',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: AppTheme.primary.withValues(alpha: 0.8),
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  Widget _buildTimeoutStatus() {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: GestureDetector(
        onTap: _startLogin,
        child: const Text(
          'Login timed out. Tap to try again.',
          style: TextStyle(
            fontSize: 13,
            color: AppTheme.textMuted,
          ),
        ),
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  Widget _buildSecurityNote() {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text(
        'Safe and secure — uses official Steam OpenID',
        style: TextStyle(
          fontSize: 12,
          color: Colors.white.withValues(alpha: 0.3),
        ),
      ),
    ).animate().fadeIn(duration: 500.ms, delay: 800.ms);
  }
}
