import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import 'date_filter_sheet.dart';

class ExportSheet extends StatefulWidget {
  final WidgetRef ref;
  const ExportSheet({super.key, required this.ref});

  @override
  State<ExportSheet> createState() => _ExportSheetState();
}

class _ExportSheetState extends State<ExportSheet> {
  bool _includeBuy = true;
  bool _includeSell = true;
  DateTime? _from;
  DateTime? _to;
  String? _selectedPreset = 'all';
  bool _exporting = false;

  static const _presets = [
    ('all', 'All time', null),
    ('7d', '7 days', 7),
    ('30d', '30 days', 30),
    ('90d', '90 days', 90),
    ('1y', '1 year', 365),
  ];

  void _selectPreset(String id, int? days) {
    HapticFeedback.selectionClick();
    setState(() {
      _selectedPreset = id;
      if (days == null) {
        _from = null;
        _to = null;
      } else {
        _from = DateTime.now().subtract(Duration(days: days));
        _to = DateTime.now();
      }
    });
  }

  Future<void> _pickDate({required bool isFrom}) async {
    final initial = isFrom ? _from : _to;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial ?? DateTime.now(),
      firstDate: DateTime(2013),
      lastDate: DateTime.now(),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: const ColorScheme.dark(
            primary: AppTheme.primary,
            surface: AppTheme.surface,
            onSurface: AppTheme.textPrimary,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      HapticFeedback.selectionClick();
      setState(() {
        _selectedPreset = null;
        if (isFrom) {
          _from = picked;
          if (_to != null && _to!.isBefore(picked)) _to = picked;
        } else {
          _to = picked;
          if (_from != null && _from!.isAfter(picked)) _from = picked;
        }
      });
    }
  }

  Future<void> _export() async {
    if (!_includeBuy && !_includeSell) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one type')),
      );
      return;
    }
    setState(() => _exporting = true);
    HapticFeedback.mediumImpact();

    try {
      final api = widget.ref.read(apiClientProvider);
      final params = <String, dynamic>{};

      if (_includeBuy && !_includeSell) params['type'] = 'buy';
      if (_includeSell && !_includeBuy) params['type'] = 'sell';

      if (_from != null) params['from'] = _from!.toIso8601String();
      if (_to != null) params['to'] = _to!.toIso8601String();

      final response = await api.get('/export/csv', queryParameters: params);
      final csvData = response.data as String;
      final lines = csvData.split('\n').length - 1;

      if (mounted) {
        context.pop();
        final dir = await getTemporaryDirectory();
        final file = File('${dir.path}/skinkeeper_export.csv');
        await file.writeAsString(csvData);
        await SharePlus.instance.share(
          ShareParams(
            files: [XFile(file.path)],
            subject: 'SkinKeeper Export — $lines transactions',
          ),
        );
      }
    } on DioException catch (e) {
      setState(() => _exporting = false);
      if (e.response?.statusCode == 403 && mounted) {
        context.pop();
        context.push('/premium');
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Export failed: ${e.message}')),
        );
      }
    } catch (e) {
      setState(() => _exporting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Export failed')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd MMM yyyy');
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppTheme.r24)),
      ),
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textDisabled,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('Export CSV', style: AppTheme.title),
          const SizedBox(height: 20),

          Text('Transaction type', style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _CheckTile(
                  label: 'Purchases',
                  icon: Icons.shopping_cart,
                  color: AppTheme.primary,
                  checked: _includeBuy,
                  onChanged: (v) => setState(() => _includeBuy = v),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _CheckTile(
                  label: 'Sales',
                  icon: Icons.sell,
                  color: AppTheme.profit,
                  checked: _includeSell,
                  onChanged: (v) => setState(() => _includeSell = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          Text('Period', style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final p in _presets)
                PresetButton(
                  label: p.$2,
                  selected: _selectedPreset == p.$1,
                  onTap: () => _selectPreset(p.$1, p.$3),
                ),
            ],
          ),
          const SizedBox(height: 16),

          Text('Custom range', style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: DateField(
                  label: 'From',
                  value: _from != null ? fmt.format(_from!) : null,
                  onTap: () => _pickDate(isFrom: true),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Icon(Icons.arrow_forward, size: 16, color: AppTheme.textDisabled),
              ),
              Expanded(
                child: DateField(
                  label: 'To',
                  value: _to != null ? fmt.format(_to!) : null,
                  onTap: () => _pickDate(isFrom: false),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              onPressed: _exporting ? null : _export,
              icon: _exporting
                  ? const SizedBox(
                      width: 18, height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.file_download, size: 20),
              label: Text(
                _exporting ? 'Exporting...' : 'Export CSV',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                disabledBackgroundColor: AppTheme.primary.withValues(alpha: 0.3),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 0,
              ),
            ),
          ),
          SizedBox(height: MediaQuery.of(context).padding.bottom),
        ],
      ),
    );
  }
}

class _CheckTile extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool checked;
  final ValueChanged<bool> onChanged;

  const _CheckTile({
    required this.label,
    required this.icon,
    required this.color,
    required this.checked,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onChanged(!checked);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: checked ? color.withValues(alpha: 0.08) : AppTheme.surfaceLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: checked ? color.withValues(alpha: 0.3) : AppTheme.border,
          ),
        ),
        child: Row(
          children: [
            Icon(
              checked ? Icons.check_box : Icons.check_box_outline_blank,
              size: 20,
              color: checked ? color : AppTheme.textDisabled,
            ),
            const SizedBox(width: 8),
            Icon(icon, size: 16, color: checked ? color : AppTheme.textMuted),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: checked ? FontWeight.w600 : FontWeight.normal,
                color: checked ? color : AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
