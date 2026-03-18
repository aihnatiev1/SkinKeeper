import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../inventory_provider.dart';

// TODO: gate behind premium when IAP is ready

class FilterSheet extends ConsumerStatefulWidget {
  const FilterSheet({super.key});

  @override
  ConsumerState<FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<FilterSheet> {
  late TextEditingController _stickerController;

  @override
  void initState() {
    super.initState();
    _stickerController = TextEditingController(
      text: ref.read(stickerSearchProvider),
    );
  }

  @override
  void dispose() {
    _stickerController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final floatRangeRaw = ref.watch(floatRangeProvider);
    final stickerQuery = ref.watch(stickerSearchProvider);
    final isFloatActive = floatRangeRaw != null;
    final floatRange = floatRangeRaw ?? const RangeValues(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
      decoration: const BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
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
          const Text(
            'Advanced Filters',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 20),

          // Float Range
          Row(
            children: [
              const Text(
                'Float Range',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary,
                ),
              ),
              const Spacer(),
              if (isFloatActive)
                GestureDetector(
                  onTap: () =>
                      ref.read(floatRangeProvider.notifier).state = null,
                  child: const Text(
                    'Clear',
                    style: TextStyle(fontSize: 12, color: AppTheme.primary),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),

          // Wear zone labels
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('FN',
                  style: TextStyle(fontSize: 10, color: Color(0xFF10B981))),
              Text('MW',
                  style: TextStyle(fontSize: 10, color: Color(0xFF06B6D4))),
              Text('FT',
                  style: TextStyle(fontSize: 10, color: Color(0xFF3B82F6))),
              Text('WW',
                  style: TextStyle(fontSize: 10, color: Color(0xFFF59E0B))),
              Text('BS',
                  style: TextStyle(fontSize: 10, color: Color(0xFFEF4444))),
            ],
          ),
          const SizedBox(height: 4),

          // Wear zone color bar
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: SizedBox(
              height: 4,
              child: Row(
                children: [
                  _wearSegment(const Color(0xFF10B981), 0.07), // FN 0-0.07
                  _wearSegment(const Color(0xFF06B6D4), 0.08), // MW 0.07-0.15
                  _wearSegment(const Color(0xFF3B82F6), 0.23), // FT 0.15-0.38
                  _wearSegment(const Color(0xFFF59E0B), 0.07), // WW 0.38-0.45
                  _wearSegment(const Color(0xFFEF4444), 0.55), // BS 0.45-1.0
                ],
              ),
            ),
          ),
          const SizedBox(height: 4),

          RangeSlider(
            values: floatRange,
            min: 0.0,
            max: 1.0,
            divisions: 100,
            activeColor: AppTheme.primary,
            inactiveColor: AppTheme.surface,
            labels: RangeLabels(
              floatRange.start.toStringAsFixed(2),
              floatRange.end.toStringAsFixed(2),
            ),
            onChanged: (values) {
              ref.read(floatRangeProvider.notifier).state = values;
            },
          ),

          if (isFloatActive)
            Text(
              '${floatRange.start.toStringAsFixed(3)} — ${floatRange.end.toStringAsFixed(3)}',
              style: const TextStyle(
                fontSize: 12,
                color: AppTheme.textMuted,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),

          const SizedBox(height: 24),

          // Sticker Search
          const Text(
            'Sticker Search',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _stickerController,
            onChanged: (v) =>
                ref.read(stickerSearchProvider.notifier).state = v,
            decoration: InputDecoration(
              hintText: 'e.g. Katowice, Holo, Gold...',
              hintStyle:
                  const TextStyle(color: AppTheme.textDisabled, fontSize: 13),
              prefixIcon:
                  const Icon(Icons.search, size: 18, color: AppTheme.textMuted),
              suffixIcon: stickerQuery.isNotEmpty
                  ? GestureDetector(
                      onTap: () {
                        _stickerController.clear();
                        ref.read(stickerSearchProvider.notifier).state = '';
                      },
                      child: const Icon(Icons.close, size: 16, color: AppTheme.textMuted),
                    )
                  : null,
              filled: true,
              fillColor: AppTheme.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
            style: const TextStyle(fontSize: 13, color: Colors.white),
          ),

          const SizedBox(height: 16),

          // Clear all filters
          if (isFloatActive || stickerQuery.isNotEmpty)
            GestureDetector(
              onTap: () {
                ref.read(floatRangeProvider.notifier).state = null;
                ref.read(stickerSearchProvider.notifier).state = '';
                _stickerController.clear();
              },
              child: const Center(
                child: Text(
                  'Clear all filters',
                  style: TextStyle(fontSize: 13, color: AppTheme.loss),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _wearSegment(Color color, double flex) {
    return Expanded(
      flex: (flex * 100).round(),
      child: Container(color: color),
    );
  }
}
