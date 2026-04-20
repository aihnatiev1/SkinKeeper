import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api_client.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/profit_loss.dart';
import '../portfolio_pl_provider.dart';

// ── Provider: transactions for one item ──────────────────────────────────────

final _itemTxsProvider = FutureProvider.autoDispose
    .family<List<_Tx>, String>((ref, itemName) async {
  final api = ref.read(apiClientProvider);
  final res = await api.get('/transactions', queryParameters: {
    'item': itemName,
    'limit': '200',
  });
  final data = res.data as Map<String, dynamic>;
  return (data['transactions'] as List<dynamic>)
      .map((e) => _Tx.fromJson(e as Map<String, dynamic>))
      .toList();
});

class _Tx {
  final int id;
  final String type;
  final int priceCents;
  final DateTime createdAt;

  const _Tx({
    required this.id,
    required this.type,
    required this.priceCents,
    required this.createdAt,
  });

  factory _Tx.fromJson(Map<String, dynamic> j) => _Tx(
        id: j['id'] as int,
        type: j['type'] as String,
        priceCents: ((j['price_cents'] ?? j['priceCents'] ?? 0) as num).toInt(),
        createdAt: DateTime.parse(j['created_at'] ?? j['createdAt'] ?? '2020-01-01'),
      );
}

// ── Sheet ────────────────────────────────────────────────────────────────────

class ItemTransactionsSheet extends ConsumerWidget {
  final ItemPL item;
  const ItemTransactionsSheet({super.key, required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final txsAsync = ref.watch(_itemTxsProvider(item.marketHashName));

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: AppTheme.divider,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Text(
            item.displayName,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text('Transactions', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
          const SizedBox(height: 12),
          txsAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Error: $e', style: TextStyle(color: AppTheme.loss, fontSize: 12)),
            ),
            data: (txs) => _TxList(txs: txs, itemName: item.marketHashName),
          ),
        ],
      ),
    );
  }
}

// ── Transaction list ─────────────────────────────────────────────────────────

class _TxList extends ConsumerStatefulWidget {
  final List<_Tx> txs;
  final String itemName;
  const _TxList({required this.txs, required this.itemName});

  @override
  ConsumerState<_TxList> createState() => _TxListState();
}

class _TxListState extends ConsumerState<_TxList> {
  late List<_Tx> _txs;
  final Set<int> _deleting = {};

  @override
  void initState() {
    super.initState();
    _txs = List.from(widget.txs);
  }

  Future<void> _delete(int id) async {
    HapticFeedback.mediumImpact();
    setState(() => _deleting.add(id));
    try {
      final api = ref.read(apiClientProvider);
      await api.delete('/transactions/$id');
      setState(() {
        _txs.removeWhere((t) => t.id == id);
        _deleting.remove(id);
      });
      ref.invalidate(itemsPLProvider);
    } catch (e) {
      setState(() => _deleting.remove(id));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Delete failed: $e'), backgroundColor: AppTheme.loss),
        );
      }
    }
  }

  void _confirmDelete(int id) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: const Text('Delete transaction?', style: TextStyle(color: Colors.white, fontSize: 15)),
        content: Text('This cannot be undone.',
            style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
        actions: [
          TextButton(
            onPressed: () => context.pop(),
            child: Text('Cancel', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: () { context.pop(); _delete(id); },
            child: Text('Delete', style: TextStyle(color: AppTheme.loss, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  void _showEdit(_Tx tx) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _EditTxSheet(
        tx: tx,
        onSaved: (updated) {
          setState(() {
            final idx = _txs.indexWhere((t) => t.id == updated.id);
            if (idx >= 0) _txs[idx] = updated;
          });
          ref.invalidate(itemsPLProvider);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_txs.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Center(child: Text('No transactions', style: TextStyle(color: AppTheme.textMuted))),
      );
    }

    final currency = ref.watch(currencyProvider);

    return Container(
      constraints: const BoxConstraints(maxHeight: 360),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: ListView.separated(
        shrinkWrap: true,
        itemCount: _txs.length,
        separatorBuilder: (_, x) => Divider(height: 1, color: AppTheme.divider),
        itemBuilder: (_, i) {
          final tx = _txs[i];
          final isBuy = tx.type == 'buy';
          final price = tx.priceCents / 100;
          final date = '${tx.createdAt.day}.${tx.createdAt.month.toString().padLeft(2, '0')}.${tx.createdAt.year}';

          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(children: [
              // Type badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: (isBuy ? AppTheme.profit : AppTheme.loss).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(5),
                ),
                child: Text(
                  tx.type.toUpperCase(),
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: isBuy ? AppTheme.profit : AppTheme.loss,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              // Price + date
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(currency.format(price),
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                    Text(date, style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                  ],
                ),
              ),
              // Edit
              GestureDetector(
                onTap: () => _showEdit(tx),
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Icon(Icons.edit_outlined, size: 16, color: AppTheme.textMuted),
                ),
              ),
              // Delete
              _deleting.contains(tx.id)
                  ? const Padding(
                      padding: EdgeInsets.all(8),
                      child: SizedBox(
                          width: 16, height: 16,
                          child: CircularProgressIndicator(strokeWidth: 1.5, color: Colors.white)))
                  : GestureDetector(
                      onTap: () => _confirmDelete(tx.id),
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Icon(Icons.delete_outline_rounded, size: 16, color: AppTheme.loss),
                      ),
                    ),
            ]),
          );
        },
      ),
    );
  }
}

