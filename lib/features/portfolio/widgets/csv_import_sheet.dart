import 'package:csv/csv.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api_client.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../portfolio_pl_provider.dart';

// ── Expected CSV format ───────────────────────────────────────────────────────
// name,type,qty,price_usd,date
// AK-47 | Redline (Field-Tested),buy,1,45.00,2024-01-15
//
// Required: name, type (buy/sell), price_usd
// Optional: qty (default 1), date (default today, YYYY-MM-DD)

class _CsvRow {
  final String name;
  final String type;
  final int qty;
  final double priceUsd;
  final String? date;
  final String? error;

  const _CsvRow({
    required this.name,
    required this.type,
    required this.qty,
    required this.priceUsd,
    this.date,
    this.error,
  });
}

class CsvImportSheet extends ConsumerStatefulWidget {
  const CsvImportSheet({super.key});

  @override
  ConsumerState<CsvImportSheet> createState() => _CsvImportSheetState();
}

class _CsvImportSheetState extends ConsumerState<CsvImportSheet> {
  final _textCtrl = TextEditingController();
  List<_CsvRow>? _rows;
  bool _importing = false;
  String? _resultMsg;
  bool _showPreview = false;

  @override
  void dispose() {
    _textCtrl.dispose();
    super.dispose();
  }

  void _parse() {
    final text = _textCtrl.text.trim();
    if (text.isEmpty) return;
    setState(() { _rows = null; _resultMsg = null; });

    try {
      final rows = const CsvToListConverter(eol: '\n').convert(text);
      if (rows.isEmpty) return;

      final first = rows.first.map((e) => e.toString().toLowerCase().trim()).toList();
      final hasHeader = first.any((c) => c == 'name' || c == 'type' || c == 'price_usd');
      final dataRows = hasHeader ? rows.skip(1).toList() : rows;

      int nameIdx = 0, typeIdx = 1, qtyIdx = 2, priceIdx = 3, dateIdx = 4;
      if (hasHeader) {
        nameIdx = first.indexOf('name').clamp(0, first.length - 1);
        typeIdx = first.indexWhere((c) => c == 'type');
        if (typeIdx < 0) typeIdx = 1;
        qtyIdx = first.indexWhere((c) => c == 'qty' || c == 'quantity');
        if (qtyIdx < 0) qtyIdx = 2;
        priceIdx = first.indexWhere((c) => c.contains('price'));
        if (priceIdx < 0) priceIdx = 3;
        dateIdx = first.indexWhere((c) => c == 'date');
        if (dateIdx < 0) dateIdx = 4;
      }

      String cell(List row, int idx) =>
          idx < row.length ? row[idx].toString().trim() : '';

      final parsed = <_CsvRow>[];
      for (final row in dataRows) {
        if (row.isEmpty || row.every((c) => c.toString().trim().isEmpty)) continue;
        final name = cell(row, nameIdx);
        final type = cell(row, typeIdx).toLowerCase();
        final qtyStr = cell(row, qtyIdx);
        final priceStr = cell(row, priceIdx);
        final date = cell(row, dateIdx);

        String? err;
        if (name.isEmpty) {
          err = 'name required';
        } else if (type != 'buy' && type != 'sell') {
          err = 'type must be buy/sell';
        } else if (double.tryParse(priceStr) == null) {
          err = 'invalid price';
        }

        parsed.add(_CsvRow(
          name: name,
          type: type,
          qty: int.tryParse(qtyStr) ?? 1,
          priceUsd: double.tryParse(priceStr) ?? 0,
          date: date.isNotEmpty ? date : null,
          error: err,
        ));
      }

      setState(() {
        _rows = parsed;
        _showPreview = true;
      });
    } catch (e) {
      setState(() {
        _rows = [];
      });
    }
  }

