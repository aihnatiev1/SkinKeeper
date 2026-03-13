import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../models/profit_loss.dart';
import '../../widgets/premium_gate.dart';
import '../../widgets/shared_ui.dart';
import '../../widgets/sync_indicator.dart';
import '../auth/widgets/session_status_widget.dart';
import '../purchases/iap_service.dart';
import 'portfolio_pl_provider.dart';
import 'portfolio_provider.dart';
import '../../widgets/glass_sheet.dart';
import 'widgets/add_transaction_sheet.dart';
import 'widgets/item_pl_list.dart';
import 'widgets/pl_history_chart.dart';

final _tabProvider = StateProvider<int>((ref) => 0);

class PortfolioScreen extends ConsumerStatefulWidget {
  const PortfolioScreen({super.key});

  @override
  ConsumerState<PortfolioScreen> createState() => _PortfolioScreenState();
}

class _PortfolioScreenState extends ConsumerState<PortfolioScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  void _showAddTransaction(BuildContext context) {
    HapticFeedback.mediumImpact();
    showGlassSheet(context, const AddTransactionSheet());
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final ref = this.ref;
    final portfolio = ref.watch(portfolioProvider);
    final tab = ref.watch(_tabProvider);
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      floatingActionButton: _AddFab(onTap: () => _showAddTransaction(context)),
      body: AppRefreshIndicator(
        onRefresh: () async {
          ref.invalidate(portfolioProvider);
          await ref.read(portfolioPLProvider.notifier).refresh();
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // ── Custom header ──
            SliverToBoxAdapter(
              child: SafeArea(
                bottom: false,
                child: _PortfolioHeader(portfolio: portfolio),
              ),
            ),

            // ── P/L Summary (always visible, compact) ──
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: _PLQuickSummary(),
              ),
            ),

            // ── Stat cards ──
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
                child: portfolio.when(
                  data: (data) => _StatCards(data: data)
                      .animate()
                      .fadeIn(duration: 400.ms)
                      .slideY(begin: 0.1, duration: 400.ms, curve: Curves.easeOutCubic),
                  loading: () => const SkeletonStatCards(),
                  error: (_, _) => const SizedBox.shrink(),
                ),
              ),
            ),

            // ── Tabs ──
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: _PillTabs(
                  tabs: const ['Value', 'P/L', 'Items'],
                  selected: tab,
                  onChanged: (i) {
                    HapticFeedback.selectionClick();
                    ref.read(_tabProvider.notifier).state = i;
                  },
                ),
              ),
            ),

            // ── Tab content — Visibility keeps state, avoids IndexedStack height bloat ──
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
              sliver: SliverToBoxAdapter(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Visibility(
                      visible: tab == 0,
                      maintainState: true,
                      child: _ValueTab(key: const ValueKey('value')),
                    ),
                    Visibility(
                      visible: tab == 1,
                      maintainState: true,
                      child: _PLChartTab(key: const ValueKey('pl')),
                    ),
                    Visibility(
                      visible: tab == 2,
                      maintainState: true,
                      child: _ItemsTab(key: const ValueKey('items')),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Floating Add Button ──────────────────────────────────────
class _AddFab extends StatelessWidget {
  final VoidCallback onTap;
  const _AddFab({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 100),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            gradient: AppTheme.primaryGradient,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: AppTheme.primary.withValues(alpha: 0.4),
                blurRadius: 20,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: const Icon(Icons.add_rounded, size: 26, color: Colors.white),
        ),
      ),
    );
  }
}

