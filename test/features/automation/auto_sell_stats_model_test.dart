import 'package:flutter_test/flutter_test.dart';
import 'package:skin_keeper/features/automation/models/auto_sell_stats.dart';

void main() {
  group('AutoSellStats.fromJson', () {
    test('parses full response shape correctly', () {
      final json = {
        'stats': {
          'active_rules': 4,
          'auto_list_rules': 2,
          'total_fires': 12,
          'listed_count': 9,
          'cancelled_count': 1,
          'failed_count': 1,
          'notified_count': 1,
          'total_listed_value_usd': 1247.85,
          'avg_premium_over_trigger': 0.42,
          'top_refusal_reasons': [
            {'reason': 'INSUFFICIENT_INVENTORY', 'count': 1},
          ],
        },
        'history': [
          {
            'date': '2026-04-22',
            'fires': 3,
            'listed': 2,
            'listed_value': 240.5,
          },
        ],
        'period_days': 30,
      };

      final stats = AutoSellStats.fromJson(json);

      expect(stats.activeRules, 4);
      expect(stats.autoListRules, 2);
      expect(stats.totalFires, 12);
      expect(stats.listedCount, 9);
      expect(stats.totalListedValueUsd, 1247.85);
      expect(stats.avgPremiumOverTrigger, 0.42);
      expect(stats.topRefusalReasons, hasLength(1));
      expect(stats.topRefusalReasons.first.reason, 'INSUFFICIENT_INVENTORY');
      expect(stats.topRefusalReasons.first.count, 1);
      expect(stats.history, hasLength(1));
      expect(stats.history.first.date, DateTime(2026, 4, 22));
      expect(stats.history.first.fires, 3);
      expect(stats.history.first.listed, 2);
      expect(stats.history.first.listedValue, 240.5);
      expect(stats.periodDays, 30);
    });

    test('handles null top_refusal_reasons (fresh user, no failures yet)', () {
      // Backend coerces NULL → [] but we still defend in the parser in case
      // an older deploy responds with a literal null.
      final json = {
        'stats': {
          'active_rules': 1,
          'auto_list_rules': 0,
          'total_fires': 0,
          'listed_count': 0,
          'cancelled_count': 0,
          'failed_count': 0,
          'notified_count': 0,
          'total_listed_value_usd': 0,
          'avg_premium_over_trigger': 0,
          'top_refusal_reasons': null,
        },
        'history': null,
        'period_days': 30,
      };

      final stats = AutoSellStats.fromJson(json);
      expect(stats.topRefusalReasons, isEmpty);
      expect(stats.history, isEmpty);
    });

    test('successRatePercent returns 0 (not NaN) for zero fires', () {
      final stats = AutoSellStats.empty(30);
      expect(stats.successRatePercent, 0);
      expect(stats.successRatePercent.isNaN, isFalse);
    });

    test('successRatePercent computes correctly when fires > 0', () {
      final stats = AutoSellStats.fromJson({
        'stats': {
          'active_rules': 1,
          'auto_list_rules': 1,
          'total_fires': 10,
          'listed_count': 8,
          'cancelled_count': 1,
          'failed_count': 1,
          'notified_count': 0,
          'total_listed_value_usd': 100.0,
          'avg_premium_over_trigger': 0,
          'top_refusal_reasons': [],
        },
        'history': [],
        'period_days': 7,
      });
      expect(stats.successRatePercent, 80.0);
    });
  });

  group('humanizeRefusalReason', () {
    test('returns friendly title + help for known codes', () {
      final c = humanizeRefusalReason('INSUFFICIENT_INVENTORY');
      expect(c.title, 'Item not in inventory');
      expect(c.help, isNotNull);
      expect(c.help, contains("wasn't in your active account"));
    });

    test('PRICE_MOVED_DURING_WINDOW maps to known copy', () {
      final c = humanizeRefusalReason('PRICE_MOVED_DURING_WINDOW');
      expect(c.title, contains('Price moved'));
      expect(c.help, contains('30%'));
    });

    test('unknown code falls back to raw string with no help', () {
      final c = humanizeRefusalReason('SOME_NEW_CODE_FROM_FUTURE_ENGINE');
      expect(c.title, 'SOME_NEW_CODE_FROM_FUTURE_ENGINE');
      expect(c.help, isNull);
    });

    test('unknown code longer than 60 chars is truncated with ellipsis', () {
      final long = 'A' * 80;
      final c = humanizeRefusalReason(long);
      expect(c.title.length, lessThanOrEqualTo(61));
      expect(c.title.endsWith('…'), isTrue);
    });
  });
}
