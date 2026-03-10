import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../widgets/shared_ui.dart';
import '../../models/trade_offer.dart';
import '../auth/steam_auth_service.dart';
import 'trades_provider.dart';

/// Max items per single Steam trade offer
const _kMaxTradeItems = 100;

/// Non-tradable junk patterns to filter from "my items"
const _kExcludedTypes = {'Collectible', 'Graffiti', 'Spray', 'Patch'};
const _kExcludedNames = {'Charm Remover', 'Storage Unit'};

class CreateTradeScreen extends ConsumerStatefulWidget {
  const CreateTradeScreen({super.key});

  @override
  ConsumerState<CreateTradeScreen> createState() => _CreateTradeScreenState();
}

class _CreateTradeScreenState extends ConsumerState<CreateTradeScreen> {
  int _step = 0; // 0=friends, 1=items, 2=review
  SteamFriend? _selectedFriend;
  String _message = '';
  final _searchCtrl = TextEditingController();

  // Selected items
  final Set<String> _giveAssetIds = {};
  final Set<String> _recvAssetIds = {};
  List<TradeOfferItem> _myItems = [];
  List<TradeOfferItem> _partnerItems = [];
  bool _loadingInventories = false;
  String? _inventoryError;
  bool _sending = false;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final currency = ref.watch(currencyProvider);
    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 20, color: AppTheme.textSecondary),
                    onPressed: () {
                      if (_step > 0) {
                        HapticFeedback.lightImpact();
                        setState(() => _step--);
                      } else {
                        context.pop();
                      }
                    },
                  ),
                  Expanded(
                    child: Text(
                      _stepTitle,
                      style: const TextStyle(
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
            Expanded(child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 200),
        child: switch (_step) {
          0 => _FriendPickerStep(
              key: const ValueKey('friends'),
              searchCtrl: _searchCtrl,
              onSelect: _onFriendSelected,
            ),
          1 => _ItemExchangeStep(
              key: const ValueKey('items'),
              myItems: _myItems,
              partnerItems: _partnerItems,
              giveAssetIds: _giveAssetIds,
              recvAssetIds: _recvAssetIds,
              loading: _loadingInventories,
              error: _inventoryError,
              onToggleGive: _toggleGive,
              onToggleRecv: _toggleRecv,
              onContinue: _goToReview,
              currency: currency,
            ),
          2 => _ReviewStep(
              key: const ValueKey('review'),
              friend: _selectedFriend!,
              myItems: _myItems,
              partnerItems: _partnerItems,
              giveAssetIds: _giveAssetIds,
              recvAssetIds: _recvAssetIds,
              message: _message,
              onMessageChanged: (v) => _message = v,
              onSend: _sendTrade,
              sending: _sending,
              currency: currency,
            ),
          _ => const SizedBox.shrink(),
        },
      )),
          ],
        ),
      ),
    );
  }

  String get _stepTitle => switch (_step) {
        0 => 'Choose Friend',
        1 => 'Select Items',
        2 => 'Review Trade',
        _ => '',
      };

  void _onFriendSelected(SteamFriend friend) {
    HapticFeedback.mediumImpact();
    setState(() {
      _selectedFriend = friend;
      _step = 1;
      _giveAssetIds.clear();
      _recvAssetIds.clear();
    });
    _loadInventories(friend.steamId);
  }

  Future<void> _loadInventories(String partnerSteamId) async {
    setState(() {
      _loadingInventories = true;
      _inventoryError = null;
    });

    try {
      final api = ref.read(apiClientProvider);

      // Load my inventory (active account only)
      final activeAccountId =
          ref.read(authStateProvider).valueOrNull?.activeAccountId;
      final myResponse = await api.get('/inventory', queryParameters: {
        if (activeAccountId != null) 'accountId': '$activeAccountId',
      });
      final myData = myResponse.data as Map<String, dynamic>;
      final myList = myData['items'] as List<dynamic>;
      _myItems = myList.map((e) {
        final item = e as Map<String, dynamic>;
        final prices = item['prices'] as Map<String, dynamic>?;
        final steamPrice = double.tryParse(prices?['steam']?.toString() ?? '') ?? 0;
        return TradeOfferItem(
          id: 0,
          side: 'give',
          assetId: item['asset_id'] as String,
          marketHashName: item['market_hash_name'] as String?,
          iconUrl: item['icon_url'] as String?,
          floatValue: double.tryParse(item['float_value']?.toString() ?? ''),
          priceCents: (steamPrice * 100).round(),
        );
      }).where((i) {
        if (i.marketHashName == null) return false;
        // Filter out non-tradable junk by name
        if (_kExcludedNames.contains(i.marketHashName)) return false;
        // Filter out graffiti patterns
        if (i.marketHashName!.startsWith('Sealed Graffiti |')) return false;
        return true;
      }).toList();

      // Load partner inventory
      try {
        final partnerResponse =
            await api.get('/trades/partner-inventory/$partnerSteamId');
        final partnerData = partnerResponse.data as Map<String, dynamic>;
        final partnerList = partnerData['items'] as List<dynamic>;
        _partnerItems = partnerList.map((e) {
          final item = e as Map<String, dynamic>;
          return TradeOfferItem(
            id: 0,
            side: 'receive',
            assetId: item['assetId'] as String,
            marketHashName: item['marketHashName'] as String?,
            iconUrl: item['iconUrl'] as String?,
          );
        }).toList();

        // Batch lookup prices for partner items
        final partnerNames = _partnerItems
            .map((i) => i.marketHashName)
            .where((n) => n != null)
            .toSet()
            .toList();
        if (partnerNames.isNotEmpty) {
          try {
            final priceResp =
                await api.post('/prices/batch', data: {'names': partnerNames});
            final prices =
                (priceResp.data['prices'] as Map<String, dynamic>?) ?? {};
            _partnerItems = _partnerItems.map((item) {
              if (item.marketHashName == null) return item;
              final p = prices[item.marketHashName] as Map<String, dynamic>?;
              if (p == null) return item;
              final steamPrice = double.tryParse(p['steam']?.toString() ?? '') ?? 0;
              final skinportPrice = double.tryParse(p['skinport']?.toString() ?? '') ?? 0;
              final best = steamPrice > 0 ? steamPrice : skinportPrice;
              return TradeOfferItem(
                id: item.id,
                side: item.side,
                assetId: item.assetId,
                marketHashName: item.marketHashName,
                iconUrl: item.iconUrl,
                floatValue: item.floatValue,
                priceCents: (best * 100).round(),
              );
            }).toList();
          } catch (_) {
            // Prices are optional
          }
        }
      } on DioException catch (e) {
        final msg = (e.response?.data as Map<String, dynamic>?)?['error'] ??
            'Partner inventory unavailable';
        setState(() {
          _loadingInventories = false;
          _step = 0;
          _selectedFriend = null;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(msg)),
          );
        }
        return;
      } catch (e) {
        setState(() {
          _loadingInventories = false;
          _step = 0;
          _selectedFriend = null;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Partner inventory unavailable')),
          );
        }
        return;
      }

      setState(() => _loadingInventories = false);
    } catch (e) {
      setState(() {
        _loadingInventories = false;
        _inventoryError = e.toString();
      });
    }
  }

  void _toggleGive(String assetId) {
    HapticFeedback.selectionClick();
    setState(() {
      if (_giveAssetIds.contains(assetId)) {
        _giveAssetIds.remove(assetId);
      } else {
        if (_giveAssetIds.length >= _kMaxTradeItems) {
          _showLimitSnackbar('give');
          return;
        }
        _giveAssetIds.add(assetId);
      }
    });
  }

  void _toggleRecv(String assetId) {
    HapticFeedback.selectionClick();
    setState(() {
      if (_recvAssetIds.contains(assetId)) {
        _recvAssetIds.remove(assetId);
      } else {
        if (_recvAssetIds.length >= _kMaxTradeItems) {
          _showLimitSnackbar('get');
          return;
        }
        _recvAssetIds.add(assetId);
      }
    });
  }

  /// Add multiple asset IDs at once (for group selection)
  void _addMultipleGive(List<String> assetIds) {
    HapticFeedback.selectionClick();
    setState(() {
      final remaining = _kMaxTradeItems - _giveAssetIds.length;
      final toAdd = assetIds.take(remaining).toList();
      _giveAssetIds.addAll(toAdd);
      if (toAdd.length < assetIds.length) _showLimitSnackbar('give');
    });
  }

  void _removeMultipleGive(List<String> assetIds) {
    HapticFeedback.selectionClick();
    setState(() => _giveAssetIds.removeAll(assetIds));
  }

  void _addMultipleRecv(List<String> assetIds) {
    HapticFeedback.selectionClick();
    setState(() {
      final remaining = _kMaxTradeItems - _recvAssetIds.length;
      final toAdd = assetIds.take(remaining).toList();
      _recvAssetIds.addAll(toAdd);
      if (toAdd.length < assetIds.length) _showLimitSnackbar('get');
    });
  }

  void _removeMultipleRecv(List<String> assetIds) {
    HapticFeedback.selectionClick();
    setState(() => _recvAssetIds.removeAll(assetIds));
  }

  void _showLimitSnackbar(String side) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Max $_kMaxTradeItems items per side ($side)'),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  void _goToReview() {
    if (_giveAssetIds.isEmpty && _recvAssetIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one item')),
      );
      return;
    }
    HapticFeedback.mediumImpact();
    setState(() => _step = 2);
  }

  Future<void> _sendTrade() async {
    if (_sending) return;
    setState(() => _sending = true);
    HapticFeedback.heavyImpact();

    try {
      final api = ref.read(apiClientProvider);
      final giveItems = _myItems
          .where((i) => _giveAssetIds.contains(i.assetId))
          .map((i) => {
                'assetId': i.assetId,
                'marketHashName': i.marketHashName,
                'iconUrl': i.iconUrl,
                'priceCents': i.priceCents,
              })
          .toList();
      final recvItems = _partnerItems
          .where((i) => _recvAssetIds.contains(i.assetId))
          .map((i) => {
                'assetId': i.assetId,
                'marketHashName': i.marketHashName,
                'iconUrl': i.iconUrl,
              })
          .toList();

      await sendTradeOffer(
        api,
        partnerSteamId: _selectedFriend!.steamId,
        itemsToGive: giveItems,
        itemsToReceive: recvItems,
        message: _message.isNotEmpty ? _message : null,
      );

      ref.invalidate(tradesProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Trade offer sent!')),
        );
        context.pop();
      }
    } catch (e) {
      setState(() => _sending = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: ${friendlyError(e)}')),
        );
      }
    }
  }
}

