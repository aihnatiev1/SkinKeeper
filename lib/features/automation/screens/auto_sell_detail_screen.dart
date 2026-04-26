import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../../../core/widgets/screen_state_builder.dart';
import '../../../widgets/shared_ui.dart';
import '../../purchases/iap_service.dart';
import '../models/auto_sell_execution.dart';
import '../models/auto_sell_rule.dart';
import '../providers/auto_sell_providers.dart';
import 'auto_sell_create_sheet.dart';

/// Detail / edit / history view for a single auto-sell rule. Wired by
/// `/auto-sell/:id` route — pushed from the list card or hit directly via
/// deep link.
///
/// Free-user policy: deep linking here without premium → bounce to /premium.
/// Lapsed users get the same redirect (PATCH/POST require active premium
/// per P3-PLAN §2.5; the screen would otherwise look broken).
class AutoSellDetailScreen extends ConsumerStatefulWidget {
  const AutoSellDetailScreen({
    super.key,
    required this.ruleId,
    this.initial,
  });

  final int ruleId;

  /// Caller can pass the rule it already has (from the list) to skip the
  /// "loading…" flicker. Provider remains the source of truth — this is
  /// just a rendering hint.
  final AutoSellRule? initial;

  @override
  ConsumerState<AutoSellDetailScreen> createState() =>
      _AutoSellDetailScreenState();
}

class _AutoSellDetailScreenState extends ConsumerState<AutoSellDetailScreen> {
  bool _redirected = false;

  @override
  Widget build(BuildContext context) {
    // Premium gate at route level — push to paywall if not premium.
    final premiumAsync = ref.watch(premiumProvider);
    if (premiumAsync.valueOrNull == false && !_redirected) {
      _redirected = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/premium');
      });
      return const Scaffold(
        backgroundColor: AppTheme.bg,
        body: Center(
          child: CircularProgressIndicator(color: AppTheme.primary),
        ),
      );
    }

    final rules = ref.watch(autoSellRulesProvider).valueOrNull ?? const [];
    final rule = rules.where((r) => r.id == widget.ruleId).firstOrNull ??
        widget.initial;

    if (rule == null) {
      return Scaffold(
        backgroundColor: AppTheme.bg,
        appBar: AppBar(
          leading: const BackButton(),
          title: const Text('Rule'),
        ),
        body: const EmptyState(
          icon: Icons.search_off_rounded,
          title: 'Rule not found',
          subtitle: 'It may have been deleted',
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              backgroundColor: Colors.transparent,
              leading: IconButton(
                icon: const Icon(Icons.arrow_back_ios_new_rounded,
                    size: 20, color: AppTheme.textSecondary),
                onPressed: () => context.pop(),
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.edit_outlined,
                      color: AppTheme.textSecondary),
                  onPressed: () => _openEditSheet(rule),
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline,
                      color: AppTheme.loss),
                  onPressed: () => _confirmDelete(rule),
                ),
              ],
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      rule.marketHashName,
                      style: AppTheme.h2,
                    ),
                    const SizedBox(height: 16),
                    _RuleSummaryCard(rule: rule),
                    const SizedBox(height: 18),
                    const Text(
                      'History',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                        color: AppTheme.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            _ExecutionsSliver(ruleId: rule.id),
          ],
        ),
      ),
    );
  }

  void _openEditSheet(AutoSellRule rule) {
    showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.bgSecondary,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppTheme.r24)),
      ),
      builder: (_) => AutoSellCreateSheet(
        accountId: rule.accountId,
        existing: rule,
      ),
    );
  }

  Future<void> _confirmDelete(AutoSellRule rule) async {
    HapticFeedback.mediumImpact();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.bgSecondary,
        title: const Text(
          'Delete rule?',
          style: TextStyle(color: Colors.white),
        ),
        content: Text(
          'Stop watching ${rule.marketHashName}?',
          style: const TextStyle(color: AppTheme.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete',
                style: TextStyle(color: AppTheme.loss)),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      try {
        await ref
            .read(autoSellRulesProvider.notifier)
            .deleteRule(rule.id);
        if (mounted) context.pop();
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to delete rule')),
          );
        }
      }
    }
  }
}

class _RuleSummaryCard extends StatelessWidget {
  const _RuleSummaryCard({required this.rule});

