import 'package:flutter/material.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../sell_provider.dart';

class SellProgressHandle extends StatelessWidget {
  const SellProgressHandle({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 40,
        height: 4,
        decoration: BoxDecoration(
          color: AppTheme.textDisabled,
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

class SellProgressHeader extends StatelessWidget {
  final bool isActive;
  final SellOperation operation;

  const SellProgressHeader({
    super.key,
    required this.isActive,
    required this.operation,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            isActive
                ? 'Selling ${operation.totalItems} items...'
                : 'Sell operation complete',
            style: AppTheme.title,
          ),
        ),
        Container(
          padding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: isActive
                ? AppTheme.primary.withValues(alpha: 0.15)
                : AppTheme.profit.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            '${operation.succeeded + operation.failed} of ${operation.totalItems}',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: isActive
                  ? AppTheme.primary
                  : AppTheme.profit,
            ),
          ),
        ),
      ],
    );
  }
}

class SellProgressBar extends StatelessWidget {
  final double progress;
  final bool hasFailures;
  final SellOperation operation;
  final bool isActive;
  final CurrencyInfo currency;

  const SellProgressBar({
    super.key,
    required this.progress,
    required this.hasFailures,
    required this.operation,
    required this.isActive,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    final listedCents = operation.items
        .where((i) => i.status == SellItemStatus.listed)
        .fold<int>(0, (sum, i) => sum + i.priceCents);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 6,
            backgroundColor: AppTheme.surface,
            valueColor: AlwaysStoppedAnimation<Color>(
              hasFailures
                  ? AppTheme.warning
                  : AppTheme.profit,
            ),
          ),
        ),
        if (operation.succeeded > 0) ...[
          const SizedBox(height: 6),
          if (listedCents > 0)
            Text(
              'Listed: ${currency.formatRaw(listedCents / 100)}',
              style: AppTheme.mono.copyWith(color: AppTheme.profit, fontSize: 13),
            )
          else
            const SizedBox.shrink(),
        ],
        if (isActive && operation.totalItems > 5)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              'Processing one at a time to avoid Steam rate limits',
              style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
              textAlign: TextAlign.center,
            ),
          ),
      ],
    );
  }
}

class SellProgressItemRow extends StatelessWidget {
  final SellOperationItem item;
  final CurrencyInfo currency;

  const SellProgressItemRow({
    super.key,
    required this.item,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    final (IconData icon, Color color, Widget trailing) =
        switch (item.status) {
      SellItemStatus.queued => (
          Icons.schedule,
          AppTheme.textDisabled,
          Text(
            'Waiting...',
            style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
          ) as Widget,
        ),
      SellItemStatus.listing => (
          Icons.sync,
          AppTheme.accent,
          SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.accent),
          ) as Widget,
        ),
      SellItemStatus.listed => (
          Icons.check_circle,
          AppTheme.profit,
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    currency.formatRaw(
                      ((item.priceCents / 0.8696).ceil()) / 100,
                    ),
                    style: AppTheme.mono.copyWith(
                      fontWeight: FontWeight.w700,
                      color: AppTheme.profit,
                    ),
                  ),
                  Text(
                    '→ ${currency.formatRaw(item.priceCents / 100)}',
                    style: AppTheme.captionSmall.copyWith(
                      fontSize: 10,
                      color: AppTheme.textMuted,
                    ),
                  ),
                ],
              ),
              if (item.requiresConfirmation) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppTheme.warning.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'Confirm',
                    style: AppTheme.captionSmall.copyWith(
                      fontSize: 10,
                      color: AppTheme.warning,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ],
          ) as Widget,
        ),
      SellItemStatus.uncertain => (
          Icons.help_outline,
          AppTheme.warning,
          Text(
            'Check Steam',
            style: AppTheme.captionSmall.copyWith(
              color: AppTheme.warning,
              fontWeight: FontWeight.w600,
            ),
          ) as Widget,
        ),
      SellItemStatus.failed => (
          Icons.cancel,
          AppTheme.loss,
          Flexible(
            child: Text(
              item.errorMessage ?? 'Failed',
              style: AppTheme.captionSmall.copyWith(color: AppTheme.loss),
              overflow: TextOverflow.ellipsis,
            ),
          ) as Widget,
        ),
    };

    final parts = item.marketHashName.split(' | ');
    final displayName = parts.length > 1
        ? '${parts[0].split(' ').last} | ${parts[1].split(' (').first}'
        : item.marketHashName;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: AppTheme.divider),
        ),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              displayName,
              style: AppTheme.bodySmall.copyWith(color: AppTheme.textPrimary),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          trailing,
        ],
      ),
    );
  }
}

