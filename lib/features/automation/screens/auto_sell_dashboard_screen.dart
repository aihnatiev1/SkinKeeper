import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/analytics_service.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../widgets/premium_gate.dart';
import '../../../widgets/shared_ui.dart';
import '../../purchases/iap_service.dart';
import '../models/auto_sell_stats.dart';
import '../providers/auto_sell_providers.dart';

/// "My auto-sell" dashboard (P11). Free perk for existing PRO users — no
/// secondary upsell. Layout matches the rest of the automation feature:
/// CS2-vibe dark surface, large hero number for total listed value, three
/// stat cards, daily fires line chart, and a refusal-reasons list.
///
/// Wrapped in [PremiumGate] for visual consistency with the list screen,
/// even though backend `/auto-sell/stats` already enforces premium —
/// defense in depth and the gate's blurred preview is a useful tease for
/// the rare lapsed-PRO with a deep link.
class AutoSellDashboardScreen extends ConsumerStatefulWidget {
  const AutoSellDashboardScreen({super.key});

  @override
  ConsumerState<AutoSellDashboardScreen> createState() =>
      _AutoSellDashboardScreenState();
}

/// Period chips. Default 30d so the API request stays cheap on first paint;
/// 1y is heavier and only loads on explicit selection.
enum DashboardPeriod {
  week(7, '7D'),
  month(30, '30D'),
  threeMonths(90, '90D'),
  year(365, '1Y');

  final int days;
  final String label;
  const DashboardPeriod(this.days, this.label);
}

class _AutoSellDashboardScreenState
    extends ConsumerState<AutoSellDashboardScreen> {
  DashboardPeriod _period = DashboardPeriod.month;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _DashboardHeader(
              period: _period,
              onPeriodChanged: (p) {
                HapticFeedback.selectionClick();
                setState(() => _period = p);
              },
            ),
            Expanded(
              child: PremiumGate(
                featureId: 'auto_sell',
                featureName: 'Auto-sell dashboard',
                lockedSubtitle:
                    'See how your rules are performing — fires, listings, refusal reasons.',
                paywallSource: PaywallSource.lockedTap,
                child: _DashboardBody(period: _period),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashboardHeader extends StatelessWidget {
  const _DashboardHeader({required this.period, required this.onPeriodChanged});

  final DashboardPeriod period;
  final ValueChanged<DashboardPeriod> onPeriodChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 16, 16, 8),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded,
                size: 20, color: AppTheme.textSecondary),
            onPressed: () => context.pop(),
          ),
          const Expanded(
            child: Text(
              // TODO(l10n): "My auto-sell"
              'MY AUTO-SELL',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.5,
                color: AppTheme.textDisabled,
              ),
            ),
          ),
          _PeriodChips(selected: period, onChanged: onPeriodChanged),
        ],
      ),
    );
  }
}

class _PeriodChips extends StatelessWidget {
  const _PeriodChips({required this.selected, required this.onChanged});

  final DashboardPeriod selected;
  final ValueChanged<DashboardPeriod> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: DashboardPeriod.values.map((p) {
        final isSelected = p == selected;
        return GestureDetector(
          onTap: () {
            if (!isSelected) onChanged(p);
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            margin: const EdgeInsets.only(left: 4),
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: isSelected
                  ? AppTheme.primary.withValues(alpha: 0.15)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isSelected
                    ? AppTheme.primary.withValues(alpha: 0.35)
                    : Colors.transparent,
              ),
            ),
            child: Text(
              p.label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color:
                    isSelected ? AppTheme.textPrimary : AppTheme.textMuted,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

class _DashboardBody extends ConsumerWidget {
  const _DashboardBody({required this.period});

  final DashboardPeriod period;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isPremium = ref.watch(premiumProvider).valueOrNull ?? false;
    if (!isPremium) {
      // Behind the PremiumGate's blur — render a fake-data hero so the
      // tease reads as "this is your stats page". Same intent as
      // `_FakeRulesPreview` on the list screen.
      return const _FakeDashboardPreview();
    }

    final asyncStats = ref.watch(autoSellStatsProvider(period.days));

    return asyncStats.when(
      loading: () => const _DashboardSkeleton(),
      error: (err, _) => _DashboardError(
        onRetry: () => ref.invalidate(autoSellStatsProvider(period.days)),
      ),
      data: (stats) => RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(autoSellStatsProvider(period.days));
          await ref.read(autoSellStatsProvider(period.days).future);
        },
        color: AppTheme.primary,
        backgroundColor: AppTheme.surfaceLight,
        child: _DashboardContent(stats: stats, period: period),
      ),
    );
  }
}

class _DashboardContent extends StatelessWidget {
  const _DashboardContent({required this.stats, required this.period});

  final AutoSellStats stats;
  final DashboardPeriod period;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        _HeroValue(stats: stats),
        const SizedBox(height: 16),
        _StatCardsRow(stats: stats),
        const SizedBox(height: 20),
        _DailyFiresChart(history: stats.history, period: period),
        const SizedBox(height: 20),
        _RefusalReasonsSection(reasons: stats.topRefusalReasons),
        const SizedBox(height: 24),
        _TuneCta(),
      ],
    );
  }
}

