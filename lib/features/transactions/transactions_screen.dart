import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/api_client.dart';
import '../../features/purchases/iap_service.dart';
import '../auth/widgets/session_status_widget.dart';
import 'transactions_provider.dart';

class TransactionsScreen extends ConsumerWidget {
  const TransactionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final transactions = ref.watch(transactionsProvider);
    final stats = ref.watch(txStatsProvider);
    final typeFilter = ref.watch(txTypeFilterProvider);
    final itemFilter = ref.watch(txItemFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context).historyTitle),
        actions: [
          const SessionStatusWidget(),
          IconButton(
            icon: const Icon(Icons.file_download_outlined),
            tooltip: 'Export CSV',
            onPressed: () => _exportCsv(context, ref),
          ),
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: 'Sync from Steam',
            onPressed: () =>
                ref.read(transactionsProvider.notifier).sync(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Stats card
          stats.when(
            data: (s) => _StatsBar(stats: s),
            loading: () => const SizedBox(height: 80),
            error: (_, _) => const SizedBox.shrink(),
          ),

          // Filters
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Row(
              children: [
                // Type filter
                _FilterChip(
                  label: typeFilter == null
                      ? 'All'
                      : typeFilter == 'buy'
                          ? 'Bought'
                          : typeFilter == 'sell'
                              ? 'Sold'
                              : 'Traded',
                  selected: typeFilter != null,
                  onTap: () {
                    final current = ref.read(txTypeFilterProvider);
                    String? next;
                    if (current == null) {
                      next = 'buy';
                    } else if (current == 'buy') {
                      next = 'sell';
                    } else if (current == 'sell') {
                      next = 'trade';
                    } else {
                      next = null;
                    }
                    ref.read(txTypeFilterProvider.notifier).state = next;
                    ref.read(transactionsProvider.notifier).refresh();
                  },
                ),
                const SizedBox(width: 8),

                // Item filter
                _FilterChip(
                  label: itemFilter ?? 'All items',
                  selected: itemFilter != null,
                  onTap: () => _showItemFilter(context, ref),
                ),
                const SizedBox(width: 8),

                // Date filter
                _FilterChip(
                  label: 'Period',
                  selected: ref.watch(txDateFromProvider) != null,
                  onTap: () => _showDateFilter(context, ref),
                ),

                const Spacer(),

                // Clear filters
                if (typeFilter != null ||
                    itemFilter != null ||
                    ref.watch(txDateFromProvider) != null)
                  IconButton(
                    icon: const Icon(Icons.clear, size: 20),
                    onPressed: () {
                      ref.read(txTypeFilterProvider.notifier).state = null;
                      ref.read(txItemFilterProvider.notifier).state = null;
                      ref.read(txDateFromProvider.notifier).state = null;
                      ref.read(txDateToProvider.notifier).state = null;
                      ref.read(transactionsProvider.notifier).refresh();
                    },
                  ),
              ],
            ),
          ),

          // Transaction list
          Expanded(
            child: transactions.when(
              data: (list) {
                if (list.isEmpty) {
                  return const Center(
                    child: Text(
                      'No transactions.\nTap sync to fetch from Steam.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white54),
                    ),
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  itemCount: list.length,
                  itemBuilder: (_, i) => _TransactionTile(tx: list[i]),
                );
              },
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e')),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _exportCsv(BuildContext context, WidgetRef ref) async {
    final isPremium = ref.read(premiumProvider).valueOrNull ?? false;
    if (!isPremium) {
      HapticFeedback.lightImpact();
      context.push('/premium');
      return;
    }

    HapticFeedback.mediumImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Generating CSV...')),
    );

    try {
      final api = ref.read(apiClientProvider);
      final type = ref.read(txTypeFilterProvider);
      final from = ref.read(txDateFromProvider);
      final to = ref.read(txDateToProvider);

      final params = <String, dynamic>{};
      if (type != null) params['type'] = type;
      if (from != null) params['from'] = from.toIso8601String();
      if (to != null) params['to'] = to.toIso8601String();

      final response = await api.get('/export/csv', queryParameters: params);
      final csvData = response.data as String;
      final lines = csvData.split('\n').length - 1; // minus header

      if (context.mounted) {
        final dir = await getTemporaryDirectory();
        final file = File('${dir.path}/skintracker_export.csv');
        await file.writeAsString(csvData);
        await SharePlus.instance.share(
          ShareParams(
            files: [XFile(file.path)],
            subject: 'SkinTracker Export — $lines transactions',
          ),
        );
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 403) {
        if (context.mounted) context.push('/premium');
      } else if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Export failed: ${e.message}')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Export failed: $e')),
        );
      }
    }
  }

  void _showItemFilter(BuildContext context, WidgetRef ref) {
    final itemsList = ref.read(txItemsListProvider);
    itemsList.when(
      data: (items) {
        showModalBottomSheet(
          context: context,
          builder: (_) => ListView(
            children: [
              ListTile(
                title: const Text('All items'),
                onTap: () {
                  ref.read(txItemFilterProvider.notifier).state = null;
                  ref.read(transactionsProvider.notifier).refresh();
                  Navigator.pop(context);
                },
              ),
              ...items.map((name) => ListTile(
                    title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
                    onTap: () {
                      ref.read(txItemFilterProvider.notifier).state = name;
                      ref.read(transactionsProvider.notifier).refresh();
                      Navigator.pop(context);
                    },
                  )),
            ],
          ),
        );
      },
      loading: () {},
      error: (_, _) {},
    );
  }

  Future<void> _showDateFilter(BuildContext context, WidgetRef ref) async {
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2013),
      lastDate: DateTime.now(),
      initialDateRange: ref.read(txDateFromProvider) != null
          ? DateTimeRange(
              start: ref.read(txDateFromProvider)!,
              end: ref.read(txDateToProvider) ?? DateTime.now(),
            )
          : null,
    );
    if (range != null) {
      ref.read(txDateFromProvider.notifier).state = range.start;
      ref.read(txDateToProvider.notifier).state = range.end;
      ref.read(transactionsProvider.notifier).refresh();
    }
  }
}

