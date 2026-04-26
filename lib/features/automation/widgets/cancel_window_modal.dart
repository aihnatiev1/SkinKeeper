import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../../../l10n/app_localizations.dart';
import '../data/auto_sell_api.dart';
import '../data/auto_sell_repository.dart';
import '../models/auto_sell_execution.dart';
import '../providers/auto_sell_providers.dart';

/// Listens for newly-arrived `pending_window` executions and pops a modal
/// dialog so the user can cancel the impending listing within the 60-second
/// window. Designed to be mounted once near the app shell so it works
/// regardless of which screen the user is on when a fire happens.
///
/// The trigger surfaces are:
///   1. [pendingExecutionsProvider] — slow poll that picks up fires within
///      ~10 s. Good enough for the 60 s window in practice.
///   2. [pendingExecutionTrigger] — push-notification handlers (P5) can set
///      this state with the execution id to surface the modal immediately.
class CancelWindowMounter extends ConsumerStatefulWidget {
  const CancelWindowMounter({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<CancelWindowMounter> createState() =>
      _CancelWindowMounterState();
}

class _CancelWindowMounterState extends ConsumerState<CancelWindowMounter> {
  // Track which execution ids we've already shown a modal for so we don't
  // pop the same dialog repeatedly when the poll re-fires.
  final Set<int> _shownIds = <int>{};
  bool _modalOpen = false;

  void _maybeShow(BuildContext ctx, AutoSellExecution exec) {
    if (_modalOpen) return;
    if (_shownIds.contains(exec.id)) return;
    if (!exec.isCancellable) return;
    _shownIds.add(exec.id);
    _modalOpen = true;
    showDialog<void>(
      context: ctx,
      barrierDismissible: false,
      builder: (_) => CancelWindowDialog(execution: exec),
    ).whenComplete(() => _modalOpen = false);
  }

  @override
  Widget build(BuildContext context) {
    // ── Slow poll branch ──
    ref.listen<AsyncValue<List<AutoSellExecution>>>(
      pendingExecutionsProvider,
      (prev, next) {
        final list = next.valueOrNull;
        if (list == null) return;
        for (final e in list) {
          _maybeShow(context, e);
        }
      },
    );

    // ── Push-notification trigger branch ──
    // Set `pendingExecutionTrigger` to an id from a push handler — we'll
    // look it up via the provider if it's already in our list, or fetch
    // fresh otherwise.
    ref.listen<int?>(pendingExecutionTrigger, (prev, id) async {
      if (id == null) return;
      final list = ref.read(pendingExecutionsProvider).valueOrNull ?? const [];
      final hit = list.where((e) => e.id == id).firstOrNull;
      if (hit != null && context.mounted) {
        _maybeShow(context, hit);
      } else {
        // Fall back to fetching the single execution row by id via the list
        // endpoint (cheap — server caps to 50). This keeps the modal
        // honest for cold-start push taps.
        final repo = ref.read(autoSellRepositoryProvider);
        try {
          final all = await repo.getExecutions(limit: 50);
          if (!context.mounted) return;
          final found = all.where((e) => e.id == id).firstOrNull;
          if (found != null) _maybeShow(context, found);
        } catch (_) {
          // Silent — push-trigger is opportunistic; the slow poll will get
          // the row eventually.
        }
      }
      // Reset the trigger so a second push for the same id re-arms it.
      ref.read(pendingExecutionTrigger.notifier).state = null;
    });

    return widget.child;
  }
}

/// The actual cancel-confirmation dialog. Lives separately so widget tests
/// can pump it directly without going through the mounter's poll wiring.
class CancelWindowDialog extends ConsumerStatefulWidget {
  const CancelWindowDialog({super.key, required this.execution});

  final AutoSellExecution execution;

  @override
  ConsumerState<CancelWindowDialog> createState() =>
      _CancelWindowDialogState();
}

class _CancelWindowDialogState extends ConsumerState<CancelWindowDialog> {
  Timer? _ticker;
  late int _secondsLeft;
  bool _busy = false;
  String? _error;
  bool _cancelled = false;

  @override
  void initState() {
    super.initState();
    _secondsLeft = widget.execution.secondsLeftInWindow.clamp(0, 60);
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        _secondsLeft = widget.execution.secondsLeftInWindow.clamp(0, 60);
      });
      if (_secondsLeft <= 0) {
        _ticker?.cancel();
        // Auto-dismiss when the window closes naturally — the listing
        // either went through or failed; user can review in history.
        if (mounted && !_cancelled) {
          Navigator.of(context).pop();
        }
      }
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _onCancel() async {
    HapticFeedback.mediumImpact();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(autoSellRepositoryProvider)
          .cancelExecution(widget.execution.id);
      // Refresh history & rules in the background — execution row's action
      // is now `cancelled`, last_fired_at unchanged.
      ref.invalidate(autoSellExecutionsProvider);
      if (mounted) {
        setState(() => _cancelled = true);
        // Hold the success state visible for half a second before popping
        // so the user sees the confirmation rather than a cold dismiss.
        await Future<void>.delayed(const Duration(milliseconds: 500));
        if (mounted) Navigator.of(context).pop();
      }
    } on AutoSellCancelExpiredException {
      if (mounted) {
        final l10n = AppLocalizations.of(context);
        setState(() {
          _error = l10n.cancelModalErrorExpired;
          _busy = false;
        });
      }
    } on DioException catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context);
        setState(() {
          // Prefer the dio-supplied message (often a translated server line)
          // and fall back to a generic localized string when there isn't one.
          _error = e.message ?? l10n.cancelModalErrorGeneric;
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final exec = widget.execution;
    final l10n = AppLocalizations.of(context);
    return Dialog(
      backgroundColor: AppTheme.bgSecondary,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppTheme.r20),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppTheme.warning.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(AppTheme.r10),
                  ),
                  child: const Icon(Icons.timer_outlined,
                      color: AppTheme.warning, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    l10n.cancelModalTitle,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              exec.marketHashName,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 12,
              runSpacing: 6,
              children: [
                _MiniStat(
                  label: 'Trigger',
                  value: '\$${exec.triggerPriceUsd.toStringAsFixed(2)}',
                ),
                _MiniStat(
                  label: 'Market',
                  value: '\$${exec.actualPriceUsd.toStringAsFixed(2)}',
                ),
                if (exec.intendedListPriceUsd != null)
                  _MiniStat(
                    label: 'List at',
                    value:
                        '\$${exec.intendedListPriceUsd!.toStringAsFixed(2)}',
                  ),
              ],
            ),
            const SizedBox(height: 18),
            if (_cancelled)
              _CancelledBanner(label: l10n.cancelModalCancelled)
            else
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppTheme.warning.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(AppTheme.r8),
                    ),
                    child: Text(
                      l10n.cancelModalCountdown(_secondsLeft),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.warning,
                      ),
                    ),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () => Navigator.of(context).pop(),
                    child: Text(l10n.cancelModalContinue),
                  ),
                  const SizedBox(width: 6),
                  FilledButton(
                    onPressed: _busy ? null : _onCancel,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppTheme.loss,
                      foregroundColor: Colors.white,
                    ),
                    child: _busy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(l10n.cancelModalCancel),
                  ),
                ],
              ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: const TextStyle(
                    color: AppTheme.loss, fontSize: 12, height: 1.3),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '$label ',
          style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
        ),
        Text(
          value,
          style: AppTheme.monoSmall.copyWith(color: AppTheme.textPrimary),
        ),
      ],
    );
  }
}

class _CancelledBanner extends StatelessWidget {
  const _CancelledBanner({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.profit.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppTheme.r10),
        border: Border.all(color: AppTheme.profit.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle_outline,
              color: AppTheme.profit, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                color: AppTheme.profit,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
