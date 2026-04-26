import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/profit_loss.dart';
import '../../../widgets/premium_gate.dart';
import '../../../widgets/shared_ui.dart';
import '../../../widgets/tease_card.dart';
import '../../transactions/transactions_provider.dart';
import '../portfolio_pl_provider.dart';
import 'pl_history_chart.dart';

class PortfolioPLChartTab extends ConsumerStatefulWidget {
  const PortfolioPLChartTab({super.key});
  @override
  ConsumerState<PortfolioPLChartTab> createState() => _PortfolioPLChartTabState();
}

class _PortfolioPLChartTabState extends ConsumerState<PortfolioPLChartTab> {
  PLPeriod _period = PLPeriod.month;

  @override
  Widget build(BuildContext context) {
    final pl = ref.watch(portfolioPLProvider);
    final history = ref.watch(plHistoryProvider(_period.days));

    final accountsPL = ref.watch(accountsPLProvider);

    return Column(
      children: [
        pl.when(
          data: (d) => _PLSummaryCard(data: d)
              .animate().fadeIn(duration: 400.ms).slideY(begin: 0.05, duration: 400.ms, curve: Curves.easeOutCubic),
          loading: () => const ShimmerCard(height: 150),
          // Don't swallow errors silently — users seeing an empty P/L screen
          // is exactly the "looks broken, bounce" moment we want to avoid.
          // If the backend says PRO is required, route to the paywall; for
          // any other failure surface a retry affordance.
          error: (err, _) => isPremiumRequired(err)
              ? const _PLUpgradeTeaser()
              : _PLErrorCard(onRetry: () => ref.invalidate(portfolioPLProvider)),
        ),
        const SizedBox(height: 12),
        accountsPL.when(
          data: (accounts) => accounts.length > 1
              ? _AccountBreakdownCard(accounts: accounts)
                  .animate().fadeIn(duration: 400.ms, delay: 100.ms)
              : const SizedBox.shrink(),
          loading: () => const SizedBox.shrink(),
          // P10 fix: free users hit 403 PREMIUM_REQUIRED on this endpoint
          // (P9 server-side gating). Surface a tease card instead of an
          // empty pane so the user understands the feature exists. Generic
          // errors fall through to the silent no-op — the parent P/L card
          // already shows the upgrade teaser when the WHOLE P/L is gated.
          error: (err, _) => isPremiumRequired(err)
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 4),
                  child: TeaseCard(
                    // TODO(l10n)
                    headline: 'Per-account P&L breakdown',
                    subtitle:
                        'See profit & loss split across each linked Steam '
                        'account.',
                    icon: Icons.people_alt_rounded,
                    margin: EdgeInsets.zero,
                  ),
                )
              : const SizedBox.shrink(),
        ),
        const SizedBox(height: 12),
        PremiumGate(
          featureId: 'portfolio_pl_charts',
          featureName: 'Detailed P/L charts over time',
          lockedSubtitle: 'Visualize your profit & loss across days, weeks, and months.',
          child: history.when(
            data: (data) => PLHistoryChart(
              history: data,
              period: _period,
              onPeriodChanged: (p) => setState(() => _period = p),
            ).animate().fadeIn(duration: 500.ms, delay: 100.ms),
            loading: () => const ShimmerCard(height: 230),
            error: (_, _) => Center(child: Text('Failed to load', style: TextStyle(color: AppTheme.textSecondary))),
          ),
        ),
      ],
    );
  }
}

