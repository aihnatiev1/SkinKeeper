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

  int _step = 1; // 1 = sign in, 2 = grab session
  bool _waitingForReturn = false;
  String? _autoStatus;
  bool _showManualPaste = false;

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
        setState(() => _step = 2);
      } else if (_step == 2) {
        _tryAutoFillFromClipboard();
      }
    }
  }

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

  Future<void> _tryAutoFillFromClipboard() async {
    setState(() => _autoStatus = 'detecting');
    try {
      final data = await Clipboard.getData(Clipboard.kTextPlain);
      final text = data?.text?.trim() ?? '';
      if (text.isEmpty) {
        setState(() {
          _autoStatus = 'not_found';
          _showManualPaste = true;
        });
        return;
      }
      if (_isNotLoggedInJson(text)) {
        setState(() {
          _autoStatus = 'not_logged_in';
          _step = 1;
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
        setState(() {
          _autoStatus = 'not_found';
          _showManualPaste = true;
        });
      }
    } catch (_) {
      setState(() {
        _autoStatus = 'not_found';
        _showManualPaste = true;
      });
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

  String? _extractToken(String text) {
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
    } catch (_) {}
    if (text.contains('%7C%7C') && text.length > 50) return text;
    if (text.contains('||') && RegExp(r'^7656\d{13}\|\|').hasMatch(text)) {
      return text.replaceFirst('||', '%7C%7C');
    }
    return null;
  }

  Future<void> _handleSubmit() async {
    final raw = _tokenController.text.trim();
    if (raw.isEmpty) return;
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
          // Navigate back to where user came from after successful re-auth
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

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 4),

          // ── What you'll unlock ─────────────────────────────────
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.primary.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.primary.withValues(alpha: 0.1)),
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
          const SizedBox(height: 20),

          // ── Step 1 ─────────────────────────────────────────────
          _StepCard(
            step: 1,
            currentStep: _step,
            title: 'Sign in to Steam',
            description: 'We\'ll open Steam in your browser.\nLog in with your account.',
            buttonLabel: 'Open Steam',
            buttonIcon: Icons.open_in_new_rounded,
            onTap: tokenState.loading ? null : _openSteamLogin,
          ),

          const SizedBox(height: 12),

          // ── Step 2 ─────────────────────────────────────────────
          _StepCard(
            step: 2,
            currentStep: _step,
            title: 'Grab your session',
            description: 'We\'ll open a special page.\nJust tap Select All → Copy and come back.',
            buttonLabel: 'Open & Copy',
            buttonIcon: Icons.content_copy_rounded,
            onTap: _step >= 2 && !tokenState.loading ? _openTokenPage : null,
          ),

          const SizedBox(height: 16),

          // ── Status ─────────────────────────────────────────────
          if (_autoStatus != null) _buildStatusBanner(),

          // ── Manual paste (hidden by default) ───────────────────
          if (_showManualPaste || _tokenController.text.isNotEmpty) ...[
            GestureDetector(
              onTap: () => setState(() => _showManualPaste = !_showManualPaste),
              child: Row(
                children: [
                  Icon(Icons.keyboard_arrow_down,
                      size: 18,
                      color: Colors.white.withValues(alpha: 0.3)),
                  const SizedBox(width: 6),
                  Text(
                    'Having trouble? Paste manually',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.3),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _tokenController,
              enabled: !tokenState.loading,
              maxLines: 2,
              decoration: InputDecoration(
                hintText: 'Paste here...',
                hintStyle: const TextStyle(
                    color: AppTheme.textDisabled, fontSize: 13),
                filled: true,
                fillColor: AppTheme.surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: AppTheme.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: AppTheme.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide:
                      const BorderSide(color: AppTheme.primary, width: 1.5),
                ),
                contentPadding: const EdgeInsets.all(14),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.content_paste_rounded,
                      size: 18, color: AppTheme.textMuted),
                  onPressed: () async {
                    final data =
                        await Clipboard.getData(Clipboard.kTextPlain);
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
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: tokenState.loading ? null : _handleSubmit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor:
                      AppTheme.primary.withValues(alpha: 0.3),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: tokenState.loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.5, color: Colors.white),
                      )
                    : const Text('Connect',
                        style: TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
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
        message = 'Reading your clipboard...';
        action = null;
      case 'found':
        bgColor = const Color(0xFF00E676).withValues(alpha: 0.08);
        textColor = const Color(0xFF00E676);
        icon = Icons.check_circle;
        message = 'Session found! Connecting your account...';
        action = null;
      case 'not_logged_in':
        bgColor = AppTheme.loss.withValues(alpha: 0.08);
        textColor = AppTheme.loss;
        icon = Icons.error_outline;
        message =
            'Looks like you\'re not signed in to Steam yet. Sign in first, then try again.';
        action = Padding(
          padding: const EdgeInsets.only(top: 10),
          child: GestureDetector(
            onTap: () {
              setState(() => _autoStatus = null);
              _openSteamLogin();
            },
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF1B2838),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF2A475E)),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.open_in_new_rounded,
                      size: 16, color: Colors.white),
                  SizedBox(width: 8),
                  Text('Open Steam',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Colors.white)),
                ],
              ),
            ),
          ),
        );
      default:
        bgColor = AppTheme.warning.withValues(alpha: 0.08);
        textColor = AppTheme.warning;
        icon = Icons.info_outline;
        message =
            'Couldn\'t detect automatically. Try pasting manually below.';
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
                          width: 14,
                          height: 14,
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
                      fontSize: 12.5,
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

