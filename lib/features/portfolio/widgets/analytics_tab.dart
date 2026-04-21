import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../widgets/shared_ui.dart';

class AnalyticsTab extends ConsumerWidget {
  const AnalyticsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final data = ref.watch(_analyticsProvider);

    return data.when(
      loading: () => const ShimmerCard(height: 300),
      error: (e, _) => GlassCard(
        child: Center(child: Text('Failed to load', style: AppTheme.caption)),
      ),
      data: (analytics) => Column(
        children: [
          _RarityBreakdown(entries: analytics.rarity),
          const SizedBox(height: AppTheme.s12),
          _TypeBreakdown(entries: analytics.types),
          const SizedBox(height: AppTheme.s12),
          if (analytics.topStickers.isNotEmpty)
            _TopStickers(entries: analytics.topStickers, currency: currency),
        ],
      ),
    );
  }
}

final _analyticsProvider =
    FutureProvider.autoDispose<_AnalyticsData>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get('/portfolio/analytics');
  final data = response.data as Map<String, dynamic>;
  return _AnalyticsData(
    rarity: (data['rarity'] as List)
        .map((e) => _RarityEntry(
              rarity: e['rarity'] as String,
              color: e['color'] as String?,
              count: e['count'] as int,
            ))
        .toList(),
    types: (data['types'] as List)
        .map((e) => _TypeEntry(
              type: e['type'] as String,
              count: e['count'] as int,
            ))
        .toList(),
    topStickers: (data['topStickers'] as List)
        .map((e) => _StickerEntry(
              name: e['name'] as String,
              count: e['count'] as int,
              price: (e['price'] as num).toDouble(),
            ))
        .toList(),
  );
});

class _AnalyticsData {
  final List<_RarityEntry> rarity;
  final List<_TypeEntry> types;
  final List<_StickerEntry> topStickers;
  const _AnalyticsData({
    required this.rarity,
    required this.types,
    required this.topStickers,
  });
}

class _RarityEntry {
  final String rarity;
  final String? color;
  final int count;
  const _RarityEntry({required this.rarity, this.color, required this.count});
}

class _TypeEntry {
  final String type;
  final int count;
  const _TypeEntry({required this.type, required this.count});
}

class _StickerEntry {
  final String name;
  final int count;
  final double price;
  const _StickerEntry({
    required this.name,
    required this.count,
    required this.price,
  });
}

class _RarityBreakdown extends StatelessWidget {
  final List<_RarityEntry> entries;
  const _RarityBreakdown({required this.entries});

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) return const SizedBox.shrink();
    final total = entries.fold<int>(0, (s, e) => s + e.count);

    return GlassCard(
      padding: const EdgeInsets.all(AppTheme.s16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('RARITY', style: AppTheme.label),
          const SizedBox(height: AppTheme.s12),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: SizedBox(
              height: 10,
              child: Row(
                children: entries.map((e) {
                  final color = e.color != null
                      ? Color(int.parse(
                          'FF${e.color!.replaceAll('#', '')}',
                          radix: 16))
                      : AppTheme.textDisabled;
                  return Expanded(
                    flex: e.count,
                    child: Container(color: color.withValues(alpha: 0.7)),
                  );
                }).toList(),
              ),
            ),
          ),
          const SizedBox(height: AppTheme.s12),
          Wrap(
            spacing: 12,
            runSpacing: 6,
            children: entries.map((e) {
              final color = e.color != null
                  ? Color(int.parse(
                      'FF${e.color!.replaceAll('#', '')}',
                      radix: 16))
                  : AppTheme.textDisabled;
              final pct =
                  total > 0 ? (e.count / total * 100).round() : 0;
              return Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${e.rarity} (${e.count}, $pct%)',
                    style: const TextStyle(
                        fontSize: 11, color: AppTheme.textSecondary),
                  ),
                ],
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _TypeBreakdown extends StatelessWidget {
  final List<_TypeEntry> entries;
  const _TypeBreakdown({required this.entries});

  static const _typeIcons = <String, IconData>{
    'Knives': Icons.content_cut_rounded,
    'Gloves': Icons.back_hand_rounded,
    'Weapons': Icons.gps_fixed_rounded,
    'Stickers': Icons.sticky_note_2_rounded,
    'Containers': Icons.inventory_2_rounded,
    'Music Kits': Icons.music_note_rounded,
    'Agents': Icons.person_rounded,
    'Patches': Icons.shield_rounded,
    'Charms': Icons.auto_awesome_rounded,
    'Graffiti': Icons.brush_rounded,
  };

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) return const SizedBox.shrink();
    final total = entries.fold<int>(0, (s, e) => s + e.count);

    return GlassCard(
      padding: const EdgeInsets.all(AppTheme.s16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('ITEM TYPES', style: AppTheme.label),
          const SizedBox(height: AppTheme.s12),
          ...entries.map((e) {
            final pct = total > 0 ? e.count / total : 0.0;
            final icon =
                _typeIcons[e.type] ?? Icons.help_outline_rounded;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Icon(icon, size: 14, color: AppTheme.textMuted),
                  const SizedBox(width: 8),
                  ConstrainedBox(
                    constraints:
                        const BoxConstraints(minWidth: 70, maxWidth: 90),
                    child: Text(e.type,
                        style: const TextStyle(fontSize: 12),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                  ),
                  Expanded(
                    child: Container(
                      height: 6,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(3),
                        color: Colors.white.withValues(alpha: 0.05),
                      ),
                      child: FractionallySizedBox(
                        alignment: Alignment.centerLeft,
                        widthFactor: pct,
                        child: Container(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(3),
                            color: AppTheme.primary.withValues(alpha: 0.5),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${e.count}',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
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

class _TopStickers extends StatelessWidget {
  final List<_StickerEntry> entries;
  final CurrencyInfo currency;
  const _TopStickers({required this.entries, required this.currency});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(AppTheme.s16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('TOP APPLIED STICKERS', style: AppTheme.label),
          const SizedBox(height: AppTheme.s12),
          ...entries.take(5).map((e) {
            final hasPrice = e.price > 0;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  const Text('✨', style: TextStyle(fontSize: 12)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          e.name,
                          style: const TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w500),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          'Applied ${e.count}x',
                          style: const TextStyle(
                              fontSize: 10,
                              color: AppTheme.textDisabled),
                        ),
                      ],
                    ),
                  ),
                  if (hasPrice)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          currency.format(e.price),
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                        if (e.count > 1)
                          Text(
                            '${currency.format(e.price * e.count)} total',
                            style: const TextStyle(
                              fontSize: 10,
                              color: AppTheme.textDisabled,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                      ],
                    )
                  else
                    const Text('—',
                        style: TextStyle(color: AppTheme.textDisabled)),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
