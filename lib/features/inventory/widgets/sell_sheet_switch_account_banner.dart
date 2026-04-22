import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../../settings/accounts_provider.dart';

class SellSheetSwitchAccountBanner extends ConsumerWidget {
  final int targetAccountId;

  const SellSheetSwitchAccountBanner({super.key, required this.targetAccountId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.warning.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: AppTheme.warning.withValues(alpha: 0.3),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.swap_horiz_rounded,
              size: 16, color: AppTheme.warning.withValues(alpha: 0.8)),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'This item belongs to another account. Switch accounts to sell it.',
              style: TextStyle(
                fontSize: 12,
                color: AppTheme.warning,
              ),
            ),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await ref.read(accountsProvider.notifier).setActive(targetAccountId);
            },
            child: const Text(
              'Switch',
              style: TextStyle(
                color: AppTheme.warning,
                fontWeight: FontWeight.bold,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
