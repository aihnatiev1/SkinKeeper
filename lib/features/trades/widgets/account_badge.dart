import 'package:flutter/material.dart';

import '../../../core/theme.dart';

/// Tiny pill showing the Steam account name (and destination for internal
/// trades: "fromName → toName"). Used by trade offer tiles and market
/// listing tiles.
class AccountBadge extends StatelessWidget {
  final String? fromName;
  final String? toName;

  const AccountBadge({super.key, this.fromName, this.toName});

  @override
  Widget build(BuildContext context) {
    final label = toName != null
        ? '${fromName ?? '?'} → $toName'
        : (fromName ?? '');
    if (label.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppTheme.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
            color: AppTheme.primary.withValues(alpha: 0.2), width: 0.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.person_rounded,
              size: 10,
              color: AppTheme.primaryLight.withValues(alpha: 0.7)),
          const SizedBox(width: 3),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 160),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 10,
                color: AppTheme.primaryLight.withValues(alpha: 0.85),
                fontWeight: FontWeight.w500,
                overflow: TextOverflow.ellipsis,
              ),
              maxLines: 1,
            ),
          ),
        ],
      ),
    );
  }
}
