import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/analytics_service.dart';
import '../../core/theme.dart';
import '../../core/widgets/screen_state_builder.dart';
import '../../widgets/shared_ui.dart';
import 'watchlist_provider.dart';
import 'widgets/add_to_watchlist_sheet.dart';
import 'widgets/watchlist_card.dart';

class WatchlistScreen extends ConsumerStatefulWidget {
  const WatchlistScreen({super.key});

  @override
  ConsumerState<WatchlistScreen> createState() => _WatchlistScreenState();
}

class _WatchlistScreenState extends ConsumerState<WatchlistScreen> {
  @override
  void initState() {
    super.initState();
    Analytics.screen('watchlist');
  }

  @override
  Widget build(BuildContext context) {
    final watchlistAsync = ref.watch(watchlistProvider);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Stack(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 16, 16, 0),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back_ios_new_rounded,
                            size: 20, color: AppTheme.textSecondary),
                        onPressed: () => context.pop(),
                      ),
                      Expanded(
                        child: Text(
                          'Watchlist'.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.5,
                            color: AppTheme.textDisabled,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),

                // Content
                Expanded(
                  child: ScreenStateBuilder<List<WatchlistItem>>(
                    state: watchlistAsync,
                    isEmpty: (items) => items.isEmpty,
                    onRetry: () => ref.invalidate(watchlistProvider),
                    emptyIcon: Icons.visibility_outlined,
                    emptyTitle: 'Watchlist is empty',
                    emptySubtitle:
                        'Track any CS2 item and get notified when the price drops.\nOpen your inventory to add one.',
                    emptyAction: FilledButton.icon(
                      onPressed: () => context.go('/inventory'),
                      icon: const Icon(Icons.inventory_2_outlined, size: 18),
                      label: const Text('Browse inventory'),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppTheme.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 20, vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                    builder: (items) => AppRefreshIndicator(
                      onRefresh: () async =>
                          ref.invalidate(watchlistProvider),
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                        itemCount: items.length,
                        itemBuilder: (_, i) => WatchlistCard(item: items[i])
                            .animate()
                            .fadeIn(duration: 300.ms, delay: (i * 50).ms)
                            .slideX(begin: 0.03, end: 0),
                      ),
                    ),
                  ),
                ),
              ],
            ),

            // FAB
            Positioned(
              bottom: 16,
              left: 0,
              right: 0,
              child: Center(
                child: GestureDetector(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      backgroundColor: Colors.transparent,
                      builder: (_) => const AddToWatchlistSheet(),
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 14),
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.primary.withValues(alpha: 0.45),
                          blurRadius: 20,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.add_rounded,
                            size: 20, color: Colors.white),
                        SizedBox(width: 8),
                        Text(
                          'Add Item',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