class _StatsBar extends StatelessWidget {
  final TransactionStats stats;

  const _StatsBar({required this.stats});

  @override
  Widget build(BuildContext context) {
    final isProfit = stats.profitCents >= 0;
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          _MiniStat(
            label: 'Bought',
            value: '${stats.totalBought}',
            sub: '\$${stats.spent.toStringAsFixed(2)}',
            color: Colors.redAccent,
          ),
          const SizedBox(width: 6),
          _MiniStat(
            label: 'Sold',
            value: '${stats.totalSold}',
            sub: '\$${stats.earned.toStringAsFixed(2)}',
            color: Colors.greenAccent,
          ),
          const SizedBox(width: 6),
          _MiniStat(
            label: 'Traded',
            value: '${stats.totalTraded}',
            sub: '\$${stats.tradedValue.toStringAsFixed(2)}',
            color: Colors.amberAccent,
          ),
          const SizedBox(width: 6),
          _MiniStat(
            label: 'Profit',
            value: '${isProfit ? '+' : ''}\$${stats.profit.toStringAsFixed(2)}',
            color: isProfit ? Colors.greenAccent : Colors.redAccent,
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  final Color color;

  const _MiniStat({
    required this.label,
    required this.value,
    this.sub,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              Text(label,
                  style: const TextStyle(fontSize: 11, color: Colors.white54)),
              const SizedBox(height: 4),
              Text(value,
                  style: TextStyle(
                      fontSize: 15, fontWeight: FontWeight.bold, color: color)),
              if (sub != null)
                Text(sub!,
                    style:
                        const TextStyle(fontSize: 11, color: Colors.white38)),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected
              ? Theme.of(context).colorScheme.primary.withAlpha(40)
              : Colors.white.withAlpha(10),
          borderRadius: BorderRadius.circular(20),
          border: selected
              ? Border.all(color: Theme.of(context).colorScheme.primary)
              : null,
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            color: selected ? Theme.of(context).colorScheme.primary : Colors.white70,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }
}

class _TransactionTile extends StatelessWidget {
  final TransactionItem tx;

  const _TransactionTile({required this.tx});

  @override
  Widget build(BuildContext context) {
    if (tx.isTrade) return _buildTradeTile(context);
    return _buildMarketTile(context);
  }

  Widget _buildMarketTile(BuildContext context) {
    final isBuy = tx.isBuy;
    final color = isBuy ? Colors.redAccent : Colors.greenAccent;
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        dense: true,
        leading: Icon(
          isBuy ? Icons.shopping_cart : Icons.sell,
          color: color,
          size: 20,
        ),
        title: Text(
          tx.marketHashName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 14),
        ),
        subtitle: Row(
          children: [
            _TypeBadge(label: isBuy ? 'Buy' : 'Sell', color: color),
            const SizedBox(width: 6),
            Text(
              DateFormat('dd.MM.yyyy HH:mm').format(tx.date.toLocal()),
              style: const TextStyle(fontSize: 11, color: Colors.white38),
            ),
          ],
        ),
        trailing: Text(
          '${isBuy ? '-' : '+'}\$${tx.priceUsd.toStringAsFixed(2)}',
          style: TextStyle(fontWeight: FontWeight.bold, color: color),
        ),
      ),
    );
  }

