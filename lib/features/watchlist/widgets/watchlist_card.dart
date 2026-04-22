import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../watchlist_provider.dart';

class WatchlistCard extends ConsumerWidget {
  final WatchlistItem item;
  const WatchlistCard({super.key, required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final belowTarget = item.isBelowTarget;
    final distPct = item.distancePct;
    final currency = ref.watch(currencyProvider);

    return Dismissible(
      key: ValueKey(item.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: AppTheme.loss.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(AppTheme.r16),
        ),
        child: const Icon(Icons.delete_outline, color: AppTheme.loss),
      ),
      confirmDismiss: (_) async {
        HapticFeedback.mediumImpact();
        return true;
      },
      onDismissed: (_) {
        ref.read(watchlistProvider.notifier).remove(item.id);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: AppTheme.glass(),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(AppTheme.r12),
              ),
              clipBehavior: Clip.antiAlias,
              child: item.imageUrl != null
                  ? Image.network(
                      item.imageUrl!,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.image_not_supported_outlined,
                        color: AppTheme.textMuted,
                        size: 20,
                      ),
                    )
                  : const Icon(
                      Icons.visibility_outlined,
                      color: AppTheme.textMuted,
                      size: 22,
                    ),
            ),
            const SizedBox(width: 12),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.weaponName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textMuted,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Target: ${currency.formatCents(item.targetPriceCents)}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (item.currentPriceCents != null)
                  Text(
                    currency.formatCents(item.currentPriceCents!),
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: belowTarget ? AppTheme.profit : AppTheme.textPrimary,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  )
                else
                  const Text(
                    '--',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textMuted,
                    ),
                  ),
                const SizedBox(height: 4),
                if (belowTarget)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppTheme.profit.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'Below target',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.profit,
                      ),
                    ),
                  )
                else if (distPct != null)
                  Text(
                    '${distPct > 0 ? '+' : ''}${distPct.toStringAsFixed(1)}%',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: distPct > 0
                          ? AppTheme.textMuted
                          : AppTheme.profit,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
