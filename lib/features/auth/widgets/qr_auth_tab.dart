import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme.dart';
import '../session_provider.dart';
import '../../settings/accounts_provider.dart';

class QrAuthTab extends ConsumerStatefulWidget {
  const QrAuthTab({super.key});

  @override
  ConsumerState<QrAuthTab> createState() => _QrAuthTabState();
}

class _QrAuthTabState extends ConsumerState<QrAuthTab> {
  Timer? _pollTimer;
  String? _authedAccountName;
  bool _showQr = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(qrAuthProvider.notifier).startQR().then((_) {
        _startPolling();
      });
    });
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      final status = await ref.read(qrAuthProvider.notifier).pollQR();
      if (!mounted) return;
      if (status == 'authenticated') {
        _pollTimer?.cancel();
        final linkMode = ref.read(sessionLinkModeProvider);

        if (linkMode) {
          ref.invalidate(accountsProvider);
        } else {
          await ref.read(sessionStatusProvider.notifier).refresh();
        }
        if (!mounted) return;

        // Get authenticated account name for confirmation
        final sessionStatus = ref.read(sessionStatusProvider).valueOrNull;
        final accountName = sessionStatus?.activeAccountName;
        setState(() => _authedAccountName = accountName);

        // Auto-navigate back after brief delay so user sees confirmation
        Future.delayed(const Duration(seconds: 2), () {
          if (!mounted) return;
          _navigateBack(linkMode);
        });
      } else if (status == 'expired') {
        _pollTimer?.cancel();
      }
    });
  }

  void _navigateBack(bool linkMode) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(linkMode
            ? 'New account linked successfully!'
            : 'Steam session connected'),
        backgroundColor: const Color(0xFF00E676),
      ),
    );
    if (GoRouter.of(context).canPop()) {
      context.pop();
    } else {
      context.go('/portfolio');
    }
  }

  void _rescan() {
    setState(() => _authedAccountName = null);
    ref.read(qrAuthProvider.notifier).reset();
    ref.read(qrAuthProvider.notifier).startQR().then((_) {
      _startPolling();
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final qrState = ref.watch(qrAuthProvider);
    final isPolling = qrState.status == 'ready' || qrState.status == 'pending' || qrState.status == 'polling';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 400),
        child: _showQr ? _buildQrView(qrState) : _buildAppView(qrState, isPolling),
      ),
    );
  }

  Widget _buildAppView(QrAuthState qrState, bool isPolling) {
    return Column(
      key: const ValueKey('app_view'),
      children: [
        const SizedBox(height: 20),
        // Large Steam Icon
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: const Color(0xFF171a21),
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: AppTheme.primary.withValues(alpha: 0.2),
                blurRadius: 20,
                spreadRadius: 5,
              ),
            ],
          ),
          child: Center(
            child: Image.network(
              'https://community.akamai.steamstatic.com/public/shared/images/responsive/header_logo.png',
              height: 40,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 32),
        const Text(
          'Confirm in Steam App',
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Open your official Steam app to authorize this session securely.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 14,
            color: Colors.white.withValues(alpha: 0.5),
            height: 1.5,
          ),
        ),
        const SizedBox(height: 40),

        if (qrState.loading)
          const Center(
            child: Column(
              children: [
                CircularProgressIndicator(color: AppTheme.primary),
                SizedBox(height: 16),
                Text('Generating Steam link...', style: TextStyle(color: Colors.white70)),
              ],
            ),
          )
        else if (qrState.error != null)
          Center(
            child: Column(
              children: [
                const Icon(Icons.error_outline, color: AppTheme.loss, size: 48),
                const SizedBox(height: 16),
                Text('Failed to start session: ${qrState.error}', 
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => _rescan(),
                  child: const Text('Try Again'),
                ),
              ],
            ),
          )
        else if (qrState.qrUrl != null && qrState.status != 'authenticated') ...[
          ElevatedButton(
            onPressed: () async {
              final uri = Uri.parse(qrState.qrUrl!);
              await launchUrl(uri, mode: LaunchMode.externalApplication);
              HapticFeedback.mediumImpact();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              foregroundColor: Colors.white,
              minimumSize: const Size(double.infinity, 56),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              elevation: 8,
              shadowColor: AppTheme.primary.withValues(alpha: 0.4),
            ),
            child: const Text('Open Steam App', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(height: 24),
          if (isPolling)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primary)),
                const SizedBox(width: 12),
                Text(
                  'Waiting for confirmation in Steam...',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: AppTheme.primaryLight.withValues(alpha: 0.8),
                  ),
                ),
              ],
            ).animate(onPlay: (c) => c.repeat()).shimmer(duration: 2.seconds),
        ],

        if (qrState.status == 'expired') ...[
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: () => _rescan(),
            icon: const Icon(Icons.refresh, size: 20),
            label: const Text('Refresh Link'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.surface,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ],

        const SizedBox(height: 60),
        TextButton(
          onPressed: () => setState(() => _showQr = true),
          child: Text(
            'Need to scan a QR instead?',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.3), fontSize: 13),
          ),
        ),
      ],
    );
  }

  Widget _buildQrView(QrAuthState qrState) {
    return Column(
      key: const ValueKey('qr_view'),
      children: [
        const SizedBox(height: 16),
        const Text(
          'Scan QR Code',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white),
        ),
        const SizedBox(height: 8),
        const Text(
          'Use the Steam Mobile App to scan this code.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 14, color: Colors.white60),
        ),
        const SizedBox(height: 32),
        _buildQrArea(qrState),
        const SizedBox(height: 32),
        _buildStatusText(qrState),
        const SizedBox(height: 24),
        TextButton(
          onPressed: () => setState(() => _showQr = false),
          child: const Text('Back to App Direct Link'),
        ),
      ],
    );
  }

  Widget _buildQrArea(QrAuthState state) {
    if (state.loading) {
      return Container(
        width: 240,
        height: 240,
        decoration: BoxDecoration(
          color: Colors.white.withAlpha(10),
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Center(child: CircularProgressIndicator()),
      );
    }

    if (state.error != null) {
      return Container(
        width: 280,
        height: 280,
        decoration: BoxDecoration(
          color: Colors.white.withAlpha(10),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
                const SizedBox(height: 12),
                Text(
                  'Failed to load QR code',
                  style: TextStyle(color: Colors.red[300], fontSize: 14),
                ),
                const SizedBox(height: 8),
                Text(
                  state.error!,
                  style: TextStyle(color: Colors.red[200], fontSize: 11),
                  textAlign: TextAlign.center,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (state.qrImage != null) {
      // Decode base64 data URI: strip "data:image/png;base64," prefix
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
          child: Image.memory(
            bytes,
            width: 216,
            height: 216,
            fit: BoxFit.contain,
          ),
        ),
      );
    }

    return Container(
      width: 240,
      height: 240,
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(10),
        borderRadius: BorderRadius.circular(16),
      ),
      child: const Center(
        child: Icon(Icons.qr_code_2, size: 64, color: Colors.white24),
      ),
    );
  }

  Widget _buildStatusText(QrAuthState state) {
    if (state.status == 'authenticated') {
      final name = _authedAccountName;
      return Column(
        children: [
          const Icon(Icons.check_circle, color: Color(0xFF00E676), size: 28),
          const SizedBox(height: 8),
          Text(
            name != null ? 'Authenticated as $name' : 'Authenticated!',
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: Color(0xFF00E676),
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Redirecting...',
            style: TextStyle(fontSize: 12, color: Colors.white38),
          ),
        ],
      );
    }

    final (String text, Color color) = switch (state.status) {
      'ready' || 'polling' => ('Waiting for scan...', Colors.white60),
      'pending' => ('Waiting for scan...', Colors.white60),
      'expired' => ('QR code expired', const Color(0xFFFF5252)),
      'error' => ('Something went wrong', const Color(0xFFFF5252)),
      _ => ('', Colors.transparent),
    };

    if (text.isEmpty) return const SizedBox.shrink();

    return Text(
      text,
      style: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: color,
      ),
    );
  }
}
