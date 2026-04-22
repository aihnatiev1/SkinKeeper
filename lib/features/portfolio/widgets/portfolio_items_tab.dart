import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../../../widgets/premium_gate.dart';
import '../../../widgets/shared_ui.dart';
import '../../purchases/iap_service.dart';
import '../portfolio_pl_provider.dart';
import 'item_pl_list.dart';
import 'portfolio_selector_bar.dart';

class PortfolioItemsTab extends ConsumerWidget {
  const PortfolioItemsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsPL = ref.watch(itemsPLProvider);
    final isPremium = ref.watch(premiumProvider).valueOrNull ?? false;

    return PremiumGate(
      isPremium: isPremium,
      featureName: 'Per-item profit & loss breakdown',
      child: Column(
        children: [
          const PortfolioSelectorBar(),
          const SizedBox(height: 8),
          itemsPL.when(
            data: (s) => ItemPLList(items: s.items, isLoadingMore: s.isLoadingMore)
                .animate()
                .fadeIn(duration: 400.ms),
            loading: () => Column(
              children: List.generate(5, (i) => const Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: ShimmerBox(height: 56),
              )),
            ),
            error: (err, _) => Center(child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Error: $err', style: const TextStyle(color: AppTheme.loss, fontSize: 11)),
            )),
          ),
        ],
      ),
    );
  }
}
