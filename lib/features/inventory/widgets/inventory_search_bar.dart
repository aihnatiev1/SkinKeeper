import 'dart:async';
import 'package:flutter/material.dart';
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
    return AnimatedSize(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutCubic,
      child: widget.isOpen
          ? Padding(
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
            )
          : const SizedBox(height: 4),
    );
  }
}
