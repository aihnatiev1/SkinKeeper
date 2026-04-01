import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/push_service.dart';
import '../../core/review_service.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../auth/session_gate.dart';
import '../../widgets/glass_sheet.dart';
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
  bool _hasSession = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final connected = await requireSession(context, ref);
      if (!mounted) return;
      if (!connected) {
        // User dismissed gate -- go back
        context.pop();
        return;
      }
      setState(() => _hasSession = true);
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasSession) {
      return Scaffold(
        backgroundColor: AppTheme.bg,
        body: const Center(
          child: CircularProgressIndicator(color: AppTheme.primary),
        ),
      );
    }

    final currency = ref.watch(currencyProvider);
    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 16, 16, 0),
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
                        FocusScope.of(context).unfocus();
                        context.pop();
                      }
                    },
                  ),
                  Expanded(
                    child: Text(
                      _stepTitle.toUpperCase(),
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
        0 => 'Send To',
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
        if (_kExcludedNames.contains(i.marketHashName)) return false;
        if (i.marketHashName!.startsWith('Sealed Graffiti |')) return false;
        return true;
      }).toList();

      // Remove items with active trade protection
      _myItems = _myItems.where((i) {
        final raw = myList.firstWhere(
          (e) => (e as Map<String, dynamic>)['asset_id'] == i.assetId,
          orElse: () => <String, dynamic>{},
        ) as Map<String, dynamic>;
        if (raw['tradable'] == false) return false;
        final ban = raw['trade_ban_until'];
        if (ban != null) {
          final banDate = DateTime.tryParse(ban.toString());
          if (banDate != null && banDate.isAfter(DateTime.now())) return false;
        }
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
      ReviewService.maybeRequestReview();
      PushService.requestPermissionAndRegister();

      if (mounted) {
        FocusScope.of(context).unfocus();
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
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
          child: Text(
            'Choose who to trade with',
            style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
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
                var filtered = query.isEmpty
                    ? friends
                    : friends
                        .where((f) =>
                            f.personaName.toLowerCase().contains(query) ||
                            f.steamId.contains(query))
                        .toList();
                // Sort: online first, then offline
                filtered = [...filtered]..sort((a, b) {
                  final aOnline = a.isOnline ? 0 : 1;
                  final bOnline = b.isOnline ? 0 : 1;
                  return aOnline.compareTo(bOnline);
                });

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
                        backgroundColor: AppTheme.primary,
                        foregroundColor: Colors.white,
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

    final isOffline = !friend.isOnline;

    return Opacity(
      opacity: isOffline ? 0.5 : 1.0,
      child: Container(
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
              Icon(Icons.chevron_right, size: 20, color: AppTheme.textSecondary),
        ),
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
      final msg = giveEmpty
          ? "You haven't selected any items to give."
          : "You haven't selected any items to receive.";
      showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: AppTheme.surface,
          title: Text(giveEmpty ? 'Nothing to give' : 'Nothing requested'),
          content: Text('$msg Continue anyway?'),
          actions: [
            TextButton(
              onPressed: () => ctx.pop(false),
              child: const Text('Go Back'),
            ),
            TextButton(
              onPressed: () => ctx.pop(true),
              child: const Text('Continue Anyway'),
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
                label: 'Give',
                count: widget.giveAssetIds.length,
                color: AppTheme.loss,
              ),
              const SizedBox(width: 4),
              _SideLimitBadge(
                label: 'Get',
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

        // Sticky bottom bar with selection tray
        _StickyTradeBar(
          giveItems: widget.myItems
              .where((i) => widget.giveAssetIds.contains(i.assetId))
              .toList(),
          recvItems: widget.partnerItems
              .where((i) => widget.recvAssetIds.contains(i.assetId))
              .toList(),
          currency: widget.currency,
          onRemoveGive: widget.onToggleGive,
          onRemoveRecv: widget.onToggleRecv,
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
  String _search = '';

  void _showTradeQuantityPicker(
    BuildContext context, {
    required _TradeItemGroup group,
    required Set<String> selectedIds,
    required int sideSelected,
    required CurrencyInfo currency,
    required void Function(List<String>) onAddMultiple,
    required void Function(List<String>) onRemoveMultiple,
  }) {
    final currentlySelected = group.items
        .where((i) => selectedIds.contains(i.assetId))
        .map((i) => i.assetId)
        .toSet();
    final currentCount = currentlySelected.length;
    final maxAllowed = group.count.clamp(0, _kMaxTradeItems - sideSelected + currentCount);

    showGlassSheet(
      context,
      _TradeQuantitySheet(
        group: group,
        currency: currency,
        preSelectedIds: currentlySelected,
        maxQuantity: maxAllowed,
        onConfirm: (chosenIds) {
          final chosenSet = chosenIds.toSet();
          // Items to add (in chosen but not in current)
          final toAdd = chosenIds
              .where((id) => !currentlySelected.contains(id))
              .toList();
          // Items to remove (in current but not in chosen)
          final toRemove = currentlySelected
              .where((id) => !chosenSet.contains(id))
              .toList();
          if (toAdd.isNotEmpty) onAddMultiple(toAdd);
          if (toRemove.isNotEmpty) onRemoveMultiple(toRemove);
        },
      ),
    );
  }

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

              return _GroupTile(
                group: group,
                selectedCount: selectedCount,
                sideSelected: widget.sideSelected,
                selectedIds: widget.selectedIds,
                currency: widget.currency,
                onToggleItem: widget.onToggle,
                onOpenQuantityPicker: () {
                  _showTradeQuantityPicker(
                    context,
                    group: group,
                    selectedIds: widget.selectedIds,
                    sideSelected: widget.sideSelected,
                    currency: widget.currency,
                    onAddMultiple: widget.onAddMultiple,
                    onRemoveMultiple: widget.onRemoveMultiple,
                  );
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
  final Set<String> selectedIds;
  final int sideSelected;
  final VoidCallback onOpenQuantityPicker;
  final ValueChanged<String> onToggleItem;
  final CurrencyInfo currency;

  const _GroupTile({
    required this.group,
    required this.selectedCount,
    required this.selectedIds,
    required this.sideSelected,
    required this.onOpenQuantityPicker,
    required this.onToggleItem,
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
        InkWell(
          onTap: () {
            if (group.count == 1) {
              onToggleItem(group.first.assetId);
            } else {
              HapticFeedback.selectionClick();
              onOpenQuantityPicker();
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
                                  fontSize: 11, color: AppTheme.primary),
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
                          ? AppTheme.primary.withValues(alpha: 0.1)
                          : AppTheme.surface,
                      borderRadius: BorderRadius.circular(AppTheme.r8),
                    ),
                    child: Text(
                      hasSelection ? '$selectedCount / ${group.count}' : 'x${group.count}',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: hasSelection
                            ? AppTheme.primary
                            : AppTheme.textSecondary,
                      ),
                    ),
                  ),

                // Single item: checkbox
                if (group.count == 1)
                  Checkbox(
                    value: hasSelection,
                    onChanged: (_) => onToggleItem(group.first.assetId),
                    activeColor: AppTheme.primary,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                  ),

                // Multi item: chevron to indicate picker
                if (group.count > 1)
                  Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: Icon(
                      Icons.chevron_right_rounded,
                      size: 20,
                      color: AppTheme.textMuted,
                    ),
                  ),
              ],
            ),
          ),
        ),
        Divider(height: 1, color: AppTheme.border),
      ],
    );
  }
}

// ==========================================================================
// Sticky bottom trade bar
// ==========================================================================

class _StickyTradeBar extends StatefulWidget {
  final List<TradeOfferItem> giveItems;
  final List<TradeOfferItem> recvItems;
  final CurrencyInfo currency;
  final ValueChanged<String> onRemoveGive;
  final ValueChanged<String> onRemoveRecv;
  final VoidCallback onContinue;

  const _StickyTradeBar({
    required this.giveItems,
    required this.recvItems,
    required this.currency,
    required this.onRemoveGive,
    required this.onRemoveRecv,
    required this.onContinue,
  });

  @override
  State<_StickyTradeBar> createState() => _StickyTradeBarState();
}

class _StickyTradeBarState extends State<_StickyTradeBar> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final giveCount = widget.giveItems.length;
    final recvCount = widget.recvItems.length;
    final total = giveCount + recvCount;
    final hasSelection = total > 0;

    return Container(
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
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle (only when has items)
            if (hasSelection)
              GestureDetector(
                onTap: () => setState(() => _expanded = !_expanded),
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.only(top: 6, bottom: 2),
                  child: Center(
                    child: Container(
                      width: 36,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppTheme.textDisabled.withValues(alpha: 0.4),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                ),
              ),

            // Header row
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          hasSelection
                              ? '$total ${total == 1 ? 'item' : 'items'} selected'
                              : 'No items selected',
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
                      onPressed: hasSelection ? widget.onContinue : null,
                      icon: const Icon(Icons.arrow_forward, size: 18),
                      label: const Text('Continue',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primary,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor:
                            AppTheme.primary.withValues(alpha: 0.12),
                        shape: RoundedRectangleBorder(
                            borderRadius:
                                BorderRadius.circular(AppTheme.r12)),
                        padding:
                            const EdgeInsets.symmetric(horizontal: 20),
                        elevation: 0,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Expanded tray: horizontal scroll of selected items
            if (hasSelection && _expanded) ...[
              if (giveCount > 0) ...[
                _TraySection(
                  label: 'Give',
                  color: AppTheme.loss,
                  items: widget.giveItems,
                  currency: widget.currency,
                  onRemove: widget.onRemoveGive,
                ),
              ],
              if (recvCount > 0) ...[
                _TraySection(
                  label: 'Get',
                  color: AppTheme.profit,
                  items: widget.recvItems,
                  currency: widget.currency,
                  onRemove: widget.onRemoveRecv,
                ),
              ],
              const SizedBox(height: 4),
            ]
            // Collapsed: horizontal scroll of thumbnails
            else if (hasSelection) ...[
              SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  children: [
                    ...widget.giveItems.map((item) => _TinyThumb(
                          item: item,
                          borderColor: AppTheme.loss,
                          onTap: () {
                            HapticFeedback.lightImpact();
                            widget.onRemoveGive(item.assetId);
                          },
                        )),
                    if (giveCount > 0 && recvCount > 0)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        child: Center(
                          child: Icon(Icons.swap_horiz,
                              size: 16, color: AppTheme.textDisabled),
                        ),
                      ),
                    ...widget.recvItems.map((item) => _TinyThumb(
                          item: item,
                          borderColor: AppTheme.profit,
                          onTap: () {
                            HapticFeedback.lightImpact();
                            widget.onRemoveRecv(item.assetId);
                          },
                        )),
                  ],
                ),
              ),
              const SizedBox(height: 6),
            ],
          ],
        ),
      ),
    );
  }
}

