import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/review_service.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../sell_provider.dart';
import '../../inventory/inventory_provider.dart';
import '../../inventory/inventory_selection_provider.dart';
import 'sell_progress_parts.dart';

class SellProgressSheet extends ConsumerStatefulWidget {
  const SellProgressSheet({super.key});

  @override
  ConsumerState<SellProgressSheet> createState() => _SellProgressSheetState();
}

class _SellProgressSheetState extends ConsumerState<SellProgressSheet> {
  final _scrollController = ScrollController();
  final _hapticFiredFor = <String>{}; // track per-item haptic
  bool _completionHapticFired = false;

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
              if (i.accountId != null) 'accountId': i.accountId,
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
            // Operation not started yet — show loading (quickSell is initializing)
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SellProgressHandle(),
                const SizedBox(height: 32),
                const CircularProgressIndicator(color: AppTheme.primary),
                const SizedBox(height: 16),
                Text('Preparing...', style: AppTheme.body, textAlign: TextAlign.center),
                const SizedBox(height: 32),
              ],
            );
          }
          // Fetching prices phase — show spinner with message
          if (operation.isFetchingPrices) {
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SellProgressHandle(),
                const SizedBox(height: 32),
                const CircularProgressIndicator(color: AppTheme.primary),
                const SizedBox(height: 16),
                Text(
                  operation.progressMessage ?? 'Fetching prices...',
                  style: AppTheme.body,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  '${operation.totalItems} items',
                  style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
                ),
                const SizedBox(height: 32),
              ],
            );
          }
          // Haptic feedback for newly listed items
          for (final item in operation.items) {
            if (item.status == SellItemStatus.listed && _hapticFiredFor.add(item.assetId)) {
              HapticFeedback.lightImpact();
            }
          }
          // Completion haptic
          if (operation.isCompleted && !_completionHapticFired) {
            _completionHapticFired = true;
            HapticFeedback.heavyImpact();
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
            const SellProgressHandle(),
            const SizedBox(height: 32),
            const CircularProgressIndicator(color: AppTheme.primary),
            const SizedBox(height: 16),
            const Text('Starting sell operation...', style: AppTheme.body),
            const SizedBox(height: 32),
          ],
        ),
        error: (e, _) {
          final isTimeout = e.toString().contains('timeout');
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SellProgressHandle(),
              const SizedBox(height: 24),
              Icon(
                isTimeout ? Icons.hourglass_empty_rounded : Icons.error_outline,
                color: AppTheme.warning,
                size: 40,
              ),
              const SizedBox(height: 12),
              Text(
                isTimeout ? 'Steam is taking its time' : 'Couldn\u2019t list',
                style: AppTheme.body.copyWith(color: AppTheme.textPrimary),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(
                  isTimeout
                      ? 'Close this and tap the item again — pick "Set price manually" to sell right now without waiting on Steam.'
                      : 'Check your connection, then reopen the item and try again.',
                  style: AppTheme.captionSmall
                      .copyWith(color: AppTheme.textSecondary, height: 1.4),
                  textAlign: TextAlign.center,
                ),
              ),
              const SizedBox(height: 16),
              SellProgressDoneButton(
                onPressed: () {
                  ref.read(sellOperationProvider.notifier).reset();
                  context.pop();
                },
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildContent(BuildContext context, SellOperation operation) {
    final isActive = operation.isActive;
    final progress = operation.totalItems > 0
        ? (operation.succeeded + operation.failed) / operation.totalItems
        : 0.0;
    final hasFailures = operation.items.any((i) =>
        i.status == SellItemStatus.failed || i.status == SellItemStatus.uncertain);
    final needsConfirmation =
        operation.items.where((i) => i.requiresConfirmation).length;
    final uncertainCount =
        operation.items.where((i) => i.status == SellItemStatus.uncertain).length;
    final currency = ref.read(currencyProvider);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SellProgressHandle(),
        const SizedBox(height: 16),

        // Header
        SellProgressHeader(isActive: isActive, operation: operation),
        const SizedBox(height: 12),

        // Progress bar + listed total + rate-limit hint
        SellProgressBar(
          progress: progress,
          hasFailures: hasFailures,
          operation: operation,
          isActive: isActive,
          currency: currency,
        ),

        const SizedBox(height: 6),

        // Item list
        Flexible(
          child: ListView.builder(
            controller: _scrollController,
            shrinkWrap: true,
            itemCount: operation.items.length,
            itemBuilder: (_, index) => SellProgressItemRow(
              item: operation.items[index],
              currency: currency,
            ),
          ),
        ),

        // Summary (when completed)
        if (!isActive) ...[
          const SizedBox(height: 12),
          SellProgressSummary(
            operation: operation,
            needsConfirmation: needsConfirmation,
            uncertainCount: uncertainCount,
            currency: currency,
          ),
        ],

        const SizedBox(height: 14),

        // Action buttons
        SellProgressActions(
          isActive: isActive,
          hasFailures: hasFailures,
          onCancel: () {
            HapticFeedback.mediumImpact();
            ref.read(sellOperationProvider.notifier).cancelOperation();
          },
          onRetry: () => _retryFailed(operation),
          onDone: () {
            HapticFeedback.lightImpact();
            // Refresh inventory and clear selection after selling
            ref.read(inventoryProvider.notifier).refresh();
            ref.read(selectionProvider.notifier).clear();
            ref.read(sellOperationProvider.notifier).reset();
            context.pop();
            // Prompt for review after successful sell
            if (operation.succeeded > 0) {
              ReviewService.maybeRequestReview();
            }
          },
        ),
      ],
    );
  }
}
