import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../widgets/shared_ui.dart';
import '../portfolio_provider.dart';

class PortfolioValueTab extends ConsumerWidget {
  const PortfolioValueTab({super.key});

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
    if (widget.history.isEmpty) {
      return SizedBox(
        width: double.infinity,
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.025),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withValues(alpha: 0.06), width: 0.5),
          ),
          child: Column(
            children: [
              Icon(Icons.show_chart_rounded, size: 40,
                  color: Colors.white.withValues(alpha: 0.15)),
              const SizedBox(height: 12),
              Text('Not enough data yet',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600,
                      color: Colors.white.withValues(alpha: 0.5))),
              const SizedBox(height: 6),
              Text('Your portfolio value chart will appear once we have a few days of price data.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12,
                      color: Colors.white.withValues(alpha: 0.3), height: 1.4)),
            ],
          ),
        ),
      );
    }

    final chartHistory = widget.history.length == 1
        ? [widget.history.first, widget.history.first]
        : widget.history;

    final spots = chartHistory.asMap().entries
        .map((e) => FlSpot(e.key.toDouble(), e.value.valueCents / 100))
        .toList();

    final minY = chartHistory
        .map((e) => e.valueCents / 100)
        .reduce((a, b) => a < b ? a : b);
    final maxY = chartHistory
        .map((e) => e.valueCents / 100)
        .reduce((a, b) => a > b ? a : b);
    final range = maxY - minY > 0 ? maxY - minY : maxY.abs() * 0.1 + 1;
    final pad = range * 0.12;
    final isUp =
        chartHistory.last.valueCents >= chartHistory.first.valueCents;
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