// ==========================================================================
// Step 1: Friend Picker
// ==========================================================================

class _FriendPickerStep extends ConsumerWidget {
  final TextEditingController searchCtrl;
  final ValueChanged<SteamFriend> onSelect;

  const _FriendPickerStep({
    super.key,
    required this.searchCtrl,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final friendsAsync = ref.watch(steamFriendsProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            controller: searchCtrl,
            decoration: InputDecoration(
              hintText: 'Search friends...',
              prefixIcon: const Icon(Icons.search, size: 20),
              filled: true,
              fillColor: AppTheme.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.r16),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
        Expanded(
          child: friendsAsync.when(
            data: (friends) => ValueListenableBuilder(
              valueListenable: searchCtrl,
              builder: (context, _, _) {
                final query = searchCtrl.text.toLowerCase();
                final filtered = query.isEmpty
                    ? friends
                    : friends
                        .where((f) =>
                            f.personaName.toLowerCase().contains(query) ||
                            f.steamId.contains(query))
                        .toList();

                if (filtered.isEmpty) {
                  return Center(
                    child: Text(
                      query.isEmpty
                          ? 'No friends found'
                          : 'No matches for "$query"',
                      style: const TextStyle(
                          fontSize: 14, color: AppTheme.textMuted),
                    ),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) => _FriendTile(
                    friend: filtered[i],
                    onTap: () => onSelect(filtered[i]),
                  ).animate()
                      .fadeIn(duration: 200.ms, delay: (i * 30).ms),
                );
              },
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.error_outline,
                        size: 40, color: AppTheme.textDisabled),
                    const SizedBox(height: 12),
                    Text(friendlyError(e),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            fontSize: 13, color: AppTheme.textSecondary)),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () => ref.invalidate(steamFriendsProvider),
                      icon: const Icon(Icons.refresh, size: 16),
                      label: const Text('Retry'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.accent,
                        foregroundColor: Colors.black,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _FriendTile extends StatelessWidget {
  final SteamFriend friend;
  final VoidCallback onTap;

  const _FriendTile({required this.friend, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final statusColor = switch (friend.onlineStatus) {
      'online' => AppTheme.accent,
      'looking_to_trade' => AppTheme.profit,
      'busy' || 'away' || 'snooze' => AppTheme.warning,
      _ => AppTheme.textMuted,
    };

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
      decoration: AppTheme.glass(radius: AppTheme.r16),
      child: ListTile(
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
        onTap: onTap,
        leading: Stack(
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: AppTheme.surface,
              backgroundImage: CachedNetworkImageProvider(friend.avatarUrl),
            ),
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: statusColor,
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: AppTheme.bg, width: 2),
                ),
              ),
            ),
          ],
        ),
        title: Text(
          friend.personaName,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: friend.isLookingToTrade
            ? const Text('Looking to Trade',
                style: TextStyle(fontSize: 11, color: AppTheme.profit))
            : Text(
                friend.isOnline ? 'Online' : 'Offline',
                style: TextStyle(
                  fontSize: 11,
                  color: friend.isOnline
                      ? AppTheme.accent
                      : AppTheme.textDisabled,
                ),
              ),
        trailing:
            const Icon(Icons.chevron_right, size: 20, color: AppTheme.textDisabled),
      ),
    );
  }
}

// ==========================================================================
// Step 2: Item Exchange (2-panel) with grouped items
// ==========================================================================

/// Groups identical items (same marketHashName) for trade selection
class _TradeItemGroup {
  final String marketHashName;
  final List<TradeOfferItem> items;

