import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../session_provider.dart';
import 'steam_webview_login.dart';

class SessionGateWebViewLoginButton extends ConsumerStatefulWidget {
  final VoidCallback onAuthenticated;
  const SessionGateWebViewLoginButton({super.key, required this.onAuthenticated});

  @override
  ConsumerState<SessionGateWebViewLoginButton> createState() =>
      _SessionGateWebViewLoginButtonState();
}

class _SessionGateWebViewLoginButtonState
    extends ConsumerState<SessionGateWebViewLoginButton> {
  bool _submitting = false;

  Future<void> _launch() async {
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

    if (mounted) {
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.login_rounded, size: 20, color: AppTheme.primary),
            const SizedBox(width: 8),
            Text(
              'Sign in with Steam',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: Colors.white.withValues(alpha: 0.9),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          'Opens Steam login in a built-in browser — no copying needed',
          style: TextStyle(
            fontSize: 12,
            color: Colors.white.withValues(alpha: 0.5),
          ),
        ),
        const SizedBox(height: 16),
        GestureDetector(
          onTap: _submitting ? null : _launch,
          child: Container(
            width: double.infinity,
            height: 52,
            decoration: BoxDecoration(
              color: const Color(0xFF1B2838),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF2A475E)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (_submitting)
                  const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                else ...[
                  const Icon(Icons.login_rounded, size: 20, color: Colors.white),
                  const SizedBox(width: 10),
                  const Text(
                    'Sign in with Steam',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_outline,
                size: 12, color: Colors.white.withValues(alpha: 0.25)),
            const SizedBox(width: 5),
            Text(
              'You sign in directly to Steam. We never see your password.',
              style: TextStyle(
                fontSize: 10,
                color: Colors.white.withValues(alpha: 0.25),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