class _PLSummaryCard extends ConsumerWidget {
  final PortfolioPL data;
  const _PLSummaryCard({required this.data});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    if (!data.hasData) {
      return GestureDetector(
        onTap: () async {
          HapticFeedback.mediumImpact();
          final api = ref.read(apiClientProvider);
          try {
            await api.post('/transactions/sync');
            ref.invalidate(portfolioPLProvider);
            ref.invalidate(transactionsProvider);
          } catch (_) {}
        },
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.primary.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppTheme.primary.withValues(alpha: 0.15), width: 0.5),
          ),
          child: Row(
            children: [
              const Icon(Icons.refresh_rounded, size: 18, color: AppTheme.primary),
              const SizedBox(width: 10),
              Expanded(child: Text('Tap to sync transactions & calculate P/L', style: AppTheme.caption.copyWith(color: AppTheme.textSecondary))),
              const Icon(Icons.chevron_right_rounded, size: 18, color: AppTheme.textDisabled),
            ],
          ),
        ),
      );
    }

    final plColor = AppTheme.plColor(data.totalProfitCents);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: plColor.withValues(alpha: 0.12), width: 0.5),
        boxShadow: [BoxShadow(color: plColor.withValues(alpha: 0.05), blurRadius: 16)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('DETAILED PROFIT', style: TextStyle(
            fontSize: 10, fontWeight: FontWeight.w600,
            letterSpacing: 1.5, color: AppTheme.textDisabled,
          )),
          const SizedBox(height: 14),
          Row(
            children: [
              _MiniStat(label: 'Invested', value: currency.format(data.totalInvested, decimals: 0)),
              _MiniStat(label: 'Current', value: currency.format(data.totalCurrentValue, decimals: 0)),
              _MiniStat(label: 'Realized', value: currency.formatWithSign(data.realizedProfit, decimals: 0), valueColor: AppTheme.plColor(data.realizedProfitCents)),
              _MiniStat(label: 'Unrealized', value: currency.formatWithSign(data.unrealizedProfit, decimals: 0), valueColor: AppTheme.plColor(data.unrealizedProfitCents)),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _MiniStat({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(label.toUpperCase(), style: AppTheme.label.copyWith(fontSize: 9)),
          const SizedBox(height: 3),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(value, style: TextStyle(
              fontSize: 13, fontWeight: FontWeight.w600,
              color: valueColor ?? AppTheme.textPrimary,
              fontFeatures: const [FontFeature.tabularFigures()],
            )),
          ),
        ],
      ),
    );
  }
}

class _AccountBreakdownCard extends ConsumerWidget {
  final List<AccountPL> accounts;
  const _AccountBreakdownCard({required this.accounts});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06), width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.people_alt_rounded, size: 14, color: AppTheme.textDisabled),
              const SizedBox(width: 6),
              const Text('P/L BY ACCOUNT', style: TextStyle(
                fontSize: 10, fontWeight: FontWeight.w600,
                letterSpacing: 1.5, color: AppTheme.textDisabled,
              )),
            ],
          ),
          const SizedBox(height: 12),
          ...accounts.map((acc) {
            final plColor = AppTheme.plColor(acc.pl.totalProfitCents);
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: AppTheme.primary.withValues(alpha: 0.15),
                    backgroundImage: acc.avatarUrl != null
                        ? NetworkImage(acc.avatarUrl!)
                        : null,
                    child: acc.avatarUrl == null
                        ? const Icon(Icons.person_rounded, size: 14, color: AppTheme.textMuted)
                        : null,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          acc.displayName,
                          style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600,
                            color: AppTheme.textPrimary,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          'Invested ${currency.format(acc.pl.totalInvested, decimals: 0)}',
                          style: const TextStyle(fontSize: 10, color: AppTheme.textDisabled),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        currency.formatWithSign(acc.pl.totalProfit),
                        style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w700,
                          color: plColor,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: plColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          AppTheme.pctText(acc.pl.totalProfitPct),
                          style: TextStyle(
                            fontSize: 10, fontWeight: FontWeight.w600,
                            color: plColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _PLUpgradeTeaser extends StatelessWidget {
  const _PLUpgradeTeaser();

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.mediumImpact();
        context.push('/premium');
      },
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppTheme.primary.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppTheme.primary.withValues(alpha: 0.25), width: 0.5),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppTheme.primary.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.auto_graph_rounded, color: AppTheme.primary, size: 20),
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Unlock profit analytics',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                  SizedBox(height: 2),
                  Text('See realized/unrealized P/L across your trades',
                      style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: AppTheme.primary),
          ],
        ),
      ),
    );
  }
}

class _PLErrorCard extends StatelessWidget {
  final VoidCallback onRetry;
  const _PLErrorCard({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onRetry,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08), width: 0.5),
        ),
        child: Row(
          children: [
            const Icon(Icons.refresh_rounded, size: 18, color: AppTheme.textSecondary),
            const SizedBox(width: 10),
            Expanded(child: Text('Tap to retry loading P/L', style: AppTheme.caption.copyWith(color: AppTheme.textSecondary))),
          ],
        ),
      ),
    );
  }
}