// Tray section (Give / Get) with label + horizontal scroll
class _TraySection extends StatelessWidget {
  final String label;
  final Color color;
  final List<TradeOfferItem> items;
  final CurrencyInfo currency;
  final ValueChanged<String> onRemove;

  const _TraySection({
    required this.label,
    required this.color,
    required this.items,
    required this.currency,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 4),
          child: Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                '$label (${items.length})',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 72,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            itemCount: items.length,
            itemBuilder: (_, index) {
              final item = items[index];
              return Padding(
                padding: const EdgeInsets.only(right: 6),
                child: _TradeMiniCard(
                  item: item,
                  borderColor: color,
                  currency: currency,
                  onTap: () {
                    HapticFeedback.lightImpact();
                    onRemove(item.assetId);
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

// Tiny thumbnail for collapsed tray
class _TinyThumb extends StatelessWidget {
  final TradeOfferItem item;
  final Color borderColor;
  final VoidCallback onTap;

  const _TinyThumb({
    required this.item,
    required this.borderColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        margin: const EdgeInsets.only(right: 5),
        decoration: BoxDecoration(
          color: AppTheme.bgSecondary,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: borderColor.withValues(alpha: 0.4),
            width: 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Padding(
          padding: const EdgeInsets.all(3),
          child: item.fullIconUrl.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: item.fullIconUrl,
                  fit: BoxFit.contain,
                  errorWidget: (_, _, _) => const SizedBox.shrink(),
                )
              : const SizedBox.shrink(),
        ),
      ),
    );
  }
}

// Mini card for expanded tray
class _TradeMiniCard extends StatelessWidget {
  final TradeOfferItem item;
  final Color borderColor;
  final CurrencyInfo currency;
  final VoidCallback onTap;

  const _TradeMiniCard({
    required this.item,
    required this.borderColor,
    required this.currency,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 64,
        decoration: BoxDecoration(
          color: AppTheme.bgSecondary,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: borderColor.withValues(alpha: 0.35),
            width: 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Price
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 3, 4, 0),
              child: Text(
                item.priceCents > 0
                    ? currency.format(item.priceUsd)
                    : '—',
                style: const TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                  letterSpacing: -0.3,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            // Image
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: item.fullIconUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: item.fullIconUrl,
                        fit: BoxFit.contain,
                        errorWidget: (_, _, _) => const Icon(
                          Icons.image_not_supported_rounded,
                          size: 12,
                          color: AppTheme.textDisabled,
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
            ),
            // Float
            if (item.floatValue != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                color: Colors.black.withValues(alpha: 0.2),
                child: Text(
                  item.floatValue!.toStringAsFixed(4),
                  style: TextStyle(
                    fontSize: 7,
                    fontFamily: 'monospace',
                    color: Colors.white.withValues(alpha: 0.5),
                  ),
                  maxLines: 1,
                ),
              ),
          ],
        ),
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
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                disabledBackgroundColor:
                    AppTheme.primary.withValues(alpha: 0.15),
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

// ==========================================================================
// Trade Quantity Picker Sheet (auto-detect: slider for generic, list for unique)
// ==========================================================================

class _TradeQuantitySheet extends StatefulWidget {
  final _TradeItemGroup group;
  final CurrencyInfo currency;
  final Set<String> preSelectedIds;
  final int maxQuantity;
  final void Function(List<String> assetIds) onConfirm;

  const _TradeQuantitySheet({
    required this.group,
    required this.currency,
    required this.preSelectedIds,
    required this.maxQuantity,
    required this.onConfirm,
  });

  @override
  State<_TradeQuantitySheet> createState() => _TradeQuantitySheetState();
}

class _TradeQuantitySheetState extends State<_TradeQuantitySheet> {
  late bool _hasUniqueItems;
  // Slider mode state
  late int _quantity;
  // Manual mode state
  late Set<String> _manualSelected;

  @override
  void initState() {
    super.initState();
    // Auto-detect: if any item has a float value, items are unique
    _hasUniqueItems = widget.group.items.any((i) => i.floatValue != null);

    final preSelected = widget.group.items
        .where((i) => widget.preSelectedIds.contains(i.assetId))
        .map((i) => i.assetId)
        .toSet();

    _quantity = preSelected.length;
    _manualSelected = Set<String>.from(preSelected);
  }

  int get _selectedCount => _hasUniqueItems ? _manualSelected.length : _quantity;

  @override
  Widget build(BuildContext context) {
    final max = widget.maxQuantity;
    final totalPrice = widget.group.priceUsd * _selectedCount;

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(AppTheme.r20)),
        border: const Border(
          top: BorderSide(color: AppTheme.primary, width: 2),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 14),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textDisabled,
                borderRadius: BorderRadius.circular(2),
              ),
            ),

            // Item preview
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppTheme.r8),
                    child: Container(
                      width: 48,
                      height: 48,
                      color: AppTheme.surface,
                      child: widget.group.fullIconUrl.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: widget.group.fullIconUrl,
                              fit: BoxFit.contain,
                            )
                          : const Icon(Icons.image_not_supported,
                              color: AppTheme.textDisabled),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.group.displayName,
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w600),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (widget.group.priceCents > 0)
                          Text(
                            widget.currency.format(widget.group.priceUsd),
                            style: const TextStyle(
                                fontSize: 12, color: AppTheme.textMuted),
                          ),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'x${widget.group.count}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.primary,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            if (max < widget.group.count)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Limited to $max (trade max $_kMaxTradeItems per side)',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppTheme.warning.withValues(alpha: 0.8),
                  ),
                ),
              ),

