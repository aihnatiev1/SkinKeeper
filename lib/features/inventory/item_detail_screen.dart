import 'dart:developer' as dev;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../models/inventory_item.dart';
import 'widgets/price_comparison_table.dart';
import 'widgets/price_history_chart.dart';

class ItemDetailScreen extends ConsumerStatefulWidget {
  final InventoryItem item;

  const ItemDetailScreen({super.key, required this.item});

  @override
  ConsumerState<ItemDetailScreen> createState() => _ItemDetailScreenState();
}

class _ItemDetailScreenState extends ConsumerState<ItemDetailScreen> {
  List<PricePoint>? _history;
  bool _historyLoading = true;
  String? _historyError;

  @override
  void initState() {
    super.initState();
    _fetchHistory();
  }

  Future<void> _fetchHistory() async {
    try {
      final api = ref.read(apiClientProvider);
      final encoded = Uri.encodeComponent(widget.item.marketHashName);
      final response =
          await api.get('/prices/$encoded/history', queryParameters: {
        'days': 30,
      });
      final data = response.data as Map<String, dynamic>;
      final historyList = data['history'] as List<dynamic>;
      if (mounted) {
        setState(() {
          _history = historyList
              .map((e) => PricePoint.fromJson(e as Map<String, dynamic>))
              .toList();
          _historyLoading = false;
        });
      }
    } catch (e) {
      dev.log('Failed to load price history: $e', name: 'ItemDetail');
      if (mounted) {
        setState(() {
          _historyError = e.toString();
          _historyLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final rarityColor = item.rarityColor != null
        ? Color(int.parse('FF${item.rarityColor}', radix: 16))
        : Colors.grey;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          item.displayName,
          style: const TextStyle(fontSize: 18),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Item image with rarity border
            Center(
              child: Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: rarityColor.withAlpha(150), width: 2),
                  color: Colors.white.withAlpha(8),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: CachedNetworkImage(
                    imageUrl: item.fullIconUrl,
                    fit: BoxFit.contain,
                    placeholder: (_, _) => const Center(
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    errorWidget: (_, _, _) => const Icon(
                      Icons.image_not_supported,
                      size: 48,
                      color: Colors.white24,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Item name and weapon
            Text(
              item.displayName,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              item.weaponName,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: Colors.white.withAlpha(140),
              ),
            ),
            const SizedBox(height: 12),

            // Wear + float
            if (item.wear != null || item.floatValue != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (item.wear != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: rarityColor.withAlpha(25),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: rarityColor.withAlpha(60)),
                        ),
                        child: Text(
                          item.wear!,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: rarityColor,
                          ),
                        ),
                      ),
                    if (item.wear != null && item.floatValue != null)
                      const SizedBox(width: 10),
                    if (item.floatValue != null)
                      Text(
                        'Float: ${item.floatValue!.toStringAsFixed(6)}',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.white.withAlpha(140),
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                  ],
                ),
              ),

            // Best price prominently
            if (item.bestPrice != null)
              Container(
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(
                  color: Colors.white.withAlpha(8),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withAlpha(15)),
                ),
                child: Column(
                  children: [
                    Text(
                      'Best Price',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.white.withAlpha(120),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '\$${item.bestPrice!.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF00D2D3),
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                    if (item.bestPriceSource != null) ...[
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(
                          color: sourceColor(item.bestPriceSource!)
                              .withAlpha(25),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          sourceDisplayName(item.bestPriceSource!),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: sourceColor(item.bestPriceSource!),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            const SizedBox(height: 16),

            // Price comparison table
            PriceComparisonTable(prices: item.prices),
            const SizedBox(height: 16),

            // Price history chart
            if (_historyLoading)
              Container(
                height: 200,
                decoration: BoxDecoration(
                  color: Colors.white.withAlpha(8),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withAlpha(15)),
                ),
                child: const Center(
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              )
            else if (_historyError != null)
              Container(
                height: 200,
                decoration: BoxDecoration(
                  color: Colors.white.withAlpha(8),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withAlpha(15)),
                ),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline,
                          size: 32, color: Colors.redAccent),
                      const SizedBox(height: 8),
                      Text(
                        'Failed to load price history',
                        style: TextStyle(
                          color: Colors.white.withAlpha(140),
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              )
            else
              PriceHistoryChart(history: _history ?? []),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
