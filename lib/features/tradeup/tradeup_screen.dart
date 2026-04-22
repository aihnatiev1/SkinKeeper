import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../core/settings_provider.dart';
import '../../models/inventory_item.dart';
import '../../features/inventory/inventory_provider.dart';
import 'tradeup_parts/tradeup_rarity.dart';
import 'tradeup_parts/tradeup_results_panel.dart';
import 'tradeup_parts/tradeup_inventory_grid.dart';
import 'tradeup_parts/tradeup_selected_tile.dart';

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
          _buildSelectedSection(currency),

          const Divider(color: AppTheme.divider, height: 1),

          Expanded(
            child: inventoryAsync.when(
              data: (items) => TradeUpInventoryGrid(
                allItems: items,
                selected: _selected,
                requiredRarity: _requiredRarity,
                requiredStatTrak: _requiredStatTrak,
                currency: currency,
                onAddItem: _addItem,
              ),
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
                    color: (rarityColors[_requiredRarity] ?? AppTheme.primary).withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    rarityShort[_requiredRarity] ?? _requiredRarity!,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: rarityColors[_requiredRarity] ?? AppTheme.primary,
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
            SizedBox(
              height: 56,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: _selected.length,
                itemBuilder: (context, index) {
                  final item = _selected[index];
                  return TradeUpSelectedTile(
                    item: item,
                    onRemove: () => _removeItem(index),
                  );
                },
              ),
            ),

            const SizedBox(height: 6),
            Row(
              children: [
                TradeUpStatChip(label: 'Avg Float', value: avgFloat.toStringAsFixed(4)),
                const SizedBox(width: 8),
                TradeUpStatChip(label: 'Input Cost', value: currency.format(inputCost)),
                const Spacer(),
                if (_selected.length < 10)
                  Text(
                    'Need ${10 - _selected.length} more',
                    style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                  ),
              ],
            ),

            if (_selected.length == 10) ...[
              const SizedBox(height: 10),
              TradeUpResultsPanel(
                selected: _selected,
                avgFloat: avgFloat,
                inputCost: inputCost,
                requiredRarity: _requiredRarity,
                currency: currency,
              ),
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

  void _addItem(InventoryItem item) {
    if (_selected.length >= 10) return;
    if (_selected.any((s) => s.assetId == item.assetId)) return;

    setState(() {
      _selected.add(item);
      if (_selected.length == 1) {
        _requiredRarity = normalizeRarity(item.rarity);
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
