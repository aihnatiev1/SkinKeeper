import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/api_client.dart';
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
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
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

        final sessionStatus = ref.read(sessionStatusProvider).valueOrNull;
        final accountName = sessionStatus?.activeAccountName;
        setState(() => _authedAccountName = accountName);

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

  Future<void> _openSteamApp(String? qrUrl) async {
    if (qrUrl == null) return;

    try {
      final uri = Uri.parse(qrUrl);
      final segments = uri.pathSegments;
      if (segments.isEmpty) return;

      final clientId = segments.last;

      // 1. Try direct deep link to confirmation screen
      final deepLink =
          Uri.parse('steammobile://open/login/confirm?client_id=$clientId');

      if (await canLaunchUrl(deepLink)) {
        await launchUrl(deepLink, mode: LaunchMode.externalApplication);
      } else {
        // 2. Fallback to opening the URL via steam://openurl/
        final fallbackLink = Uri.parse('steam://openurl/$qrUrl');
        if (await canLaunchUrl(fallbackLink)) {
          await launchUrl(fallbackLink, mode: LaunchMode.externalApplication);
        } else {
          // 3. Last resort: open in browser (which should trigger universal link)
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      }
    } catch (e) {
      debugPrint('Error launching Steam app: $e');
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final qrState = ref.watch(qrAuthProvider);
    final isPolling = qrState.status == 'ready' ||
        qrState.status == 'pending' ||
        qrState.status == 'polling';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const SizedBox(height: 8),
          Text(
            'One-Tap Login',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            'Approve login directly in Steam app',
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 13, color: Colors.white.withValues(alpha: 0.4)),
          ),
          const SizedBox(height: 20),
          if (qrState.status != 'authenticated' &&
              qrState.status != 'expired') ...[
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton.icon(
                onPressed: qrState.qrUrl == null ? null : () => _openSteamApp(qrState.qrUrl),
                icon: qrState.qrUrl == null 
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white24))
                  : Image.asset('assets/app_icon.png', width: 24, height: 24, errorBuilder: (_, _, _) => const Icon(Icons.bolt)),
                label: Text(
                  qrState.qrUrl == null ? 'Loading session...' : 'Open Steam & Approve',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: AppTheme.primary.withValues(alpha: 0.1),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16)),
                  elevation: 0,
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              '— OR —',
              style: TextStyle(fontSize: 11, color: Colors.white24),
            ),
            const SizedBox(height: 16),
          ],
          Text(
            'Scan QR Code',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.white.withValues(alpha: 0.6),
            ),
          ),
          const SizedBox(height: 12),
          _buildQrArea(qrState),
          const SizedBox(height: 20),
          if (qrState.status == 'authenticated') ...[
            const Icon(Icons.check_circle, color: Color(0xFF00E676), size: 32),
            const SizedBox(height: 8),
            Text(
              _authedAccountName != null
                  ? 'Authenticated as $_authedAccountName'
                  : 'Authenticated!',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Color(0xFF00E676),
              ),
            ),
            const SizedBox(height: 4),
            const Text('Redirecting...',
                style: TextStyle(fontSize: 12, color: Colors.white38)),
          ] else if (qrState.status == 'expired') ...[
            const Text(
              'QR code expired',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.loss),
            ),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: _rescan,
              icon: const Icon(Icons.refresh, size: 20),
              label: const Text('Refresh'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.surface,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ] else if (isPolling) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(
                  width: 12,
                  height: 12,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppTheme.primary),
                ),
                const SizedBox(width: 12),
                Text(
                  'Waiting for confirmation...',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: AppTheme.primaryLight.withValues(alpha: 0.8),
                  ),
                ),
              ],
            ).animate(onPlay: (c) => c.repeat()).shimmer(duration: 2.seconds),
          ],
          const SizedBox(height: 24),
          // Instructions
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
            ),
            child: Column(
              children: [
                _buildStep('1', 'Open Steam app on another device'),
                const SizedBox(height: 10),
                _buildStep('2', 'Go to Steam Guard (shield icon)'),
                const SizedBox(height: 10),
                _buildStep('3', 'Scan this QR code'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStep(String number, String text) {
    return Row(
      children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            color: AppTheme.primary.withValues(alpha: 0.15),
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(number,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primary,
                )),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(text,
              style: TextStyle(
                fontSize: 13.5,
                color: Colors.white.withValues(alpha: 0.7),
                height: 1.3,
              )),
        ),
      ],
    );
  }

  Widget _buildQrArea(QrAuthState state) {
    if (state.loading) {
      return Container(
        width: 220,
        height: 220,
        decoration: BoxDecoration(
          color: Colors.white.withAlpha(10),
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Center(child: CircularProgressIndicator()),
      );
    }

    if (state.error != null) {
      return Container(
        width: 220,
        height: 240,
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
                const Icon(Icons.error_outline,
                    color: Colors.redAccent, size: 48),
                const SizedBox(height: 12),
                Text('Failed to load QR',
                    style: TextStyle(color: Colors.red[300], fontSize: 14, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text(friendlyError(state.error),
                    style: TextStyle(color: Colors.red[200], fontSize: 12),
                    textAlign: TextAlign.center),
                const SizedBox(height: 4),
                Text(state.error!.toString(),
                    style: TextStyle(color: Colors.white24, fontSize: 9),
                    textAlign: TextAlign.center,
                    maxLines: 3,
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
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.memory(
            bytes,
            width: 196,
            height: 196,
            fit: BoxFit.contain,
          ),
        ),
      ).animate().fadeIn(duration: 300.ms).scale(
          begin: const Offset(0.95, 0.95), duration: 300.ms);
    }

    return Container(
      width: 220,
      height: 220,
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(10),
        borderRadius: BorderRadius.circular(16),
      ),
      child: const Center(
        child: Icon(Icons.qr_code_2, size: 64, color: Colors.white24),
      ),
    );
  }
}
