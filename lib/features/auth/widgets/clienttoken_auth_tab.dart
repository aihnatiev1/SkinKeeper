import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../session_provider.dart';
import '../steam_auth_service.dart';
import '../../settings/accounts_provider.dart';

class ClientTokenAuthTab extends ConsumerStatefulWidget {
  final bool isLinking;
  const ClientTokenAuthTab({super.key, this.isLinking = false});

  @override
  ConsumerState<ClientTokenAuthTab> createState() => _ClientTokenAuthTabState();
}

class _ClientTokenAuthTabState extends ConsumerState<ClientTokenAuthTab>
    with WidgetsBindingObserver {
  final _tokenController = TextEditingController();
  StateController<bool>? _sessionLinkModeNotifier;

  // Flow state
  int _step = 1; // 1 = log in to Steam, 2 = copy token
  bool _waitingForReturn = false;
  String? _autoStatus; // null | 'detecting' | 'found' | 'not_found' | 'not_logged_in'

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.isLinking) {
      _sessionLinkModeNotifier = ref.read(sessionLinkModeProvider.notifier);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _sessionLinkModeNotifier?.state = true;
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    final notifier = _sessionLinkModeNotifier;
    if (notifier != null) {
      Future(() => notifier.state = false);
    }
    _tokenController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _waitingForReturn) {
      _waitingForReturn = false;
      if (_step == 1) {
        // Returned from Steam login — advance to step 2
        setState(() => _step = 2);
      } else if (_step == 2) {
        // Returned from token page — try to read clipboard
        _tryAutoFillFromClipboard();
      }
    }
  }

  // ─── Step 1: Open Steam login ─────────────────────────────────────────

  Future<void> _openSteamLogin() async {
    setState(() {
      _waitingForReturn = true;
      _autoStatus = null;
    });
    await launchUrl(
      Uri.parse('https://steamcommunity.com/login/home/'),
      mode: LaunchMode.platformDefault,
    );
  }

  // ─── Step 2: Open token page ──────────────────────────────────────────

  Future<void> _openTokenPage() async {
    setState(() {
      _waitingForReturn = true;
      _autoStatus = null;
    });
    await launchUrl(
      Uri.parse('https://steamcommunity.com/chat/clientjstoken'),
      mode: LaunchMode.platformDefault,
    );
  }

  // ─── Auto-fill from clipboard ─────────────────────────────────────────

  Future<void> _tryAutoFillFromClipboard() async {
    setState(() => _autoStatus = 'detecting');
    try {
      final data = await Clipboard.getData(Clipboard.kTextPlain);
      final text = data?.text?.trim() ?? '';
      if (text.isEmpty) {
        setState(() => _autoStatus = 'not_found');
        return;
      }

      // Check for logged_in: false
      if (_isNotLoggedInJson(text)) {
        setState(() {
          _autoStatus = 'not_logged_in';
          _step = 1; // Go back to step 1
        });
        return;
      }

      final token = _extractToken(text);
      if (token != null) {
        _tokenController.text = token;
        setState(() => _autoStatus = 'found');
        await Future.delayed(const Duration(milliseconds: 500));
        if (!mounted) return;
        _handleSubmit();
      } else {
        setState(() => _autoStatus = 'not_found');
      }
    } catch (_) {
      setState(() => _autoStatus = 'not_found');
    }
  }

  bool _isNotLoggedInJson(String text) {
    try {
      final json = jsonDecode(text) as Map<String, dynamic>;
      return json.containsKey('logged_in') && json['logged_in'] == false;
    } catch (_) {
      return false;
    }
  }

  /// Extract steamLoginSecure from various clipboard formats:
  /// 1. JSON from clientjstoken: {"steamid":"765...","token":"eyA..."}
  /// 2. Raw steamLoginSecure: 765...%7C%7CeyA...
  /// 3. Raw with pipes: 765...||eyA...
  String? _extractToken(String text) {
    // Try JSON first (clientjstoken page response)
    try {
      final json = jsonDecode(text) as Map<String, dynamic>;
      final steamId = json['steamid'] as String?;
      final token = json['token'] as String?;
      if (steamId != null &&
          steamId.isNotEmpty &&
          token != null &&
          token.isNotEmpty) {
        return '$steamId%7C%7C$token';
      }
    } catch (_) {
      // Not JSON
    }

    // Already a steamLoginSecure value
    if (text.contains('%7C%7C') && text.length > 50) return text;
    if (text.contains('||') && RegExp(r'^7656\d{13}\|\|').hasMatch(text)) {
      return text.replaceFirst('||', '%7C%7C');
    }

    return null;
  }

  // ─── Submit ───────────────────────────────────────────────────────────

  Future<void> _handleSubmit() async {
    final raw = _tokenController.text.trim();
    if (raw.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Paste the token first'),
          backgroundColor: AppTheme.warning,
        ),
      );
      return;
    }
    if (_isNotLoggedInJson(raw)) {
      setState(() {
        _autoStatus = 'not_logged_in';
        _step = 1;
      });
      _tokenController.clear();
      return;
    }
    final token = _extractToken(raw) ?? raw;
    await ref.read(clientTokenAuthProvider.notifier).submitToken(token);
  }

  // ─── Build ────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final tokenState = ref.watch(clientTokenAuthProvider);
    final theme = Theme.of(context);

    ref.listen<ClientTokenAuthState>(clientTokenAuthProvider, (prev, next) {
      if (next.status == 'authenticated') {
        final linkMode = ref.read(sessionLinkModeProvider);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(linkMode
                ? 'New account linked successfully!'
                : 'Steam session connected'),
            backgroundColor: const Color(0xFF00E676),
          ),
        );
        if (linkMode) {
          ref.invalidate(accountsProvider);
          if (context.canPop()) context.pop();
        } else {
          // Invalidate auth — router will auto-redirect to /portfolio
          ref.invalidate(authStateProvider);
        }
      } else if (next.status == 'error' && next.error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Token failed: ${friendlyError(next.error)}'),
            backgroundColor: AppTheme.loss,
          ),
        );
      }
    });

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),

          // Explanation
          Text(
            'For full access to trades, market history and P&L — complete these two steps:',
            style: TextStyle(
              fontSize: 13,
              color: Colors.white.withValues(alpha: 0.5),
              height: 1.5,
            ),
          ),
          const SizedBox(height: 16),

          // ── Step 1: Log in to Steam ──────────────────────────────
          _StepButton(
            step: 1,
            currentStep: _step,
            label: 'Log in to Steam',
            subtitle: 'Sign in to your account in the browser',
            icon: Icons.login_rounded,
            onTap: tokenState.loading ? null : _openSteamLogin,
          ),

          const SizedBox(height: 12),

          // ── Step 2: Copy token ───────────────────────────────────
          _StepButton(
            step: 2,
            currentStep: _step,
            label: 'Copy Token',
            subtitle: 'We\'ll open a page with your session data — just Select All and Copy',
            icon: Icons.content_copy_rounded,
            onTap: _step >= 2 && !tokenState.loading ? _openTokenPage : null,
          ),

          const SizedBox(height: 16),

          // ── Status messages ──────────────────────────────────────
          if (_autoStatus != null) _buildStatusBanner(),

          // ── Example of what the page looks like ──────────────────
          if (_step >= 2 && _autoStatus == null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.04),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'You\'ll see text like this — select all and copy it:',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.white.withValues(alpha: 0.5),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '{"logged_in":true,"steamid":"7656...","token":"eyA..."}',
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: Colors.white.withValues(alpha: 0.45),
                      ),
                    ),
                  ),
                ],
              ),
            ),

          const SizedBox(height: 20),

          // ── Manual paste fallback ────────────────────────────────
          Text(
            'Or paste manually:',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.4),
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _tokenController,
            enabled: !tokenState.loading,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: 'Paste JSON or token here...',
              hintStyle: const TextStyle(color: AppTheme.textDisabled, fontSize: 13),
              filled: true,
              fillColor: AppTheme.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: AppTheme.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: AppTheme.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: AppTheme.primary, width: 1.5),
              ),
              contentPadding: const EdgeInsets.all(16),
              suffixIcon: IconButton(
                icon: const Icon(Icons.content_paste_rounded,
                    size: 20, color: AppTheme.textMuted),
                onPressed: () async {
                  final data = await Clipboard.getData(Clipboard.kTextPlain);
                  if (data?.text != null) {
                    _tokenController.text = data!.text!.trim();
                    setState(() {});
                  }
                },
              ),
            ),
            style: const TextStyle(
              color: Colors.white,
              fontFamily: 'monospace',
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 16),

          SizedBox(
            height: 52,
            child: ElevatedButton(
              onPressed: tokenState.loading ? null : _handleSubmit,
              style: ElevatedButton.styleFrom(
                backgroundColor: theme.colorScheme.primary,
                foregroundColor: Colors.white,
                disabledBackgroundColor: theme.colorScheme.primary.withAlpha(80),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: tokenState.loading
                  ? const SizedBox(
                      width: 22, height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                    )
                  : const Text('Submit',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBanner() {
    final Color bgColor;
    final Color textColor;
    final IconData icon;
    final String message;
    final Widget? action;

    switch (_autoStatus) {
      case 'detecting':
        bgColor = AppTheme.primary.withValues(alpha: 0.06);
        textColor = AppTheme.primary;
        icon = Icons.hourglass_empty;
        message = 'Checking clipboard...';
        action = null;
      case 'found':
        bgColor = const Color(0xFF00E676).withValues(alpha: 0.08);
        textColor = const Color(0xFF00E676);
        icon = Icons.check_circle;
        message = 'Token detected! Connecting...';
        action = null;
      case 'not_logged_in':
        bgColor = AppTheme.loss.withValues(alpha: 0.08);
        textColor = AppTheme.loss;
        icon = Icons.error_outline;
        message = 'You\'re not logged into Steam yet. Tap "Log in to Steam" first, sign in, then come back and tap "Copy Token".';
        action = Padding(
          padding: const EdgeInsets.only(top: 10),
          child: GestureDetector(
            onTap: () {
              setState(() => _autoStatus = null);
              _openSteamLogin();
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF1B2838),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF2A475E)),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.login_rounded, size: 16, color: Colors.white),
                  SizedBox(width: 8),
                  Text('Log in to Steam',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Colors.white)),
                ],
              ),
            ),
          ),
        );
      default: // not_found
        bgColor = AppTheme.warning.withValues(alpha: 0.08);
        textColor = AppTheme.warning;
        icon = Icons.info_outline;
        message = 'Token not found in clipboard. Paste manually below.';
        action = null;
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 1),
                  child: _autoStatus == 'detecting'
                      ? SizedBox(
                          width: 14, height: 14,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: textColor),
                        )
                      : Icon(icon, size: 16, color: textColor),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    message,
                    style: TextStyle(
                      color: textColor,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
            ?action,
          ],
        ),
      ),
    );
  }
}

