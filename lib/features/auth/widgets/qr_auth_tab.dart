import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
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
          const SizedBox(height: 4),
          // Full access badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: BoxDecoration(
              color: const Color(0xFF00E676).withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text('Full access — trades, history & more',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                    color: const Color(0xFF00E676).withValues(alpha: 0.8))),
          ),
          const SizedBox(height: 14),
          Text(
            'Scan with Steam Guard',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            'Have a friend or second device? Open Steam app\nand scan this code with Steam Guard.',
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 13, color: Colors.white.withValues(alpha: 0.4),
                height: 1.4),
          ),
          const SizedBox(height: 20),
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