class SellProgressSummary extends StatelessWidget {
  final SellOperation operation;
  final int needsConfirmation;
  final int uncertainCount;
  final CurrencyInfo currency;

  const SellProgressSummary({
    super.key,
    required this.operation,
    required this.needsConfirmation,
    required this.uncertainCount,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    final listedItems = operation.items.where((i) => i.status == SellItemStatus.listed).toList();
    final totalSellerReceivesCents = listedItems.fold<int>(0, (sum, i) => sum + i.priceCents);

    int totalBuyerPays = 0;
    for (final item in listedItems) {
      final bp = (item.priceCents / 0.8696).ceil();
      totalBuyerPays += bp;
    }
    final totalFees = totalBuyerPays - totalSellerReceivesCents;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: AppTheme.glass(radius: AppTheme.r12),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Result', style: AppTheme.bodySmall),
              Text(
                '${operation.succeeded} listed, ${operation.failed} failed',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: operation.failed > 0
                      ? AppTheme.warning
                      : AppTheme.profit,
                ),
              ),
            ],
          ),
          if (operation.succeeded > 0) ...[
            const Divider(height: 16, color: AppTheme.divider),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Buyer pays', style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted)),
                Text(currency.formatRaw(totalBuyerPays / 100),
                    style: AppTheme.captionSmall.copyWith(color: AppTheme.textSecondary)),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Steam + CS2 fee (15%)', style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted)),
                Text('-${currency.formatRaw(totalFees / 100)}',
                    style: AppTheme.captionSmall.copyWith(color: AppTheme.loss)),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('You receive', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                Text(currency.formatRaw(totalSellerReceivesCents / 100),
                    style: AppTheme.price.copyWith(color: AppTheme.profit)),
              ],
            ),
          ],
          if (needsConfirmation > 0) ...[
            const SizedBox(height: 8),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.warning.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.phone_android,
                      size: 16, color: AppTheme.warning),
                  const SizedBox(width: 8),
                  Text(
                    '$needsConfirmation items need confirmation in Steam app',
                    style: AppTheme.captionSmall.copyWith(
                      color: AppTheme.warning,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (uncertainCount > 0) ...[
            const SizedBox(height: 8),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.warning.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.help_outline,
                      size: 16, color: AppTheme.warning),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '$uncertainCount item${uncertainCount > 1 ? 's' : ''} may need manual verification on Steam',
                      style: AppTheme.captionSmall.copyWith(
                        color: AppTheme.warning,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class SellProgressActions extends StatelessWidget {
  final bool isActive;
  final bool hasFailures;
  final VoidCallback onCancel;
  final VoidCallback onRetry;
  final VoidCallback onDone;

  const SellProgressActions({
    super.key,
    required this.isActive,
    required this.hasFailures,
    required this.onCancel,
    required this.onRetry,
    required this.onDone,
  });

  @override
  Widget build(BuildContext context) {
    if (isActive) {
      return SizedBox(
        width: double.infinity,
        height: 48,
        child: OutlinedButton(
          onPressed: onCancel,
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: AppTheme.loss),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppTheme.r16),
            ),
          ),
          child: Text(
            'Cancel',
            style: AppTheme.title.copyWith(color: AppTheme.loss),
          ),
        ),
      );
    }

    return Row(
      children: [
        if (hasFailures) ...[
          Expanded(
            child: SizedBox(
              height: 48,
              child: OutlinedButton(
                onPressed: onRetry,
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppTheme.warning),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.r16),
                  ),
                ),
                child: Text(
                  'Retry Failed',
                  style: AppTheme.title.copyWith(color: AppTheme.warning),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
        ],
        Expanded(
          child: SizedBox(
            height: 48,
            child: ElevatedButton(
              onPressed: onDone,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.profit,
                foregroundColor: Colors.black,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.r16),
                ),
                elevation: 0,
              ),
              child: const Text(
                'Done',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class SellProgressDoneButton extends StatelessWidget {
  final VoidCallback onPressed;

  const SellProgressDoneButton({
    super.key,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppTheme.surface,
          foregroundColor: AppTheme.textPrimary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.r16),
          ),
          elevation: 0,
        ),
        child: const Text('Close'),
      ),
    );
  }
}
