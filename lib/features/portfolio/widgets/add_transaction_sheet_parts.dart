import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/steam_image.dart';
import '../../../core/theme.dart';
import '../../../models/profit_loss.dart';
import '../manual_tx_provider.dart';
import '../portfolio_pl_provider.dart';

class AddTransactionHeader extends StatelessWidget {
  final String title;
  final VoidCallback onClose;

  const AddTransactionHeader({
    super.key,
    required this.title,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Center(
          child: Container(
            margin: const EdgeInsets.only(top: 12, bottom: 8),
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: AppTheme.textDisabled,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 16, 12),
          child: Row(
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textPrimary,
                ),
              ),
              const Spacer(),
              GestureDetector(
                onTap: onClose,
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.06),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.close_rounded,
                      size: 18, color: AppTheme.textMuted),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class AddTransactionFieldLabel extends StatelessWidget {
  final String text;

  const AddTransactionFieldLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.2,
        color: AppTheme.textDisabled,
      ),
    );
  }
}

class AddTransactionTotalRow extends StatelessWidget {
  final double totalPrice;
  final String Function(double) formatter;

  const AddTransactionTotalRow({
    super.key,
    required this.totalPrice,
    required this.formatter,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppTheme.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            'Total',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: AppTheme.textSecondary,
            ),
          ),
          Text(
            formatter(totalPrice),
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 200.ms);
  }
}

class AddTransactionItemSearch extends StatelessWidget {
  final TextEditingController controller;
  final String? selectedItem;
  final String? selectedIconUrl;
  final ValueChanged<String> onChanged;
  final VoidCallback onTap;

  const AddTransactionItemSearch({
    super.key,
    required this.controller,
    required this.selectedItem,
    required this.selectedIconUrl,
    required this.onChanged,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: selectedItem != null
              ? AppTheme.profit.withValues(alpha: 0.3)
              : AppTheme.border,
        ),
      ),
      child: Row(
        children: [
          if (selectedIconUrl != null) ...[
            Padding(
              padding: const EdgeInsets.only(left: 10),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: CachedNetworkImage(
                  imageUrl: SteamImage.url(selectedIconUrl!, size: '64fx64f'),
                  width: 28,
                  height: 28,
                  fit: BoxFit.contain,
                  errorWidget: (_, _, _) => const SizedBox.shrink(),
                ),
              ),
            ),
          ],
          Expanded(
            child: TextField(
              controller: controller,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: AppTheme.textPrimary,
              ),
              onChanged: onChanged,
              onTap: onTap,
              decoration: InputDecoration(
                hintText: 'Search item name...',
                hintStyle: const TextStyle(
                    color: AppTheme.textDisabled, fontSize: 14),
                prefixIcon: selectedIconUrl == null
                    ? const Icon(Icons.search_rounded,
                        size: 18, color: AppTheme.textMuted)
                    : null,
                suffixIcon: selectedItem != null
                    ? const Icon(Icons.check_circle_rounded,
                        size: 18, color: AppTheme.profit)
                    : null,
                border: InputBorder.none,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class AddTransactionSearchResults extends ConsumerWidget {
  final String query;
  final VoidCallback onUseAnyway;
  final void Function(String marketHashName, String? iconUrl) onPick;

  const AddTransactionSearchResults({
    super.key,
    required this.query,
    required this.onUseAnyway,
    required this.onPick,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (query.length < 2) return const SizedBox.shrink();

    final results = ref.watch(itemSearchProvider(query));

    return Container(
      margin: const EdgeInsets.only(top: 4),
      constraints: const BoxConstraints(maxHeight: 200),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: results.when(
        data: (items) {
          if (items.isEmpty) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'No items found',
                    style:
                        TextStyle(fontSize: 13, color: AppTheme.textMuted),
                  ),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: onUseAnyway,
                    child: Text(
                      'Use "$query" anyway',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.primary,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }

          return ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: ListView.separated(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              itemCount: items.length,
              separatorBuilder: (_, _) =>
                  const Divider(height: 1, color: AppTheme.border),
              itemBuilder: (context, index) {
                final item = items[index];
                return InkWell(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    onPick(item.marketHashName, item.iconUrl);
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
                    child: Row(
                      children: [
                        if (item.imageUrl.isNotEmpty) ...[
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: CachedNetworkImage(
                              imageUrl: item.imageUrl,
                              width: 28,
                              height: 28,
                              fit: BoxFit.contain,
                              errorWidget: (_, _, _) =>
                                  const SizedBox(width: 28, height: 28),
                            ),
                          ),
                          const SizedBox(width: 10),
                        ],
                        Expanded(
                          child: Text(
                            item.marketHashName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: AppTheme.textPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
        loading: () => const Padding(
          padding: EdgeInsets.all(16),
          child: Center(
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppTheme.primary,
              ),
            ),
          ),
        ),
        error: (_, _) => const Padding(
          padding: EdgeInsets.all(16),
          child: Text('Search failed',
              style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
        ),
      ),
    );
  }
}

class AddTransactionPortfolioPickerRow extends ConsumerWidget {
  final int? portfolioId;
  final ValueChanged<int?> onPicked;

  const AddTransactionPortfolioPickerRow({
    super.key,
    required this.portfolioId,
    required this.onPicked,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfoliosAsync = ref.watch(portfoliosProvider);
    return portfoliosAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (e, _) => const SizedBox.shrink(),
      data: (portfolios) {
        if (portfolios.isEmpty) return const SizedBox.shrink();
        final selected =
            portfolios.where((p) => p.id == portfolioId).firstOrNull;
        return Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Row(
            children: [
              const Icon(Icons.folder_outlined,
                  size: 16, color: AppTheme.textMuted),
              const SizedBox(width: 8),
              Text(
                'Portfolio',
                style: AppTheme.captionSmall
                    .copyWith(color: AppTheme.textMuted),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () => _pickPortfolio(context, portfolios),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: selected != null
                        ? selected.color.withValues(alpha: 0.15)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: selected != null
                          ? selected.color
                          : AppTheme.divider,
                    ),
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 160),
                    child: Text(
                      selected?.name ?? 'None',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        color: selected?.color ?? AppTheme.textMuted,
                        fontWeight: selected != null
                            ? FontWeight.w600
                            : FontWeight.w400,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _pickPortfolio(
      BuildContext context, List<Portfolio> portfolios) async {
    final picked = await showModalBottomSheet<int?>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.all(16),
        decoration: AppTheme.glass(),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Assign Portfolio',
              style: AppTheme.bodySmall.copyWith(
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 12),
            ListTile(
              leading: Icon(Icons.close, color: AppTheme.textMuted, size: 18),
              title: Text('None',
                  style: AppTheme.bodySmall
                      .copyWith(color: AppTheme.textMuted)),
              onTap: () => context.pop(-1),
              dense: true,
              contentPadding: EdgeInsets.zero,
            ),
            for (final p in portfolios)
              ListTile(
                leading: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                      color: p.color, shape: BoxShape.circle),
                ),
                title: Text(p.name,
                    style: AppTheme.bodySmall
                        .copyWith(color: AppTheme.textPrimary)),
                onTap: () => context.pop(p.id),
                dense: true,
                contentPadding: EdgeInsets.zero,
              ),
          ],
        ),
      ),
    );
    if (picked == -1) {
      onPicked(null);
    } else if (picked != null) {
      onPicked(picked);
    }
  }
}
