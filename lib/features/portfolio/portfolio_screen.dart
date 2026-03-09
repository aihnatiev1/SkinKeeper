import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../models/profit_loss.dart';
import '../../widgets/premium_gate.dart';
import '../../widgets/sync_indicator.dart';
import '../auth/widgets/session_status_widget.dart';
import '../purchases/iap_service.dart';
import 'portfolio_pl_provider.dart';
import 'portfolio_provider.dart';
import 'widgets/item_pl_list.dart';
import 'widgets/pl_history_chart.dart';

final _tabProvider = StateProvider<int>((ref) => 0);

class PortfolioScreen extends ConsumerWidget {
  const PortfolioScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfolio = ref.watch(portfolioProvider);
    final pl = ref.watch(portfolioPLProvider);
    final tab = ref.watch(_tabProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context).portfolioTitle),
        actions: [
          // Recalculate button
          IconButton(
            icon: const Icon(Icons.refresh, size: 20),
            tooltip: 'Recalculate P/L',
            onPressed: () {
              HapticFeedback.mediumImpact();
              ref.read(portfolioPLProvider.notifier).recalculate();
              ref.invalidate(portfolioProvider);
            },
          ),
          const SessionStatusWidget(),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(portfolioProvider);
          await ref.read(portfolioPLProvider.notifier).refresh();
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Sync indicator
              const Align(
                alignment: Alignment.centerLeft,
                child: SyncIndicator(),
              ),
              const SizedBox(height: 8),
              // P/L Summary Card (FREE)
              pl.when(
                data: (plData) => _PLSummaryCard(data: plData),
                loading: () => _buildLoadingCard(100),
                error: (e, _) => _buildErrorCard('P/L: $e'),
              ),
              const SizedBox(height: 16),

              // Stat tiles row
              portfolio.when(
                data: (data) => Row(
                  children: [
                    _StatTile(
                      label: 'Items',
                      value: data.itemCount.toString(),
                    ),
                    const SizedBox(width: 12),
                    _StatTile(
                      label: '24h',
                      value:
                          '${data.change24hPct >= 0 ? '+' : ''}${data.change24hPct.toStringAsFixed(1)}%',
                      valueColor: data.change24hPct >= 0
                          ? Colors.greenAccent
                          : Colors.redAccent,
                    ),
                    const SizedBox(width: 12),
                    _StatTile(
                      label: '7d',
                      value:
                          '${data.change7dPct >= 0 ? '+' : ''}${data.change7dPct.toStringAsFixed(1)}%',
                      valueColor: data.change7dPct >= 0
                          ? Colors.greenAccent
                          : Colors.redAccent,
                    ),
                  ],
                ),
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
              ),
              const SizedBox(height: 20),

              // Tab selector
              _TabSelector(
                selected: tab,
                onChanged: (i) {
                  HapticFeedback.selectionClick();
                  ref.read(_tabProvider.notifier).state = i;
                },
              ),
              const SizedBox(height: 16),

              // Tab content
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 300),
                child: _buildTabContent(tab, ref),
              ),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTabContent(int tab, WidgetRef ref) {
    switch (tab) {
      case 0:
        return _ValueTab(key: const ValueKey('value'));
      case 1:
        return _PLChartTab(key: const ValueKey('pl-chart'));
      case 2:
        return _ItemsTab(key: const ValueKey('items'));
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildLoadingCard(double height) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withAlpha(15)),
      ),
      child: const Center(
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
    );
  }

  Widget _buildErrorCard(String error) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withAlpha(15)),
      ),
      child: Text(error,
          style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
    );
  }
}

// ---- P/L Summary Card (FREE) ----

class _PLSummaryCard extends StatelessWidget {
  final PortfolioPL data;

  const _PLSummaryCard({required this.data});

