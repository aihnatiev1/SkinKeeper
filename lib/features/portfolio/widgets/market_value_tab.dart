import 'dart:ui' show FontFeature;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../widgets/shared_ui.dart';
import '../../inventory/widgets/price_comparison_table.dart'
    show sourceColor, sourceDisplayName;

class MarketValueTab extends ConsumerWidget {
  const MarketValueTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final data = ref.watch(_valueBySourceProvider);

    return data.when(
      loading: () => const ShimmerCard(height: 200),
      error: (e, _) => GlassCard(
        child: Center(
          child: Text('Failed to load', style: AppTheme.caption),
        ),
      ),
      data: (sources) {
        if (sources.isEmpty) {
          return GlassCard(
            padding: const EdgeInsets.all(AppTheme.s24),
            child: Center(
              child: Text('No price data yet', style: AppTheme.caption),
            ),
          );
        }

        final maxValue = sources.first.totalValue;

        return GlassCard(
          padding: const EdgeInsets.all(AppTheme.s16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('PORTFOLIO VALUE BY MARKET', style: AppTheme.label),
              const SizedBox(height: AppTheme.s14),
              ...sources.map((s) {
                final color = sourceColor(s.source);
                final barFraction =
                    maxValue > 0 ? s.totalValue / maxValue : 0.0;

                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: color,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              sourceDisplayName(s.source),
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          Text(
                            currency.format(s.totalValue),
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Container(
                        height: 6,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(3),
                          color: Colors.white.withValues(alpha: 0.05),
                        ),
                        child: FractionallySizedBox(
                          alignment: Alignment.centerLeft,
                          widthFactor: barFraction,
                          child: Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(3),
                              color: color.withValues(alpha: 0.6),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${s.itemCount} items',
                        style: const TextStyle(
                          fontSize: 10,
                          color: AppTheme.textDisabled,
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        );
      },
    );
  }
}

final _valueBySourceProvider =
    FutureProvider.autoDispose<List<_SourceValue>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get('/portfolio/value-by-source');
  final data = response.data as Map<String, dynamic>;
  final list = data['sources'] as List<dynamic>;
  return list.map((e) {
    final m = e as Map<String, dynamic>;
    return _SourceValue(
      source: m['source'] as String,
      totalValue: (m['totalValue'] as num).toDouble(),
      itemCount: m['itemCount'] as int,
    );
  }).toList();
});

class _SourceValue {
  final String source;
  final double totalValue;
  final int itemCount;
  const _SourceValue({
    required this.source,
    required this.totalValue,
    required this.itemCount,
  });
}