            const SizedBox(height: 16),

            // --- Content: slider or manual list ---
            if (_hasUniqueItems)
              _buildManualList(max)
            else
              _buildSlider(max),

            const SizedBox(height: 8),

            // Total + confirm
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Row(
                children: [
                  if (widget.group.priceCents > 0)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Total value',
                          style: TextStyle(fontSize: 11, color: AppTheme.textMuted),
                        ),
                        Text(
                          widget.currency.format(totalPrice),
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  const Spacer(),
                  GestureDetector(
                    onTap: () {
                      HapticFeedback.mediumImpact();
                      if (_hasUniqueItems) {
                        widget.onConfirm(_manualSelected.toList());
                      } else {
                        final ids = widget.group.items
                            .take(_quantity)
                            .map((i) => i.assetId)
                            .toList();
                        widget.onConfirm(ids);
                      }
                      context.pop();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 24, vertical: 12),
                      decoration: BoxDecoration(
                        color: AppTheme.primary,
                        borderRadius: BorderRadius.circular(AppTheme.r12),
                        boxShadow: [
                          BoxShadow(
                            color: AppTheme.primary.withValues(alpha: 0.3),
                            blurRadius: 10,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Text(
                        _selectedCount == 0 ? 'Clear' : 'Select $_selectedCount',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Slider mode (generic items: cases, stickers, etc.) ──
  Widget _buildSlider(int max) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _QtyCircleBtn(
                icon: Icons.remove_rounded,
                enabled: _quantity > 0,
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _quantity--);
                },
              ),
              const SizedBox(width: 20),
              Text(
                '$_quantity',
                style: const TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  letterSpacing: -1,
                ),
              ),
              const SizedBox(width: 20),
              _QtyCircleBtn(
                icon: Icons.add_rounded,
                enabled: _quantity < max,
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _quantity++);
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (max > 2)
            SliderTheme(
              data: SliderThemeData(
                activeTrackColor: AppTheme.primary,
                inactiveTrackColor: AppTheme.primary.withValues(alpha: 0.15),
                thumbColor: AppTheme.primary,
                overlayColor: AppTheme.primary.withValues(alpha: 0.12),
                trackHeight: 4,
                thumbShape:
                    const RoundSliderThumbShape(enabledThumbRadius: 8),
              ),
              child: Slider(
                value: _quantity.toDouble(),
                min: 0,
                max: max.toDouble(),
                divisions: max,
                onChanged: (v) {
                  final newQty = v.round();
                  if (newQty != _quantity) {
                    HapticFeedback.selectionClick();
                    setState(() => _quantity = newQty);
                  }
                },
              ),
            ),
          if (max > 3)
            Padding(
              padding: const EdgeInsets.only(top: 4, bottom: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _TradeQuickBtn(
                    label: '0',
                    selected: _quantity == 0,
                    onTap: () => setState(() => _quantity = 0),
                  ),
                  if (max >= 10)
                    _TradeQuickBtn(
                      label: '${max ~/ 4}',
                      selected: _quantity == max ~/ 4,
                      onTap: () => setState(() => _quantity = max ~/ 4),
                    ),
                  if (max >= 4)
                    _TradeQuickBtn(
                      label: '${max ~/ 2}',
                      selected: _quantity == max ~/ 2,
                      onTap: () => setState(() => _quantity = max ~/ 2),
                    ),
                  _TradeQuickBtn(
                    label: 'Max ($max)',
                    selected: _quantity == max,
                    onTap: () => setState(() => _quantity = max),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ── Manual mode (unique items: weapons with floats, phases, etc.) ──
  Widget _buildManualList(int max) {
    // Sort by float ascending (best float first)
    final sorted = List<TradeOfferItem>.from(widget.group.items)
      ..sort((a, b) => (a.floatValue ?? 999).compareTo(b.floatValue ?? 999));

    return Column(
      children: [
        // Select all / clear row
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            children: [
              Text(
                '${_manualSelected.length} selected',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.primary,
                ),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() {
                    if (_manualSelected.length == max || _manualSelected.length == sorted.length) {
                      _manualSelected.clear();
                    } else {
                      _manualSelected = sorted
                          .take(max)
                          .map((i) => i.assetId)
                          .toSet();
                    }
                  });
                },
                child: Text(
                  _manualSelected.length == max || _manualSelected.length == sorted.length
                      ? 'Clear all'
                      : 'Select all',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.primary.withValues(alpha: 0.8),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        // Scrollable list
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 280),
          child: ListView.separated(
            shrinkWrap: true,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            itemCount: sorted.length,
            separatorBuilder: (_, _) => Divider(height: 1, color: AppTheme.border),
            itemBuilder: (_, index) {
              final item = sorted[index];
              final selected = _manualSelected.contains(item.assetId);
              final atLimit = !selected && _manualSelected.length >= max;

              return InkWell(
                onTap: atLimit && !selected
                    ? null
                    : () {
                        HapticFeedback.selectionClick();
                        setState(() {
                          if (selected) {
                            _manualSelected.remove(item.assetId);
                          } else {
                            _manualSelected.add(item.assetId);
                          }
                        });
                      },
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
                  child: Row(
                    children: [
                      Icon(
                        selected
                            ? Icons.check_circle_rounded
                            : Icons.circle_outlined,
                        size: 20,
                        color: selected
                            ? AppTheme.primary
                            : atLimit
                                ? AppTheme.textDisabled.withValues(alpha: 0.3)
                                : AppTheme.textDisabled,
                      ),
                      const SizedBox(width: 10),
                      // Float value
                      if (item.floatValue != null)
                        Expanded(
                          child: Text(
                            item.floatValue!.toStringAsFixed(8),
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: selected
                                  ? FontWeight.w600
                                  : FontWeight.normal,
                              fontFamily: 'monospace',
                              color: selected
                                  ? Colors.white
                                  : atLimit
                                      ? AppTheme.textDisabled
                                      : AppTheme.textSecondary,
                            ),
                          ),
                        )
                      else
                        Expanded(
                          child: Text(
                            '#${item.assetId.length > 6 ? item.assetId.substring(item.assetId.length - 6) : item.assetId}',
                            style: TextStyle(
                              fontSize: 13,
                              color: atLimit
                                  ? AppTheme.textDisabled
                                  : AppTheme.textSecondary,
                            ),
                          ),
                        ),
                      // Price
                      if (item.priceCents > 0)
                        Text(
                          widget.currency.format(item.priceUsd),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: selected
                                ? Colors.white
                                : AppTheme.textMuted,
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _QtyCircleBtn extends StatelessWidget {
  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;

  const _QtyCircleBtn({
    required this.icon,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: enabled
              ? AppTheme.primary.withValues(alpha: 0.15)
              : Colors.white.withValues(alpha: 0.03),
          shape: BoxShape.circle,
          border: Border.all(
            color: enabled
                ? AppTheme.primary.withValues(alpha: 0.3)
                : Colors.white.withValues(alpha: 0.05),
          ),
        ),
        child: Icon(
          icon,
          size: 20,
          color: enabled ? AppTheme.primary : AppTheme.textDisabled,
        ),
      ),
    );
  }
}

class _TradeQuickBtn extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _TradeQuickBtn({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected
                ? AppTheme.primary.withValues(alpha: 0.2)
                : Colors.white.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: selected
                  ? AppTheme.primary.withValues(alpha: 0.4)
                  : Colors.white.withValues(alpha: 0.08),
              width: 0.5,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: selected ? AppTheme.primary : AppTheme.textMuted,
            ),
          ),
        ),
      ),
    );
  }
}
