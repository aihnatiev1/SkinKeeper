import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../core/settings_provider.dart';
import '../../models/inventory_item.dart';
import '../../features/inventory/inventory_provider.dart';
import '../../core/steam_image.dart';

/// Rarity tiers for trade-up contracts (lowest to highest)
const _rarityOrder = [
  'Consumer Grade',
  'Industrial Grade',
  'Mil-Spec Grade',
  'Restricted',
  'Classified',
  'Covert',
];

const _rarityShort = {
  'Consumer Grade': 'Consumer',
  'Industrial Grade': 'Industrial',
  'Mil-Spec Grade': 'Mil-Spec',
  'Restricted': 'Restricted',
  'Classified': 'Classified',
  'Covert': 'Covert',
};

const _rarityColors = {
  'Consumer Grade': Color(0xFFB0C3D9),
  'Industrial Grade': Color(0xFF5E98D9),
  'Mil-Spec Grade': Color(0xFF4B69FF),
  'Restricted': Color(0xFF8847FF),
  'Classified': Color(0xFFD32CE6),
  'Covert': Color(0xFFEB4B4B),
};

String _normalizeRarity(String? rarity) {
  if (rarity == null) return '';
  final r = rarity.replaceAll(RegExp(r'[★\s]+'), ' ').trim();
  // Try exact match first
  if (_rarityOrder.contains(r)) return r;
  // Fuzzy match
  final lower = r.toLowerCase();
  for (final tier in _rarityOrder) {
    if (tier.toLowerCase() == lower) return tier;
    if (lower.contains(tier.toLowerCase().split(' ').first)) return tier;
  }
  return r;
}

bool _isTradeUpEligible(InventoryItem item) {
  final rarity = _normalizeRarity(item.rarity);
  if (rarity.isEmpty) return false;
  // Can't trade up Base Grade, Consumer Grade, Covert, or Contraband
  if (rarity == 'Covert') return false;
  if (!_rarityOrder.contains(rarity)) return false;
  final idx = _rarityOrder.indexOf(rarity);
  if (idx < 1) return false; // Consumer can't trade up (need Industrial+)
  // Must have a wear condition (weapon skins only)
  if (item.wear == null) return false;
  // Must be marketable (no storage units, keys, stickers, etc.)
  final type = item.marketHashName.toLowerCase();
  if (type.contains('case') || type.contains('key') || type.contains('sticker') ||
      type.contains('graffiti') || type.contains('patch') || type.contains('pin') ||
      type.contains('music kit') || type.contains('agent')) {
    return false;
  }
  return true;
}

class TradeUpScreen extends ConsumerStatefulWidget {
  const TradeUpScreen({super.key});

  @override
  ConsumerState<TradeUpScreen> createState() => _TradeUpScreenState();
}

class _TradeUpScreenState extends ConsumerState<TradeUpScreen> {
  final List<InventoryItem> _selected = [];
  String? _requiredRarity;
  bool _requiredStatTrak = false;

