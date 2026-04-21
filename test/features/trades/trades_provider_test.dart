import 'package:flutter_test/flutter_test.dart';
import 'package:skin_keeper/features/trades/trades_provider.dart';
import 'package:skin_keeper/models/trade_offer.dart';

import '../../helpers/fixtures.dart';

void main() {
  group('TradeOffer model', () {
    test('fromJson parses all fields', () {
      final offer = TradeOffer.fromJson({
        'id': '42',
        'direction': 'incoming',
        'steamOfferId': 'steam_123',
        'partnerSteamId': '76561198000000001',
        'partnerName': 'TradeBot',
        'message': 'Here is my offer',
        'status': 'pending',
        'isQuickTransfer': false,
        'isInternal': false,
        'valueGiveCents': 5000,
        'valueRecvCents': 4800,
        'createdAt': '2026-03-01T00:00:00Z',
        'updatedAt': '2026-03-01T00:00:00Z',
        'items': [
          {
            'id': 1,
            'side': 'give',
            'assetId': '100',
            'marketHashName': 'AK-47 | Redline (FT)',
            'iconUrl': 'icon1',
            'priceCents': 1250,
          },
          {
            'id': 2,
            'side': 'receive',
            'assetId': '200',
            'marketHashName': 'M4A4 | Howl (FN)',
            'iconUrl': 'icon2',
            'priceCents': 4800,
          },
        ],
      });

      expect(offer.id, '42');
      expect(offer.direction, 'incoming');
      expect(offer.isIncoming, true);
      expect(offer.isPending, true);
      expect(offer.status, 'pending');
      expect(offer.valueGiveCents, 5000);
      expect(offer.valueRecvCents, 4800);
      expect(offer.valueDiffCents, -200);
      expect(offer.items.length, 2);
      expect(offer.giveItems.length, 1);
      expect(offer.receiveItems.length, 1);
    });

    test('isPending is true for awaiting_confirmation', () {
      final offer = sampleTradeOffer(status: 'awaiting_confirmation');
      expect(offer.isPending, true);
    });

    test('isPending is true for on_hold', () {
      final offer = sampleTradeOffer(status: 'on_hold');
      expect(offer.isPending, true);
    });

    test('isPending is false for accepted', () {
      final offer = sampleAcceptedTrade();
      expect(offer.isPending, false);
    });

    test('isPending is false for declined', () {
      final offer = sampleDeclinedTrade();
      expect(offer.isPending, false);
    });

    test('isIncoming is false for outgoing direction', () {
      final offer = sampleTradeOffer(direction: 'outgoing');
      expect(offer.isIncoming, false);
    });

    test('message strips HTML tags', () {
      final offer = TradeOffer.fromJson({
        'id': '1',
        'direction': 'incoming',
        'partnerSteamId': '123',
        'status': 'pending',
        'message': '<b>Hello</b>&nbsp;<i>world</i>',
        'createdAt': '2026-03-01T00:00:00Z',
        'updatedAt': '2026-03-01T00:00:00Z',
      });
      expect(offer.message, 'Hello world');
    });
  });

  group('TradeOfferItem model', () {
    test('fromJson parses correctly', () {
      final item = TradeOfferItem.fromJson({
        'id': 1,
        'side': 'give',
        'assetId': '100',
        'marketHashName': 'AK-47 | Redline (Field-Tested)',
        'iconUrl': 'icon1',
        'floatValue': 0.25,
        'priceCents': 1250,
      });

      expect(item.side, 'give');
      expect(item.assetId, '100');
      expect(item.priceCents, 1250);
      expect(item.displayName, 'Redline');
      expect(item.fullIconUrl, contains('icon1'));
    });

    test('displayName handles items without pipe', () {
      final item = TradeOfferItem.fromJson({
        'id': 1,
        'side': 'give',
        'assetId': '100',
        'marketHashName': 'Operation Broken Fang Case',
      });
      expect(item.displayName, 'Operation Broken Fang Case');
    });

    test('displayName returns Unknown Item when null', () {
      final item = TradeOfferItem.fromJson({
        'id': 1,
        'side': 'give',
        'assetId': '100',
      });
      expect(item.displayName, 'Unknown Item');
    });
  });

  group('TradesState', () {
    test('copyWith preserves unmodified fields', () {
      const state = TradesState(
        offers: [],
        hasMore: true,
        total: 10,
        isLoadingMore: false,
      );

      final updated = state.copyWith(isLoadingMore: true);
      expect(updated.hasMore, true);
      expect(updated.total, 10);
      expect(updated.isLoadingMore, true);
    });
  });

  group('SteamFriend model', () {
    test('fromJson parses correctly', () {
      final friend = SteamFriend.fromJson({
        'steamId': '76561198000000001',
        'personaName': 'TestFriend',
        'avatarUrl': 'https://example.com/avatar.jpg',
        'profileUrl': 'https://steamcommunity.com/id/test',
        'onlineStatus': 'online',
      });

      expect(friend.steamId, '76561198000000001');
      expect(friend.personaName, 'TestFriend');
      expect(friend.isOnline, true);
      expect(friend.isLookingToTrade, false);
    });

    test('isOnline is false for offline status', () {
      final friend = SteamFriend.fromJson({
        'steamId': '1',
        'personaName': 'Test',
        'avatarUrl': '',
        'onlineStatus': 'offline',
      });
      expect(friend.isOnline, false);
    });

    test('isLookingToTrade is true for looking_to_trade', () {
      final friend = SteamFriend.fromJson({
        'steamId': '1',
        'personaName': 'Test',
        'avatarUrl': '',
        'onlineStatus': 'looking_to_trade',
      });
      expect(friend.isLookingToTrade, true);
    });
  });
}