  Future<void> _import() async {
    final rows = _rows;
    if (rows == null) return;
    final valid = rows.where((r) => r.error == null).toList();
    if (valid.isEmpty) return;

    setState(() { _importing = true; });
    try {
      final api = ref.read(apiClientProvider);
      final portfolioId = ref.read(selectedPortfolioIdProvider);
      final res = await api.post('/transactions/import', data: {
        'rows': valid.map((r) => {
          'name': r.name,
          'type': r.type,
          'qty': r.qty,
          'price_usd': r.priceUsd,
          if (r.date != null) 'date': r.date,
          if (portfolioId != null) 'portfolio_id': portfolioId,
        }).toList(),
      });
      final imported = res.data['imported'] as int;
      ref.invalidate(itemsPLProvider);
      setState(() {
        _importing = false;
        _resultMsg = 'Imported $imported transaction${imported == 1 ? '' : 's'}!';
        _rows = null;
        _showPreview = false;
        _textCtrl.clear();
      });
    } catch (e) {
      setState(() { _importing = false; });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Import failed: $e'), backgroundColor: AppTheme.loss),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final currency = ref.watch(currencyProvider);
    final validCount = _rows?.where((r) => r.error == null).length ?? 0;
    final errorCount = _rows?.where((r) => r.error != null).length ?? 0;

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
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                  color: AppTheme.divider, borderRadius: BorderRadius.circular(2)),
            ),
          ),

          const Text('Import CSV',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 4),
          Text('Paste your CSV data below',
              style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
          const SizedBox(height: 10),

          // Format hint
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: AppTheme.surface, borderRadius: BorderRadius.circular(8)),
            child: Text(
              'name,type,qty,price_usd,date\n'
              'AK-47 | Redline (FT),buy,1,45.00,2024-01-15\n'
              'AWP | Asiimov (FT),sell,2,120.00',
              style: TextStyle(
                  fontSize: 10, color: AppTheme.textSecondary, fontFamily: 'monospace'),
            ),
          ),
          const SizedBox(height: 8),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.info_outline_rounded, size: 12, color: AppTheme.textMuted),
            const SizedBox(width: 5),
            Expanded(
              child: Text(
                'Item name must exactly match Steam market name, including wear — e.g. "AK-47 | Redline (Field-Tested)". Wrong name = no price data.',
                style: TextStyle(fontSize: 10, color: AppTheme.textMuted),
              ),
            ),
          ]),
          const SizedBox(height: 12),

          if (_resultMsg != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.profit.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.profit.withValues(alpha: 0.3)),
              ),
              child: Row(children: [
                Icon(Icons.check_circle_outline, color: AppTheme.profit, size: 16),
                const SizedBox(width: 8),
                Text(_resultMsg!,
                    style: TextStyle(color: AppTheme.profit, fontSize: 13)),
              ]),
            ),
            const SizedBox(height: 12),
            GestureDetector(
              onTap: () => context.pop(),
              child: _primaryButton('Done'),
            ),
          ] else ...[
            // Text input
            TextField(
              controller: _textCtrl,
              maxLines: 6,
              style: const TextStyle(color: Colors.white, fontSize: 12, fontFamily: 'monospace'),
              decoration: InputDecoration(
                hintText: 'Paste CSV here…',
                hintStyle: TextStyle(color: AppTheme.textDisabled, fontSize: 12),
                enabledBorder: OutlineInputBorder(
                  borderSide: BorderSide(color: AppTheme.divider),
                  borderRadius: BorderRadius.circular(10),
                ),
                focusedBorder: OutlineInputBorder(
                  borderSide: BorderSide(color: AppTheme.primary),
                  borderRadius: BorderRadius.circular(10),
                ),
                contentPadding: const EdgeInsets.all(12),
              ),
              onChanged: (_) => setState(() {
                _rows = null;
                _showPreview = false;
              }),
            ),
            const SizedBox(height: 10),

            // Parse button
            if (!_showPreview)
              GestureDetector(
                onTap: _textCtrl.text.trim().isEmpty ? null : _parse,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppTheme.primary.withValues(alpha: 0.3)),
                  ),
                  child: Center(
                    child: Text('Preview',
                        style: TextStyle(
                            color: AppTheme.primary, fontWeight: FontWeight.w600)),
                  ),
                ),
              ),

            // Preview
            if (_showPreview && _rows != null) ...[
              Text('${_rows!.length} rows  •  $validCount valid  •  $errorCount errors',
                  style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
              const SizedBox(height: 8),
              Container(
                constraints: const BoxConstraints(maxHeight: 160),
                decoration: BoxDecoration(
                    color: AppTheme.surface, borderRadius: BorderRadius.circular(8)),
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _rows!.length.clamp(0, 20),
                  itemBuilder: (_, i) {
                    final r = _rows![i];
                    final hasErr = r.error != null;
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      child: Row(children: [
                        Icon(
                          hasErr ? Icons.error_outline : Icons.check_circle_outline,
                          size: 13,
                          color: hasErr ? AppTheme.loss : AppTheme.profit,
                        ),
                        const SizedBox(width: 7),
                        Expanded(
                          child: Text(
                            hasErr
                                ? '${r.name.isEmpty ? "(empty)" : r.name} — ${r.error}'
                                : '${r.type.toUpperCase()}  ${r.name}  ×${r.qty}  ${currency.format(r.priceUsd)}',
                            style: TextStyle(
                                fontSize: 11,
                                color: hasErr ? AppTheme.loss : AppTheme.textSecondary),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ]),
                    );
                  },
                ),
              ),
              if (_rows!.length > 20)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('… and ${_rows!.length - 20} more',
                      style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                ),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() { _showPreview = false; _rows = null; }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppTheme.divider)),
                      child: Center(
                        child: Text('Edit',
                            style: TextStyle(
                                color: AppTheme.textMuted, fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: GestureDetector(
                    onTap: validCount == 0 || _importing ? null : _import,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      decoration: BoxDecoration(
                        gradient: validCount > 0 ? AppTheme.primaryGradient : null,
                        color: validCount == 0 ? AppTheme.surface : null,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Center(
                        child: _importing
                            ? const SizedBox(
                                width: 18, height: 18,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white))
                            : Text(
                                'Import $validCount rows',
                                style: TextStyle(
                                  color: validCount > 0
                                      ? Colors.white
                                      : AppTheme.textDisabled,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                      ),
                    ),
                  ),
                ),
              ]),
            ],
          ],
        ],
      ),
    );
  }

  Widget _primaryButton(String label) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          gradient: AppTheme.primaryGradient,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Text(label,
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
        ),
      );
}
