import 'package:flutter/material.dart';

import '../../../core/theme.dart';

class ItemFilterSheet extends StatefulWidget {
  final List<String> items;
  final void Function(String?) onSelect;

  const ItemFilterSheet({
    super.key,
    required this.items,
    required this.onSelect,
  });

  @override
  State<ItemFilterSheet> createState() => _ItemFilterSheetState();
}

class _ItemFilterSheetState extends State<ItemFilterSheet> {
  String _query = '';

  List<String> get _filtered => _query.isEmpty
      ? widget.items
      : widget.items.where((n) => n.toLowerCase().contains(_query.toLowerCase())).toList();

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      maxChildSize: 0.9,
      minChildSize: 0.3,
      expand: false,
      builder: (_, controller) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 8),
            child: Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.textDisabled,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: TextField(
              autofocus: true,
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
              decoration: InputDecoration(
                hintText: 'Search items...',
                hintStyle: const TextStyle(color: AppTheme.textDisabled),
                prefixIcon: const Icon(Icons.search, size: 20, color: AppTheme.textMuted),
                filled: true,
                fillColor: AppTheme.surfaceLight,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
          const SizedBox(height: 4),
          Expanded(
            child: ListView.builder(
              controller: controller,
              itemCount: _filtered.length + 1,
              itemBuilder: (_, i) {
                if (i == 0) {
                  return ListTile(
                    leading: const Icon(Icons.all_inclusive, size: 18, color: AppTheme.primary),
                    title: const Text('All items', style: TextStyle(color: AppTheme.textPrimary)),
                    onTap: () => widget.onSelect(null),
                  );
                }
                final name = _filtered[i - 1];
                return ListTile(
                  title: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
                  ),
                  onTap: () => widget.onSelect(name),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
