import 'package:skin_keeper/models/inventory_item.dart';
import 'package:skin_keeper/models/trade_offer.dart';
import 'package:skin_keeper/models/user.dart';
import 'package:skin_keeper/models/profit_loss.dart';
import 'package:skin_keeper/features/portfolio/portfolio_provider.dart';

// ---- Inventory Items --------------------------------------------------------

InventoryItem sampleInventoryItem({
  String assetId = '12345',
  String marketHashName = 'AK-47 | Redline (Field-Tested)',
  String iconUrl = 'test_icon',
  String? wear = 'Field-Tested',
  double? floatValue = 0.25,
  bool tradable = true,
  String? rarity = 'Classified',
  String? rarityColor = 'D32CE6',
  Map<String, double> prices = const {'steam': 12.50, 'skinport': 11.80},
  String? inspectLink,
  int? paintSeed,
  int? paintIndex,
  List<StickerInfo> stickers = const [],
  List<CharmInfo> charms = const [],
  DateTime? tradeBanUntil,
  int? accountId,
}) {
  return InventoryItem(
    assetId: assetId,
    marketHashName: marketHashName,
    iconUrl: iconUrl,
    wear: wear,
    floatValue: floatValue,
    tradable: tradable,
    rarity: rarity,
    rarityColor: rarityColor,
    prices: prices,
    inspectLink: inspectLink,
    paintSeed: paintSeed,
    paintIndex: paintIndex,
    stickers: stickers,
    charms: charms,
    tradeBanUntil: tradeBanUntil,
    accountId: accountId,
  );
}

InventoryItem sampleDopplerItem({
  String assetId = '99001',
  int paintIndex = 415, // Ruby
}) {
  return sampleInventoryItem(
    assetId: assetId,
    marketHashName: 'Karambit | Doppler (Factory New)',
    wear: 'Factory New',
    floatValue: 0.008,
    paintIndex: paintIndex,
    prices: {'steam': 1500.00, 'skinport': 1420.00},
    rarity: 'Covert',
    rarityColor: 'EB4B4B',
  );
}

InventoryItem sampleNonWeaponItem({
  String assetId = '88001',
}) {
  return sampleInventoryItem(
    assetId: assetId,
    marketHashName: 'Sticker | Natus Vincere (Holo) | Katowice 2014',
    wear: null,
    floatValue: null,
    prices: {'steam': 4500.00},
    rarity: 'High Grade',
    rarityColor: '4B69FF',
  );
}

InventoryItem sampleTradeBannedItem({
  String assetId = '77001',
}) {
  return sampleInventoryItem(
    assetId: assetId,
    tradable: false,
    tradeBanUntil: DateTime.now().toUtc().add(const Duration(days: 7)),
  );
}

List<InventoryItem> sampleInventoryList({int count = 5}) {
  return List.generate(
    count,
    (i) => sampleInventoryItem(
      assetId: '${10000 + i}',
      marketHashName: 'Item $i | Skin $i (Field-Tested)',
      prices: {'steam': 10.0 + i * 5},
    ),
  );
}

/// JSON representation matching API response format.
Map<String, dynamic> sampleInventoryItemJson({
  String assetId = '12345',
  String marketHashName = 'AK-47 | Redline (Field-Tested)',
}) {
  return {
    'asset_id': assetId,
    'market_hash_name': marketHashName,
    'icon_url': 'test_icon',
    'wear': 'Field-Tested',
    'float_value': 0.25,
    'tradable': true,
    'rarity': 'Classified',
    'rarity_color': 'D32CE6',
    'prices': {'steam': 12.50, 'skinport': 11.80},
    'stickers': <dynamic>[],
    'charms': <dynamic>[],
  };
}

// ---- Trade Offers -----------------------------------------------------------

