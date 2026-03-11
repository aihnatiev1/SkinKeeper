import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../inventory_provider.dart';

class InventorySearchBar extends ConsumerStatefulWidget {
  final bool isOpen;
  final VoidCallback onClose;

  const InventorySearchBar({
    super.key,
    required this.isOpen,
    required this.onClose,
  });

  @override
  ConsumerState<InventorySearchBar> createState() => _InventorySearchBarState();
}

class _InventorySearchBarState extends ConsumerState<InventorySearchBar> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  Timer? _debounce;

  @override
  void didUpdateWidget(InventorySearchBar old) {
    super.didUpdateWidget(old);
    if (widget.isOpen && !old.isOpen) {
      Future.delayed(const Duration(milliseconds: 250), () {
        if (mounted) _focusNode.requestFocus();
      });
    } else if (!widget.isOpen && old.isOpen) {
      _controller.clear();
      _debounce?.cancel();
      ref.read(searchQueryProvider.notifier).state = '';
      _focusNode.unfocus();
    }
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) {
        ref.read(searchQueryProvider.notifier).state = value;
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final wearFilter = ref.watch(wearFilterProvider);
    final tradableOnly = ref.watch(tradableOnlyProvider);
    final hideNoPrice = ref.watch(hideNoPriceProvider);
    final hasActiveFilter = wearFilter != null || tradableOnly || hideNoPrice;

    return AnimatedSize(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutCubic,
      child: widget.isOpen
          ? Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppTheme.s16,
                    AppTheme.s8,
                    AppTheme.s16,
                    AppTheme.s4,
                  ),
                  child: TextField(
                    controller: _controller,
                    focusNode: _focusNode,
                    onChanged: _onChanged,
                    style: AppTheme.body,
                    decoration: InputDecoration(
                      hintText: 'Search items...',
                      prefixIcon: const Icon(Icons.search_rounded, size: 20),
                      suffixIcon: GestureDetector(
                        onTap: widget.onClose,
                        child: const Icon(Icons.close_rounded, size: 18),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: AppTheme.s16,
                        vertical: AppTheme.s12,
                      ),
                    ),
                  ),
                ),
                // Filter chips row
                SizedBox(
                  height: 36,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppTheme.s16,
                    ),
                    children: [
                      // Wear condition chips
                      for (final wear in const ['FN', 'MW', 'FT', 'WW', 'BS'])
                        _FilterChip(
                          label: wear,
                          selected: wearFilter == wear,
                          color: _wearColor(wear),
                          onTap: () {
                            HapticFeedback.selectionClick();
                            ref.read(wearFilterProvider.notifier).state =
                                wearFilter == wear ? null : wear;
                          },
                        ),
                      _FilterChip(
                        label: 'Tradable',
                        selected: tradableOnly,
                        icon: Icons.swap_horiz_rounded,
                        onTap: () {
                          HapticFeedback.selectionClick();
                          ref.read(tradableOnlyProvider.notifier).state =
                              !tradableOnly;
                        },
                      ),
                      _FilterChip(
                        label: 'Has price',
                        selected: hideNoPrice,
                        icon: Icons.attach_money_rounded,
                        onTap: () {
                          HapticFeedback.selectionClick();
                          ref.read(hideNoPriceProvider.notifier).state =
                              !hideNoPrice;
                        },
                      ),
                      if (hasActiveFilter)
                        _FilterChip(
                          label: 'Clear',
                          selected: false,
                          icon: Icons.clear_all_rounded,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            ref.read(wearFilterProvider.notifier).state = null;
                            ref.read(tradableOnlyProvider.notifier).state =
                                false;
                            ref.read(hideNoPriceProvider.notifier).state =
                                false;
                          },
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 4),
              ],
            )
          : const SizedBox(height: 4),
    );
  }

  static Color _wearColor(String wear) => switch (wear) {
        'FN' => const Color(0xFF10B981),
        'MW' => const Color(0xFF06B6D4),
        'FT' => const Color(0xFF3B82F6),
        'WW' => const Color(0xFFF59E0B),
        'BS' => const Color(0xFFEF4444),
        _ => AppTheme.textMuted,
      };
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final Color? color;
  final IconData? icon;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.selected,
    this.color,
    this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final chipColor = color ?? AppTheme.primary;

    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: selected
                ? chipColor.withValues(alpha: 0.2)
                : Colors.white.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(AppTheme.r8),
            border: Border.all(
              color: selected
                  ? chipColor.withValues(alpha: 0.5)
                  : Colors.white.withValues(alpha: 0.08),
              width: selected ? 1.0 : 0.5,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 13, color: selected ? chipColor : AppTheme.textMuted),
                const SizedBox(width: 4),
              ],
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  color: selected ? chipColor : AppTheme.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