// ─── Step Card ──────────────────────────────────────────────────────────

class _StepCard extends StatelessWidget {
  final int step;
  final int currentStep;
  final String title;
  final String description;
  final String buttonLabel;
  final IconData buttonIcon;
  final VoidCallback? onTap;

  const _StepCard({
    required this.step,
    required this.currentStep,
    required this.title,
    required this.description,
    required this.buttonLabel,
    required this.buttonIcon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDone = step < currentStep;
    final isCurrent = step == currentStep;
    final isLocked = step > currentStep;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDone
            ? const Color(0xFF00E676).withValues(alpha: 0.04)
            : isCurrent
                ? Colors.white.withValues(alpha: 0.04)
                : Colors.white.withValues(alpha: 0.02),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDone
              ? const Color(0xFF00E676).withValues(alpha: 0.15)
              : isCurrent
                  ? Colors.white.withValues(alpha: 0.1)
                  : Colors.white.withValues(alpha: 0.04),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Step indicator
              Container(
                width: 28,
                height: 28,
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
                      ? const Icon(Icons.check,
                          size: 16, color: Color(0xFF00E676))
                      : Text(
                          '$step',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: isCurrent
                                ? AppTheme.primary
                                : Colors.white.withValues(alpha: 0.25),
                          ),
                        ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                title,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: isLocked
                      ? Colors.white.withValues(alpha: 0.25)
                      : Colors.white,
                ),
              ),
              if (isDone) ...[
                const Spacer(),
                Text(
                  'Done',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF00E676).withValues(alpha: 0.8),
                  ),
                ),
              ],
            ],
          ),
          if (!isDone) ...[
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.only(left: 40),
              child: Text(
                description,
                style: TextStyle(
                  fontSize: 13,
                  color: isLocked
                      ? Colors.white.withValues(alpha: 0.2)
                      : Colors.white.withValues(alpha: 0.5),
                  height: 1.5,
                ),
              ),
            ),
            if (isCurrent) ...[
              const SizedBox(height: 14),
              Padding(
                padding: const EdgeInsets.only(left: 40),
                child: GestureDetector(
                  onTap: onTap,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1B2838),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFF2A475E)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(buttonIcon, size: 16, color: Colors.white),
                        const SizedBox(width: 8),
                        Text(
                          buttonLabel,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
