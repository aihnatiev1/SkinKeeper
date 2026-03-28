import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/sync_state_provider.dart';
import '../../core/theme.dart';
import '../../features/inventory/inventory_provider.dart';
import '../../features/portfolio/portfolio_provider.dart';
import '../../features/portfolio/portfolio_pl_provider.dart';
import '../../features/trades/trades_provider.dart';
import '../../features/transactions/transactions_provider.dart';
import '../../features/settings/accounts_provider.dart';

enum _StepStatus { waiting, syncing, done, error }

class InitialSyncScreen extends ConsumerStatefulWidget {
  const InitialSyncScreen({super.key});

  @override
  ConsumerState<InitialSyncScreen> createState() => _InitialSyncScreenState();
}

class _InitialSyncScreenState extends ConsumerState<InitialSyncScreen> {
  _StepStatus _inventory = _StepStatus.waiting;
  _StepStatus _transactions = _StepStatus.waiting;
  _StepStatus _trades = _StepStatus.waiting;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    _runSync();
  }

  Future<void> _runSync() async {
    final api = ref.read(apiClientProvider);

    // 1. Inventory
    setState(() => _inventory = _StepStatus.syncing);
    try {
      await api.post('/inventory/refresh');
      if (mounted) {
        ref.invalidate(inventoryProvider);
        ref.invalidate(portfolioProvider);
        setState(() => _inventory = _StepStatus.done);
      }
    } catch (_) {
      if (mounted) setState(() => _inventory = _StepStatus.error);
    }

    // 2. Transactions
    if (mounted) setState(() => _transactions = _StepStatus.syncing);
    try {
      await api.post('/transactions/sync');
      if (mounted) {
        ref.invalidate(transactionsProvider);
        ref.invalidate(portfolioPLProvider);
        ref.invalidate(portfolioProvider);
        ref.invalidate(txStatsProvider);
        setState(() => _transactions = _StepStatus.done);
      }
    } catch (_) {
      if (mounted) setState(() => _transactions = _StepStatus.error);
    }

    // 3. Trades
    if (mounted) setState(() => _trades = _StepStatus.syncing);
    try {
      await api.get('/trades', queryParameters: {'limit': 20, 'offset': 0});
      if (mounted) {
        ref.invalidate(tradesProvider);
        setState(() => _trades = _StepStatus.done);
      }
    } catch (_) {
      if (mounted) setState(() => _trades = _StepStatus.error);
    }

    // Done — navigate after short delay
    if (mounted) {
      setState(() => _done = true);
      ref.read(needsInitialSyncProvider.notifier).state = false;
      await Future.delayed(const Duration(milliseconds: 800));
      if (mounted) context.go('/portfolio');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.sync_rounded, size: 48, color: AppTheme.primary)
                  .animate()
                  .fadeIn(duration: 400.ms)
                  .scale(begin: const Offset(0.8, 0.8), end: const Offset(1, 1)),
              const SizedBox(height: 24),
              const Text(
                'Setting up your account',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ).animate().fadeIn(duration: 400.ms, delay: 100.ms),
              const SizedBox(height: 8),
              const Text(
                'Syncing data from Steam...',
                style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
              ).animate().fadeIn(duration: 400.ms, delay: 200.ms),
              const SizedBox(height: 40),
              _SyncRow(
                label: 'Inventory',
                status: _inventory,
                delay: 300,
              ),
              const SizedBox(height: 16),
              _SyncRow(
                label: 'Transactions',
                status: _transactions,
                delay: 400,
              ),
              const SizedBox(height: 16),
              _SyncRow(
                label: 'Trades',
                status: _trades,
                delay: 500,
              ),
              if (_done) ...[
                const SizedBox(height: 32),
                const Text(
                  'All done!',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.profit,
                  ),
                ).animate().fadeIn(duration: 300.ms).scale(
                    begin: const Offset(0.9, 0.9),
                    end: const Offset(1, 1)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SyncRow extends StatelessWidget {
  final String label;
  final _StepStatus status;
  final int delay;

  const _SyncRow({
    required this.label,
    required this.status,
    required this.delay,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _buildIcon(),
        const SizedBox(width: 16),
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w500,
              color: status == _StepStatus.done
                  ? AppTheme.profit
                  : status == _StepStatus.syncing
                      ? Colors.white
                      : AppTheme.textMuted,
            ),
          ),
        ),
        _buildTrailing(),
      ],
    ).animate().fadeIn(duration: 300.ms, delay: Duration(milliseconds: delay))
        .slideX(begin: 0.05, end: 0);
  }

  Widget _buildIcon() {
    switch (status) {
      case _StepStatus.waiting:
        return const Icon(Icons.circle_outlined, size: 24, color: AppTheme.textMuted);
      case _StepStatus.syncing:
        return const SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            color: AppTheme.primary,
          ),
        );
      case _StepStatus.done:
        return const Icon(Icons.check_circle, size: 24, color: AppTheme.profit)
            .animate()
            .scale(begin: const Offset(0, 0), end: const Offset(1, 1), duration: 300.ms, curve: Curves.elasticOut);
      case _StepStatus.error:
        return const Icon(Icons.error_outline, size: 24, color: AppTheme.loss);
    }
  }

  Widget _buildTrailing() {
    switch (status) {
      case _StepStatus.waiting:
        return const SizedBox.shrink();
      case _StepStatus.syncing:
        return Text('Syncing...', style: TextStyle(fontSize: 12, color: AppTheme.textMuted));
      case _StepStatus.done:
        return Text('Done', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.profit))
            .animate().fadeIn(duration: 200.ms);
      case _StepStatus.error:
        return Text('Skipped', style: TextStyle(fontSize: 12, color: AppTheme.loss));
    }
  }
}