  final AutoSellRule rule;

  String get _triggerSummary {
    final dir = rule.triggerType == AutoSellTriggerType.above ? '>' : '<';
    return 'Sell when price $dir \$${rule.triggerPriceUsd.toStringAsFixed(2)}';
  }

  String get _strategySummary => switch (rule.sellStrategy) {
        AutoSellStrategy.fixed =>
          'Fixed at \$${rule.sellPriceUsd?.toStringAsFixed(2) ?? '?'}',
        AutoSellStrategy.marketMax => 'Market max (1% undercut)',
        AutoSellStrategy.percentOfMarket =>
          '${rule.sellPriceUsd?.round() ?? '?'}% of market',
      };

  String get _modeSummary => rule.mode == AutoSellMode.autoList
      ? 'Auto-list with 60s cancel window'
      : 'Notify only';

  String get _cooldownSummary {
    final m = rule.cooldownMinutes;
    if (m >= 60) return '${m ~/ 60}h cooldown';
    return '${m}m cooldown';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: AppTheme.glass(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SummaryRow(icon: Icons.bolt_rounded, text: _triggerSummary),
          const SizedBox(height: 10),
          _SummaryRow(
              icon: Icons.attach_money_rounded, text: _strategySummary),
          const SizedBox(height: 10),
          _SummaryRow(icon: Icons.notifications_outlined, text: _modeSummary),
          const SizedBox(height: 10),
          _SummaryRow(
              icon: Icons.history_toggle_off_rounded, text: _cooldownSummary),
          const SizedBox(height: 10),
          _SummaryRow(
            icon: Icons.local_fire_department_rounded,
            text: 'Fired ${rule.timesFired} time${rule.timesFired == 1 ? '' : 's'}',
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppTheme.textMuted),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 13,
              color: AppTheme.textPrimary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _ExecutionsSliver extends ConsumerWidget {
  const _ExecutionsSliver({required this.ruleId});

  final int ruleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncList = ref.watch(autoSellExecutionsProvider(ruleId));
    return SliverScreenStateBuilder<List<AutoSellExecution>>(
      state: asyncList,
      isEmpty: (l) => l.isEmpty,
      onRetry: () => ref.invalidate(autoSellExecutionsProvider(ruleId)),
      emptyIcon: Icons.history,
      emptyTitle: 'No fires yet',
      emptySubtitle: 'Executions will appear here when the rule fires',
      sliverBuilder: (executions) {
        return SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
          sliver: SliverList.separated(
            itemCount: executions.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (_, i) =>
                _ExecutionTile(execution: executions[i]),
          ),
        );
      },
    );
  }
}

class _ExecutionTile extends StatelessWidget {
  const _ExecutionTile({required this.execution});

  final AutoSellExecution execution;

  String _timeAgo(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${t.day}/${t.month}/${t.year}';
  }

  (String, Color, IconData) get _actionDescriptor => switch (execution.action) {
        AutoSellAction.notified => ('Notified', AppTheme.accent, Icons.notifications_active_outlined),
        AutoSellAction.pendingWindow => ('Pending', AppTheme.warning, Icons.timer_outlined),
        AutoSellAction.listed => ('Listed', AppTheme.profit, Icons.sell_outlined),
        AutoSellAction.cancelled => ('Cancelled', AppTheme.textMuted, Icons.block_rounded),
        AutoSellAction.failed => ('Failed', AppTheme.loss, Icons.error_outline_rounded),
      };

  @override
  Widget build(BuildContext context) {
    final (label, color, icon) = _actionDescriptor;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: AppTheme.glass(radius: AppTheme.r12),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppTheme.r8),
            ),
            child: Icon(icon, size: 16, color: color),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: color,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      _timeAgo(execution.firedAt),
                      style: const TextStyle(
                          fontSize: 11, color: AppTheme.textMuted),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  'Trigger \$${execution.triggerPriceUsd.toStringAsFixed(2)} · '
                  'Market \$${execution.actualPriceUsd.toStringAsFixed(2)}'
                  '${execution.intendedListPriceUsd != null ? ' · List \$${execution.intendedListPriceUsd!.toStringAsFixed(2)}' : ''}',
                  style: AppTheme.monoSmall,
                ),
                if (execution.errorMessage != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    execution.errorMessage!,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.loss,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
