import 'package:flutter/material.dart';

class PortfolioPL {
  final int totalInvestedCents;
  final int totalEarnedCents;
  final int realizedProfitCents;
  final int unrealizedProfitCents;
  final int totalProfitCents;
  final double totalProfitPct;
  final int holdingCount;
  final int totalCurrentValueCents;

  const PortfolioPL({
    required this.totalInvestedCents,
    required this.totalEarnedCents,
    required this.realizedProfitCents,
    required this.unrealizedProfitCents,
    required this.totalProfitCents,
    required this.totalProfitPct,
    required this.holdingCount,
    required this.totalCurrentValueCents,
  });

  double get totalInvested => totalInvestedCents / 100;
  double get totalEarned => totalEarnedCents / 100;
  double get realizedProfit => realizedProfitCents / 100;
  double get unrealizedProfit => unrealizedProfitCents / 100;
  double get totalProfit => totalProfitCents / 100;
  double get totalCurrentValue => totalCurrentValueCents / 100;
  bool get isProfitable => totalProfitCents >= 0;
  bool get hasData => totalInvestedCents > 0 || totalEarnedCents > 0;

  factory PortfolioPL.fromJson(Map<String, dynamic> json) {
    return PortfolioPL(
      totalInvestedCents: json['totalInvestedCents'] as int? ?? 0,
      totalEarnedCents: json['totalEarnedCents'] as int? ?? 0,
      realizedProfitCents: json['realizedProfitCents'] as int? ?? 0,
      unrealizedProfitCents: json['unrealizedProfitCents'] as int? ?? 0,
      totalProfitCents: json['totalProfitCents'] as int? ?? 0,
      totalProfitPct: (json['totalProfitPct'] as num?)?.toDouble() ?? 0,
      holdingCount: json['holdingCount'] as int? ?? 0,
      totalCurrentValueCents: json['totalCurrentValueCents'] as int? ?? 0,
    );
  }
}

class ItemPL {
  final String marketHashName;
  final int avgBuyPriceCents;
  final int totalQuantityBought;
  final int totalSpentCents;
  final int totalQuantitySold;
  final int totalEarnedCents;
  final int currentHolding;
  final int realizedProfitCents;
  final int unrealizedProfitCents;
  final int currentPriceCents;
  final int totalProfitCents;
  final double profitPct;
  final DateTime? updatedAt;
  final String? iconUrl;

  const ItemPL({
    required this.marketHashName,
    required this.avgBuyPriceCents,
    required this.totalQuantityBought,
    required this.totalSpentCents,
    required this.totalQuantitySold,
    required this.totalEarnedCents,
    required this.currentHolding,
    required this.realizedProfitCents,
    required this.unrealizedProfitCents,
    required this.currentPriceCents,
    required this.totalProfitCents,
    required this.profitPct,
    this.updatedAt,
    this.iconUrl,
  });

  double get avgBuyPrice => avgBuyPriceCents / 100;
  double get totalSpent => totalSpentCents / 100;
  double get totalEarned => totalEarnedCents / 100;
  double get realizedProfit => realizedProfitCents / 100;
  double get unrealizedProfit => unrealizedProfitCents / 100;
  double get currentPrice => currentPriceCents / 100;
  double get totalProfit => totalProfitCents / 100;
  bool get isProfitable => totalProfitCents >= 0;
  bool get isSoldOut => currentHolding == 0 && totalQuantitySold > 0;
  double get avgSellPrice =>
      totalQuantitySold > 0 ? totalEarnedCents / totalQuantitySold / 100 : 0;

  // Total current market value of held items
  int get totalWorthNowCents => currentPriceCents * currentHolding;
  double get totalWorthNow => totalWorthNowCents / 100;

  // Gain after Steam fees (~15%): realized already net, unrealized needs 15% deducted
  int get gainAfterFeesCents {
    final heldNet = currentHolding > 0
        ? (currentPriceCents * 0.85).round() * currentHolding -
            avgBuyPriceCents * currentHolding
        : 0;
    return realizedProfitCents + heldNet;
  }

  double get gainAfterFees => gainAfterFeesCents / 100;

  String? get imageUrl =>
      iconUrl != null && iconUrl!.isNotEmpty
          ? 'https://community.cloudflare.steamstatic.com/economy/image/$iconUrl/64fx64f'
          : null;

