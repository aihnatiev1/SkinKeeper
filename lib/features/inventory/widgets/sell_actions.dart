import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';
import '../../../widgets/glass_sheet.dart';
import '../../../widgets/shared_ui.dart';
import '../../auth/session_gate.dart';
import '../sell_provider.dart';
import 'fee_breakdown.dart';
import 'sell_bottom_sheet.dart';
import 'sell_progress_sheet.dart';

/// Sell-flow card on ItemDetailScreen: fetches quick-sell price, shows
/// the fee breakdown, and surfaces Quick Sell + Custom buttons. Falls
/// back to a simple "Sell Item" button on price fetch error.
class SellActions extends ConsumerWidget {
  final InventoryItem item;

  const SellActions({super.key, required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quickPriceAsync = ref.watch(quickPriceProvider(QuickPriceRequest(
      marketHashName: item.marketHashName,
      fallbackPriceUsd: item.bestPrice ?? item.steamPrice,
    )));

    return GlassCard(
      padding: const EdgeInsets.all(AppTheme.s14),
      child: Column(
        children: [
          quickPriceAsync.when(
            data: (result) {
              final priceCents = result.sellerReceivesCents;
              final stale = result.stale;
              final priceStr = result.formatPrice(priceCents);
              return Column(
                children: [
                  if (stale)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppTheme.s10),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: AppTheme.loss.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                              color:
                                  AppTheme.loss.withValues(alpha: 0.3)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.warning_amber_rounded,
                                color: AppTheme.loss, size: 16),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Price may be outdated',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.loss,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  FeeBreakdown(
                      sellerReceivesCents: priceCents,
                      walletSymbol: result.currencySymbol),
                  const SizedBox(height: AppTheme.s10),
                  Row(
                    children: [
                      Expanded(
                        child: SizedBox(
                          height: 44,
                          child: ElevatedButton(
                            onPressed: () async {
                              if (!await requireSession(context, ref)) return;
                              if (!context.mounted) return;
                              if (stale) {
                                HapticFeedback.selectionClick();
                                showGlassSheet(context,
                                    SellBottomSheet(items: [item]));
                                return;
                              }
                              HapticFeedback.mediumImpact();
                              final items = [
                                {
                                  'assetId': item.assetId,
                                  'marketHashName': item.marketHashName,
                                  'priceCents': 0,
                                  if (item.accountId != null)
                                    'accountId': item.accountId,
                                },
                              ];
                              if (context.mounted) {
                                showGlassSheetLocked(
                                    context, const SellProgressSheet());
                              }
                              await ref
                                  .read(sellOperationProvider.notifier)
                                  .startQuickSell(items,
                                      accountId: item.accountId);
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: stale
                                  ? AppTheme.warning
                                  : AppTheme.primary,
                              foregroundColor:
                                  stale ? Colors.black : Colors.white,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius:
                                    BorderRadius.circular(AppTheme.r12),
                              ),
                            ),
                            child: Text(
                              stale
                                  ? 'Check Price & Sell'
                                  : 'Quick Sell $priceStr',
                              style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        height: 44,
                        child: OutlinedButton(
                          onPressed: () async {
                            if (!await requireSession(context, ref)) return;
                            if (!context.mounted) return;
                            HapticFeedback.selectionClick();
                            showGlassSheet(
                                context, SellBottomSheet(items: [item]));
                          },
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppTheme.textSecondary,
                            side: const BorderSide(
                                color: AppTheme.borderLight),
                            shape: RoundedRectangleBorder(
                              borderRadius:
                                  BorderRadius.circular(AppTheme.r12),
                            ),
                          ),
                          child: const Text('Custom',
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600)),
                        ),
                      ),
                    ],
                  ),
                ],
              );
            },
            loading: () => const ShimmerBox(height: 48),
            error: (_, _) => GradientButton(
              label: 'Sell Item',
              icon: Icons.sell_rounded,
              onPressed: () {
                showGlassSheet(context, SellBottomSheet(items: [item]));
              },
            ),
          ),
        ],
      ),
    );
  }
}
