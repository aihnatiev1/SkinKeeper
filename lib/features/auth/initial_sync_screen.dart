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

enum _StepStatus { waiting, syncing, done, error }

enum _Step { inventory, transactions, trades }

class InitialSyncScreen extends ConsumerStatefulWidget {
  const InitialSyncScreen({super.key});

  @override
  ConsumerState<InitialSyncScreen> createState() => _InitialSyncScreenState();
}

class _InitialSyncScreenState extends ConsumerState<InitialSyncScreen> {
  final Map<_Step, _StepStatus> _status = {
    _Step.inventory: _StepStatus.waiting,
    _Step.transactions: _StepStatus.waiting,
    _Step.trades: _StepStatus.waiting,
  };
  bool _allDone = false;
  bool _navigating = false;

  bool get _hasErrors =>
      _status.values.any((s) => s == _StepStatus.error);

  bool get _allFinished => _status.values.every(
      (s) => s == _StepStatus.done || s == _StepStatus.error);

  @override
  void initState() {
    super.initState();
    _runAll();
  }

  Future<void> _runAll() async {
    await _runStep(_Step.inventory);
    if (!mounted) return;
    await _runStep(_Step.transactions);
    if (!mounted) return;
    await _runStep(_Step.trades);
    if (!mounted) return;

    setState(() => _allDone = true);
    ref.read(needsInitialSyncProvider.notifier).state = false;

    // Force refresh all portfolio-related providers
    ref.invalidate(inventoryProvider);
    ref.invalidate(portfolioProvider);
    ref.invalidate(portfolioPLProvider);
    ref.invalidate(transactionsProvider);
    ref.invalidate(tradesProvider);

    if (!_hasErrors) {
      // Auto-navigate only on full success
      await Future.delayed(const Duration(milliseconds: 800));
      _navigate();
    }
    // On errors: stay on screen, let user retry or continue manually.
  }

  Future<void> _runStep(_Step step) async {
    if (!mounted) return;
    setState(() => _status[step] = _StepStatus.syncing);
    final api = ref.read(apiClientProvider);

    try {
      switch (step) {
        case _Step.inventory:
          await api.post('/inventory/refresh');
          if (!mounted) return;
          ref.invalidate(inventoryProvider);
          ref.invalidate(portfolioProvider);
          break;
        case _Step.transactions:
          await api.post('/transactions/sync');
          if (!mounted) return;
          ref.invalidate(transactionsProvider);
          ref.invalidate(portfolioPLProvider);
          ref.invalidate(portfolioProvider);
          ref.invalidate(txStatsProvider);
          break;
        case _Step.trades:
          await api.get('/trades',
              queryParameters: {'limit': 20, 'offset': 0});
          if (!mounted) return;
          ref.invalidate(tradesProvider);
          break;
      }
      if (mounted) setState(() => _status[step] = _StepStatus.done);
    } catch (_) {
      if (mounted) setState(() => _status[step] = _StepStatus.error);
    }
  }

  Future<void> _retryFailed() async {
    final failed = _status.entries
        .where((e) => e.value == _StepStatus.error)
        .map((e) => e.key)
        .toList();
    for (final step in failed) {
      if (!mounted) return;
      await _runStep(step);
    }
    if (!_hasErrors && mounted) {
      await Future.delayed(const Duration(milliseconds: 400));
      _navigate();
    }
  }

  void _navigate() {
    if (!mounted || _navigating) return;
    _navigating = true;
    context.go('/portfolio');
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
                status: _status[_Step.inventory]!,
                delay: 300,
                onRetry: _status[_Step.inventory] == _StepStatus.error
                    ? () => _runStep(_Step.inventory)
                    : null,
              ),
              const SizedBox(height: 16),
              _SyncRow(
                label: 'Transactions',
                status: _status[_Step.transactions]!,
                delay: 400,
                onRetry: _status[_Step.transactions] == _StepStatus.error
                    ? () => _runStep(_Step.transactions)
                    : null,
              ),
              const SizedBox(height: 16),
              _SyncRow(
                label: 'Trades',
                status: _status[_Step.trades]!,
                delay: 500,
                onRetry: _status[_Step.trades] == _StepStatus.error
                    ? () => _runStep(_Step.trades)
                    : null,
              ),
              if (_allDone && !_hasErrors) ...[
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
              if (_allFinished && _hasErrors) ...[
                const SizedBox(height: 32),
                const Text(
                  'Some data couldn\'t sync',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.loss,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'You can retry now or continue and sync later from settings.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    OutlinedButton(
                      onPressed: _navigate,
                      child: const Text('Continue'),
                    ),
                    const SizedBox(width: 12),
                    FilledButton.icon(
                      onPressed: _retryFailed,
                      icon: const Icon(Icons.refresh, size: 16),
                      label: const Text('Retry'),
                    ),
                  ],
                ).animate().fadeIn(duration: 300.ms),
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
  final VoidCallback? onRetry;

  const _SyncRow({
    required this.label,
    required this.status,
    required this.delay,
    this.onRetry,
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
                      : status == _StepStatus.error
                          ? AppTheme.loss
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
        return const Text('Syncing...', style: TextStyle(fontSize: 12, color: AppTheme.textMuted));
      case _StepStatus.done:
        return const Text('Done', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.profit))
            .animate().fadeIn(duration: 200.ms);
      case _StepStatus.error:
        if (onRetry != null) {
          return TextButton.icon(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              minimumSize: const Size(0, 28),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            icon: const Icon(Icons.refresh, size: 14, color: AppTheme.loss),
            label: const Text('Retry',
                style: TextStyle(fontSize: 12, color: AppTheme.loss)),
          );
        }
        return const Text('Failed',
            style: TextStyle(fontSize: 12, color: AppTheme.loss));
    }
  }
}
