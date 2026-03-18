import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../session_provider.dart';
import '../steam_auth_service.dart';
import '../../settings/accounts_provider.dart';
import 'steam_webview_login.dart';

/// Tab that launches a WebView for Steam login and extracts cookies.
class WebViewAuthTab extends ConsumerStatefulWidget {
  final bool isLinking;
  const WebViewAuthTab({super.key, this.isLinking = false});

  @override
  ConsumerState<WebViewAuthTab> createState() => _WebViewAuthTabState();
}

class _WebViewAuthTabState extends ConsumerState<WebViewAuthTab> {
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    if (widget.isLinking) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(sessionLinkModeProvider.notifier).state = true;
      });
    }
  }

  @override
  void dispose() {
    if (widget.isLinking) {
      Future(() {
        if (mounted) return;
        // ignore — provider may already be disposed
      });
    }
    super.dispose();
  }

  Future<void> _launchWebView() async {
    final result = await Navigator.of(context).push<SteamWebViewResult>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => const SteamWebViewLogin(),
      ),
    );

    if (result == null || !mounted) return;

    setState(() => _submitting = true);

    await ref.read(clientTokenAuthProvider.notifier).submitToken(
      result.steamLoginSecure,
      sessionId: result.sessionId,
      steamRefreshToken: result.refreshToken,
    );

    if (mounted) setState(() => _submitting = false);
  }

  @override
  Widget build(BuildContext context) {
    final tokenState = ref.watch(clientTokenAuthProvider);

    ref.listen<ClientTokenAuthState>(clientTokenAuthProvider, (prev, next) {
      if (next.status == 'authenticated') {
        final linkMode = ref.read(sessionLinkModeProvider);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(linkMode
                ? 'New account linked successfully!'
                : 'Connected! Loading your data...'),
            backgroundColor: const Color(0xFF00E676),
          ),
        );
        if (linkMode) {
          ref.invalidate(accountsProvider);
          if (context.canPop()) context.pop();
        } else {
          ref.invalidate(authStateProvider);
          if (context.canPop()) context.pop();
        }
      } else if (next.status == 'error' && next.error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Connection failed: ${friendlyError(next.error)}'),
            backgroundColor: AppTheme.loss,
          ),
        );
      }
    });

    final isLoading = tokenState.loading || _submitting;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 4),

          // Value proposition
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.primary.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(12),
              border:
                  Border.all(color: AppTheme.primary.withValues(alpha: 0.1)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'This unlocks:',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withValues(alpha: 0.6),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    _featureChip('Market History'),
                    const SizedBox(width: 8),
                    _featureChip('Trades'),
                    const SizedBox(width: 8),
                    _featureChip('Profit & Loss'),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // How it works
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.03),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: Colors.white.withValues(alpha: 0.06)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'How it works:',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withValues(alpha: 0.7),
                  ),
                ),
                const SizedBox(height: 10),
                _stepRow(1, 'Sign in to Steam in the built-in browser'),
                const SizedBox(height: 6),
                _stepRow(2, 'Your session is captured automatically'),
                const SizedBox(height: 6),
                _stepRow(3, 'No copying or pasting needed'),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Main action button
          GestureDetector(
            onTap: isLoading ? null : _launchWebView,
            child: Container(
              height: 56,
              decoration: BoxDecoration(
                color: isLoading
                    ? const Color(0xFF1B2838).withValues(alpha: 0.5)
                    : const Color(0xFF1B2838),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isLoading
                      ? const Color(0xFF2A475E).withValues(alpha: 0.3)
                      : const Color(0xFF2A475E),
                ),
                boxShadow: isLoading
                    ? null
                    : [
                        BoxShadow(
                          color:
                              const Color(0xFF1B2838).withValues(alpha: 0.4),
                          blurRadius: 16,
                          offset: const Offset(0, 4),
                        ),
                      ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (isLoading)
                    const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.5, color: Colors.white),
                    )
                  else ...[
                    const Icon(Icons.login_rounded,
                        size: 22, color: Colors.white),
                    const SizedBox(width: 12),
                    const Text(
                      'Sign in with Steam',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Security note
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.lock_outline,
                  size: 13, color: Colors.white.withValues(alpha: 0.3)),
              const SizedBox(width: 6),
              Text(
                'You sign in directly to Steam. We never see your password.',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.white.withValues(alpha: 0.3),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _featureChip(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppTheme.primary.withValues(alpha: 0.9),
        ),
      ),
    );
  }

  Widget _stepRow(int number, String text) {
    return Row(
      children: [
        Container(
          width: 22,
          height: 22,
          decoration: BoxDecoration(
            color: AppTheme.primary.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              '$number',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppTheme.primary,
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 12.5,
              color: Colors.white.withValues(alpha: 0.6),
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }
}
