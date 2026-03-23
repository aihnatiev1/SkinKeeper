import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';

// Placeholder — filters removed per user request.
// Can be re-added later as premium feature.

class FilterSheet extends ConsumerWidget {
  const FilterSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
      decoration: const BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Center(
            child: SizedBox(
              width: 40,
              height: 4,
            ),
          ),
          SizedBox(height: 24),
          Text(
            'No filters available yet',
            style: TextStyle(
              fontSize: 14,
              color: AppTheme.textMuted,
            ),
          ),
          SizedBox(height: 16),
        ],
      ),
    );
  }
}