// ── P/L Quick Summary (always visible) ─────────────────────
class _PLQuickSummary extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pl = ref.watch(portfolioPLProvider);
    final currency = ref.watch(currencyProvider);

    return pl.when(
      data: (data) {
        if (!data.hasData) {
          return GestureDetector(
            onTap: () {
              // Show add transaction sheet
              HapticFeedback.mediumImpact();
              showGlassSheet(context, const AddTransactionSheet());
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: AppTheme.primary.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppTheme.primary.withValues(alpha: 0.15),
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.add_circle_outline_rounded,
                      size: 20, color: AppTheme.primary),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Log your first purchase to track profit',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ),
                  const Icon(Icons.arrow_forward_ios_rounded,
                      size: 14, color: AppTheme.textDisabled),
                ],
              ),
            ),
          ).animate().fadeIn(duration: 400.ms);
        }

        final plColor = AppTheme.plColor(data.totalProfitCents);
        return Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(
            color: plColor.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: plColor.withValues(alpha: 0.12),
              width: 0.5,
            ),
          ),
          child: Row(
            children: [
              // P/L Amount
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'TOTAL P/L',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                        color: AppTheme.textDisabled,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Text(
                          currency.formatWithSign(data.totalProfit),
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: plColor,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: plColor.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(5),
                          ),
                          child: Text(
                            AppTheme.pctText(data.totalProfitPct),
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: plColor,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              // Mini stats
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _PLMiniRow(
                      label: 'Invested',
                      value: currency.format(data.totalInvested, decimals: 0)),
                  const SizedBox(height: 3),
                  _PLMiniRow(
                      label: 'Current',
                      value: currency.format(data.totalCurrentValue, decimals: 0)),
                ],
              ),
            ],
          ),
        ).animate().fadeIn(duration: 400.ms);
      },
      loading: () => const ShimmerBox(height: 64),
      error: (_, _) => const SizedBox.shrink(),
    );
  }
}

class _PLMiniRow extends StatelessWidget {
  final String label;
  final String value;
  const _PLMiniRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '$label ',
          style: const TextStyle(
            fontSize: 11,
            color: AppTheme.textDisabled,
          ),
        ),
        Text(
          value,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: AppTheme.textSecondary,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}

// ── Header ───────────────────────────────────────────────────────────
class _PortfolioHeader extends ConsumerWidget {
  final AsyncValue<PortfolioSummary> portfolio;
  const _PortfolioHeader({required this.portfolio});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 16, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'TOTAL PORTFOLIO',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1.5,
                      color: AppTheme.textDisabled,
                    ),
                  ),
                  const SizedBox(height: 6),
                  portfolio.when(
                    data: (data) => AnimatedNumber(
                      value: data.totalValue,
                      style: const TextStyle(
                        fontSize: 36,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -1.5,
                        color: Colors.white,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                      formatter: (v) => currency.format(v),
                    ).animate().fadeIn(duration: 600.ms),
                    loading: () => const ShimmerBox(width: 200, height: 40),
                    error: (_, _) => const SizedBox.shrink(),
                  ),
                ],
              ),
              const Spacer(),
            ],
          ),
          const SizedBox(height: 12),
          portfolio.when(
            data: (data) {
              final isUp = data.change24h >= 0;
              final color = AppTheme.plColor(data.change24h);
              return Row(
                children: [
                  _ChangeBadge(
                    text: '${isUp ? "↑" : "↓"} ${currency.formatWithSign(data.change24h)}',
                    color: color,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${AppTheme.pctText(data.change24hPct)} today',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textDisabled,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const Spacer(),
                  SyncIndicator(
                    onTap: () async {
                      HapticFeedback.mediumImpact();
                      await ref.read(portfolioPLProvider.notifier).recalculate();
                      ref.invalidate(portfolioProvider);
                    },
                  ),
                ],
              ).animate().fadeIn(duration: 500.ms, delay: 200.ms);
            },
            loading: () => const ShimmerBox(width: 160, height: 28),
            error: (_, _) => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _ChangeBadge extends StatelessWidget {
  final String text;
  final Color color;
  const _ChangeBadge({required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.2), width: 0.5),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: color,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

class _IconBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _IconBtn({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.white.withValues(alpha: 0.07), width: 0.5),
        ),
        child: Icon(icon, size: 18, color: AppTheme.textMuted),
      ),
    );
  }
}

// ── Stat cards ───────────────────────────────────────────────────────
class _StatCards extends ConsumerWidget {
  final PortfolioSummary data;
  const _StatCards({required this.data});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Row(
      children: [
        _StatCard(
          label: 'ITEMS',
          value: NumberFormat.decimalPattern().format(data.itemCount),
          sub: 'in inventory',
          accentColor: AppTheme.primary,
          icon: Icons.inventory_2_rounded,
        ),
        const SizedBox(width: 8),
        _StatCard(
          label: '24H',
          value: AppTheme.pctText(data.change24hPct),
          sub: AppTheme.pctText(data.change24h),
          accentColor: AppTheme.plColor(data.change24hPct),
        ),
        const SizedBox(width: 8),
        _StatCard(
          label: '7D',
          value: AppTheme.pctText(data.change7dPct),
          sub: 'this week',
          accentColor: AppTheme.plColor(data.change7dPct),
        ),
      ],
    );
  }
}

