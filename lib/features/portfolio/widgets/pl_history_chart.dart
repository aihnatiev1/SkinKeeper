import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/profit_loss.dart';

enum PLPeriod {
  week(7, '1W'),
  month(30, '1M'),
  threeMonths(90, '3M'),
  year(365, '1Y');

  final int days;
  final String label;
  const PLPeriod(this.days, this.label);
}

class PLHistoryChart extends ConsumerWidget {
  final List<PLHistoryPoint> history;
  final PLPeriod period;
  final ValueChanged<PLPeriod> onPeriodChanged;

  const PLHistoryChart({
    super.key,
    required this.history,
    required this.period,
    required this.onPeriodChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: AppTheme.glass(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'Profit History',
                style: AppTheme.title.copyWith(fontSize: 14),
              ),
              const Spacer(),
              _PeriodSelector(
                selected: period,
                onChanged: onPeriodChanged,
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (history.isEmpty)
            SizedBox(
              height: 180,
              child: Center(
                child: Text(
                  'Sync transactions to see P/L history',
                  style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted),
                ),
              ),
            )
          else
            SizedBox(
              height: 180,
              child: _buildChart(context, currency),
            ).animate().fadeIn(duration: 400.ms),
        ],
      ),
    );
  }

  Widget _buildChart(BuildContext context, CurrencyInfo currency) {
    final spots = history
        .asMap()
        .entries
        .map((e) => FlSpot(e.key.toDouble(), e.value.cumulativeProfit))
        .toList();

    if (spots.isEmpty) return const SizedBox.shrink();

    final values = spots.map((s) => s.y).toList();
    final minY = values.reduce((a, b) => a < b ? a : b);
    final maxY = values.reduce((a, b) => a > b ? a : b);
    final padding = ((maxY - minY) * 0.15).clamp(1.0, double.infinity);
    final isProfit = (history.last.cumulativeProfitCents) >= 0;
    final lineColor = isProfit ? AppTheme.profit : AppTheme.loss;

    return LineChart(
      LineChartData(
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
              interval: (history.length / 4).ceilToDouble(),
              getTitlesWidget: (value, _) {
                final idx = value.toInt();
                if (idx < 0 || idx >= history.length) {
                  return const SizedBox.shrink();
                }
                return Text(
                  DateFormat('d/M').format(history[idx].date),
                  style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
                );
              },
            ),
          ),
        ),
        borderData: FlBorderData(show: false),
        minY: minY - padding,
        maxY: maxY + padding,
        // Zero line
        extraLinesData: ExtraLinesData(
          horizontalLines: [
            HorizontalLine(
              y: 0,
              color: AppTheme.border,
              strokeWidth: 1,
              dashArray: [4, 4],
            ),
          ],
        ),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            curveSmoothness: 0.3,
            color: lineColor,
            barWidth: 2.5,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(
              show: true,
              color: lineColor.withValues(alpha: 0.12),
            ),
          ),
        ],
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipItems: (spots) {
              return spots.map((spot) {
                return LineTooltipItem(
                  currency.formatWithSign(spot.y),
                  TextStyle(
                    color: spot.y >= 0 ? AppTheme.profit : AppTheme.loss,
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
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

class _PeriodSelector extends StatelessWidget {
  final PLPeriod selected;
  final ValueChanged<PLPeriod> onChanged;

  const _PeriodSelector({required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: PLPeriod.values.map((p) {
        final isSelected = p == selected;
        return GestureDetector(
          onTap: () {
            if (!isSelected) {
              HapticFeedback.selectionClick();
              onChanged(p);
            }
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            margin: const EdgeInsets.only(left: 4),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: isSelected
                  ? AppTheme.primary.withValues(alpha: 0.15)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              p.label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                color: isSelected
                    ? AppTheme.textPrimary
                    : AppTheme.textMuted,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}
