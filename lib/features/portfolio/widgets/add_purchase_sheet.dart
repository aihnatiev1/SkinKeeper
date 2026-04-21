import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../portfolio_pl_provider.dart';

class AddPurchaseSheet extends StatefulWidget {
  final String marketHashName;
  final String? iconUrl;
  final WidgetRef ref;

  const AddPurchaseSheet({
    super.key,
    required this.marketHashName,
    this.iconUrl,
    required this.ref,
  });

  @override
  State<AddPurchaseSheet> createState() => _AddPurchaseSheetState();
}

class _AddPurchaseSheetState extends State<AddPurchaseSheet> {
  final _priceController = TextEditingController();
  String _type = 'buy';
  String _source = 'manual';
  DateTime _date = DateTime.now();
  bool _saving = false;

  static const _sources = [
    ('manual', 'Manual'),
    ('csfloat', 'CSFloat'),
    ('skinport', 'Skinport'),
    ('dmarket', 'DMarket'),
    ('buff', 'Buff'),
    ('trade', 'Trade'),
    ('drop', 'Drop / Case'),
    ('other', 'Other'),
  ];

  @override
  void dispose() {
    _priceController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final priceText = _priceController.text.trim();
    if (priceText.isEmpty) return;

    final price = double.tryParse(priceText.replaceAll(',', '.'));
    if (price == null || price <= 0) return;

    setState(() => _saving = true);

    try {
      final api = widget.ref.read(apiClientProvider);
      await api.post('/transactions/manual', data: {
        'marketHashName': widget.marketHashName,
        'priceCents': (price * 100).round(),
        'type': _type,
        'date': _date.toIso8601String(),
        'source': _source,
        'iconUrl': widget.iconUrl,
      });

      // Refresh P/L data
      widget.ref.invalidate(itemsPLProvider);
      widget.ref.invalidate(portfolioPLProvider);

      HapticFeedback.mediumImpact();
      if (mounted) context.pop();
    } on DioException catch (e) {
      if (e.response?.statusCode == 403 &&
          (e.response?.data as Map<String, dynamic>?)?['error'] == 'premium_required') {
        if (mounted) {
          context.pop(); // close sheet
          context.push('/premium');
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Failed to save'),
            backgroundColor: AppTheme.loss,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Failed to save'),
            backgroundColor: AppTheme.loss,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2012),
      lastDate: DateTime.now(),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: ColorScheme.dark(
            primary: AppTheme.primary,
            surface: AppTheme.card,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      margin: EdgeInsets.only(bottom: bottom),
      decoration: const BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppTheme.textDisabled,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Title
              Text('Add Transaction', style: AppTheme.h3, textAlign: TextAlign.center),
              const SizedBox(height: 4),
              Text(
                widget.marketHashName,
                style: AppTheme.caption,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 20),

              // Buy / Sell toggle
              Row(
                children: [
                  _TypeChip(
                    label: 'Buy',
                    selected: _type == 'buy',
                    color: AppTheme.profit,
                    onTap: () => setState(() => _type = 'buy'),
                  ),
                  const SizedBox(width: 8),
                  _TypeChip(
                    label: 'Sell',
                    selected: _type == 'sell',
                    color: AppTheme.loss,
                    onTap: () => setState(() => _type = 'sell'),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Price input
              TextField(
                controller: _priceController,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                autofocus: true,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textPrimary,
                ),
                decoration: InputDecoration(
                  prefixText: '\$ ',
                  prefixStyle: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textMuted,
                  ),
                  hintText: '0.00',
                  hintStyle: TextStyle(color: AppTheme.textDisabled),
                  filled: true,
                  fillColor: AppTheme.bg,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                ),
              ),
              const SizedBox(height: 12),

              // Source chips
              Text('SOURCE', style: AppTheme.label),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: _sources.map((s) {
                  final selected = _source == s.$1;
                  return GestureDetector(
                    onTap: () => setState(() => _source = s.$1),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: selected
                            ? AppTheme.primary.withValues(alpha: 0.15)
                            : AppTheme.bg,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color:
                              selected ? AppTheme.primary : Colors.transparent,
                          width: 1,
                        ),
                      ),
                      child: Text(
                        s.$2,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: selected
                              ? AppTheme.primary
                              : AppTheme.textSecondary,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 12),

              // Date picker
              GestureDetector(
                onTap: _pickDate,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppTheme.bg,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.calendar_today_rounded,
                          size: 16, color: AppTheme.textMuted),
                      const SizedBox(width: 10),
                      Text(
                        '${_date.day.toString().padLeft(2, '0')}.${_date.month.toString().padLeft(2, '0')}.${_date.year}',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const Spacer(),
                      const Icon(Icons.chevron_right_rounded,
                          size: 18, color: AppTheme.textDisabled),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Save button
              GestureDetector(
                onTap: _saving ? null : _save,
                child: Container(
                  height: 50,
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.primary.withValues(alpha: 0.3),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Center(
                    child: _saving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                          )
                        : Text(
                            'Save ${_type == 'buy' ? 'Purchase' : 'Sale'}',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TypeChip extends StatelessWidget {
  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  const _TypeChip({
    required this.label,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.15) : AppTheme.bg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? color : Colors.transparent,
            width: 1.5,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: selected ? color : AppTheme.textMuted,
          ),
        ),
      ),
    );
  }
}
