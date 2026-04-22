import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../../core/theme.dart';

class DateFilterSheet extends StatefulWidget {
  final DateTime? currentFrom;
  final DateTime? currentTo;
  final void Function(DateTime? from, DateTime? to) onApply;

  const DateFilterSheet({
    super.key,
    required this.currentFrom,
    required this.currentTo,
    required this.onApply,
  });

  @override
  State<DateFilterSheet> createState() => _DateFilterSheetState();
}

class _DateFilterSheetState extends State<DateFilterSheet> {
  DateTime? _from;
  DateTime? _to;
  String? _selectedPreset;

  static const _presets = [
    ('7d', 'Last 7 days', 7),
    ('30d', 'Last 30 days', 30),
    ('90d', 'Last 90 days', 90),
    ('1y', 'Last year', 365),
  ];

  @override
  void initState() {
    super.initState();
    _from = widget.currentFrom;
    _to = widget.currentTo;
    if (_from != null && _to != null) {
      final diff = DateTime.now().difference(_from!).inDays;
      for (final p in _presets) {
        if ((diff - p.$3).abs() <= 2) {
          _selectedPreset = p.$1;
          break;
        }
      }
    }
    if (_from == null) _selectedPreset = 'all';
  }

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

  Future<void> _pickCustomDate({required bool isFrom}) async {
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

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd MMM yyyy');
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
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
          Text('Select period', style: AppTheme.title),
          const SizedBox(height: 16),

          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              PresetButton(
                label: 'All time',
                selected: _selectedPreset == 'all',
                onTap: () => _selectPreset('all', null),
              ),
              for (final p in _presets)
                PresetButton(
                  label: p.$2,
                  selected: _selectedPreset == p.$1,
                  onTap: () => _selectPreset(p.$1, p.$3),
                ),
            ],
          ),
          const SizedBox(height: 20),

          Text('Custom range', style: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: DateField(
                  label: 'From',
                  value: _from != null ? fmt.format(_from!) : null,
                  onTap: () => _pickCustomDate(isFrom: true),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Icon(Icons.arrow_forward, size: 16, color: AppTheme.textDisabled),
              ),
              Expanded(
                child: DateField(
                  label: 'To',
                  value: _to != null ? fmt.format(_to!) : null,
                  onTap: () => _pickCustomDate(isFrom: false),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                HapticFeedback.mediumImpact();
                widget.onApply(_from, _to);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Apply', style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }
}

class PresetButton extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const PresetButton({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppTheme.primary.withValues(alpha: 0.15) : AppTheme.surfaceLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AppTheme.primary : AppTheme.border,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
            color: selected ? AppTheme.primary : AppTheme.textSecondary,
          ),
        ),
      ),
    );
  }
}

class DateField extends StatelessWidget {
  final String label;
  final String? value;
  final VoidCallback onTap;

  const DateField({
    super.key,
    required this.label,
    required this.value,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppTheme.surfaceLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: value != null ? AppTheme.primary.withValues(alpha: 0.4) : AppTheme.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                value ?? label,
                style: TextStyle(
                  fontSize: 13,
                  color: value != null ? AppTheme.textPrimary : AppTheme.textDisabled,
                ),
              ),
            ),
            const Icon(Icons.calendar_today, size: 14, color: AppTheme.textMuted),
          ],
        ),
      ),
    );
  }
}
