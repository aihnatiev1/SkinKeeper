import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../../../models/profit_loss.dart';
import '../../../widgets/glass_sheet.dart';
import '../portfolio_pl_provider.dart';
import 'portfolio_sheets.dart';

class PortfolioSelectorBar extends ConsumerWidget {
  const PortfolioSelectorBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfoliosAsync = ref.watch(portfoliosProvider);
    final selected = ref.watch(selectedPortfolioIdProvider);

    Widget defaultBar() => Padding(
      padding: const EdgeInsets.fromLTRB(0, 0, 0, 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _chip(
            label: 'All',
            color: AppTheme.primary,
            isSelected: true,
            onTap: () {},
            onLongPress: null,
          ),
          const SizedBox(width: 8),
          _addButton(context, ref),
        ],
      ),
    );

    return portfoliosAsync.when(
      loading: () => defaultBar(),
      error: (e, _) => defaultBar(),
      data: (portfolios) {
        if (portfolios.isEmpty) {
          return defaultBar();
        }
        return SizedBox(
          height: 36,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.zero,
            children: [
              _chip(
                label: 'All',
                color: AppTheme.primary,
                isSelected: selected == null,
                onTap: () {
                  HapticFeedback.selectionClick();
                  ref.read(selectedPortfolioIdProvider.notifier).state = null;
                  ref.read(plTabProvider.notifier).state = PlTab.active;
                },
                onLongPress: null,
              ),
              const SizedBox(width: 8),
              for (final p in portfolios) ...[
                _chip(
                  label: p.name,
                  color: p.color,
                  isSelected: selected == p.id,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    ref.read(selectedPortfolioIdProvider.notifier).state = p.id;
                    ref.read(plTabProvider.notifier).state = PlTab.active;
                  },
                  onLongPress: () => _showPortfolioOptions(context, ref, p),
                ),
                const SizedBox(width: 8),
              ],
              _addButton(context, ref),
            ],
          ),
        );
      },
    );
  }

  Widget _chip({
    required String label,
    required Color color,
    required bool isSelected,
    required VoidCallback onTap,
    required VoidCallback? onLongPress,
  }) {
    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? color.withValues(alpha: 0.2) : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? color : AppTheme.divider,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 120),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              color: isSelected ? color : AppTheme.textMuted,
            ),
          ),
        ),
      ),
    );
  }

  Widget _addButton(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        showGlassSheet(context, const CreatePortfolioSheet());
      },
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.divider),
        ),
        child: const Icon(Icons.add, size: 16, color: AppTheme.textMuted),
      ),
    );
  }

  void _showPortfolioOptions(BuildContext context, WidgetRef ref, Portfolio p) {
    HapticFeedback.mediumImpact();
    showGlassSheet(
      context,
      PortfolioOptionsSheet(portfolio: p),
    );
  }
}