  _TradeItemGroup({required this.marketHashName, required this.items});

  TradeOfferItem get first => items.first;
  int get count => items.length;
  String get displayName => first.displayName;
  String get fullIconUrl => first.fullIconUrl;
  int get priceCents => first.priceCents;
  double get priceUsd => first.priceUsd;
}

class _ItemExchangeStep extends StatefulWidget {
  final List<TradeOfferItem> myItems;
  final List<TradeOfferItem> partnerItems;
  final Set<String> giveAssetIds;
  final Set<String> recvAssetIds;
  final bool loading;
  final String? error;
  final ValueChanged<String> onToggleGive;
  final ValueChanged<String> onToggleRecv;
  final VoidCallback onContinue;
  final CurrencyInfo currency;

  const _ItemExchangeStep({
    super.key,
    required this.myItems,
    required this.partnerItems,
    required this.giveAssetIds,
    required this.recvAssetIds,
    required this.loading,
    this.error,
    required this.onToggleGive,
    required this.onToggleRecv,
    required this.onContinue,
    required this.currency,
  });

  @override
  State<_ItemExchangeStep> createState() => _ItemExchangeStepState();
}

class _ItemExchangeStepState extends State<_ItemExchangeStep> {
  int _selectedTab = 0;
  late final PageController _pageCtrl;
  bool _switchedOnce = false;

