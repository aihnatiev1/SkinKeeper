import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/market_listing.dart';
import '../../../widgets/shared_ui.dart';
import '../trades_provider.dart';
import 'account_badge.dart';

class ListingsTab extends ConsumerWidget {
  const ListingsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final listingsAsync = ref.watch(listingsProvider);

    return listingsAsync.when(
      data: (state) {
        if (state.listings.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppTheme.surface,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: AppTheme.accent.withValues(alpha: 0.15),
                      width: 1,
                    ),
                  ),
                  child: Icon(
                    Icons.storefront_outlined,
                    size: 36,
                    color: AppTheme.accent.withValues(alpha: 0.5),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'No active listings',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Items you list on Steam Market appear here',
                  style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
                ),
              ],
            ),
          )
              .animate()
              .fadeIn(duration: 400.ms)
              .scale(begin: const Offset(0.95, 0.95));
        }
        return RefreshIndicator(
          onRefresh: () => ref.read(listingsProvider.notifier).refresh(),
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: state.listings.length,
            itemBuilder: (_, i) => _ListingTile(
                    listing: state.listings[i], currency: currency)
                .animate()
                .fadeIn(duration: 300.ms, delay: (i * 40).ms)
                .slideX(begin: 0.03, end: 0),
          ),
        );
      },
      loading: () => ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: List.generate(4, (_) => const SkeletonTradeTile()),
      ),
      error: (_, _) => EmptyState(
        icon: Icons.cloud_off_rounded,
        title: 'Failed to load listings',
        subtitle: 'Check your session and try again',
        action: GradientButton(
          label: 'Retry',
          icon: Icons.refresh_rounded,
          expanded: false,
          onPressed: () => ref.read(listingsProvider.notifier).refresh(),
        ),
      ),
    );
  }
}

class _ListingTile extends ConsumerWidget {
  final MarketListing listing;
  final CurrencyInfo currency;
  const _ListingTile({required this.listing, required this.currency});

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: const Text('Cancel listing?'),
        content: Text('Remove "${listing.displayName}" from Steam Market?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('No')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel listing',
                style: TextStyle(color: AppTheme.loss)),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    final ok = await ref
        .read(listingsProvider.notifier)
        .cancelListing(listing.listingId);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(ok ? 'Listing cancelled' : 'Failed to cancel — try again'),
        backgroundColor: ok ? AppTheme.profit : AppTheme.loss,
        duration: const Duration(seconds: 2),
      ));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final createdStr = _formatDate(listing.createdAt);
    final accentColor = listing.needsConfirmation
        ? AppTheme.warning
        : listing.isOnHold
            ? AppTheme.textMuted
            : null;

    return Dismissible(
      key: Key(listing.listingId),
      direction: DismissDirection.endToStart,
      confirmDismiss: (_) async {
        final ok = await ref
            .read(listingsProvider.notifier)
            .cancelListing(listing.listingId);
        if (!ok && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Failed to cancel — try again'),
            backgroundColor: AppTheme.loss,
          ));
        }
        return ok;
      },
      background: Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: AppTheme.loss.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(AppTheme.r12),
          border: Border.all(color: AppTheme.loss.withValues(alpha: 0.3)),
        ),
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.delete_outline_rounded,
                color: AppTheme.loss, size: 22),
            SizedBox(height: 4),
            Text('Cancel',
                style: TextStyle(
                    color: AppTheme.loss,
                    fontSize: 11,
                    fontWeight: FontWeight.w600)),
          ],
        ),
      ),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: accentColor != null
            ? AppTheme.glassAccent(accentColor: accentColor)
            : AppTheme.glass(),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              // Icon
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: AppTheme.surface,
                  borderRadius: BorderRadius.circular(AppTheme.r8),
                ),
                child: listing.fullIconUrl.isNotEmpty
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(AppTheme.r8),
                        child: Image.network(
                          listing.fullIconUrl,
                          fit: BoxFit.contain,
                          errorBuilder: (_, _, _) => const Icon(
                            Icons.image_not_supported,
                            size: 22,
                            color: AppTheme.textDisabled,
                          ),
                        ),
                      )
                    : const Icon(
                        Icons.image_not_supported,
                        size: 22,
                        color: AppTheme.textDisabled,
                      ),
              ),
              const SizedBox(width: 12),
              // Name + meta
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            listing.displayName,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (listing.needsConfirmation) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppTheme.warning.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              'Confirm',
                              style: TextStyle(
                                  fontSize: 10,
                                  color: AppTheme.warning,
                                  fontWeight: FontWeight.w600),
                            ),
                          ),
                        ] else if (listing.isOnHold) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppTheme.textMuted.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              'On Hold',
                              style: TextStyle(
                                  fontSize: 10,
                                  color: AppTheme.textMuted,
                                  fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (listing.marketHashName != null &&
                        listing.marketHashName != listing.displayName) ...[
                      const SizedBox(height: 2),
                      Text(
                        listing.marketHashName!,
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppTheme.textMuted,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Text(
                          createdStr,
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppTheme.textDisabled,
                          ),
                        ),
                        if (listing.accountName != null) ...[
                          const SizedBox(width: 6),
                          AccountBadge(fromName: listing.accountName),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              // Prices + cancel button
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    currency.formatCents(listing.sellerPriceCents),
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.profit,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Buyer: ${currency.formatCents(listing.buyerPriceCents)}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textMuted,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(height: 6),
                  GestureDetector(
                    onTap: () => _cancel(context, ref),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppTheme.loss.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                            color: AppTheme.loss.withValues(alpha: 0.25)),
                      ),
                      child: const Text(
                        'Cancel',
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.loss),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inDays == 0) return 'Today';
    if (diff.inDays == 1) return 'Yesterday';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[dt.month - 1]} ${dt.day}';
  }
}