  @override
  Widget build(BuildContext context) {
    final currency = ref.watch(currencyProvider);
    final inventoryAsync = ref.watch(inventoryProvider);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        title: const Text('Trade-Up Calculator'),
        backgroundColor: AppTheme.bg,
        actions: [
          if (_selected.isNotEmpty)
            TextButton(
              onPressed: _clearAll,
              child: const Text('Clear', style: TextStyle(color: AppTheme.loss)),
            ),
        ],
      ),
      body: Column(
        children: [
          // Selected items + summary
          _buildSelectedSection(currency),

          const Divider(color: AppTheme.divider, height: 1),

          // Inventory grid (filtered to eligible items)
          Expanded(
            child: inventoryAsync.when(
              data: (items) => _buildInventoryGrid(items, currency),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: AppTheme.loss))),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSelectedSection(CurrencyInfo currency) {
    final inputCost = _selected.fold<double>(0, (sum, item) => sum + (item.steamPrice ?? 0));
    final avgFloat = _selected.isEmpty ? 0.0 :
        _selected.fold<double>(0, (sum, item) => sum + (item.floatValue ?? 0.5)) / _selected.length;

    return Container(
      padding: const EdgeInsets.all(12),
      color: AppTheme.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Text(
                'Selected ${_selected.length}/10',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textPrimary),
              ),
              if (_requiredRarity != null) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: (_rarityColors[_requiredRarity] ?? AppTheme.primary).withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    _rarityShort[_requiredRarity] ?? _requiredRarity!,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: _rarityColors[_requiredRarity] ?? AppTheme.primary,
                    ),
                  ),
                ),
                if (_requiredStatTrak)
                  Container(
                    margin: const EdgeInsets.only(left: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppTheme.warning.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text('ST', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: AppTheme.warning)),
                  ),
              ],
              const Spacer(),
              if (_selected.isNotEmpty)
                Text(
                  'Cost: ${currency.format(inputCost)}',
                  style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                ),
            ],
          ),

          if (_selected.isNotEmpty) ...[
            const SizedBox(height: 8),
            // Selected items row
            SizedBox(
              height: 56,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: _selected.length,
                itemBuilder: (context, index) {
                  final item = _selected[index];
                  return GestureDetector(
                    onTap: () => _removeItem(index),
                    child: Container(
                      width: 52,
                      margin: const EdgeInsets.only(right: 4),
                      decoration: BoxDecoration(
                        border: Border.all(color: _rarityColors[_normalizeRarity(item.rarity)] ?? AppTheme.border),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Stack(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(5),
                            child: Image.network(
                              SteamImage.url(item.iconUrl, size: '96fx96f'),
                              fit: BoxFit.cover,
                              width: 52,
                              height: 56,
                            ),
                          ),
                          Positioned(
                            top: 1, right: 1,
                            child: Container(
                              padding: const EdgeInsets.all(2),
                              decoration: BoxDecoration(
                                color: AppTheme.loss.withValues(alpha: 0.9),
                                borderRadius: BorderRadius.circular(3),
                              ),
                              child: const Icon(Icons.close, size: 10, color: Colors.white),
                            ),
                          ),
                          if (item.floatValue != null)
                            Positioned(
                              bottom: 1, left: 1,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.7),
                                  borderRadius: BorderRadius.circular(2),
                                ),
                                child: Text(
                                  item.floatValue!.toStringAsFixed(3),
                                  style: const TextStyle(fontSize: 7, color: Colors.white70),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),

            const SizedBox(height: 6),
            // Stats row
            Row(
              children: [
                _statChip('Avg Float', avgFloat.toStringAsFixed(4)),
                const SizedBox(width: 8),
                _statChip('Input Cost', currency.format(inputCost)),
                const Spacer(),
                if (_selected.length < 10)
                  Text(
                    'Need ${10 - _selected.length} more',
                    style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                  ),
              ],
            ),

            // Results panel — shown when 10 items selected
            if (_selected.length == 10) ...[
              const SizedBox(height: 10),
              _buildResultsPanel(avgFloat, inputCost, currency),
            ],
          ] else
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'Select 10 items of the same rarity to calculate trade-up outcomes',
                style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
              ),
            ),
        ],
      ),
    );
  }

  // Output float formula: avgInputFloat × (maxFloat − minFloat) + minFloat
  // For most CS2 skins: minFloat=0.00, maxFloat=1.00 → output = avgInputFloat
  // We approximate with standard float ranges per wear tier
  String _floatToWear(double f) {
    if (f < 0.07) return 'Factory New';
    if (f < 0.15) return 'Minimal Wear';
    if (f < 0.38) return 'Field-Tested';
    if (f < 0.45) return 'Well-Worn';
    return 'Battle-Scarred';
  }

  Color _wearColor(String wear) => switch (wear) {
    'Factory New' => const Color(0xFF4ade80),
    'Minimal Wear' => const Color(0xFF22d3ee),
    'Field-Tested' => const Color(0xFFa78bfa),
    'Well-Worn' => const Color(0xFFf97316),
    _ => const Color(0xFFef4444),
  };

  // Group selected items by collection → derive output probabilities
  Map<String, double> _collectionProbabilities() {
    final counts = <String, int>{};
    for (final item in _selected) {
      final col = item.collection?.name ?? item.marketHashName.split(' | ').first;
      counts[col] = (counts[col] ?? 0) + 1;
    }
    return counts.map((k, v) => MapEntry(k, v / _selected.length));
  }

  Widget _buildResultsPanel(double avgFloat, double inputCost, CurrencyInfo currency) {
    final outputWear = _floatToWear(avgFloat);
    final wearColor = _wearColor(outputWear);
    final outputRarityIdx = _rarityOrder.indexOf(_requiredRarity ?? '') + 1;
    final outputRarity = outputRarityIdx < _rarityOrder.length
        ? _rarityOrder[outputRarityIdx]
        : 'Covert';
    final outputRarityColor = _rarityColors[outputRarity] ?? AppTheme.primary;

    // Estimate EV from average price of same-rarity output items in inventory
    // (we don't have full collection data, so show the output details only)
    final probs = _collectionProbabilities();

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.primary.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome, size: 14, color: AppTheme.primary),
              const SizedBox(width: 6),
              const Text('Trade-Up Outcome', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
            ],
          ),
          const SizedBox(height: 8),

          // Output tier + float
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: outputRarityColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: outputRarityColor.withValues(alpha: 0.4)),
                ),
                child: Text(
                  outputRarity,
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: outputRarityColor),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: wearColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: wearColor.withValues(alpha: 0.35)),
                ),
                child: Text(
                  outputWear,
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: wearColor),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Float ~${avgFloat.toStringAsFixed(4)}',
                style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
              ),
            ],
          ),

          // Collection probabilities
          if (probs.length > 1) ...[
            const SizedBox(height: 8),
            const Text('Output chances by collection:', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
            const SizedBox(height: 4),
            ...probs.entries.map((e) => Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      e.key,
                      style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${(e.value * 100).round()}%',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textPrimary),
                  ),
                ],
              ),
            )),
          ],

          const SizedBox(height: 8),
          const Divider(color: AppTheme.divider, height: 1),
          const SizedBox(height: 8),

          // Cost summary
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Input Cost', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    Text(currency.format(inputCost), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppTheme.loss)),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward, size: 16, color: AppTheme.textMuted),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        const Text('1× ', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                        Text(outputRarity, style: TextStyle(fontSize: 10, color: outputRarityColor, fontWeight: FontWeight.w700)),
                        Text(' · $outputWear', style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                      ],
                    ),
                    const Text('Check market for price', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 10),
          // CTA
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: null, // Execute via desktop (GC required)
              icon: const Icon(Icons.open_in_new, size: 14),
              label: const Text('Execute on Desktop (GC required)'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.primary,
                side: BorderSide(color: AppTheme.primary.withValues(alpha: 0.4)),
                textStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                padding: const EdgeInsets.symmetric(vertical: 8),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _statChip(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
          const SizedBox(width: 4),
          Text(value, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
        ],
      ),
    );
  }

  Widget _buildInventoryGrid(List<InventoryItem> allItems, CurrencyInfo currency) {
    // Filter to eligible items
    final eligible = allItems.where(_isTradeUpEligible).toList();

    // Further filter by required rarity if set
    final filtered = _requiredRarity != null
        ? eligible.where((item) {
            final rarity = _normalizeRarity(item.rarity);
            final isStatTrak = item.marketHashName.contains('StatTrak');
            return rarity == _requiredRarity && isStatTrak == _requiredStatTrak;
          }).toList()
        : eligible;

    // Sort by rarity then price
    filtered.sort((a, b) {
      final aIdx = _rarityOrder.indexOf(_normalizeRarity(a.rarity));
      final bIdx = _rarityOrder.indexOf(_normalizeRarity(b.rarity));
      if (aIdx != bIdx) return bIdx - aIdx; // higher rarity first
      return (b.steamPrice ?? 0).compareTo(a.steamPrice ?? 0);
    });

    if (filtered.isEmpty) {
      return const Center(
        child: Text('No eligible items found', style: TextStyle(color: AppTheme.textMuted)),
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.all(8),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 5,
        childAspectRatio: 0.75,
        crossAxisSpacing: 4,
        mainAxisSpacing: 4,
      ),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final item = filtered[index];
        final isSelected = _selected.any((s) => s.assetId == item.assetId);
        final rarity = _normalizeRarity(item.rarity);
        final rarityColor = _rarityColors[rarity] ?? AppTheme.textMuted;

        return GestureDetector(
          onTap: isSelected ? null : () => _addItem(item),
          child: Opacity(
            opacity: isSelected ? 0.3 : (_selected.length >= 10 ? 0.5 : 1.0),
            child: Container(
              decoration: BoxDecoration(
                color: AppTheme.card,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: isSelected ? AppTheme.profit : rarityColor.withValues(alpha: 0.3),
                  width: isSelected ? 2 : 1,
                ),
              ),
              child: Column(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(5)),
                      child: Image.network(
                        SteamImage.url(item.iconUrl, size: '128fx128f'),
                        fit: BoxFit.cover,
                        width: double.infinity,
                      ),
                    ),
                  ),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 2),
                    decoration: BoxDecoration(
                      color: rarityColor.withValues(alpha: 0.1),
                      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(5)),
                    ),
                    child: Text(
                      item.steamPrice != null ? currency.format(item.steamPrice!) : '—',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: rarityColor),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  void _addItem(InventoryItem item) {
    if (_selected.length >= 10) return;
    if (_selected.any((s) => s.assetId == item.assetId)) return;

    setState(() {
      _selected.add(item);
      // Lock rarity + StatTrak after first item
      if (_selected.length == 1) {
        _requiredRarity = _normalizeRarity(item.rarity);
        _requiredStatTrak = item.marketHashName.contains('StatTrak');
      }
    });
  }

  void _removeItem(int index) {
    setState(() {
      _selected.removeAt(index);
      if (_selected.isEmpty) {
        _requiredRarity = null;
        _requiredStatTrak = false;
      }
    });
  }

  void _clearAll() {
    setState(() {
      _selected.clear();
      _requiredRarity = null;
      _requiredStatTrak = false;
    });
  }
}
