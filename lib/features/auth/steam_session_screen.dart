import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/cache_service.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/shared_ui.dart';
import 'steam_auth_service.dart';
import 'session_provider.dart';
import 'widgets/qr_auth_tab.dart';
import 'widgets/webview_auth_tab.dart';
import 'widgets/session_status_widget.dart';

class SteamSessionScreen extends ConsumerStatefulWidget {
  final int? accountId;
  final bool linkMode;
  const SteamSessionScreen({super.key, this.accountId, this.linkMode = false});

  @override
  ConsumerState<SteamSessionScreen> createState() => _SteamSessionScreenState();
}

class _SteamSessionScreenState extends ConsumerState<SteamSessionScreen> {
  int _selectedTab = 0;
  late final PageController _pageCtrl;
  bool _showInfoBanner = false;

  @override
  void initState() {
    super.initState();
    _pageCtrl = PageController();
    _showInfoBanner = !CacheService.sessionInfoDismissed;
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    if (widget.linkMode) {
      ref.read(sessionLinkModeProvider.notifier).state = false;
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(sessionLinkModeProvider.notifier).state = widget.linkMode;
    });

    final sessionStatus = ref.watch(sessionStatusProvider);
    final activeStatus = sessionStatus.valueOrNull?.status;
    final isExpired = !widget.linkMode &&
        (activeStatus == 'expired' || activeStatus == 'none');

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 20, color: AppTheme.textSecondary),
                    onPressed: () {
                      if (GoRouter.of(context).canPop()) {
                        context.pop();
                      } else {
                        context.go('/portfolio');
                      }
                    },
                  ),
                  Expanded(
                    child: Text(
                      widget.linkMode ? 'Link New Account' : 'Steam Session',
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ),
                  if (!widget.linkMode) const SessionStatusWidget(),
                ],
              ),
            ),
            // Pill tabs: Token, Browser, QR
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: PillTabSelector(
                tabs: const ['Steam Login', 'Browser', 'QR Code'],
                selected: _selectedTab,
                onChanged: (i) {
                  setState(() => _selectedTab = i);
                  _pageCtrl.animateToPage(i,
                      duration: const Duration(milliseconds: 300),
                      curve: Curves.easeOutCubic);
                },
              ),
            ),
            // Link mode info banner
            if (widget.linkMode)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                color: AppTheme.accent.withValues(alpha: 0.08),
                child: const Row(
                  children: [
                    Icon(Icons.person_add, color: AppTheme.accent, size: 18),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Sign in with a different Steam account to link it.',
                        style: TextStyle(
                          color: AppTheme.accent,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn(duration: 300.ms),

            // Session expired banner
            if (isExpired)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                color: AppTheme.loss.withValues(alpha: 0.12),
                child: const Row(
                  children: [
                    Icon(Icons.error_outline, color: AppTheme.loss, size: 18),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Steam session expired. Please re-authenticate.',
                        style: TextStyle(
                          color: AppTheme.loss,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn(duration: 300.ms),

            // First-time info banner
            if (_showInfoBanner)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.accent.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.accent.withValues(alpha: 0.2)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.info_outline_rounded, color: AppTheme.accent, size: 18),
                        const SizedBox(width: 8),
                        Text(
                          AppLocalizations.of(context).sessionInfoTitle,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const Spacer(),
                        GestureDetector(
                          onTap: () {
                            setState(() => _showInfoBanner = false);
                            CacheService.setSessionInfoDismissed(true);
                          },
                          child: const Icon(Icons.close_rounded, color: AppTheme.textMuted, size: 18),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      AppLocalizations.of(context).sessionInfoBody,
                      style: const TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 12.5,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn(duration: 400.ms).slideY(begin: -0.1, end: 0),

            // Tab content
            Expanded(
              child: PageView(
                controller: _pageCtrl,
                onPageChanged: (i) => setState(() => _selectedTab = i),
                children: [
                  WebViewAuthTab(isLinking: widget.linkMode),
                  _BrowserTab(linkMode: widget.linkMode),
                  const QrAuthTab(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Browser login tab — opens Steam OpenID in Safari
class _BrowserTab extends ConsumerWidget {
  final bool linkMode;
  const _BrowserTab({required this.linkMode});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
            GestureDetector(
              onTap: () {
                if (linkMode) {
                  ref.read(authServiceProvider).openSteamLinkLogin(ref);
                } else {
                  ref.read(authServiceProvider).openSteamLogin();
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
