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

  static const _wearOptions = [
    ('FN', 'Factory New', Color(0xFF10B981)),
    ('MW', 'Minimal Wear', Color(0xFF06B6D4)),
    ('FT', 'Field-Tested', Color(0xFF3B82F6)),
    ('WW', 'Well-Worn', Color(0xFFF59E0B)),
    ('BS', 'Battle-Scarred', Color(0xFFEF4444)),
  ];

  @override
  Widget build(BuildContext context) {
    final selectedWears = ref.watch(wearFilterProvider);
    final stickerQuery = ref.watch(stickerSearchProvider);
    final hasFilters = selectedWears.isNotEmpty || stickerQuery.isNotEmpty;

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

          // Title + clear
          Row(
            children: [
              const Text(
                'Filters',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              const Spacer(),
              if (hasFilters)
                GestureDetector(
                  onTap: () {
                    ref.read(wearFilterProvider.notifier).state = {};
                    ref.read(stickerSearchProvider.notifier).state = '';
                    _stickerController.clear();
                  },
                  child: const Text(
                    'Clear all',
                    style: TextStyle(fontSize: 12, color: AppTheme.loss),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 20),

          // Wear filter chips
          const Text(
            'Wear',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _wearOptions.map((w) {
              final code = w.$1;
              final label = w.$2;
              final color = w.$3;
              final selected = selectedWears.contains(code);
              return GestureDetector(
                onTap: () {
                  final current = Set<String>.from(ref.read(wearFilterProvider));
                  if (selected) {
                    current.remove(code);
                  } else {
                    current.add(code);
                  }
                  ref.read(wearFilterProvider.notifier).state = current;
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: selected ? color.withValues(alpha: 0.15) : AppTheme.surface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: selected ? color.withValues(alpha: 0.5) : AppTheme.border,
                      width: selected ? 1.5 : 1,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (selected)
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: Icon(Icons.check_rounded, size: 14, color: color),
                        ),
                      Text(
                        code,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: selected ? color : AppTheme.textMuted,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        label,
                        style: TextStyle(
                          fontSize: 11,
                          color: selected ? color.withValues(alpha: 0.7) : AppTheme.textDisabled,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
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
              suffixIcon: _stickerController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.close, size: 16, color: AppTheme.textMuted),
                      onPressed: () {
                        _stickerController.clear();
                        ref.read(stickerSearchProvider.notifier).state = '';
                      },
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
        ],
      ),
    );
  }
}