class _StatCard extends StatefulWidget {
  final String label;
  final String value;
  final String sub;
  final Color accentColor;
  final IconData? icon;

  const _StatCard({
    required this.label,
    required this.value,
    required this.sub,
    required this.accentColor,
    this.icon,
  });

  @override
  State<_StatCard> createState() => _StatCardState();
}

class _StatCardState extends State<_StatCard> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTapDown: (_) => setState(() => _hovered = true),
        onTapUp: (_) => setState(() => _hovered = false),
        onTapCancel: () => setState(() => _hovered = false),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          transform: Matrix4.translationValues(0, _hovered ? -2 : 0, 0),
          padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.03),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: widget.accentColor.withValues(alpha: 0.12),
              width: 0.5,
            ),
            boxShadow: _hovered ? [
              BoxShadow(
                color: widget.accentColor.withValues(alpha: 0.08),
                blurRadius: 12,
              ),
            ] : [],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.label,
                style: const TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                  color: AppTheme.textDisabled,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                widget.value,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: widget.accentColor,
                  letterSpacing: -0.5,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 3),
              Text(
                widget.sub,
                style: const TextStyle(
                  fontSize: 10,
                  color: AppTheme.textDisabled,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Pill tabs ────────────────────────────────────────────────────────
class _PillTabs extends StatelessWidget {
  final List<String> tabs;
  final int selected;
  final ValueChanged<int> onChanged;

  const _PillTabs({
    required this.tabs,
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 42,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.05),
          width: 0.5,
        ),
      ),
      padding: const EdgeInsets.all(3),
      child: Row(
        children: tabs.asMap().entries.map((e) {
          final active = e.key == selected;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(e.key),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOutCubic,
                decoration: BoxDecoration(
                  gradient: active ? AppTheme.primaryGradient : null,
                  borderRadius: BorderRadius.circular(11),
                  boxShadow: active ? [
                    BoxShadow(
                      color: AppTheme.primary.withValues(alpha: 0.35),
                      blurRadius: 12,
                      offset: const Offset(0, 3),
                    ),
                  ] : [],
                ),
                child: Center(
                  child: Text(
                    e.value,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: active ? Colors.white : AppTheme.textMuted,
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Value Tab ────────────────────────────────────────────────────────
class _ValueTab extends ConsumerWidget {
  const _ValueTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfolio = ref.watch(portfolioProvider);
    return portfolio.when(
      data: (data) => _PortfolioChart(history: data.history)
          .animate().fadeIn(duration: 500.ms).slideY(begin: 0.05, duration: 400.ms, curve: Curves.easeOutCubic),
      loading: () => const Column(children: [
        ShimmerCard(height: 110),
        SizedBox(height: 12),
        ShimmerCard(height: 240),
      ]),
      error: (e, _) => EmptyState(
        icon: Icons.error_outline_rounded,
        title: 'Failed to load portfolio',
        subtitle: 'Check your connection and try again',
        action: GradientButton(
          label: 'Retry',
          icon: Icons.refresh_rounded,
          expanded: false,
          onPressed: () => ref.invalidate(portfolioProvider),
        ),
      ),
    );
  }
}

class _ValueCard extends ConsumerWidget {
  final PortfolioSummary data;
  const _ValueCard({required this.data});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final isUp = data.change24h >= 0;
    final changeColor = AppTheme.plColor(data.change24h);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06), width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('TOTAL VALUE', style: TextStyle(
            fontSize: 10, fontWeight: FontWeight.w600,
            letterSpacing: 1.5, color: AppTheme.textDisabled,
          )),
          const SizedBox(height: 10),
          AnimatedNumber(
            value: data.totalValue,
            style: AppTheme.priceLarge.copyWith(fontSize: 34, letterSpacing: -1),
            formatter: (v) => currency.format(v),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Icon(
                isUp ? Icons.trending_up_rounded : Icons.trending_down_rounded,
                color: changeColor, size: 16,
              ),
              const SizedBox(width: 4),
              Text(
                '${currency.formatWithSign(data.change24h)} (${AppTheme.pctText(data.change24hPct)})',
                style: TextStyle(
                  fontSize: 13, color: changeColor,
                  fontWeight: FontWeight.w600,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(width: 4),
              Text('today', style: AppTheme.caption.copyWith(fontSize: 12)),
            ],
          ),
        ],
      ),
    );
  }
}

class _PortfolioChart extends ConsumerStatefulWidget {
  final List<PortfolioHistoryPoint> history;
  const _PortfolioChart({required this.history});

  @override
  ConsumerState<_PortfolioChart> createState() => _PortfolioChartState();
}

class _PortfolioChartState extends ConsumerState<_PortfolioChart> {
  int _activePeriodIdx = 1; // 1W default
  static const _periods = ['1D', '1W', '1M', 'ALL'];

  @override
  Widget build(BuildContext context) {
    final currency = ref.watch(currencyProvider);
    if (widget.history.length < 2) return const SizedBox.shrink();

    final spots = widget.history.asMap().entries
        .map((e) => FlSpot(e.key.toDouble(), e.value.value))
        .toList();

    final minY = widget.history.map((e) => e.value).reduce((a, b) => a < b ? a : b);
    final maxY = widget.history.map((e) => e.value).reduce((a, b) => a > b ? a : b);
    final range = maxY - minY > 0 ? maxY - minY : maxY.abs() * 0.1 + 1;
    final pad = range * 0.12;
    final isUp = widget.history.last.value >= widget.history.first.value;
    final lineColor = isUp ? AppTheme.profit : AppTheme.loss;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.025),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06), width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('Portfolio Value', style: TextStyle(
                fontSize: 13, fontWeight: FontWeight.w600,
                color: AppTheme.textSecondary,
              )),
              const Spacer(),
              Container(
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(10),
                ),
                padding: const EdgeInsets.all(3),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: _periods.asMap().entries.map((e) {
                    final active = e.key == _activePeriodIdx;
                    return GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        setState(() => _activePeriodIdx = e.key);
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                        decoration: BoxDecoration(
                          color: active ? lineColor.withValues(alpha: 0.2) : Colors.transparent,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          e.value,
                          style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w600,
                            color: active ? lineColor : AppTheme.textDisabled,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 200,
            child: LineChart(
              LineChartData(
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  horizontalInterval: range / 3,
                  getDrawingHorizontalLine: (_) => FlLine(
                    color: Colors.white.withValues(alpha: 0.04),
                    strokeWidth: 1,
                  ),
                ),
                titlesData: FlTitlesData(
                  leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      interval: (widget.history.length / 4).ceilToDouble().clamp(1.0, double.infinity),
                      getTitlesWidget: (value, _) {
                        final idx = value.toInt();
                        if (idx < 0 || idx >= widget.history.length) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            DateFormat('d/M').format(widget.history[idx].date),
                            style: const TextStyle(fontSize: 10, color: AppTheme.textDisabled),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                borderData: FlBorderData(show: false),
                minY: minY - pad,
                maxY: maxY + pad,
                lineBarsData: [
                  LineChartBarData(
                    spots: spots,
                    isCurved: true,
                    curveSmoothness: 0.35,
                    color: lineColor,
                    barWidth: 2.5,
                    dotData: const FlDotData(show: false),
                    shadow: Shadow(color: lineColor.withValues(alpha: 0.3), blurRadius: 8),
                    belowBarData: BarAreaData(
                      show: true,
                      gradient: LinearGradient(
                        colors: [lineColor.withValues(alpha: 0.22), lineColor.withValues(alpha: 0.0)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                  ),
                ],
                lineTouchData: LineTouchData(
                  touchTooltipData: LineTouchTooltipData(
                    tooltipRoundedRadius: 10,
                    tooltipBorder: BorderSide(color: lineColor.withValues(alpha: 0.3), width: 0.5),
                    getTooltipItems: (spots) => spots.map((s) => LineTooltipItem(
                      currency.format(s.y),
                      const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13),
                    )).toList(),
                  ),
                  getTouchedSpotIndicator: (_, indicators) => indicators.map((_) => TouchedSpotIndicatorData(
                    FlLine(color: lineColor.withValues(alpha: 0.3), strokeWidth: 1, dashArray: [4, 4]),
                    FlDotData(
                      show: true,
                      getDotPainter: (_, _, _, _) => FlDotCirclePainter(
                        radius: 5, color: lineColor, strokeWidth: 2.5, strokeColor: AppTheme.bg,
                      ),
                    ),
                  )).toList(),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── P/L Tab ──────────────────────────────────────────────────────────
class _PLChartTab extends ConsumerStatefulWidget {
  const _PLChartTab({super.key});
  @override
  ConsumerState<_PLChartTab> createState() => _PLChartTabState();
}

class _PLChartTabState extends ConsumerState<_PLChartTab> {
  PLPeriod _period = PLPeriod.month;

  @override
  Widget build(BuildContext context) {
    final pl = ref.watch(portfolioPLProvider);
    final history = ref.watch(plHistoryProvider(_period.days));
    final isPremium = ref.watch(premiumProvider).valueOrNull ?? false;

    final accountsPL = ref.watch(accountsPLProvider);

    return Column(
      children: [
        pl.when(
          data: (d) => _PLSummaryCard(data: d)
              .animate().fadeIn(duration: 400.ms).slideY(begin: 0.05, duration: 400.ms, curve: Curves.easeOutCubic),
          loading: () => const ShimmerCard(height: 150),
          error: (_, _) => const SizedBox.shrink(),
        ),
        const SizedBox(height: 12),
        // ── Per-account breakdown (multi-account users) ──
        accountsPL.when(
          data: (accounts) => accounts.length > 1
              ? _AccountBreakdownCard(accounts: accounts)
                  .animate().fadeIn(duration: 400.ms, delay: 100.ms)
              : const SizedBox.shrink(),
          loading: () => const SizedBox.shrink(),
          error: (_, _) => const SizedBox.shrink(),
        ),
        const SizedBox(height: 12),
        PremiumGate(
          isPremium: isPremium,
          featureName: 'Detailed P/L charts over time',
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

// ── Items Tab ────────────────────────────────────────────────────────
class _ItemsTab extends ConsumerWidget {
  const _ItemsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsPL = ref.watch(itemsPLProvider);
    final isPremium = ref.watch(premiumProvider).valueOrNull ?? false;

    return PremiumGate(
      isPremium: isPremium,
      featureName: 'Per-item profit & loss breakdown',
      child: itemsPL.when(
        data: (items) => Column(
          children: [
            const _PortfolioSelectorBar(),
            const SizedBox(height: 8),
            ItemPLList(items: items).animate().fadeIn(duration: 400.ms),
          ],
        ),
        loading: () => Column(
          children: List.generate(5, (i) => const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: ShimmerBox(height: 56),
          )),
        ),
        error: (_, _) => Center(child: Text('Failed to load', style: TextStyle(color: AppTheme.textSecondary))),
      ),
    );
  }
}

// ── P/L Summary Card ─────────────────────────────────────────────────
class _PLSummaryCard extends ConsumerWidget {
  final PortfolioPL data;
  const _PLSummaryCard({required this.data});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    if (!data.hasData) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withValues(alpha: 0.06), width: 0.5),
        ),
        child: Row(
          children: [
            const Icon(Icons.sync_rounded, size: 18, color: AppTheme.textDisabled),
            const SizedBox(width: 10),
            Expanded(child: Text('Sync Steam Market history to see P/L', style: AppTheme.caption)),
          ],
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
          const Text('DETAILED PROFIT / LOSS', style: TextStyle(
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
          Text(value, style: TextStyle(
            fontSize: 13, fontWeight: FontWeight.w600,
            color: valueColor ?? AppTheme.textPrimary,
            fontFeatures: const [FontFeature.tabularFigures()],
          )),
        ],
      ),
    );
  }
}

// ── Account Breakdown Card ──────────────────────────────────────────
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
                  // Avatar
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
                  // Name + invested
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
                  // P/L value + percentage
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

// ── Portfolio selector ──────────────────────────────────────────────────────

class _PortfolioSelectorBar extends ConsumerWidget {
  const _PortfolioSelectorBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfoliosAsync = ref.watch(portfoliosProvider);
    final selected = ref.watch(selectedPortfolioIdProvider);

    return portfoliosAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (e, _) => const SizedBox.shrink(),
      data: (portfolios) {
        if (portfolios.isEmpty) {
          // Show just the "All" chip + "+" button to create first portfolio
          return Padding(
            padding: const EdgeInsets.fromLTRB(0, 0, 0, 8),
            child: Row(
              children: [
                _chip(
                  label: 'All',
                  color: AppTheme.primary,
                  isSelected: true,
                  onTap: () {},
                  onLongPress: null,
                ),
                const SizedBox(width: 8),
                _addButton(context, ref),
              ],
            ),
          );
        }
        return SizedBox(
          height: 36,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.zero,
            children: [
              _chip(
                label: 'All',
                color: AppTheme.primary,
                isSelected: selected == null,
                onTap: () {
                  HapticFeedback.selectionClick();
                  ref.read(selectedPortfolioIdProvider.notifier).state = null;
                  ref.read(plTabProvider.notifier).state = PlTab.active;
                },
                onLongPress: null,
              ),
              const SizedBox(width: 8),
              for (final p in portfolios) ...[
                _chip(
                  label: p.name,
                  color: p.color,
                  isSelected: selected == p.id,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    ref.read(selectedPortfolioIdProvider.notifier).state = p.id;
                    ref.read(plTabProvider.notifier).state = PlTab.active;
                  },
                  onLongPress: () => _showPortfolioOptions(context, ref, p),
                ),
                const SizedBox(width: 8),
              ],
              _addButton(context, ref),
            ],
          ),
        );
      },
    );
  }

  Widget _chip({
    required String label,
    required Color color,
    required bool isSelected,
    required VoidCallback onTap,
    required VoidCallback? onLongPress,
  }) {
    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? color.withValues(alpha: 0.2) : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? color : AppTheme.divider,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            color: isSelected ? color : AppTheme.textMuted,
          ),
        ),
      ),
    );
  }

  Widget _addButton(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        showGlassSheet(context, const _CreatePortfolioSheet());
      },
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.divider),
        ),
        child: const Icon(Icons.add, size: 16, color: AppTheme.textMuted),
      ),
    );
  }

  void _showPortfolioOptions(BuildContext context, WidgetRef ref, Portfolio p) {
    HapticFeedback.mediumImpact();
    showGlassSheet(
      context,
      _PortfolioOptionsSheet(portfolio: p),
    );
  }
}

