import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../session_provider.dart';

class QrAuthTab extends ConsumerStatefulWidget {
  const QrAuthTab({super.key});

  @override
  ConsumerState<QrAuthTab> createState() => _QrAuthTabState();
}

class _QrAuthTabState extends ConsumerState<QrAuthTab> {
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    // Start QR generation after first frame
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(qrAuthProvider.notifier).startQR().then((_) {
        _startPolling();
      });
    });
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      final status = await ref.read(qrAuthProvider.notifier).pollQR();
      if (!mounted) return;
      if (status == 'authenticated') {
        _pollTimer?.cancel();
        await ref.read(sessionStatusProvider.notifier).refresh();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Steam session connected via QR code'),
              backgroundColor: Color(0xFF00E676),
            ),
          );
          context.pop();
        }
      } else if (status == 'expired') {
        _pollTimer?.cancel();
      }
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

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const SizedBox(height: 16),
          Text(
            'Scan with Steam Mobile App',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: Colors.white,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Open the Steam app on your phone, go to the guard section, and scan the QR code below.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.white60,
                ),
          ),
          const SizedBox(height: 32),

          // QR image area
          _buildQrArea(qrState),

          const SizedBox(height: 24),

          // Status text
          _buildStatusText(qrState),

          if (qrState.status == 'expired') ...[
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () {
                ref.read(qrAuthProvider.notifier).startQR().then((_) {
                  _startPolling();
                });
              },
              icon: const Icon(Icons.refresh, size: 20),
              label: const Text('Generate New QR Code'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 14,
                ),
              ),
            ),
          ],
        ],
      ),
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
        width: 240,
        height: 240,
        decoration: BoxDecoration(
          color: Colors.white.withAlpha(10),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
              const SizedBox(height: 12),
              Text(
                'Failed to load QR code',
                style: TextStyle(color: Colors.red[300], fontSize: 14),
              ),
            ],
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
    final (String text, Color color) = switch (state.status) {
      'ready' || 'polling' => ('Waiting for scan...', Colors.white60),
      'pending' => ('Waiting for scan...', Colors.white60),
      'authenticated' => ('Authenticated!', const Color(0xFF00E676)),
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