// ── Edit Transaction Sheet ────────────────────────────────────────────────────

class _EditTxSheet extends ConsumerStatefulWidget {
  final _Tx tx;
  final void Function(_Tx updated) onSaved;
  const _EditTxSheet({required this.tx, required this.onSaved});

  @override
  ConsumerState<_EditTxSheet> createState() => _EditTxSheetState();
}

class _EditTxSheetState extends ConsumerState<_EditTxSheet> {
  late TextEditingController _priceCtrl;
  late String _type;
  late DateTime _date;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _priceCtrl = TextEditingController(
        text: (widget.tx.priceCents / 100).toStringAsFixed(2));
    _type = widget.tx.type;
    _date = widget.tx.createdAt;
  }

  @override
  void dispose() {
    _priceCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final price = double.tryParse(_priceCtrl.text.replaceAll(',', '.'));
    if (price == null || price < 0) {
      setState(() => _error = 'Invalid price');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      final api = ref.read(apiClientProvider);
      await api.put('/transactions/${widget.tx.id}', data: {
        'price_usd': price,
        'type': _type,
        'date': _date.toIso8601String(),
      });
      final updated = _Tx(
        id: widget.tx.id,
        type: _type,
        priceCents: (price * 100).round(),
        createdAt: _date,
      );
      widget.onSaved(updated);
      if (mounted) context.pop();
    } catch (e) {
      setState(() { _saving = false; _error = 'Save failed: $e'; });
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2010),
      lastDate: DateTime.now(),
      builder: (ctx, child) => Theme(
        data: ThemeData.dark(),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    final dateStr = '${_date.day}.${_date.month.toString().padLeft(2, '0')}.${_date.year}';
    return Padding(
      padding: EdgeInsets.only(
        left: 16, right: 16, top: 0,
        bottom: MediaQuery.of(context).viewInsets.bottom + 32,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(color: AppTheme.divider, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const Text('Edit transaction',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 16),

          // Type selector
          Row(children: [
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _type = 'buy'),
                child: _typeChip('Buy', _type == 'buy', AppTheme.profit),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _type = 'sell'),
                child: _typeChip('Sell', _type == 'sell', AppTheme.loss),
              ),
            ),
          ]),
          const SizedBox(height: 12),

          // Price
          TextField(
            controller: _priceCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Price (USD)',
              labelStyle: TextStyle(color: AppTheme.textMuted),
              prefixText: '\$ ',
              prefixStyle: TextStyle(color: AppTheme.textMuted),
              enabledBorder: OutlineInputBorder(
                borderSide: BorderSide(color: AppTheme.divider),
                borderRadius: BorderRadius.circular(10),
              ),
              focusedBorder: OutlineInputBorder(
                borderSide: BorderSide(color: AppTheme.primary),
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Date
          GestureDetector(
            onTap: _pickDate,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.divider),
              ),
              child: Row(children: [
                Icon(Icons.calendar_today_outlined, size: 16, color: AppTheme.textMuted),
                const SizedBox(width: 10),
                Text(dateStr, style: const TextStyle(color: Colors.white, fontSize: 14)),
              ]),
            ),
          ),

          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(_error!, style: TextStyle(color: AppTheme.loss, fontSize: 12)),
            ),
          const SizedBox(height: 16),

          GestureDetector(
            onTap: _saving ? null : _save,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Center(
                child: _saving
                    ? const SizedBox(width: 18, height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Save', style: TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _typeChip(String label, bool selected, Color color) => Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.15) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? color : AppTheme.divider),
        ),
        child: Center(
          child: Text(label, style: TextStyle(
            color: selected ? color : AppTheme.textMuted,
            fontWeight: FontWeight.w600,
          )),
        ),
      );
}