  @override
  void initState() {
    super.initState();
    _pageCtrl = PageController();
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  void _handleContinue() {
    final giveEmpty = widget.giveAssetIds.isEmpty;
    final recvEmpty = widget.recvAssetIds.isEmpty;

    // If one side has items and the other is empty, auto-switch tab first time
    if (!_switchedOnce && ((giveEmpty && !recvEmpty) || (!giveEmpty && recvEmpty))) {
      final targetTab = giveEmpty ? 0 : 1;
      if (_selectedTab != targetTab) {
        _switchedOnce = true;
        setState(() => _selectedTab = targetTab);
        _pageCtrl.animateToPage(targetTab,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOutCubic);
        return;
      }
    }

    // If still one side empty, show confirmation dialog
    if (giveEmpty || recvEmpty) {
      final emptySide = giveEmpty ? 'give' : 'get';
      showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: AppTheme.surface,
          title: const Text('One side is empty'),
          content: Text('You have no items on the $emptySide side. Continue anyway?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('No'),
            ),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Yes'),
            ),
          ],
        ),
      ).then((confirmed) {
        if (confirmed == true) widget.onContinue();
      });
      return;
    }

    widget.onContinue();
  }


  @override
  Widget build(BuildContext context) {
    if (widget.loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Loading inventories...',
                style: TextStyle(fontSize: 13, color: AppTheme.textMuted)),
          ],
        ),
      );
    }

    if (widget.error != null) {
      return Center(
        child: Text('Failed to load: ${friendlyError(widget.error)}',
            style: const TextStyle(color: AppTheme.textSecondary)),
      );
    }

    final parent = context.findAncestorStateOfType<_CreateTradeScreenState>()!;

    return Column(
      children: [
        // Limit indicator
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          color: AppTheme.surface.withValues(alpha: 0.5),
          child: Row(
            children: [
              _SelectionChip(
                label: 'Give',
                count: widget.giveAssetIds.length,
                color: AppTheme.loss,
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Icon(Icons.swap_horiz,
                    size: 18, color: AppTheme.textDisabled),
              ),
              _SelectionChip(
                label: 'Get',
                count: widget.recvAssetIds.length,
                color: AppTheme.profit,
              ),
              const Spacer(),
              // Item limit counters per side
              _SideLimitBadge(
                label: 'G',
                count: widget.giveAssetIds.length,
                color: AppTheme.loss,
              ),
              const SizedBox(width: 4),
              _SideLimitBadge(
                label: 'R',
                count: widget.recvAssetIds.length,
                color: AppTheme.profit,
              ),
            ],
          ),
        ),

        // Tabs
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: PillTabSelector(
            tabs: [
              'Your Items (${widget.myItems.length})',
              'Their Items (${widget.partnerItems.length})',
            ],
            selected: _selectedTab,
            onChanged: (i) {
              setState(() => _selectedTab = i);
              _pageCtrl.animateToPage(i, duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
            },
          ),
        ),
        const SizedBox(height: 8),

        // Item lists
        Expanded(
          child: PageView(
            controller: _pageCtrl,
            onPageChanged: (i) => setState(() => _selectedTab = i),
            children: [
              _GroupedItemList(
                items: widget.myItems,
                selectedIds: widget.giveAssetIds,
                onToggle: widget.onToggleGive,
                onAddMultiple: parent._addMultipleGive,
                onRemoveMultiple: parent._removeMultipleGive,
                sideSelected: widget.giveAssetIds.length,
                emptyText: 'No tradable items in your inventory',
                currency: widget.currency,
              ),
              _GroupedItemList(
                items: widget.partnerItems,
                selectedIds: widget.recvAssetIds,
                onToggle: widget.onToggleRecv,
                onAddMultiple: parent._addMultipleRecv,
                onRemoveMultiple: parent._removeMultipleRecv,
                sideSelected: widget.recvAssetIds.length,
                emptyText: 'No tradable items in partner inventory',
                currency: widget.currency,
              ),
            ],
          ),
        ),

        // Sticky bottom bar
        _StickyTradeBar(
          giveCount: widget.giveAssetIds.length,
          recvCount: widget.recvAssetIds.length,
          onContinue: _handleContinue,
        ),
      ],
    );
  }
}

// ==========================================================================
// Grouped item list (replaces grid)
// ==========================================================================

class _GroupedItemList extends StatefulWidget {
  final List<TradeOfferItem> items;
  final Set<String> selectedIds;
  final ValueChanged<String> onToggle;
  final void Function(List<String>) onAddMultiple;
  final void Function(List<String>) onRemoveMultiple;
  final int sideSelected;
  final String emptyText;
  final CurrencyInfo currency;

  const _GroupedItemList({
    required this.items,
    required this.selectedIds,
    required this.onToggle,
    required this.onAddMultiple,
    required this.onRemoveMultiple,
    required this.sideSelected,
    required this.emptyText,
    required this.currency,
  });

  @override
  State<_GroupedItemList> createState() => _GroupedItemListState();
}

class _GroupedItemListState extends State<_GroupedItemList> {
  final Set<String> _expanded = {};
  String _search = '';

  List<_TradeItemGroup> _buildGroups() {
    final map = <String, List<TradeOfferItem>>{};
    for (final item in widget.items) {
      if (item.marketHashName == null) continue;
      map.putIfAbsent(item.marketHashName!, () => []).add(item);
    }

    var groups = map.entries
        .map((e) => _TradeItemGroup(marketHashName: e.key, items: e.value))
        .toList();

    // Sort by count descending, then price descending
    groups.sort((a, b) {
      final cmp = b.count.compareTo(a.count);
      if (cmp != 0) return cmp;
      return b.priceCents.compareTo(a.priceCents);
    });

    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      groups = groups
          .where((g) => g.marketHashName.toLowerCase().contains(q))
          .toList();
    }

