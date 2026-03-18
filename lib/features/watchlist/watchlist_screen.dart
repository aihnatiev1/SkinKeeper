import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/steam_image.dart';
import '../../core/theme.dart';
import '../../widgets/shared_ui.dart';
import 'watchlist_provider.dart';

class WatchlistScreen extends ConsumerWidget {
  const WatchlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
                      const Expanded(
                        child: Text(
                          'Watchlist',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: -0.5,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),

                // Content
                Expanded(
                  child: watchlistAsync.when(
                    loading: () => const Center(
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppTheme.primary),
                    ),
                    error: (e, _) => Center(
                      child: Text('Failed to load',
                          style:
                              const TextStyle(color: AppTheme.textSecondary)),
                    ),
                    data: (items) {
                      if (items.isEmpty) {
                        return const EmptyState(
                          icon: Icons.visibility_outlined,
                          title: 'Watchlist is empty',
                          subtitle:
                              'Track any CS2 item and get notified when it drops',
                        );
                      }

                      return AppRefreshIndicator(
                        onRefresh: () async =>
                            ref.invalidate(watchlistProvider),
                        child: ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                          itemCount: items.length,
                          itemBuilder: (_, i) => _WatchlistCard(item: items[i])
                              .animate()
                              .fadeIn(duration: 300.ms, delay: (i * 50).ms)
                              .slideX(begin: 0.03, end: 0),
                        ),
                      );
                    },
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
                      builder: (_) => const _AddToWatchlistSheet(),
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

// ─── Watchlist Card ──────────────────────────────────────────────

class _WatchlistCard extends ConsumerWidget {
  final WatchlistItem item;
  const _WatchlistCard({required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final belowTarget = item.isBelowTarget;
    final distPct = item.distancePct;

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
            // Item image or icon
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

            // Name + target
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
                    'Target: \$${item.targetPrice.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            // Current price + distance
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (item.currentPrice != null)
                  Text(
                    '\$${item.currentPrice!.toStringAsFixed(2)}',
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

// ─── Add to Watchlist Bottom Sheet ──────────────────────────────

class _AddToWatchlistSheet extends ConsumerStatefulWidget {
  const _AddToWatchlistSheet();

  @override
  ConsumerState<_AddToWatchlistSheet> createState() =>
      _AddToWatchlistSheetState();
}

class _AddToWatchlistSheetState extends ConsumerState<_AddToWatchlistSheet> {
  final _searchController = TextEditingController();
  final _priceController = TextEditingController();
  final _priceFocus = FocusNode();
  Timer? _debounce;
  String _query = '';
  String? _selectedName;
  String? _selectedIconUrl;
  double? _selectedCurrentPrice;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _searchController.dispose();
    _priceController.dispose();
    _priceFocus.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String val) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = val.trim());
    });
  }

  void _selectItem(Map<String, dynamic> item) {
    final name = item['market_hash_name'] as String;
    final price = item['price'] as num?;
    setState(() {
      _selectedName = name;
      _selectedIconUrl = item['icon_url'] as String?;
      _selectedCurrentPrice = price?.toDouble();
      _searchController.text = name;
      _query = '';
    });
    _priceFocus.requestFocus();
  }

  void _clearSelection() {
    setState(() {
      _selectedName = null;
      _selectedIconUrl = null;
      _selectedCurrentPrice = null;
      _searchController.clear();
      _query = '';
      _error = null;
    });
  }

  Future<void> _submit() async {
    if (_selectedName == null) {
      setState(() => _error = 'Select an item first');
      return;
    }
    final price =
        double.tryParse(_priceController.text.replaceAll(',', '.'));
    if (price == null || price <= 0) {
      setState(() => _error = 'Enter a valid target price');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await ref.read(watchlistProvider.notifier).add(
            _selectedName!,
            price,
            iconUrl: _selectedIconUrl,
          );
      HapticFeedback.mediumImpact();
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final searchResults = _query.length >= 2
        ? ref.watch(itemSearchProvider(_query))
        : const AsyncValue<List<Map<String, dynamic>>>.data([]);

    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final hasSelection = _selectedName != null;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      padding: EdgeInsets.only(bottom: bottomInset),
      decoration: const BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Drag handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 16),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textMuted.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Title
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20),
            child: Text(
              'Add to Watchlist',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                letterSpacing: -0.3,
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Search or selected chip
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: hasSelection
                ? _SelectedChip(
                    name: _selectedName!,
                    price: _selectedCurrentPrice,
                    onClear: _clearSelection,
                  )
                : TextField(
                    controller: _searchController,
                    onChanged: _onSearchChanged,
                    autofocus: true,
                    decoration: InputDecoration(
                      hintText: 'Search any CS2 item...',
                      hintStyle:
                          const TextStyle(color: AppTheme.textDisabled),
                      prefixIcon: const Icon(Icons.search, size: 20),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.close, size: 18),
                              onPressed: _clearSelection,
                            )
                          : null,
                      filled: true,
                      fillColor: AppTheme.surface,
                      border: OutlineInputBorder(
                        borderRadius:
                            BorderRadius.circular(AppTheme.r12),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 12),
                    ),
                    style: const TextStyle(fontSize: 14),
                  ),
          ),

          // Search results
          if (!hasSelection && _query.length >= 2)
            searchResults.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(20),
                child: Center(
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppTheme.primary),
                ),
              ),
              error: (_, _) => const Padding(
                padding: EdgeInsets.all(20),
                child: Text('Search failed',
                    style: TextStyle(color: AppTheme.textMuted)),
              ),
              data: (items) {
                if (items.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(20),
                    child: Text('No items found',
                        style: TextStyle(color: AppTheme.textMuted),
                        textAlign: TextAlign.center),
                  );
                }
                return Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                    itemCount: items.length,
                    itemBuilder: (_, i) {
                      final item = items[i];
                      final name = item['market_hash_name'] as String;
                      final price = item['price'] as num?;
                      final iconHash = item['icon_url'] as String?;

                      return InkWell(
                        onTap: () => _selectItem(item),
                        borderRadius:
                            BorderRadius.circular(AppTheme.r12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 10),
                          child: Row(
                            children: [
                              if (iconHash != null &&
                                  iconHash.isNotEmpty) ...[
                                SizedBox(
                                  width: 32,
                                  height: 32,
                                  child: Image.network(
                                    SteamImage.url(iconHash,
                                        size: '64fx64f'),
                                    fit: BoxFit.contain,
                                    errorBuilder: (_, _, _) =>
                                        const SizedBox.shrink(),
                                  ),
                                ),
                                const SizedBox(width: 10),
                              ],
                              Expanded(
                                child: Text(
                                  name,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              if (price != null)
                                Text(
                                  '\$${price.toStringAsFixed(2)}',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: AppTheme.textSecondary,
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
            ),

          // Target price input (after selection)
          if (hasSelection) ...[
            const SizedBox(height: 20),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Target price',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _priceController,
                    focusNode: _priceFocus,
                    onChanged: (_) => setState(() => _error = null),
                    keyboardType: const TextInputType.numberWithOptions(
                        decimal: true),
                    decoration: InputDecoration(
                      prefixText: '\$ ',
                      prefixStyle: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary,
                      ),
                      hintText: _selectedCurrentPrice != null
                          ? _selectedCurrentPrice!.toStringAsFixed(2)
                          : '0.00',
                      hintStyle: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        color:
                            AppTheme.textDisabled.withValues(alpha: 0.3),
                      ),
                      filled: true,
                      fillColor: AppTheme.surface,
                      border: OutlineInputBorder(
                        borderRadius:
                            BorderRadius.circular(AppTheme.r12),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 16),
                    ),
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                    textAlign: TextAlign.center,
                  ),
                  if (_selectedCurrentPrice != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      'Current price: \$${_selectedCurrentPrice!.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.textMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],

          // Error
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Text(
                _error!,
                style:
                    const TextStyle(color: AppTheme.loss, fontSize: 13),
                textAlign: TextAlign.center,
              ),
            ),

          // Submit button
          if (hasSelection) ...[
            const SizedBox(height: 20),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
              child: GestureDetector(
                onTap: _loading ? null : _submit,
                child: AnimatedContainer(
                  duration: 200.ms,
                  height: 54,
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(AppTheme.r16),
                  ),
                  foregroundDecoration: BoxDecoration(
                    color: _priceController.text.isNotEmpty
                        ? Colors.transparent
                        : Colors.black.withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(AppTheme.r16),
                  ),
                  child: Center(
                    child: _loading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.visibility_rounded,
                                  size: 20, color: Colors.white),
                              SizedBox(width: 8),
                              Text(
                                'Add to Watchlist',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                  ),
                ),
              ),
            ),
          ],

          if (!hasSelection) const SizedBox(height: 20),
        ],
      ),
    );
  }
}

// ─── Selected Item Chip ──────────────────────────────────────────

class _SelectedChip extends StatelessWidget {
  final String name;
  final double? price;
  final VoidCallback onClear;

  const _SelectedChip({
    required this.name,
    this.price,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.profit.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppTheme.r12),
        border:
            Border.all(color: AppTheme.profit.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle,
              color: AppTheme.profit, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              name,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.profit,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (price != null) ...[
            const SizedBox(width: 8),
            Text(
              '\$${price!.toStringAsFixed(2)}',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
          const SizedBox(width: 8),
          GestureDetector(
            onTap: onClear,
            child: const Icon(Icons.close,
                size: 16, color: AppTheme.textMuted),
          ),
        ],
      ),
    );
  }
}
