import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import 'price_comparison_table.dart' show sourceColor, sourceDisplayName;

class PricePoint {
  final String source;
  final double priceUsd;
  final DateTime recordedAt;

  const PricePoint({
    required this.source,
    required this.priceUsd,
    required this.recordedAt,
  });

  factory PricePoint.fromJson(Map<String, dynamic> json) {
    return PricePoint(
      source: json['source'] as String,
      priceUsd: (json['price_usd'] as num).toDouble(),
      recordedAt: DateTime.parse(json['recorded_at'] as String),
    );
  }
}

enum ChartPeriod {
  day(label: '1D', days: 1),
  week(label: '1W', days: 7),
  month(label: '1M', days: 30),
  year(label: '1Y', days: 365);

  final String label;
  final int days;
  const ChartPeriod({required this.label, required this.days});
}

class PriceHistoryChart extends StatefulWidget {
  final List<PricePoint> history;
  final ChartPeriod period;
  final ValueChanged<ChartPeriod> onPeriodChanged;
  final CurrencyInfo? currency;

  const PriceHistoryChart({
    super.key,
    required this.history,
    this.period = ChartPeriod.month,
    required this.onPeriodChanged,
    this.currency,
  });

  @override
  State<PriceHistoryChart> createState() => _PriceHistoryChartState();
}

class _PriceHistoryChartState extends State<PriceHistoryChart> {
  String? _selectedSource;