    return groups;
  }

  int _selectedInGroup(_TradeItemGroup group) {
    return group.items
        .where((i) => widget.selectedIds.contains(i.assetId))
        .length;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty) {
      return Center(
        child: Text(widget.emptyText,
            style: const TextStyle(fontSize: 13, color: AppTheme.textMuted)),
      );
    }

    final groups = _buildGroups();

    return Column(
      children: [
        // Search
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: TextField(
            onChanged: (v) => setState(() => _search = v),
            decoration: InputDecoration(
              hintText: 'Search...',
              prefixIcon: const Icon(Icons.search, size: 18),
              filled: true,
              fillColor: AppTheme.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.r12),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
              isDense: true,
            ),
            style: const TextStyle(fontSize: 13),
          ),
        ),

        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 4),
            itemCount: groups.length,
            itemBuilder: (_, i) {
              final group = groups[i];
              final selectedCount = _selectedInGroup(group);
              final isExpanded = _expanded.contains(group.marketHashName);

              return _GroupTile(
                group: group,
                selectedCount: selectedCount,
                isExpanded: isExpanded,
                sideSelected: widget.sideSelected,
                selectedIds: widget.selectedIds,
                currency: widget.currency,
                onToggleExpand: () {
                  setState(() {
                    if (isExpanded) {
                      _expanded.remove(group.marketHashName);
                    } else {
                      _expanded.add(group.marketHashName);
                    }
                  });
                },
                onToggleItem: widget.onToggle,
                onSetQuantity: (qty) {
                  final currentlySelected = group.items
                      .where(
                          (i) => widget.selectedIds.contains(i.assetId))
                      .map((i) => i.assetId)
                      .toList();
                  final currentCount = currentlySelected.length;

                  if (qty > currentCount) {
                    // Add more
                    final toAdd = group.items
                        .where(
                            (i) => !widget.selectedIds.contains(i.assetId))
                        .take(qty - currentCount)
                        .map((i) => i.assetId)
                        .toList();
                    widget.onAddMultiple(toAdd);
                  } else if (qty < currentCount) {
                    // Remove some
                    final toRemove = currentlySelected
                        .reversed
                        .take(currentCount - qty)
                        .toList();
                    widget.onRemoveMultiple(toRemove);
                  }
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

// ==========================================================================
// Group tile with expand/collapse and quantity selection
// ==========================================================================

class _GroupTile extends StatelessWidget {
  final _TradeItemGroup group;
  final int selectedCount;
  final bool isExpanded;
  final int sideSelected;
  final Set<String> selectedIds;
  final VoidCallback onToggleExpand;
  final ValueChanged<String> onToggleItem;
  final ValueChanged<int> onSetQuantity;
  final CurrencyInfo currency;

  const _GroupTile({
    required this.group,
    required this.selectedCount,
    required this.isExpanded,
    required this.sideSelected,
    required this.selectedIds,
    required this.onToggleExpand,
    required this.onToggleItem,
    required this.onSetQuantity,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    final hasSelection = selectedCount > 0;
    final priceStr = group.priceCents > 0
        ? currency.format(group.priceUsd)
        : '';

    return Column(
      children: [
        // Main row
        InkWell(
          onTap: () {
            if (group.count == 1) {
              onToggleItem(group.first.assetId);
            } else {
              onToggleExpand();
            }
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Row(
              children: [
                // Image
                ClipRRect(
                  borderRadius: BorderRadius.circular(AppTheme.r8),
                  child: Container(
                    width: 42,
                    height: 42,
                    color: AppTheme.surface,
                    child: group.fullIconUrl.isNotEmpty
                        ? CachedNetworkImage(
                            imageUrl: group.fullIconUrl,
                            fit: BoxFit.contain,
                            errorWidget: (_, _, _) => const Icon(
                                Icons.image_not_supported,
                                size: 16,
                                color: AppTheme.textDisabled),
                          )
                        : const Icon(Icons.image_not_supported,
                            size: 16, color: AppTheme.textDisabled),
                  ),
                ),
                const SizedBox(width: 10),

                // Name + selection info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        group.displayName,
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600),
                        overflow: TextOverflow.ellipsis,
                        maxLines: 1,
                      ),
                      Row(
                        children: [
                          if (hasSelection)
                            Text(
                              '$selectedCount selected',
                              style: const TextStyle(
                                  fontSize: 11, color: AppTheme.accent),
                            )
                          else if (priceStr.isNotEmpty)
                            Text(
                              priceStr,
                              style: const TextStyle(
                                  fontSize: 11,
                                  color: AppTheme.textMuted),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),

                // Count badge
                if (group.count > 1)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: hasSelection
                          ? AppTheme.accent.withValues(alpha: 0.1)
                          : AppTheme.surface,
                      borderRadius: BorderRadius.circular(AppTheme.r8),
                    ),
                    child: Text(
                      'x${group.count}',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: hasSelection
                            ? AppTheme.accent
                            : AppTheme.textSecondary,
                      ),
                    ),
                  ),

                // Single item: checkbox
                if (group.count == 1)
                  Checkbox(
                    value: hasSelection,
                    onChanged: (_) => onToggleItem(group.first.assetId),
                    activeColor: AppTheme.accent,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                  ),

                // Multi item: expand arrow
                if (group.count > 1)
                  Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: Icon(
                      isExpanded ? Icons.expand_less : Icons.expand_more,
                      size: 20,
                      color: AppTheme.textMuted,
                    ),
                  ),
              ],
            ),
          ),
        ),

        // Expanded: quantity picker + individual items
        if (isExpanded && group.count > 1) ...[
          // Quantity row
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Row(
              children: [
                const Text('Select quantity:',
                    style: TextStyle(
                        fontSize: 12, color: AppTheme.textMuted)),
                const Spacer(),
                _QuantityPicker(
                  value: selectedCount,
                  max: group.count.clamp(0, _kMaxTradeItems - sideSelected + selectedCount),
                  onChanged: onSetQuantity,
                ),
              ],
            ),
          ),

          // Individual items
          Container(
            margin: const EdgeInsets.fromLTRB(14, 4, 14, 8),
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: AppTheme.surface.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(AppTheme.r12),
              border: Border.all(color: AppTheme.border),
            ),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: group.items.map((item) {
                final selected = selectedIds.contains(item.assetId);
                return GestureDetector(
                  onTap: () => onToggleItem(item.assetId),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 120),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                    decoration: BoxDecoration(
                      color: selected
                          ? AppTheme.accent.withValues(alpha: 0.1)
                          : AppTheme.surface,
                      borderRadius: BorderRadius.circular(AppTheme.r8),
                      border: Border.all(
                        color: selected
                            ? AppTheme.accent.withValues(alpha: 0.3)
                            : AppTheme.border,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          selected
                              ? Icons.check_circle
                              : Icons.circle_outlined,
                          size: 14,
                          color: selected
                              ? AppTheme.accent
                              : AppTheme.textDisabled,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          item.floatValue != null
                              ? 'FV ${item.floatValue!.toStringAsFixed(4)}'
                              : '#${item.assetId.length > 4 ? item.assetId.substring(item.assetId.length - 4) : item.assetId}',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight:
                                selected ? FontWeight.w600 : FontWeight.normal,
                            color: selected
                                ? AppTheme.textPrimary
                                : AppTheme.textSecondary,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],

        Divider(height: 1, color: AppTheme.border),
      ],
    );
  }
}

// ==========================================================================
// Sticky bottom trade bar
// ==========================================================================

class _StickyTradeBar extends StatelessWidget {
  final int giveCount;
  final int recvCount;
  final VoidCallback onContinue;

  const _StickyTradeBar({
    required this.giveCount,
    required this.recvCount,
    required this.onContinue,
  });

  @override
  Widget build(BuildContext context) {
    final total = giveCount + recvCount;
    final hasSelection = total > 0;

    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.of(context).padding.bottom + 12,
      ),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        border: Border(top: BorderSide(color: AppTheme.border)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  hasSelection ? '$total items selected' : 'No items selected',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: hasSelection
                        ? AppTheme.textPrimary
                        : AppTheme.textMuted,
                  ),
                ),
                if (hasSelection)
                  Text(
                    'Give $giveCount, Get $recvCount',
                    style: const TextStyle(
                        fontSize: 12, color: AppTheme.textMuted),
                  ),
              ],
            ),
          ),
          SizedBox(
            height: 44,
            child: ElevatedButton.icon(
              onPressed: hasSelection ? onContinue : null,
              icon: const Icon(Icons.arrow_forward, size: 18),
              label: const Text('Continue',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.accent,
                foregroundColor: Colors.black,
                disabledBackgroundColor:
                    AppTheme.accent.withValues(alpha: 0.12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.r12)),
                padding: const EdgeInsets.symmetric(horizontal: 20),
                elevation: 0,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SelectionChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;

  const _SelectionChip({
    required this.label,
    required this.count,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: count > 0 ? 0.1 : 0.04),
        borderRadius: BorderRadius.circular(AppTheme.r8),
        border: Border.all(color: color.withValues(alpha: count > 0 ? 0.2 : 0.06)),
      ),
      child: Text(
        '$label: $count',
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: count > 0 ? color : AppTheme.textMuted,
        ),
      ),
    );
  }
}