  // "Karambit | Crimson Web (Field-Tested)" → "Karambit | Crimson Web"
  String get displayName =>
      marketHashName.replaceAll(RegExp(r'\s*\([^)]+\)$'), '').trim();

  String get weaponName => marketHashName.split(' | ').first;

  bool get hasCostData => avgBuyPriceCents > 0 || totalSpentCents > 0;

  factory ItemPL.fromJson(Map<String, dynamic> json) {
    return ItemPL(
      marketHashName: json['marketHashName'] as String? ?? '',
      avgBuyPriceCents: json['avgBuyPriceCents'] as int? ?? 0,
      totalQuantityBought: json['totalQuantityBought'] as int? ?? 0,
      totalSpentCents: json['totalSpentCents'] as int? ?? 0,
      totalQuantitySold: json['totalQuantitySold'] as int? ?? 0,
      totalEarnedCents: json['totalEarnedCents'] as int? ?? 0,
      currentHolding: json['currentHolding'] as int? ?? 0,
      realizedProfitCents: json['realizedProfitCents'] as int? ?? 0,
      unrealizedProfitCents: json['unrealizedProfitCents'] as int? ?? 0,
      currentPriceCents: json['currentPriceCents'] as int? ?? 0,
      totalProfitCents: json['totalProfitCents'] as int? ?? 0,
      profitPct: (json['profitPct'] as num?)?.toDouble() ?? 0,
      updatedAt: json['updatedAt'] != null
          ? DateTime.tryParse(json['updatedAt'] as String)
          : null,
      iconUrl: json['iconUrl'] as String?,
    );
  }
}

class AccountPL {
  final int accountId;
  final String steamId;
  final String displayName;
  final String? avatarUrl;
  final PortfolioPL pl;

  const AccountPL({
    required this.accountId,
    required this.steamId,
    required this.displayName,
    this.avatarUrl,
    required this.pl,
  });

  factory AccountPL.fromJson(Map<String, dynamic> json) {
    return AccountPL(
      accountId: json['accountId'] as int,
      steamId: json['steamId'] as String,
      displayName: json['displayName'] as String? ?? 'Unknown',
      avatarUrl: json['avatarUrl'] as String?,
      pl: PortfolioPL.fromJson(json['pl'] as Map<String, dynamic>),
    );
  }
}

class PLHistoryPoint {
  final DateTime date;
  final int totalInvestedCents;
  final int totalCurrentValueCents;
  final int cumulativeProfitCents;
  final int realizedProfitCents;
  final int unrealizedProfitCents;

  const PLHistoryPoint({
    required this.date,
    required this.totalInvestedCents,
    required this.totalCurrentValueCents,
    required this.cumulativeProfitCents,
    required this.realizedProfitCents,
    required this.unrealizedProfitCents,
  });

  double get cumulativeProfit => cumulativeProfitCents / 100;
  double get totalInvested => totalInvestedCents / 100;
  double get totalCurrentValue => totalCurrentValueCents / 100;

  factory PLHistoryPoint.fromJson(Map<String, dynamic> json) {
    return PLHistoryPoint(
      date: DateTime.parse(json['date'] as String),
      totalInvestedCents: json['totalInvestedCents'] as int? ?? 0,
      totalCurrentValueCents: json['totalCurrentValueCents'] as int? ?? 0,
      cumulativeProfitCents: json['cumulativeProfitCents'] as int? ?? 0,
      realizedProfitCents: json['realizedProfitCents'] as int? ?? 0,
      unrealizedProfitCents: json['unrealizedProfitCents'] as int? ?? 0,
    );
  }
}

class Portfolio {
  final int id;
  final String name;
  final Color color;
  final DateTime createdAt;

  const Portfolio({
    required this.id,
    required this.name,
    required this.color,
    required this.createdAt,
  });

  factory Portfolio.fromJson(Map<String, dynamic> json) {
    final hex = (json['color'] as String? ?? '#6366F1').replaceAll('#', '');
    return Portfolio(
      id: json['id'] as int,
      name: json['name'] as String,
      color: Color(int.parse('0xFF$hex')),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  String get colorHex =>
      '#${color.toARGB32().toRadixString(16).substring(2).toUpperCase()}';
}