  @override
  Widget build(BuildContext context) {
    if (!data.hasData) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white.withAlpha(8),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withAlpha(15)),
        ),
        child: Column(
          children: [
            Icon(Icons.sync, size: 32, color: Colors.white.withAlpha(80)),
            const SizedBox(height: 12),
            Text(
              'Sync your Steam Market history\nto see profit & loss',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: Colors.white.withAlpha(120),
              ),
            ),
          ],
        ),
      );
    }

    final profitColor = data.isProfitable ? Colors.greenAccent : Colors.redAccent;
    final prefix = data.totalProfitCents >= 0 ? '+' : '';
    final pctPrefix = data.totalProfitPct >= 0 ? '+' : '';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withAlpha(15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Total Profit/Loss',
            style: TextStyle(
              fontSize: 12,
              color: Colors.white.withAlpha(120),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$prefix\$${data.totalProfit.toStringAsFixed(2)}',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                  color: profitColor,
                ),
              ),
              const SizedBox(width: 10),
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: profitColor.withAlpha(25),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    '$pctPrefix${data.totalProfitPct.toStringAsFixed(1)}%',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: profitColor,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _MiniStat(
                label: 'Invested',
                value: '\$${data.totalInvested.toStringAsFixed(0)}',
              ),
              _MiniStat(
                label: 'Current',
                value: '\$${data.totalCurrentValue.toStringAsFixed(0)}',
              ),
              _MiniStat(
                label: 'Realized',
                value:
                    '${data.realizedProfitCents >= 0 ? '+' : ''}\$${data.realizedProfit.toStringAsFixed(0)}',
                valueColor: data.realizedProfitCents >= 0
                    ? Colors.greenAccent
                    : Colors.redAccent,
              ),
              _MiniStat(
                label: 'Unrealized',
                value:
                    '${data.unrealizedProfitCents >= 0 ? '+' : ''}\$${data.unrealizedProfit.toStringAsFixed(0)}',
                valueColor: data.unrealizedProfitCents >= 0
                    ? Colors.greenAccent
                    : Colors.redAccent,
              ),
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

  const _MiniStat({
    required this.label,
    required this.value,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 10, color: Colors.white.withAlpha(100)),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: valueColor ?? Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

// ---- Tab Selector ----

class _TabSelector extends StatelessWidget {
  final int selected;
  final ValueChanged<int> onChanged;

  const _TabSelector({required this.selected, required this.onChanged});

  static const _tabs = ['Value', 'P/L', 'Items'];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(8),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: List.generate(_tabs.length, (i) {
          final isSelected = i == selected;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(i),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected
                      ? Colors.white.withAlpha(15)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      _tabs[i],
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight:
                            isSelected ? FontWeight.w600 : FontWeight.normal,
                        color:
                            isSelected ? Colors.white : Colors.white.withAlpha(120),
                      ),
                    ),
                    if (i > 0) ...[
                      const SizedBox(width: 4),
                      Icon(
                        Icons.star,
                        size: 10,
                        color: isSelected
                            ? const Color(0xFFA29BFE)
                            : Colors.white.withAlpha(60),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

// ---- Tab 1: Value (existing portfolio chart) ----

class _ValueTab extends ConsumerWidget {
  const _ValueTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfolio = ref.watch(portfolioProvider);

    return portfolio.when(
      data: (data) => Column(
        children: [
          // Total value card
          _ValueCard(data: data),
          const SizedBox(height: 16),
          // Chart
          _PortfolioChart(history: data.history),
        ],
      ),
      loading: () => const SizedBox(
        height: 300,
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (e, _) => Center(child: Text('Error: $e')),
    );
  }
}

class _ValueCard extends StatelessWidget {
  final PortfolioSummary data;

  const _ValueCard({required this.data});

  @override
  Widget build(BuildContext context) {
    final isUp = data.change24h >= 0;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withAlpha(15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Total Value',
              style: TextStyle(
                  fontSize: 12, color: Colors.white.withAlpha(120))),
          const SizedBox(height: 6),
          Text(
            '\$${data.totalValue.toStringAsFixed(2)}',
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(
                isUp ? Icons.trending_up : Icons.trending_down,
                color: isUp ? Colors.greenAccent : Colors.redAccent,
                size: 18,
              ),
              const SizedBox(width: 4),
              Text(
                '${isUp ? '+' : ''}\$${data.change24h.toStringAsFixed(2)} (${data.change24hPct.toStringAsFixed(1)}%)',
                style: TextStyle(
                  fontSize: 13,
                  color: isUp ? Colors.greenAccent : Colors.redAccent,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(' today',
                  style: TextStyle(
                      fontSize: 12, color: Colors.white.withAlpha(100))),
            ],
          ),
        ],
      ),
    );
  }
}

class _PortfolioChart extends StatelessWidget {
  final List<PortfolioHistoryPoint> history;

  const _PortfolioChart({required this.history});

  @override
  Widget build(BuildContext context) {
    if (history.isEmpty) return const SizedBox.shrink();

    final spots = history
        .asMap()
        .entries
        .map((e) => FlSpot(e.key.toDouble(), e.value.value))
        .toList();

    final minY = history.map((e) => e.value).reduce((a, b) => a < b ? a : b);
    final maxY = history.map((e) => e.value).reduce((a, b) => a > b ? a : b);
    final padding = (maxY - minY) * 0.1;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withAlpha(15)),
      ),
      child: SizedBox(
        height: 200,
        child: LineChart(
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
                  interval: (history.length / 5).ceilToDouble(),
                  getTitlesWidget: (value, _) {
                    final idx = value.toInt();
                    if (idx < 0 || idx >= history.length) {
                      return const SizedBox.shrink();
                    }
                    return Text(
                      DateFormat('d/M').format(history[idx].date),
                      style: const TextStyle(
                          fontSize: 10, color: Colors.white38),
                    );
                  },
                ),
              ),
            ),
            borderData: FlBorderData(show: false),
            minY: minY - padding,
            maxY: maxY + padding,
            lineBarsData: [
              LineChartBarData(
                spots: spots,
                isCurved: true,
                color: Theme.of(context).colorScheme.primary,
                barWidth: 2.5,
                dotData: const FlDotData(show: false),
                belowBarData: BarAreaData(
                  show: true,
                  color:
                      Theme.of(context).colorScheme.primary.withAlpha(40),
                ),
              ),
            ],
            lineTouchData: LineTouchData(
              touchTooltipData: LineTouchTooltipData(
                getTooltipItems: (spots) {
                  return spots.map((spot) {
                    return LineTooltipItem(
                      '\$${spot.y.toStringAsFixed(2)}',
                      const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    );
                  }).toList();
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ---- Tab 2: P/L Chart (PREMIUM) ----

class _PLChartTab extends ConsumerStatefulWidget {
  const _PLChartTab({super.key});

  @override
  ConsumerState<_PLChartTab> createState() => _PLChartTabState();
}

class _PLChartTabState extends ConsumerState<_PLChartTab> {
  PLPeriod _period = PLPeriod.month;

  @override
  Widget build(BuildContext context) {
    final history = ref.watch(plHistoryProvider(_period.days));

    // TODO: Replace with actual premium check when IAP is implemented
    final isPremium = ref.watch(premiumProvider).valueOrNull ?? false;

    return PremiumGate(
      isPremium: isPremium,
      featureName: 'Detailed P/L charts over time',
      child: history.when(
        data: (data) => PLHistoryChart(
          history: data,
          period: _period,
          onPeriodChanged: (p) => setState(() => _period = p),
        ),
        loading: () => Container(
          height: 230,
          decoration: BoxDecoration(
            color: Colors.white.withAlpha(8),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withAlpha(15)),
          ),
          child:
              const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        ),
        error: (e, _) {
          // 403 = not premium
          if (e.toString().contains('403')) {
            return PremiumGate(
              isPremium: false,
              featureName: 'Detailed P/L charts over time',
              child: Container(
                height: 230,
                decoration: BoxDecoration(
                  color: Colors.white.withAlpha(8),
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            );
          }
          return Center(
            child: Text('Error: $e',
                style: const TextStyle(color: Colors.redAccent)),
          );
        },
      ),
    );
  }
}

// ---- Tab 3: Per-Item P/L (PREMIUM) ----

class _ItemsTab extends ConsumerWidget {
  const _ItemsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsPL = ref.watch(itemsPLProvider);

    // TODO: Replace with actual premium check when IAP is implemented
    final isPremium = ref.watch(premiumProvider).valueOrNull ?? false;

    return PremiumGate(
      isPremium: isPremium,
      featureName: 'Per-item profit & loss breakdown',
      child: itemsPL.when(
        data: (items) => ItemPLList(items: items),
        loading: () => Container(
          height: 200,
          decoration: BoxDecoration(
            color: Colors.white.withAlpha(8),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withAlpha(15)),
          ),
          child:
              const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        ),
        error: (e, _) {
          if (e.toString().contains('403')) {
            return PremiumGate(
              isPremium: false,
              featureName: 'Per-item profit & loss breakdown',
              child: Container(
                height: 200,
                decoration: BoxDecoration(
                  color: Colors.white.withAlpha(8),
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            );
          }
          return Center(
            child: Text('Error: $e',
                style: const TextStyle(color: Colors.redAccent)),
          );
        },
      ),
    );
  }
}

// ---- Stat Tile (reused) ----

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;

  const _StatTile({
    required this.label,
    required this.value,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white.withAlpha(8),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withAlpha(15)),
        ),
        child: Column(
          children: [
            Text(label,
                style: TextStyle(
                    fontSize: 11, color: Colors.white.withAlpha(100))),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: valueColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