class _SideLimitBadge extends StatelessWidget {
  final String label;
  final int count;
  final Color color;

  const _SideLimitBadge({
    required this.label,
    required this.count,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final atLimit = count >= _kMaxTradeItems;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: atLimit ? AppTheme.loss.withValues(alpha: 0.1) : AppTheme.surface,
        borderRadius: BorderRadius.circular(AppTheme.r8),
      ),
      child: Text(
        '$label $count/$_kMaxTradeItems',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: atLimit ? AppTheme.loss : AppTheme.textSecondary,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

// ==========================================================================
// Quantity picker
// ==========================================================================

class _QuantityPicker extends StatefulWidget {
  final int value;
  final int max;
  final ValueChanged<int> onChanged;

  const _QuantityPicker({
    required this.value,
    required this.max,
    required this.onChanged,
  });

  @override
  State<_QuantityPicker> createState() => _QuantityPickerState();
}

class _QuantityPickerState extends State<_QuantityPicker> {
  bool _editing = false;
  late TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _startEditing() {
    setState(() {
      _editing = true;
      _ctrl.text = widget.value > 0 ? '${widget.value}' : '';
    });
    HapticFeedback.selectionClick();
  }

  void _finishEditing() {
    final parsed = int.tryParse(_ctrl.text) ?? 0;
    final clamped = parsed.clamp(0, widget.max.clamp(0, _kMaxTradeItems));
    widget.onChanged(clamped);
    setState(() => _editing = false);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(AppTheme.r12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _PkBtn(
            icon: Icons.remove,
            active: widget.value > 0,
            onTap: () {
              if (widget.value > 0) {
                widget.onChanged(widget.value - 1);
                HapticFeedback.selectionClick();
              }
            },
          ),
          GestureDetector(
            onTap: _editing ? null : _startEditing,
            child: Container(
              constraints: const BoxConstraints(minWidth: 38),
              alignment: Alignment.center,
              child: _editing
                  ? SizedBox(
                      width: 42,
                      height: 24,
                      child: TextField(
                        controller: _ctrl,
                        autofocus: true,
                        textAlign: TextAlign.center,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(3),
                        ],
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                        decoration: const InputDecoration(
                          isDense: true,
                          contentPadding:
                              EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                          border: InputBorder.none,
                        ),
                        onSubmitted: (_) => _finishEditing(),
                        onTapOutside: (_) => _finishEditing(),
                      ),
                    )
                  : Text(
                      '${widget.value}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        fontFeatures: const [FontFeature.tabularFigures()],
                        decoration: TextDecoration.underline,
                        decorationStyle: TextDecorationStyle.dotted,
                        decorationColor: AppTheme.textDisabled,
                      ),
                    ),
            ),
          ),
          _PkBtn(
            icon: Icons.add,
            active: widget.value < widget.max,
            onTap: () {
              if (widget.value < widget.max) {
                widget.onChanged(widget.value + 1);
                HapticFeedback.selectionClick();
              }
            },
          ),
        ],
      ),
    );
  }
}

