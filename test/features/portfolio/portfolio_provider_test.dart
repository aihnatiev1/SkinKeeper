import 'package:flutter_test/flutter_test.dart';
import 'package:skin_keeper/features/portfolio/portfolio_provider.dart';
import 'package:skin_keeper/models/profit_loss.dart';

import '../../helpers/fixtures.dart';

void main() {
  group('PortfolioSummary', () {
    test('fromJson parses correctly', () {
      final json = samplePortfolioSummaryJson();
      final summary = PortfolioSummary.fromJson(json);

      expect(summary.totalValueCents, 123456);
      expect(summary.change24hCents, 4520);
      expect(summary.change24hPct, 3.8);
      expect(summary.change7dCents, 12000);
      expect(summary.change7dPct, 10.8);
      expect(summary.itemCount, 47);
      expect(summary.history.length, 2);
    });

    test('PortfolioHistoryPoint fromJson parses date and value', () {
      final point = PortfolioHistoryPoint.fromJson({
        'date': '2026-03-01',
        'value': 1234.56,
      });
      expect(point.date, DateTime(2026, 3, 1));
      expect(point.valueCents, 123456);
    });
  });

  group('PortfolioPL', () {
    test('fromJson parses all fields', () {
      final pl = PortfolioPL.fromJson({
        'totalInvestedCents': 65200,
        'totalEarnedCents': 18950,
        'realizedProfitCents': 4730,
        'unrealizedProfitCents': 14120,
        'totalProfitCents': 18850,
        'totalProfitPct': 28.91,
        'holdingCount': 47,
        'totalCurrentValueCents': 79409,
      });

      expect(pl.totalInvested, 652.0);
      expect(pl.totalEarned, 189.50);
      expect(pl.realizedProfit, 47.30);
      expect(pl.unrealizedProfit, 141.20);
      expect(pl.totalProfit, 188.50);
      expect(pl.totalProfitPct, 28.91);
      expect(pl.holdingCount, 47);
      expect(pl.isProfitable, true);
      expect(pl.hasData, true);
    });

    test('isProfitable returns false for negative profit', () {
      final pl = samplePortfolioPL(totalProfitCents: -100);
      expect(pl.isProfitable, false);
    });

    test('hasData returns false when no investment', () {
      const pl = PortfolioPL(
        totalInvestedCents: 0,
        totalEarnedCents: 0,
        realizedProfitCents: 0,
        unrealizedProfitCents: 0,
        totalProfitCents: 0,
        totalProfitPct: 0,
        holdingCount: 0,
        totalCurrentValueCents: 0,
      );
      expect(pl.hasData, false);
    });
  });

  group('ItemPL', () {
    test('fromJson parses correctly', () {
      final item = ItemPL.fromJson({
        'marketHashName': 'AK-47 | Redline (Field-Tested)',
        'avgBuyPriceCents': 3200,
        'totalQuantityBought': 5,
        'totalSpentCents': 16000,
        'totalQuantitySold': 2,
        'totalEarnedCents': 8400,
        'currentHolding': 3,
        'realizedProfitCents': 2000,
        'unrealizedProfitCents': 3600,
        'currentPriceCents': 4400,
        'totalProfitCents': 5600,
        'profitPct': 35.0,
      });

      expect(item.avgBuyPrice, 32.0);
      expect(item.totalSpent, 160.0);
      expect(item.currentPrice, 44.0);
      expect(item.totalProfit, 56.0);
      expect(item.isProfitable, true);
      // displayName strips wear parens, keeps the full weapon|skin label.
      expect(item.displayName, 'AK-47 | Redline');
      expect(item.weaponName, 'AK-47');
    });

    test('displayName strips wear from market hash name', () {
      final item = sampleItemPL(
          marketHashName: 'M4A4 | Howl (Factory New)');
      expect(item.displayName, 'M4A4 | Howl');
    });

    test('isProfitable is false for loss items', () {
      final item = sampleItemPL(totalProfitCents: -200);
      expect(item.isProfitable, false);
    });
  });

  group('PLHistoryPoint', () {
    test('fromJson parses correctly', () {
      final point = PLHistoryPoint.fromJson({
        'date': '2026-03-01',
        'totalInvestedCents': 65200,
        'totalCurrentValueCents': 79409,
        'cumulativeProfitCents': 14209,
        'realizedProfitCents': 4730,
        'unrealizedProfitCents': 9479,
      });

      expect(point.date, DateTime(2026, 3, 1));
      expect(point.totalInvested, 652.0);
      expect(point.totalCurrentValue, 794.09);
      expect(point.cumulativeProfit, 142.09);
    });
  });

  group('AccountPL', () {
    test('fromJson parses correctly', () {
      final account = AccountPL.fromJson({
        'accountId': 1,
        'steamId': '76561198000000001',
        'displayName': 'TestAccount',
        'avatarUrl': 'https://example.com/avatar.jpg',
        'pl': {
          'totalInvestedCents': 65200,
          'totalEarnedCents': 18950,
          'realizedProfitCents': 4730,
          'unrealizedProfitCents': 14120,
          'totalProfitCents': 18850,
          'totalProfitPct': 28.91,
          'holdingCount': 47,
          'totalCurrentValueCents': 79409,
        },
      });

      expect(account.accountId, 1);
      expect(account.displayName, 'TestAccount');
      expect(account.pl.totalProfitPct, 28.91);
    });
  });
}
