import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/push_service.dart';
import '../../core/review_service.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../auth/session_gate.dart';
import '../../models/trade_offer.dart';
import '../auth/steam_auth_service.dart';
import 'trade_constants.dart';
import 'trades_provider.dart';
import 'widgets/friend_picker_step.dart';
import 'widgets/item_exchange_step.dart';
import 'widgets/review_step.dart';

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
          0 => FriendPickerStep(
              key: const ValueKey('friends'),
              searchCtrl: _searchCtrl,
              onSelect: _onFriendSelected,
            ),
          1 => ItemExchangeStep(
              key: const ValueKey('items'),
              myItems: _myItems,
              partnerItems: _partnerItems,
              giveAssetIds: _giveAssetIds,
              recvAssetIds: _recvAssetIds,
              loading: _loadingInventories,
              error: _inventoryError,
              onToggleGive: _toggleGive,
              onToggleRecv: _toggleRecv,
              onAddMultipleGive: _addMultipleGive,
              onRemoveMultipleGive: _removeMultipleGive,
              onAddMultipleRecv: _addMultipleRecv,
              onRemoveMultipleRecv: _removeMultipleRecv,
              onContinue: _goToReview,
              currency: currency,
            ),
          2 => ReviewStep(
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
        if (kExcludedTradeNames.contains(i.marketHashName)) return false;
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
        if (_giveAssetIds.length >= kMaxTradeItems) {
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
        if (_recvAssetIds.length >= kMaxTradeItems) {
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
      final remaining = kMaxTradeItems - _giveAssetIds.length;
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
      final remaining = kMaxTradeItems - _recvAssetIds.length;
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
        content: Text('Max $kMaxTradeItems items per side ($side)'),
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