class _PkBtn extends StatelessWidget {
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  const _PkBtn(
      {required this.icon, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: active ? onTap : null,
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Icon(icon,
            size: 16,
            color:
                active ? AppTheme.textPrimary : AppTheme.textDisabled),
      ),
    );
  }
}

// ==========================================================================
// Step 3: Review & Send
// ==========================================================================

class _ReviewStep extends StatelessWidget {
  final SteamFriend friend;
  final List<TradeOfferItem> myItems;
  final List<TradeOfferItem> partnerItems;
  final Set<String> giveAssetIds;
  final Set<String> recvAssetIds;
  final String message;
  final ValueChanged<String> onMessageChanged;
  final VoidCallback onSend;
  final bool sending;
  final CurrencyInfo currency;

  const _ReviewStep({
    super.key,
    required this.friend,
    required this.myItems,
    required this.partnerItems,
    required this.giveAssetIds,
    required this.recvAssetIds,
    required this.message,
    required this.onMessageChanged,
    required this.onSend,
    required this.sending,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    final giveItems =
        myItems.where((i) => giveAssetIds.contains(i.assetId)).toList();
    final recvItems =
        partnerItems.where((i) => recvAssetIds.contains(i.assetId)).toList();

    final giveValue = giveItems.fold<int>(0, (s, i) => s + i.priceCents);
    final recvValue = recvItems.fold<int>(0, (s, i) => s + i.priceCents);
    final diff = recvValue - giveValue;

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Partner card
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: AppTheme.glass(),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 20,
                        backgroundImage:
                            CachedNetworkImageProvider(friend.avatarUrl),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(friend.personaName,
                                style: const TextStyle(
                                    fontSize: 15, fontWeight: FontWeight.w600)),
                            Text(friend.steamId,
                                style: const TextStyle(
                                    fontSize: 11,
                                    color: AppTheme.textMuted)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ).animate().fadeIn(duration: 300.ms),

                // Value summary
                if (giveValue > 0 || recvValue > 0) ...[
                  const SizedBox(height: 12),
                  _buildValueSummary(giveValue, recvValue, diff, currency)
                      .animate().fadeIn(duration: 300.ms, delay: 50.ms),
                ],

                // Give items
                const SizedBox(height: 16),
                _ReviewSectionHeader(
                    title: 'Items You Give',
                    count: giveItems.length,
                    color: AppTheme.loss),
                const SizedBox(height: 6),
                ...giveItems.map((item) => _ReviewItemTile(item: item, currency: currency)),
                if (giveItems.isEmpty) _emptySection('Nothing (gift)'),

                // Receive items
                const SizedBox(height: 16),
                _ReviewSectionHeader(
                    title: 'Items You Receive',
                    count: recvItems.length,
                    color: AppTheme.profit),
                const SizedBox(height: 6),
                ...recvItems.map((item) => _ReviewItemTile(item: item, currency: currency)),
                if (recvItems.isEmpty) _emptySection('Nothing'),

                // Message
                const SizedBox(height: 16),
                TextField(
                  onChanged: onMessageChanged,
                  maxLength: 128,
                  decoration: InputDecoration(
                    hintText: 'Add a message (optional)',
                    filled: true,
                    fillColor: AppTheme.surface,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppTheme.r12),
                      borderSide: BorderSide.none,
                    ),
                    counterStyle: const TextStyle(
                        fontSize: 10, color: AppTheme.textDisabled),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),

        // Sticky send button
        Container(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 12,
            bottom: MediaQuery.of(context).padding.bottom + 12,
          ),
          decoration: BoxDecoration(
            color: AppTheme.surface,
            border: Border(top: BorderSide(color: AppTheme.border)),
          ),
          child: SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              onPressed: sending ? null : onSend,
              icon: sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.black),
                    )
                  : const Icon(Icons.send, size: 20),
              label: Text(
                sending ? 'Sending...' : 'Send Trade Offer',
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.accent,
                foregroundColor: Colors.black,
                disabledBackgroundColor:
                    AppTheme.accent.withValues(alpha: 0.15),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.r16)),
                elevation: 0,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildValueSummary(int giveValue, int recvValue, int diff, CurrencyInfo currency) {
    final diffPct = giveValue > 0
        ? (diff / giveValue) * 100
        : recvValue > 0
            ? 100.0
            : 0.0;
    final diffColor = diff > 0
        ? AppTheme.profit
        : diff < 0
            ? AppTheme.loss
            : AppTheme.textMuted;

    String verdict;
    if (diffPct >= 15) {
      verdict = const [
        'Bro, you absolutely cooked here',
        'Free money glitch activated',
        'W trade. Hall of fame material'
      ][giveValue % 3];
    } else if (diffPct >= 3) {
      verdict = const [
        'Nice one! You came out on top',
        'Solid trade, clean profit',
        'GG, you won this round'
      ][giveValue % 3];
    } else if (diffPct >= -3) {
      verdict = const [
        'Fair trade. Both happy, nobody scammed',
        'Perfectly balanced, as all things should be',
        "A gentleman's agreement"
      ][giveValue % 3];
    } else if (diffPct >= -15) {
      verdict = const [
        "I'd think twice about this one...",
        'Not your best trade, chief',
        'You might be leaving money on the table'
      ][giveValue % 3];
    } else {
      verdict = const [
        'Bro... who hurt you?',
        "I'm calling the trade police",
        'My brother in Christ, what are you doing?'
      ][giveValue % 3];
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: AppTheme.glass(),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _ReviewValueCol(
                  label: 'You Give',
                  cents: giveValue,
                  color: AppTheme.loss,
                  currency: currency),
              Icon(Icons.swap_horiz,
                  color: AppTheme.textDisabled, size: 24),
              _ReviewValueCol(
                  label: 'You Get',
                  cents: recvValue,
                  color: AppTheme.profit,
                  currency: currency),
              Container(
                  width: 1, height: 36, color: AppTheme.border),
              Column(
                children: [
                  const Text('Diff',
                      style: TextStyle(
                          fontSize: 11, color: AppTheme.textMuted)),
                  const SizedBox(height: 2),
                  Text(
                    currency.formatWithSign(diff / 100),
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: diffColor),
                  ),
                  Text(
                    '${diffPct >= 0 ? '+' : ''}${diffPct.toStringAsFixed(1)}%',
                    style: TextStyle(fontSize: 11, color: diffColor),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: diffColor.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(AppTheme.r12),
            ),
            child: Row(
              children: [
                Icon(diff >= 0 ? Icons.trending_up : Icons.trending_down,
                    size: 18, color: diffColor),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(verdict,
                      style: TextStyle(
                          fontSize: 13,
                          fontStyle: FontStyle.italic,
                          color: diffColor)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptySection(String text) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(AppTheme.r12),
      ),
      child: Center(
        child: Text(text,
            style:
                const TextStyle(fontSize: 13, color: AppTheme.textMuted)),
      ),
    );
  }
}

class _ReviewSectionHeader extends StatelessWidget {
  final String title;
  final int count;
  final Color color;

  const _ReviewSectionHeader({
    required this.title,
    required this.count,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title,
            style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(AppTheme.r8),
          ),
          child: Text('$count',
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600, color: color)),
        ),
      ],
    );
  }
}

