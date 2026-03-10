import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/review_service.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../sell_provider.dart';
import '../../inventory/inventory_provider.dart';
import '../../inventory/inventory_screen.dart';

class SellProgressSheet extends ConsumerStatefulWidget {
  const SellProgressSheet({super.key});

  @override
  ConsumerState<SellProgressSheet> createState() => _SellProgressSheetState();
}

class _SellProgressSheetState extends ConsumerState<SellProgressSheet> {
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _autoScroll(List<SellOperationItem> items) {
    // Find the index of the currently-processing item
    final activeIndex =
        items.indexWhere((i) => i.status == SellItemStatus.listing);
    if (activeIndex < 0) return;

    final offset = activeIndex * 56.0; // approximate row height
    if (_scrollController.hasClients &&
        offset > _scrollController.offset + 200) {
      _scrollController.animateTo(
        offset,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  Future<void> _retryFailed(SellOperation operation) async {
    final failedItems = operation.items
        .where((i) => i.status == SellItemStatus.failed)
        .map((i) => {
              'assetId': i.assetId,
              'marketHashName': i.marketHashName,
              'priceCents': i.priceCents,
            })
        .toList();
    if (failedItems.isEmpty) return;

    HapticFeedback.mediumImpact();
    ref.read(sellOperationProvider.notifier).reset();
    await ref.read(sellOperationProvider.notifier).startOperation(failedItems);
  }

  @override
  Widget build(BuildContext context) {
    final operationAsync = ref.watch(sellOperationProvider);

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.75,
      ),
      padding: const EdgeInsets.only(left: 20, right: 20, top: 12, bottom: 20),
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppTheme.r24)),
        border: Border.all(color: AppTheme.border),
      ),
      child: operationAsync.when(
        data: (operation) {
          if (operation == null) {
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildHandle(),
                const SizedBox(height: 24),
                const Text('No active operation', style: AppTheme.body),
                const SizedBox(height: 16),
                _buildDoneButton(context),
              ],
            );
          }
          // Auto-scroll to active item
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _autoScroll(operation.items);
          });
          return _buildContent(context, operation);
        },
        loading: () => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildHandle(),
            const SizedBox(height: 32),
            const CircularProgressIndicator(color: AppTheme.primary),
            const SizedBox(height: 16),
            const Text('Starting sell operation...', style: AppTheme.body),
            const SizedBox(height: 32),
          ],
        ),
        error: (e, _) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildHandle(),
            const SizedBox(height: 24),
            const Icon(Icons.error_outline, color: AppTheme.loss, size: 40),
            const SizedBox(height: 12),
            Text(
              'Operation failed',
              style: AppTheme.body.copyWith(color: AppTheme.loss),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            _buildDoneButton(context),
          ],
        ),
      ),
    );
  }

  Widget _buildHandle() {
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

  Widget _buildContent(BuildContext context, SellOperation operation) {
    final isActive = operation.isActive;
    final progress = operation.totalItems > 0
        ? (operation.succeeded + operation.failed) / operation.totalItems
        : 0.0;
    final hasFailures =
        operation.items.any((i) => i.status == SellItemStatus.failed);
    final needsConfirmation =
        operation.items.where((i) => i.requiresConfirmation).length;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _buildHandle(),
        const SizedBox(height: 16),

        // Header
        Row(
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
        ),
        const SizedBox(height: 12),

        // Progress bar
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
        const SizedBox(height: 14),

        // Item list
        Flexible(
          child: ListView.builder(
            controller: _scrollController,
            shrinkWrap: true,
            itemCount: operation.items.length,
            itemBuilder: (_, index) =>
                _buildItemRow(operation.items[index]),
          ),
        ),

        // Summary (when completed)
        if (!isActive) ...[
          const SizedBox(height: 12),
          _buildSummary(operation, needsConfirmation),
        ],

        const SizedBox(height: 14),

        // Action buttons
        _buildActions(context, operation, isActive, hasFailures),
      ],
    );
  }

  Widget _buildItemRow(SellOperationItem item) {
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
              Text(
                ref.read(currencyProvider).format(item.priceCents / 100),
                style: AppTheme.mono.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppTheme.profit,
                ),
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

    // Shorten the display name
    final parts = item.marketHashName.split(' | ');
    final displayName = parts.length > 1
        ? parts[1].split(' (').first
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

  Widget _buildSummary(SellOperation operation, int needsConfirmation) {
    final currency = ref.read(currencyProvider);
    final totalListedCents = operation.items
        .where((i) => i.status == SellItemStatus.listed)
        .fold<int>(0, (sum, i) => sum + i.priceCents);
    final totalListedStr = currency.format(totalListedCents / 100);

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
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Total listed value', style: AppTheme.bodySmall),
                Text(
                  totalListedStr,
                  style: AppTheme.price,
                ),
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
        ],
      ),
    );
  }

  Widget _buildActions(
    BuildContext context,
    SellOperation operation,
    bool isActive,
    bool hasFailures,
  ) {
    if (isActive) {
      return SizedBox(
        width: double.infinity,
        height: 48,
        child: OutlinedButton(
          onPressed: () {
            HapticFeedback.mediumImpact();
            ref.read(sellOperationProvider.notifier).cancelOperation();
          },
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
                onPressed: () => _retryFailed(operation),
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
              onPressed: () {
                HapticFeedback.lightImpact();
                // Refresh inventory and clear selection after selling
                ref.read(inventoryProvider.notifier).refresh();
                ref.read(selectedItemsProvider.notifier).state = {};
                ref.read(sellOperationProvider.notifier).reset();
                Navigator.pop(context);
                // Prompt for review after successful sell
                if (operation.succeeded > 0) {
                  ReviewService.maybeRequestReview();
                }
              },
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

  Widget _buildDoneButton(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: ElevatedButton(
        onPressed: () {
          ref.read(sellOperationProvider.notifier).reset();
          Navigator.pop(context);
        },
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