// ─── Hero value ──────────────────────────────────────────────────────────

class _HeroValue extends ConsumerWidget {
  const _HeroValue({required this.stats});

  final AutoSellStats stats;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final formatted = currency.format(stats.totalListedValueUsd);
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
      decoration: AppTheme.glass(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            // TODO(l10n)
            'LISTED VIA AUTO-SELL',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.4,
              color: AppTheme.textMuted,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            formatted,
            style: TextStyle(
              // Monospace tabular-figures for the hero — matches the
              // CLAUDE.md "monospace for cash values" convention.
              fontFamily: 'monospace',
              fontSize: 36,
              fontWeight: FontWeight.w800,
              color: stats.totalListedValueUsd > 0
                  ? AppTheme.profit
                  : AppTheme.textPrimary,
              fontFeatures: const [FontFeature.tabularFigures()],
              height: 1.05,
            ),
          ).animate().fadeIn(duration: 350.ms).slideY(begin: 0.05, end: 0),
          const SizedBox(height: 6),
          Text(
            // TODO(l10n)
            'Last ${stats.periodDays} day${stats.periodDays == 1 ? '' : 's'} · '
            '${stats.listedCount} listing${stats.listedCount == 1 ? '' : 's'}',
            style: const TextStyle(
              fontSize: 12,
              color: AppTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Stat cards row ──────────────────────────────────────────────────────

class _StatCardsRow extends StatelessWidget {
  const _StatCardsRow({required this.stats});

  final AutoSellStats stats;

  @override
  Widget build(BuildContext context) {
    final successRate = stats.successRatePercent;
    final successColor =
        successRate >= 80 ? AppTheme.warningLight : AppTheme.textPrimary;
    final successText =
        stats.totalFires == 0 ? '—' : '${successRate.toStringAsFixed(0)}%';

    return Row(
      children: [
        Expanded(
          child: _StatCard(
            label: 'ACTIVE RULES',
            value: '${stats.activeRules}',
            valueColor: AppTheme.textPrimary,
            subtitle: stats.autoListRules > 0
                ? '${stats.autoListRules} auto-list'
                : 'all notify',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatCard(
            label: 'TOTAL FIRES',
            value: '${stats.totalFires}',
            valueColor: AppTheme.textPrimary,
            subtitle: 'in last ${stats.periodDays}d',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatCard(
            label: 'SUCCESS',
            value: successText,
            valueColor: successColor,
            subtitle: '${stats.listedCount}/${stats.totalFires} listed',
          ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.valueColor,
    required this.subtitle,
  });

  final String label;
  final String value;
  final Color valueColor;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: AppTheme.glass(radius: AppTheme.r12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 9.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.0,
              color: AppTheme.textMuted,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontFamily: 'monospace',
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: valueColor,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: const TextStyle(
              fontSize: 10.5,
              color: AppTheme.textSecondary,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

// ─── Daily fires chart ───────────────────────────────────────────────────

class _DailyFiresChart extends ConsumerWidget {
  const _DailyFiresChart({required this.history, required this.period});

  final List<DailyHistoryPoint> history;
  final DashboardPeriod period;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    return RepaintBoundary(
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
        decoration: AppTheme.glass(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'DAILY FIRES',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.2,
                color: AppTheme.textMuted,
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 160,
              child: history.isEmpty
                  ? const Center(
                      child: Text(
                        'No fires in this period',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppTheme.textMuted,
                        ),
                      ),
                    )
                  : _buildChart(context, currency),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildChart(BuildContext context, CurrencyInfo currency) {
    // Single point → duplicate to draw a flat segment instead of a bare dot.
    final data = history.length == 1 ? [history.first, history.first] : history;

    final spots = data
        .asMap()
        .entries
        .map((e) => FlSpot(e.key.toDouble(), e.value.fires.toDouble()))
        .toList();
    final values = spots.map((s) => s.y).toList();
    final maxFires = values.reduce((a, b) => a > b ? a : b);
    final yMax = (maxFires + 1).clamp(2, 1000).toDouble();

    return LineChart(
      LineChartData(
        minY: 0,
        maxY: yMax,
        gridData: const FlGridData(show: false),
        titlesData: FlTitlesData(
          leftTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          rightTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          topTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              interval: (data.length / 4).ceilToDouble().clamp(1, 365),
              getTitlesWidget: (value, _) {
                final idx = value.toInt();
                if (idx < 0 || idx >= data.length) {
                  return const SizedBox.shrink();
                }
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    DateFormat('d/M').format(data[idx].date),
                    style: const TextStyle(
                      fontSize: 10,
                      color: AppTheme.textDisabled,
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        borderData: FlBorderData(show: false),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            curveSmoothness: 0.3,
            color: AppTheme.primary,
            barWidth: 2.5,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(
              show: true,
              color: AppTheme.primary.withValues(alpha: 0.14),
            ),
          ),
        ],
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipItems: (touched) {
              return touched.map((spot) {
                final idx = spot.x.toInt();
                if (idx < 0 || idx >= data.length) {
                  return null;
                }
                final p = data[idx];
                return LineTooltipItem(
                  '${DateFormat('MMM d').format(p.date)}\n'
                  '${p.fires} fire${p.fires == 1 ? '' : 's'} · '
                  '${p.listed} listed\n'
                  '${currency.format(p.listedValue)}',
                  const TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                );
              }).toList();
            },
          ),
        ),
      ),
    );
  }
}

// ─── Refusal reasons ─────────────────────────────────────────────────────

class _RefusalReasonsSection extends StatelessWidget {
  const _RefusalReasonsSection({required this.reasons});

  final List<RefusalReasonStat> reasons;

  @override
  Widget build(BuildContext context) {
    if (reasons.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: AppTheme.glass(),
        child: Row(
          children: const [
            Icon(Icons.check_circle_outline_rounded,
                size: 18, color: AppTheme.profit),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'No refusals — every fire went through cleanly.',
                style: TextStyle(
                  fontSize: 13,
                  color: AppTheme.textSecondary,
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: AppTheme.glass(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'TOP REFUSAL REASONS',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
              color: AppTheme.textMuted,
            ),
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < reasons.length; i++) ...[
            if (i > 0)
              const Divider(height: 16, color: AppTheme.divider),
            _RefusalRow(stat: reasons[i]),
          ],
        ],
      ),
    );
  }
}

class _RefusalRow extends StatelessWidget {
  const _RefusalRow({required this.stat});

  final RefusalReasonStat stat;

  @override
  Widget build(BuildContext context) {
    final copy = humanizeRefusalReason(stat.reason);
    final help = copy.help;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.error_outline_rounded,
            size: 16, color: AppTheme.warning),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                copy.title,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary,
                ),
              ),
              if (help != null) ...[
                const SizedBox(height: 2),
                Text(
                  help,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppTheme.textMuted,
                    height: 1.3,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: AppTheme.warning.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            '${stat.count}',
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppTheme.warning,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Tune CTA ────────────────────────────────────────────────────────────

class _TuneCta extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        context.go('/auto-sell');
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        decoration: BoxDecoration(
          gradient: AppTheme.primaryGradient,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: AppTheme.primary.withValues(alpha: 0.35),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            Icon(Icons.tune_rounded, size: 18, color: Colors.white),
            SizedBox(width: 8),
            Text(
              'Tune your rules',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Loading / error / fake-preview states ───────────────────────────────

class _DashboardSkeleton extends StatelessWidget {
  const _DashboardSkeleton();

  @override
  Widget build(BuildContext context) {
    Widget block({required double height}) => Container(
          height: height,
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: AppTheme.surfaceLight.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(AppTheme.r12),
          ),
        );

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      physics: const NeverScrollableScrollPhysics(),
      children: [
        block(height: 110),
        Row(
          children: [
            Expanded(child: block(height: 88)),
            const SizedBox(width: 8),
            Expanded(child: block(height: 88)),
            const SizedBox(width: 8),
            Expanded(child: block(height: 88)),
          ],
        ),
        const SizedBox(height: 12),
        block(height: 200),
        block(height: 120),
      ],
    );
  }
}

class _DashboardError extends StatelessWidget {
  const _DashboardError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.cloud_off_rounded,
      title: 'Could not load stats',
      subtitle: 'Check your connection and try again',
      action: TextButton(
        onPressed: onRetry,
        child: const Text(
          'Retry',
          style: TextStyle(color: AppTheme.primary),
        ),
      ),
    );
  }
}

/// Pretend stats shown to free / lapsed users behind the gate's blur. The
/// values are obviously aspirational — large hero, healthy success rate —
/// so the preview reads as "this is what unlocking gets you" without
/// claiming to be the user's actual data.
class _FakeDashboardPreview extends StatelessWidget {
  const _FakeDashboardPreview();

  @override
  Widget build(BuildContext context) {
    final fakeStats = AutoSellStats(
      activeRules: 4,
      autoListRules: 2,
      totalFires: 18,
      listedCount: 14,
      cancelledCount: 1,
      failedCount: 2,
      notifiedCount: 1,
      totalListedValueUsd: 1247.85,
      avgPremiumOverTrigger: 0.42,
      topRefusalReasons: const [
        RefusalReasonStat(reason: 'INSUFFICIENT_INVENTORY', count: 2),
      ],
      history: List.generate(
        7,
        (i) => DailyHistoryPoint(
          date: DateTime.now().subtract(Duration(days: 6 - i)),
          fires: [1, 3, 2, 4, 2, 3, 3][i],
          listed: [1, 3, 1, 3, 2, 2, 2][i],
          listedValue: [80.0, 240.0, 60.0, 350.0, 180.0, 200.0, 137.85][i],
        ),
      ),
      periodDays: 30,
    );

    return IgnorePointer(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        physics: const NeverScrollableScrollPhysics(),
        children: [
          _HeroValue(stats: fakeStats),
          const SizedBox(height: 16),
          _StatCardsRow(stats: fakeStats),
          const SizedBox(height: 20),
          _DailyFiresChart(
              history: fakeStats.history, period: DashboardPeriod.month),
        ],
      ),
    );
  }
}