class _ReviewValueCol extends StatelessWidget {
  final String label;
  final int cents;
  final Color color;
  final CurrencyInfo currency;

  const _ReviewValueCol({
    required this.label,
    required this.cents,
    required this.color,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    final value = cents / 100;
    return Column(
      children: [
        Text(label,
            style:
                const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
        const SizedBox(height: 2),
        Text(
          currency.format(value),
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.bold,
            color: color,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}

class _ReviewItemTile extends StatelessWidget {
  final TradeOfferItem item;
  final CurrencyInfo currency;

  const _ReviewItemTile({required this.item, required this.currency});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(10),
      decoration: AppTheme.glass(radius: AppTheme.r12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(AppTheme.r8),
            ),
            child: item.fullIconUrl.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: item.fullIconUrl,
                    fit: BoxFit.contain,
                    errorWidget: (_, _, _) => const Icon(
                        Icons.image_not_supported,
                        size: 16,
                        color: AppTheme.textDisabled),
                  )
                : const Icon(Icons.image_not_supported,
                    size: 16, color: AppTheme.textDisabled),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              item.marketHashName ?? 'Unknown',
              style:
                  const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (item.priceCents > 0)
            Text(
              currency.format(item.priceUsd),
              style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary),
            ),
        ],
      ),
    );
  }
}
