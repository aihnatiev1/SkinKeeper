import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../widgets/shared_ui.dart';
import 'session_provider.dart';
import 'steam_auth_service.dart';
import 'widgets/clienttoken_auth_tab.dart';
import 'widgets/qr_auth_tab.dart';

// ─── Login Screen ────────────────────────────────────────────────────────

class LoginScreen extends ConsumerStatefulWidget {
  final bool isLinking;
  const LoginScreen({super.key, this.isLinking = false});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  int _selectedTab = 0; // 0 = Token, 1 = Browser, 2 = QR
  late final PageController _pageCtrl;

  @override
  void initState() {
    super.initState();
    _pageCtrl = PageController();
    
    // Set link mode in provider if needed
    if (widget.isLinking) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(sessionLinkModeProvider.notifier).state = true;
      });
    }
  }

  void _onTabChanged(int i) {
    setState(() => _selectedTab = i);
    _pageCtrl.animateToPage(i,
        duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
  }

  void _onPageChanged(int i) {
    setState(() => _selectedTab = i);
  }

  Future<void> _openSteamLogin() async {
    await ref.read(authServiceProvider).openSteamLogin();
  }

  @override
  void dispose() {
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
                  tabs: const ['Token', 'Browser', 'QR Code'],
                  selected: _selectedTab,
                  onChanged: _onTabChanged,
                ),
              ).animate().fadeIn(duration: 400.ms, delay: 400.ms),
              Expanded(
                child: PageView(
                  controller: _pageCtrl,
                  onPageChanged: _onPageChanged,
                  children: [
                    ClientTokenAuthTab(isLinking: widget.isLinking),
                    _buildBrowserTab(isLoading),
                    const QrAuthTab(),
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

  // ─── Browser tab ─────────────────────────────────────────────────────

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
              'Sign in via official Steam website.',
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: Colors.white60, height: 1.5),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.warning.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.warning.withValues(alpha: 0.2)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.info_outline, size: 14, color: AppTheme.warning),
                  const SizedBox(width: 8),
                  Text(
                    'No transaction or P&L data available',
                    style: TextStyle(
                        color: AppTheme.warning.withValues(alpha: 0.9),
                        fontSize: 11,
                        fontWeight: FontWeight.w600),
                  ),
                ],
              ),
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
                        _openSteamLogin();
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
