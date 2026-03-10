import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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

          // Wrong account — re-scan option
          if (qrState.status == 'authenticated' && _authedAccountName != null) ...[
            const SizedBox(height: 16),
            TextButton.icon(
              onPressed: _rescan,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Wrong account? Scan again'),
              style: TextButton.styleFrom(foregroundColor: AppTheme.textSecondary),
            ),
          ],

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