// ─── Step Button Widget ─────────────────────────────────────────────────

class _StepButton extends StatelessWidget {
  final int step;
  final int currentStep;
  final String label;
  final String subtitle;
  final IconData icon;
  final VoidCallback? onTap;

  const _StepButton({
    required this.step,
    required this.currentStep,
    required this.label,
    required this.subtitle,
    required this.icon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isActive = step <= currentStep;
    final isDone = step < currentStep;
    final isCurrent = step == currentStep;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: isCurrent
              ? const Color(0xFF1B2838)
              : isDone
                  ? const Color(0xFF00E676).withValues(alpha: 0.06)
                  : Colors.white.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isCurrent
                ? const Color(0xFF2A475E)
                : isDone
                    ? const Color(0xFF00E676).withValues(alpha: 0.2)
                    : Colors.white.withValues(alpha: 0.06),
          ),
        ),
        child: Row(
          children: [
            // Step number / check
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(
                color: isDone
                    ? const Color(0xFF00E676).withValues(alpha: 0.15)
                    : isCurrent
                        ? AppTheme.primary.withValues(alpha: 0.15)
                        : Colors.white.withValues(alpha: 0.05),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: isDone
                    ? const Icon(Icons.check, size: 16, color: Color(0xFF00E676))
                    : Text(
                        '$step',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: isCurrent
                              ? AppTheme.primary
                              : Colors.white.withValues(alpha: 0.3),
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: isActive ? Colors.white : Colors.white.withValues(alpha: 0.3),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 12,
                      color: isActive
                          ? Colors.white.withValues(alpha: 0.5)
                          : Colors.white.withValues(alpha: 0.2),
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              icon,
              size: 20,
              color: isActive
                  ? Colors.white.withValues(alpha: 0.6)
                  : Colors.white.withValues(alpha: 0.15),
            ),
          ],
        ),
      ),
    );
  }
}
