import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../session_provider.dart';
import 'connect_progress_overlay.dart';
import 'steam_webview_login.dart';

/// Full-screen gate that prompts the user to connect their Steam session.
///
/// Pushed by [requireSession] when the active account has no valid session.
/// Pops with `true` on successful connect, `false` (or null) on dismiss.
class SessionGateScreen extends ConsumerStatefulWidget {
  const SessionGateScreen({super.key});

  @override
  ConsumerState<SessionGateScreen> createState() => _SessionGateScreenState();
}

class _SessionGateScreenState extends ConsumerState<SessionGateScreen>
    with WidgetsBindingObserver {
  final _tokenController = TextEditingController();

  int _step = 1;
  bool _waitingForReturn = false;
  String? _autoStatus;
  bool _showManualPaste = false;
  bool _showSuccess = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Reset auth providers so stale 'authenticated' state doesn't
    // trick the listener into showing success without a real request
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(clientTokenAuthProvider.notifier).reset();
      ref.read(qrAuthProvider.notifier).reset();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tokenController.dispose();
    super.dispose();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

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

  // ── Browser helpers ────────────────────────────────────────────────────

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

  // ── Token helpers (from ClientTokenAuthTab) ────────────────────────────

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

  // ── Success flow ───────────────────────────────────────────────────────

  void _onAuthSuccess() {
    if (!mounted) return;
    ref.read(sessionStatusProvider.notifier).refresh();
    setState(() => _showSuccess = true);
  }

  void _onProgressComplete() {
    FocusManager.instance.primaryFocus?.unfocus();
    Navigator.of(context).pop(true);
  }

  // ── Build ──────────────────────────────────────────────────────────────

  bool get _isExpiredSession {
    final status = ref.read(sessionStatusProvider).valueOrNull;
    return status != null &&
        (status.status == 'expired' || status.needsReauth);
  }

  @override
  Widget build(BuildContext context) {
    final tokenState = ref.watch(clientTokenAuthProvider);
    final isExpired = _isExpiredSession;

    // Listen for auth success from token flow
    ref.listen<ClientTokenAuthState>(clientTokenAuthProvider, (prev, next) {
      if (prev?.status != 'authenticated' && next.status == 'authenticated') {
        _onAuthSuccess();
      } else if (next.status == 'error' && next.error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Connection failed: ${friendlyError(next.error)}'),
            backgroundColor: AppTheme.loss,
          ),
        );
      }
    });

    // Listen for auth success from QR flow
    ref.listen<QrAuthState>(qrAuthProvider, (prev, next) {
      if (prev?.status != 'authenticated' && next.status == 'authenticated') {
        _onAuthSuccess();
      }
    });

    // Safety net: if tokenState is already 'authenticated' but _showSuccess hasn't fired
    if (!_showSuccess && tokenState.status == 'authenticated') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !_showSuccess) _onAuthSuccess();
      });
    }

    if (_showSuccess) {
      return Scaffold(
        backgroundColor: AppTheme.bg,
        body: ConnectProgressOverlay(onComplete: _onProgressComplete),
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            FocusManager.instance.primaryFocus?.unfocus();
            Navigator.of(context).pop(false);
          },
        ),
        title: Text(isExpired ? 'Session Expired' : 'Enable Full Access'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 100),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Value proposition ──────────────────────────────────────
            _buildValueSection(isExpired: isExpired),
            const SizedBox(height: 20),

            // ── WebView Login (PRIMARY) ────────────────────────────────
            _WebViewLoginButton(onAuthenticated: _onAuthSuccess),
            const SizedBox(height: 20),

            // ── QR Code (alternative) ─────────────────────────────────
            _QrFallbackSection(onAuthenticated: _onAuthSuccess),
            const SizedBox(height: 20),

            // ── Browser fallback (collapsed) ──────────────────────────
            _BrowserFallbackSection(
              step: _step,
              tokenState: tokenState,
              autoStatus: _autoStatus,
              showManualPaste: _showManualPaste,
              tokenController: _tokenController,
              onOpenSteam: _openSteamLogin,
              onOpenToken: _openTokenPage,
              onSubmit: _handleSubmit,
              statusBanner: _autoStatus != null ? _buildStatusBanner() : null,
            ),
          ],
        ),
      ),
    );
  }

  // ── Sub-builders ───────────────────────────────────────────────────────

  Widget _buildValueSection({bool isExpired = false}) {
    return Container(
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
            isExpired
                ? 'Steam keeps sessions active for about 24 hours. Sign in again to continue trading.'
                : 'Steam requires this extra step to protect your items',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: Colors.white.withValues(alpha: 0.7),
              height: 1.4,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: const [
              _FeatureChip('Sell Items'),
              _FeatureChip('Trade'),
              _FeatureChip('Market History'),
              _FeatureChip('Profit & Loss'),
            ],
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
        message = 'Reading your clipboard...';
        action = null;
      case 'found':
        bgColor = const Color(0xFF00E676).withValues(alpha: 0.08);
        textColor = const Color(0xFF00E676);
        icon = Icons.check_circle;
        message = 'Session found! Connecting...';
        action = null;
      case 'not_logged_in':
        bgColor = AppTheme.loss.withValues(alpha: 0.08);
        textColor = AppTheme.loss;
        icon = Icons.error_outline;
        message = "Not signed in to Steam yet. Sign in first, then try again.";
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
        message = "Couldn't detect automatically. Try pasting manually below.";
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

// ─── Feature Chip ────────────────────────────────────────────────────────

class _FeatureChip extends StatelessWidget {
  final String label;
  const _FeatureChip(this.label);

  @override
  Widget build(BuildContext context) {
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
}

// ─── Step Card (duplicated from ClientTokenAuthTab -- private class) ─────

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

// ─── WebView Login Button ────────────────────────────────────────────────

class _WebViewLoginButton extends ConsumerStatefulWidget {
  final VoidCallback onAuthenticated;
  const _WebViewLoginButton({required this.onAuthenticated});

  @override
  ConsumerState<_WebViewLoginButton> createState() => _WebViewLoginButtonState();
}

class _WebViewLoginButtonState extends ConsumerState<_WebViewLoginButton> {
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

// ─── QR Fallback Section ─────────────────────────────────────────────────

class _QrFallbackSection extends ConsumerStatefulWidget {
  final VoidCallback onAuthenticated;
  const _QrFallbackSection({required this.onAuthenticated});

  @override
  ConsumerState<_QrFallbackSection> createState() =>
      _QrFallbackSectionState();
}

class _QrFallbackSectionState extends ConsumerState<_QrFallbackSection> {
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    // Auto-start QR generation
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(qrAuthProvider.notifier).startQR();
      _startPolling();
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }


  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      final status = await ref.read(qrAuthProvider.notifier).pollQR();
      if (!mounted) return;
      if (status == 'authenticated') {
        _pollTimer?.cancel();
        widget.onAuthenticated();
      } else if (status == 'expired') {
        _pollTimer?.cancel();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final qrState = ref.watch(qrAuthProvider);

    return Column(
      children: [
        // QR header
        Row(
          children: [
            Icon(Icons.qr_code_2,
                size: 20, color: AppTheme.primary),
            const SizedBox(width: 8),
            Text(
              'Scan with Steam Guard',
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
          'Open Steam Guard on another device and scan this code',
          style: TextStyle(
            fontSize: 12,
            color: Colors.white.withValues(alpha: 0.5),
          ),
        ),
        const SizedBox(height: 16),
        // QR content
        if (qrState.loading)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          )
        else if (qrState.status == 'error')
          _buildQrError(qrState)
        else if (qrState.status == 'expired')
          _buildQrExpired()
        else
          _buildQrReady(qrState),
      ],
    );
  }

  Widget _buildQrReady(QrAuthState qrState) {
    return Column(
      children: [
        if (qrState.qrImage != null)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Image.memory(
              base64Decode(qrState.qrImage!.replaceFirst(RegExp(r'^data:image/\w+;base64,'), '')),
              width: 180,
              height: 180,
              fit: BoxFit.contain,
            ),
          ),
        const SizedBox(height: 12),
        if (qrState.status == 'ready' || qrState.status == 'polling')
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width: 12,
                height: 12,
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  color: Colors.white.withValues(alpha: 0.4),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Waiting for confirmation...',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.white.withValues(alpha: 0.4),
                ),
              ),
            ],
          ),
        const SizedBox(height: 8),
        Text(
          'Open Steam Guard on another device and scan this code',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 11,
            color: Colors.white.withValues(alpha: 0.3),
          ),
        ),
      ],
    );
  }

  Widget _buildQrExpired() {
    return Column(
      children: [
        Text(
          'QR code expired',
          style: TextStyle(
            fontSize: 13,
            color: Colors.white.withValues(alpha: 0.5),
          ),
        ),
        const SizedBox(height: 8),
        TextButton.icon(
          onPressed: () {
            ref.read(qrAuthProvider.notifier).startQR();
            _startPolling();
          },
          icon: const Icon(Icons.refresh, size: 16),
          label: const Text('Refresh'),
        ),
      ],
    );
  }

  Widget _buildQrError(QrAuthState qrState) {
    return Column(
      children: [
        Text(
          'Failed to generate QR code',
          style: TextStyle(
            fontSize: 13,
            color: AppTheme.loss.withValues(alpha: 0.8),
          ),
        ),
        if (qrState.error != null) ...[
          const SizedBox(height: 4),
          Text(
            friendlyError(qrState.error),
            style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
          ),
        ],
        const SizedBox(height: 8),
        TextButton.icon(
          onPressed: () {
            ref.read(qrAuthProvider.notifier).startQR();
            _startPolling();
          },
          icon: const Icon(Icons.refresh, size: 16),
          label: const Text('Retry'),
        ),
      ],
    );
  }
}

