import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

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

class PriceHistoryChart extends StatefulWidget {
  final List<PricePoint> history;

  const PriceHistoryChart({super.key, required this.history});

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
        padding: const EdgeInsets.all(24),
        decoration: _boxDecoration(),
        child: Center(
          child: Text(
            'No price history yet',
            style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 14),
          ),
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

    // Compute bounds from active sources only
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

    // Build line bars
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
        color: isActive ? color : color.withAlpha(30),
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
            colors: [color.withAlpha(40), color.withAlpha(5)],
          ),
        ),
      ));
    }

    // Latest prices per active source
    final latestPrices = <String, double>{};
    for (final source in activeSources) {
      final points = grouped[source];
      if (points != null && points.isNotEmpty) {
        latestPrices[source] = points.last.priceUsd;
      }
    }

    final dateFormat = DateFormat('d MMM');

    return Container(
      decoration: _boxDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with current prices
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Row(
              children: [
                Text(
                  'Price History',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withAlpha(220),
                  ),
                ),
                const Spacer(),
                if (_selectedSource != null && latestPrices.isNotEmpty)
                  Text(
                    '\$${latestPrices.values.first.toStringAsFixed(2)}',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: sourceColor(_selectedSource!),
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
              ],
            ),
          ),

          // Source filter chips
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
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
                      color: Colors.white.withAlpha(12),
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
                              '\$${value.toStringAsFixed(value < 10 ? 2 : 0)}',
                              style: TextStyle(
                                fontSize: 10,
                                color: Colors.white.withAlpha(90),
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
                              dateFormat.format(DateTime.fromMillisecondsSinceEpoch(
                                  value.toInt())),
                              style: TextStyle(
                                fontSize: 10,
                                color: Colors.white.withAlpha(90),
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
                      tooltipRoundedRadius: 10,
                      tooltipPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      getTooltipColor: (_) =>
                          const Color(0xF01A1A2E),
                      getTooltipItems: (spots) {
                        return spots.map((spot) {
                          final source = sources[spot.barIndex];
                          if (!activeSources.contains(source)) return null;
                          final date =
                              DateTime.fromMillisecondsSinceEpoch(spot.x.toInt());
                          return LineTooltipItem(
                            '${sourceDisplayName(source)}  \$${spot.y.toStringAsFixed(2)}\n${DateFormat('d MMM, HH:mm').format(date)}',
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
          const SizedBox(height: 10),
        ],
      ),
    );
  }

  Widget _buildChip(String label, String? source, bool showAll) {
    if (!showAll && source == null) return const SizedBox.shrink();
    final isSelected =
        (source == null && _selectedSource == null) || source == _selectedSource;
    final color =
        source != null ? sourceColor(source) : Colors.white.withAlpha(180);

    return GestureDetector(
      onTap: () => setState(() => _selectedSource = source),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: isSelected ? color.withAlpha(25) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected ? color.withAlpha(100) : Colors.white.withAlpha(20),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
            color: isSelected ? color : Colors.white.withAlpha(100),
          ),
        ),
      ),
    );
  }

  BoxDecoration _boxDecoration() => BoxDecoration(
        color: Colors.white.withAlpha(8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withAlpha(15)),
      );

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