TradeOffer sampleTradeOffer({
  String id = '1',
  String direction = 'incoming',
  String status = 'pending',
  String partnerSteamId = '76561198000000001',
  String? partnerName = 'TradeBot',
  int valueGiveCents = 5000,
  int valueRecvCents = 4800,
  List<TradeOfferItem> items = const [],
}) {
  return TradeOffer(
    id: id,
    direction: direction,
    status: status,
    partnerSteamId: partnerSteamId,
    partnerName: partnerName,
    valueGiveCents: valueGiveCents,
    valueRecvCents: valueRecvCents,
    createdAt: DateTime(2026, 3, 1),
    updatedAt: DateTime(2026, 3, 1),
    items: items.isEmpty
        ? [
            const TradeOfferItem(
              id: 1,
              side: 'give',
              assetId: '100',
              marketHashName: 'AK-47 | Redline (Field-Tested)',
              iconUrl: 'icon1',
              priceCents: 1250,
            ),
            const TradeOfferItem(
              id: 2,
              side: 'receive',
              assetId: '200',
              marketHashName: 'M4A4 | Howl (Field-Tested)',
              iconUrl: 'icon2',
              priceCents: 4800,
            ),
          ]
        : items,
  );
}

TradeOffer sampleAcceptedTrade() =>
    sampleTradeOffer(id: '2', status: 'accepted');

TradeOffer sampleDeclinedTrade() =>
    sampleTradeOffer(id: '3', status: 'declined', direction: 'outgoing');

// ---- Users ------------------------------------------------------------------

SteamUser sampleUser({
  bool isPremium = false,
  int? activeAccountId = 1,
  int accountCount = 1,
}) {
  return SteamUser(
    steamId: '76561190907760781',
    displayName: 'TestPlayer',
    avatarUrl: 'https://example.com/avatar.jpg',
    isPremium: isPremium,
    premiumUntil: isPremium ? DateTime(2027, 1, 1) : null,
    activeAccountId: activeAccountId,
    accountCount: accountCount,
  );
}

SteamUser samplePremiumUser() => sampleUser(
      isPremium: true,
      accountCount: 3,
    );

Map<String, dynamic> sampleUserJson({bool isPremium = false}) {
  return {
    'steam_id': '76561190907760781',
    'display_name': 'TestPlayer',
    'avatar_url': 'https://example.com/avatar.jpg',
    'is_premium': isPremium,
    'active_account_id': 1,
    'account_count': 1,
  };
}

// ---- Portfolio --------------------------------------------------------------

PortfolioSummary samplePortfolioSummary({
  double totalValue = 1234.56,
  double change24h = 45.20,
  double change24hPct = 3.8,
  double change7d = 120.00,
  double change7dPct = 10.8,
  int itemCount = 47,
}) {
  return PortfolioSummary(
    totalValue: totalValue,
    change24h: change24h,
    change24hPct: change24hPct,
    change7d: change7d,
    change7dPct: change7dPct,
    itemCount: itemCount,
    history: [
      PortfolioHistoryPoint(date: DateTime(2026, 2, 28), value: 1189.36),
      PortfolioHistoryPoint(date: DateTime(2026, 3, 1), value: 1234.56),
    ],
  );
}

Map<String, dynamic> samplePortfolioSummaryJson() {
  return {
    'total_value': 1234.56,
    'change_24h': 45.20,
    'change_24h_pct': 3.8,
    'change_7d': 120.00,
    'change_7d_pct': 10.8,
    'item_count': 47,
    'history': [
      {'date': '2026-02-28', 'value': 1189.36},
      {'date': '2026-03-01', 'value': 1234.56},
    ],
  };
}

// ---- Profit/Loss ------------------------------------------------------------

PortfolioPL samplePortfolioPL({
  int totalProfitCents = 18850,
  double totalProfitPct = 28.91,
}) {
  return PortfolioPL(
    totalInvestedCents: 65200,
    totalEarnedCents: 18950,
    realizedProfitCents: 4730,
    unrealizedProfitCents: 14120,
    totalProfitCents: totalProfitCents,
    totalProfitPct: totalProfitPct,
    holdingCount: 47,
    totalCurrentValueCents: 79409,
  );
}

ItemPL sampleItemPL({
  String marketHashName = 'AK-47 | Redline (Field-Tested)',
  int totalProfitCents = 5600,
  double profitPct = 35.0,
}) {
  return ItemPL(
    marketHashName: marketHashName,
    avgBuyPriceCents: 3200,
    totalQuantityBought: 5,
    totalSpentCents: 16000,
    totalQuantitySold: 2,
    totalEarnedCents: 8400,
    currentHolding: 3,
    realizedProfitCents: 2000,
    unrealizedProfitCents: 3600,
    currentPriceCents: 4400,
    totalProfitCents: totalProfitCents,
    profitPct: profitPct,
  );
}