  @override
  Widget build(BuildContext context) {
    if (widget.history.isEmpty) {
      return Container(
        height: 200,
        padding: const EdgeInsets.all(AppTheme.s24),
        decoration: AppTheme.glass(),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('No price history yet', style: AppTheme.bodySmall),
            const SizedBox(height: AppTheme.s12),
            _buildPeriodSelector(),
          ],
        ),
      );
    }

    // Group by source
    final grouped = <String, List<PricePoint>>{};
    for (final point in widget.history) {
      grouped.putIfAbsent(point.source, () => []).add(point);
    }
    for (final points in grouped.values) {
      points.sort((a, b) => a.recordedAt.compareTo(b.recordedAt));
    }

    final sources = grouped.keys.toList()..sort();
    final activeSources =
        _selectedSource != null ? [_selectedSource!] : sources;

    final activePoints =
        activeSources.expand((s) => grouped[s] ?? <PricePoint>[]).toList();
    if (activePoints.isEmpty) return const SizedBox.shrink();

    final allTimes =
        activePoints.map((p) => p.recordedAt.millisecondsSinceEpoch);
    final minTime = allTimes.reduce((a, b) => a < b ? a : b).toDouble();
    final maxTime = allTimes.reduce((a, b) => a > b ? a : b).toDouble();

    final allPrices = activePoints.map((p) => p.priceUsd);
    final rawMin = allPrices.reduce((a, b) => a < b ? a : b);
    final rawMax = allPrices.reduce((a, b) => a > b ? a : b);
    final pad = ((rawMax - rawMin) * 0.15).clamp(0.5, double.infinity);
    final minY = (rawMin - pad).clamp(0.0, double.infinity);
    final maxY = rawMax + pad;

    final lineBars = <LineChartBarData>[];
    for (final source in sources) {
      final points = grouped[source]!;
      final isActive = activeSources.contains(source);
      final color = sourceColor(source);

      lineBars.add(LineChartBarData(
        spots: points
            .map((p) => FlSpot(
                  p.recordedAt.millisecondsSinceEpoch.toDouble(),
                  p.priceUsd,
                ))
            .toList(),
        isCurved: true,
        curveSmoothness: 0.3,
        preventCurveOverShooting: true,
        color: isActive ? color : color.withValues(alpha: 0.12),
        barWidth: isActive ? 2.5 : 1,
        isStrokeCapRound: true,
        dotData: FlDotData(
          show: isActive && points.length < 30,
          getDotPainter: (spot, percent, bar, index) => FlDotCirclePainter(
            radius: 2.5,
            color: color,
            strokeWidth: 0,
          ),
        ),
        belowBarData: BarAreaData(
          show: isActive && _selectedSource != null,
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              color.withValues(alpha: 0.15),
              color.withValues(alpha: 0.0),
            ],
          ),
        ),
      ));
    }

    final priceChange = _computePriceChange(grouped, activeSources);

    final dateFormat = widget.period == ChartPeriod.day
        ? DateFormat('HH:mm')
        : DateFormat('d MMM');

    return Container(
      decoration: AppTheme.glass(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppTheme.s16,
              AppTheme.s14,
              AppTheme.s16,
              0,
            ),
            child: Row(
              children: [
                Text('PRICE HISTORY', style: AppTheme.label),
                const Spacer(),
                if (priceChange != null) _buildPriceChangeBadge(priceChange),
              ],
            ),
          ),

          // Period selector
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppTheme.s12,
              AppTheme.s10,
              AppTheme.s12,
              0,
            ),
            child: _buildPeriodSelector(),
          ),

          // Source filter chips
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppTheme.s12,
              AppTheme.s8,
              AppTheme.s12,
              AppTheme.s4,
            ),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _buildChip('All', null, sources.length > 1),
                ...sources.map((s) => _buildChip(
                    sourceDisplayName(s), s, sources.length > 1)),
              ],
            ),
          ),

          // Chart
          SizedBox(
            height: 180,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 8, 16, 4),
              child: LineChart(
                LineChartData(
                  lineBarsData: lineBars,
                  minX: minTime,
                  maxX: maxTime,
                  minY: minY,
                  maxY: maxY,
                  clipData: const FlClipData.all(),
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    horizontalInterval: _interval(minY, maxY),
                    getDrawingHorizontalLine: (_) => FlLine(
                      color: AppTheme.border,
                      strokeWidth: 0.5,
                    ),
                  ),
                  borderData: FlBorderData(show: false),
                  titlesData: FlTitlesData(
                    topTitles:
                        const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    rightTitles:
                        const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 52,
                        interval: _interval(minY, maxY),
                        getTitlesWidget: (value, meta) {
                          if (value <= meta.min || value >= meta.max) {
                            return const SizedBox.shrink();
                          }
                          return Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: Text(
                              widget.currency?.format(value) ?? '\$${value < 10 ? value.toStringAsFixed(2) : NumberFormat('#,##0', 'en_US').format(value.round())}',
                              style: AppTheme.captionSmall.copyWith(
                                color: AppTheme.textDisabled,
                                fontFeatures: const [FontFeature.tabularFigures()],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 24,
                        interval: (maxTime - minTime) / 4,
                        getTitlesWidget: (value, meta) {
                          if (value <= meta.min || value >= meta.max) {
                            return const SizedBox.shrink();
                          }
                          return Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              dateFormat.format(
                                  DateTime.fromMillisecondsSinceEpoch(
                                      value.toInt())),
                              style: AppTheme.captionSmall.copyWith(
                                color: AppTheme.textDisabled,
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  lineTouchData: LineTouchData(
                    handleBuiltInTouches: true,
                    touchTooltipData: LineTouchTooltipData(
                      fitInsideHorizontally: true,
                      fitInsideVertically: true,
                      tooltipRoundedRadius: AppTheme.r10,
                      tooltipPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      getTooltipColor: (_) => AppTheme.surfaceLight,
                      getTooltipItems: (spots) {
                        return spots.map((spot) {
                          final source = sources[spot.barIndex];
                          if (!activeSources.contains(source)) return null;
                          final date =
                              DateTime.fromMillisecondsSinceEpoch(spot.x.toInt());
                          return LineTooltipItem(
                            '${sourceDisplayName(source)}  ${widget.currency?.format(spot.y) ?? '\$${spot.y.toStringAsFixed(2)}'}\n${DateFormat('d MMM, HH:mm').format(date)}',
                            TextStyle(
                              color: sourceColor(source),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              height: 1.4,
                            ),
                          );
                        }).toList();
                      },
                    ),
                  ),
                ),
                duration: const Duration(milliseconds: 300),
              ),
            ),
          ),
          const SizedBox(height: AppTheme.s10),
        ],
      ),
    );
  }

  double? _computePriceChange(
      Map<String, List<PricePoint>> grouped, List<String> activeSources) {
    final preferredSource = activeSources.contains('steam')
        ? 'steam'
        : activeSources.isNotEmpty
            ? activeSources.first
            : null;
    if (preferredSource == null) return null;

    final points = grouped[preferredSource];
    if (points == null || points.length < 2) return null;

    final first = points.first.priceUsd;
    final last = points.last.priceUsd;
    if (first <= 0) return null;

    return ((last - first) / first) * 100;
  }

  Widget _buildPriceChangeBadge(double changePercent) {
    final isPositive = changePercent >= 0;
    final color = AppTheme.plColor(changePercent);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppTheme.r8),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isPositive ? Icons.trending_up_rounded : Icons.trending_down_rounded,
            size: 14,
            color: color,
          ),
          const SizedBox(width: 4),
          Text(
            AppTheme.pctText(changePercent),
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: color,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPeriodSelector() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: ChartPeriod.values.map((p) {
        final isSelected = widget.period == p;
        return Padding(
          padding: const EdgeInsets.only(right: 4),
          child: GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              widget.onPeriodChanged(p);
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: isSelected
                    ? AppTheme.accent.withValues(alpha: 0.12)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(AppTheme.r8),
                border: Border.all(
                  color: isSelected
                      ? AppTheme.accent.withValues(alpha: 0.3)
                      : AppTheme.border,
                ),
              ),
              child: Text(
                p.label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight:
                      isSelected ? FontWeight.w600 : FontWeight.w400,
                  color: isSelected ? AppTheme.accent : AppTheme.textMuted,
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildChip(String label, String? source, bool showAll) {
    if (!showAll && source == null) return const SizedBox.shrink();
    final isSelected =
        (source == null && _selectedSource == null) || source == _selectedSource;
    final color = source != null ? sourceColor(source) : AppTheme.textSecondary;

    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        setState(() => _selectedSource = source);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: isSelected ? color.withValues(alpha: 0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(AppTheme.r8),
          border: Border.all(
            color: isSelected ? color.withValues(alpha: 0.3) : AppTheme.border,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
            color: isSelected ? color : AppTheme.textMuted,
          ),
        ),
      ),
    );
  }

  double _interval(double min, double max) {
    final range = max - min;
    if (range <= 0) return 1;
    if (range < 1) return 0.25;
    if (range < 5) return 1;
    if (range < 20) return 5;
    if (range < 100) return 20;
    return (range / 5).roundToDouble();
  }
}