// ── Preset colors for portfolio picker ──────────────────────────────────────
const _kPortfolioColors = [
  Color(0xFF6366F1), // indigo (default)
  Color(0xFF10B981), // green
  Color(0xFFF59E0B), // amber
  Color(0xFFEF4444), // red
  Color(0xFF8B5CF6), // purple
  Color(0xFF06B6D4), // cyan
];

// ── Create Portfolio Sheet ───────────────────────────────────────────────────
class _CreatePortfolioSheet extends ConsumerStatefulWidget {
  const _CreatePortfolioSheet();

  @override
  ConsumerState<_CreatePortfolioSheet> createState() =>
      _CreatePortfolioSheetState();
}

class _CreatePortfolioSheetState extends ConsumerState<_CreatePortfolioSheet> {
  final _nameCtrl = TextEditingController();
  Color _color = _kPortfolioColors[0];
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Name is required');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(portfoliosProvider.notifier).createPortfolio(name, _color);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = 'Failed to create portfolio';
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'New Portfolio',
            style: AppTheme.bodySmall.copyWith(
              fontWeight: FontWeight.w700,
              fontSize: 16,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _nameCtrl,
            autofocus: true,
            style: AppTheme.bodySmall.copyWith(color: AppTheme.textPrimary),
            decoration: InputDecoration(
              hintText: 'Portfolio name',
              hintStyle: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted),
              errorText: _error,
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: AppTheme.divider),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: AppTheme.primary),
              ),
              errorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0xFFEF4444)),
              ),
              focusedErrorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0xFFEF4444)),
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
          ),
          const SizedBox(height: 16),
          Text('Color',
              style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted)),
          const SizedBox(height: 8),
          Row(
            children: [
              for (final c in _kPortfolioColors) ...[
                GestureDetector(
                  onTap: () => setState(() => _color = c),
                  child: Container(
                    width: 32,
                    height: 32,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: c,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: _color == c ? Colors.white : Colors.transparent,
                        width: 2,
                      ),
                      boxShadow: _color == c
                          ? [
                              BoxShadow(
                                  color: c.withValues(alpha: 0.5), blurRadius: 6)
                            ]
                          : null,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(backgroundColor: AppTheme.primary),
              child: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Create'),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Portfolio Options Sheet (long-press) ─────────────────────────────────────
class _PortfolioOptionsSheet extends ConsumerWidget {
  final Portfolio portfolio;
  const _PortfolioOptionsSheet({required this.portfolio});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                    color: portfolio.color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Text(
                portfolio.name,
                style: AppTheme.bodySmall.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ListTile(
            leading:
                Icon(Icons.edit_outlined, color: AppTheme.textSecondary),
            title: Text('Edit',
                style:
                    AppTheme.bodySmall.copyWith(color: AppTheme.textPrimary)),
            onTap: () {
              Navigator.of(context).pop();
              showGlassSheet(
                  context, _EditPortfolioSheet(portfolio: portfolio));
            },
            contentPadding: EdgeInsets.zero,
            dense: true,
          ),
          ListTile(
            leading: const Icon(Icons.delete_outline,
                color: Color(0xFFEF4444)),
            title: Text('Delete',
                style: AppTheme.bodySmall
                    .copyWith(color: const Color(0xFFEF4444))),
            onTap: () async {
              Navigator.of(context).pop();
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (_) => AlertDialog(
                  backgroundColor: AppTheme.surface,
                  title: Text(
                    'Delete "${portfolio.name}"?',
                    style: AppTheme.bodySmall.copyWith(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  content: Text(
                    'Transactions in this portfolio will become untagged.',
                    style:
                        AppTheme.bodySmall.copyWith(color: AppTheme.textMuted),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: Text('Cancel',
                          style: TextStyle(color: AppTheme.textMuted)),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Delete',
                          style: TextStyle(color: Color(0xFFEF4444))),
                    ),
                  ],
                ),
              );
              if (confirmed == true && context.mounted) {
                await ref
                    .read(portfoliosProvider.notifier)
                    .deletePortfolio(portfolio.id);
                // Reset selection if this portfolio was active
                if (ref.read(selectedPortfolioIdProvider) == portfolio.id) {
                  ref.read(selectedPortfolioIdProvider.notifier).state = null;
                }
              }
            },
            contentPadding: EdgeInsets.zero,
            dense: true,
          ),
        ],
      ),
    );
  }
}

