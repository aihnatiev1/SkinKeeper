import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../session_provider.dart';

class SessionGateQrFallbackSection extends ConsumerStatefulWidget {
  final VoidCallback onAuthenticated;
  const SessionGateQrFallbackSection({super.key, required this.onAuthenticated});

  @override
  ConsumerState<SessionGateQrFallbackSection> createState() =>
      _SessionGateQrFallbackSectionState();
}

class _SessionGateQrFallbackSectionState
    extends ConsumerState<SessionGateQrFallbackSection> {
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
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
