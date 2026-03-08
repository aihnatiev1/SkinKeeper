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

class PriceHistoryChart extends StatelessWidget {
  final List<PricePoint> history;

  const PriceHistoryChart({super.key, required this.history});

  @override
  Widget build(BuildContext context) {
    if (history.isEmpty) {
      return Container(
        height: 200,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white.withAlpha(8),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withAlpha(15)),
        ),
        child: Center(
          child: Text(
            'No history available',
            style: TextStyle(
              color: Colors.white.withAlpha(120),
              fontSize: 14,
            ),
          ),
        ),
      );
    }

    // Group by source
    final grouped = <String, List<PricePoint>>{};
    for (final point in history) {
      grouped.putIfAbsent(point.source, () => []).add(point);
    }

    // Sort each source's points by time
    for (final points in grouped.values) {
      points.sort((a, b) => a.recordedAt.compareTo(b.recordedAt));
    }

    // Find time bounds
    final allTimes = history.map((p) => p.recordedAt.millisecondsSinceEpoch);
    final minTime = allTimes.reduce((a, b) => a < b ? a : b).toDouble();
    final maxTime = allTimes.reduce((a, b) => a > b ? a : b).toDouble();

    // Find price bounds with padding
    final allPrices = history.map((p) => p.priceUsd);
    final rawMinPrice = allPrices.reduce((a, b) => a < b ? a : b);
    final rawMaxPrice = allPrices.reduce((a, b) => a > b ? a : b);
    final pricePadding = (rawMaxPrice - rawMinPrice) * 0.1;
    final minPrice = (rawMinPrice - pricePadding).clamp(0.0, double.infinity);
    final maxPrice = rawMaxPrice + pricePadding;

    final lineBars = grouped.entries.map((entry) {
      final color = sourceColor(entry.key);
      final spots = entry.value
          .map((p) => FlSpot(
                p.recordedAt.millisecondsSinceEpoch.toDouble(),
                p.priceUsd,
              ))
          .toList();

      return LineChartBarData(
        spots: spots,
        isCurved: true,
        color: color,
        barWidth: 2,
        dotData: const FlDotData(show: false),
        belowBarData: BarAreaData(
          show: true,
          color: color.withAlpha(20),
        ),
      );
    }).toList();

    final dateFormat = DateFormat('MMM d');

    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withAlpha(15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
            child: Text(
              'Price History',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: Colors.white.withAlpha(220),
              ),
            ),
          ),
          SizedBox(
            height: 200,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
              child: LineChart(
                LineChartData(
                  lineBarsData: lineBars,
                  minX: minTime,
                  maxX: maxTime,
                  minY: minPrice,
                  maxY: maxPrice,
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    horizontalInterval: _calcInterval(minPrice, maxPrice),
                    getDrawingHorizontalLine: (value) => FlLine(
                      color: Colors.white.withAlpha(15),
                      strokeWidth: 1,
                    ),
                  ),
                  borderData: FlBorderData(show: false),
                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                    rightTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 50,
                        interval: _calcInterval(minPrice, maxPrice),
                        getTitlesWidget: (value, meta) {
                          if (value == meta.min || value == meta.max) {
                            return const SizedBox.shrink();
                          }
                          return Text(
                            '\$${value.toStringAsFixed(2)}',
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.white.withAlpha(100),
                            ),
                          );
                        },
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 28,
                        interval: (maxTime - minTime) / 4,
                        getTitlesWidget: (value, meta) {
                          if (value == meta.min || value == meta.max) {
                            return const SizedBox.shrink();
                          }
                          final date = DateTime.fromMillisecondsSinceEpoch(
                              value.toInt());
                          return Text(
                            dateFormat.format(date),
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.white.withAlpha(100),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  lineTouchData: LineTouchData(
                    touchTooltipData: LineTouchTooltipData(
                      getTooltipColor: (_) =>
                          const Color(0xFF1A1A2E).withAlpha(230),
                      getTooltipItems: (touchedSpots) {
                        return touchedSpots.map((spot) {
                          final source =
                              grouped.keys.elementAt(spot.barIndex);
                          return LineTooltipItem(
                            '${sourceDisplayName(source)}\n\$${spot.y.toStringAsFixed(2)}',
                            TextStyle(
                              color: sourceColor(source),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          );
                        }).toList();
                      },
                    ),
                  ),
                ),
              ),
            ),
          ),
          // Legend
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
            child: Wrap(
              spacing: 16,
              runSpacing: 6,
              children: grouped.keys.map((source) {
                return Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: sourceColor(source),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      sourceDisplayName(source),
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.white.withAlpha(160),
                      ),
                    ),
                  ],
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  double _calcInterval(double min, double max) {
    final range = max - min;
    if (range <= 0) return 1;
    if (range < 1) return 0.25;
    if (range < 5) return 1;
    if (range < 20) return 5;
    if (range < 100) return 20;
    return (range / 5).roundToDouble();
  }
}