  Widget _buildTradeTile(BuildContext context) {
    final diff = tx.tradeDiffCents;
    final pct = tx.tradeDiffPct;
    final isGood = diff >= 0;
    final diffColor = diff > 0
        ? Colors.greenAccent
        : diff < 0
            ? Colors.redAccent
            : Colors.white54;

    final statusColor = switch (tx.tradeStatus) {
      'accepted' => Colors.greenAccent,
      'pending' => Colors.amberAccent,
      'cancelled' || 'declined' || 'expired' => Colors.white38,
      _ => Colors.white54,
    };

    final giveVal = (tx.giveTotal ?? 0) / 100;
    final recvVal = (tx.recvTotal ?? 0) / 100;

    // Fun verdict
    final verdict = _getTradeVerdict(pct);

    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row
            Row(
              children: [
                const Icon(Icons.swap_horiz, color: Colors.amberAccent, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    tx.marketHashName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                  ),
                ),
                _TypeBadge(
                  label: tx.tradeStatus ?? 'trade',
                  color: statusColor,
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Give / Receive summary
            Row(
              children: [
                Expanded(
                  child: _TradeValueBox(
                    label: 'GAVE',
                    count: tx.giveCount ?? 0,
                    value: giveVal,
                    color: Colors.redAccent,
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8),
                  child: Icon(Icons.arrow_forward, size: 16, color: Colors.white24),
                ),
                Expanded(
                  child: _TradeValueBox(
                    label: 'GOT',
                    count: tx.recvCount ?? 0,
                    value: recvVal,
                    color: Colors.greenAccent,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Diff + verdict
            Row(
              children: [
                Icon(
                  isGood ? Icons.trending_up : Icons.trending_down,
                  size: 16,
                  color: diffColor,
                ),
                const SizedBox(width: 4),
                Text(
                  '${diff >= 0 ? '+' : ''}\$${(diff / 100).toStringAsFixed(2)} (${pct.toStringAsFixed(1)}%)',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: diffColor,
                  ),
                ),
                const Spacer(),
                Text(
                  DateFormat('dd.MM.yyyy HH:mm').format(tx.date.toLocal()),
                  style: const TextStyle(fontSize: 11, color: Colors.white38),
                ),
              ],
            ),

            // Verdict message
            if (verdict != null) ...[
              const SizedBox(height: 6),
              Text(
                verdict,
                style: TextStyle(
                  fontSize: 12,
                  fontStyle: FontStyle.italic,
                  color: diffColor.withAlpha(180),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String? _getTradeVerdict(double pct) {
    if (pct >= 15) {
      return const ['Bro, you absolutely cooked here', 'Free money glitch activated', 'W trade. Hall of fame material.'][tx.id.hashCode.abs() % 3];
    } else if (pct >= 3) {
      return const ['Nice one! You came out on top', 'Solid trade, clean profit', 'GG, you won this round'][tx.id.hashCode.abs() % 3];
    } else if (pct >= -3) {
      return const ['Fair trade. Both happy, nobody scammed', 'Perfectly balanced, as all things should be', "A gentleman's agreement"][tx.id.hashCode.abs() % 3];
    } else if (pct >= -15) {
      return const ["I'd think twice about this one...", 'Not your best trade, chief', 'You might be leaving money on the table'][tx.id.hashCode.abs() % 3];
    } else {
      return const ['Bro... who hurt you?', "I'm calling the trade police on this one", 'My brother in Christ, what are you doing?'][tx.id.hashCode.abs() % 3];
    }
  }
}

class _TypeBadge extends StatelessWidget {
  final String label;
  final Color color;

  const _TypeBadge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: color.withAlpha(25),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 10, color: color),
      ),
    );
  }
}

class _TradeValueBox extends StatelessWidget {
  final String label;
  final int count;
  final double value;
  final Color color;

  const _TradeValueBox({
    required this.label,
    required this.count,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: color.withAlpha(12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withAlpha(30)),
      ),
      child: Column(
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            '$count items',
            style: const TextStyle(fontSize: 12, color: Colors.white70),
          ),
          Text(
            '\$${value.toStringAsFixed(2)}',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