// ── Browser Fallback Section (collapsible) ─────────────────────────────
class _BrowserFallbackSection extends StatelessWidget {
  final int step;
  final ClientTokenAuthState tokenState;
  final String? autoStatus;
  final bool showManualPaste;
  final TextEditingController tokenController;
  final VoidCallback onOpenSteam;
  final VoidCallback onOpenToken;
  final VoidCallback onSubmit;
  final Widget? statusBanner;

  const _BrowserFallbackSection({
    required this.step,
    required this.tokenState,
    required this.autoStatus,
    required this.showManualPaste,
    required this.tokenController,
    required this.onOpenSteam,
    required this.onOpenToken,
    required this.onSubmit,
    this.statusBanner,
  });

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: 16),
        title: Row(
          children: [
            Icon(Icons.help_outline_rounded,
                size: 16, color: Colors.white.withValues(alpha: 0.35)),
            const SizedBox(width: 8),
            Text(
              'Having trouble? Use browser instead',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Colors.white.withValues(alpha: 0.35),
              ),
            ),
          ],
        ),
        children: [
          _StepCard(
            step: 1,
            currentStep: step,
            title: 'Sign in to Steam',
            description: "We'll open Steam in your browser.\nLog in if needed.",
            buttonLabel: 'Open Steam',
            buttonIcon: Icons.open_in_new_rounded,
            onTap: tokenState.loading ? null : onOpenSteam,
          ),
          const SizedBox(height: 12),
          _StepCard(
            step: 2,
            currentStep: step,
            title: 'Copy your session',
            description: "We'll open a special page.\nTap Select All then Copy.",
            buttonLabel: 'Open & Copy',
            buttonIcon: Icons.content_copy_rounded,
            onTap: step >= 2 && !tokenState.loading ? onOpenToken : null,
          ),
          if (statusBanner != null) ...[
            const SizedBox(height: 16),
            statusBanner!,
          ],
          if (showManualPaste || tokenController.text.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: tokenController,
                    decoration: InputDecoration(
                      hintText: 'Paste token here...',
                      hintStyle: const TextStyle(fontSize: 12),
                      filled: true,
                      fillColor: AppTheme.surface,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                    ),
                    style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: tokenState.loading ? null : onSubmit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                  child: tokenState.loading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Connect', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