// ── Edit Portfolio Sheet ─────────────────────────────────────────────────────
class _EditPortfolioSheet extends ConsumerStatefulWidget {
  final Portfolio portfolio;
  const _EditPortfolioSheet({required this.portfolio});

  @override
  ConsumerState<_EditPortfolioSheet> createState() =>
      _EditPortfolioSheetState();
}

class _EditPortfolioSheetState extends ConsumerState<_EditPortfolioSheet> {
  late final TextEditingController _nameCtrl;
  late Color _color;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.portfolio.name);
    _color = widget.portfolio.color;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Name is required');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(portfoliosProvider.notifier)
          .updatePortfolio(widget.portfolio.id, name, _color);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = 'Failed to update portfolio';
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Edit Portfolio',
            style: AppTheme.bodySmall.copyWith(
              fontWeight: FontWeight.w700,
              fontSize: 16,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _nameCtrl,
            style: AppTheme.bodySmall.copyWith(color: AppTheme.textPrimary),
            decoration: InputDecoration(
              hintText: 'Portfolio name',
              hintStyle: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted),
              errorText: _error,
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: AppTheme.divider),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: AppTheme.primary),
              ),
              errorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0xFFEF4444)),
              ),
              focusedErrorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0xFFEF4444)),
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
          ),
          const SizedBox(height: 16),
          Text('Color',
              style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted)),
          const SizedBox(height: 8),
          Row(
            children: [
              for (final c in _kPortfolioColors) ...[
                GestureDetector(
                  onTap: () => setState(() => _color = c),
                  child: Container(
                    width: 32,
                    height: 32,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: c,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: _color == c ? Colors.white : Colors.transparent,
                        width: 2,
                      ),
                      boxShadow: _color == c
                          ? [
                              BoxShadow(
                                  color: c.withValues(alpha: 0.5), blurRadius: 6)
                            ]
                          : null,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(backgroundColor: AppTheme.primary),
              child: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Save'),
            ),
          ),
        ],
      ),
    );
  }
}
