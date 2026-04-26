import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:skin_keeper/features/automation/data/auto_sell_repository.dart';
import 'package:skin_keeper/features/automation/models/auto_sell_execution.dart';
import 'package:skin_keeper/features/automation/models/auto_sell_rule.dart';
import 'package:skin_keeper/features/automation/providers/auto_sell_providers.dart';

class _MockRepo extends Mock implements AutoSellRepository {}

Map<String, dynamic> _ruleJson({
  int id = 1,
  bool enabled = true,
  String mode = 'notify_only',
  String name = 'AK-47 | Redline (Field-Tested)',
  double trigger = 15.0,
}) {
  return {
    'id': id,
    'account_id': 7,
    'market_hash_name': name,
    'trigger_type': 'above',
    'trigger_price_usd': trigger,
    'sell_price_usd': 14.99,
    'sell_strategy': 'fixed',
    'mode': mode,
    'enabled': enabled,
    'cooldown_minutes': 360,
    'created_at': '2026-04-20T12:00:00Z',
    'last_fired_at': null,
    'times_fired': 0,
  };
}

void main() {
  setUpAll(() {
    registerFallbackValue(AutoSellTriggerType.above);
    registerFallbackValue(AutoSellStrategy.fixed);
    registerFallbackValue(AutoSellMode.notifyOnly);
  });

  group('AutoSellRulesNotifier', () {
    late _MockRepo repo;
    late ProviderContainer container;

    setUp(() {
      repo = _MockRepo();
      container = ProviderContainer(overrides: [
        autoSellRepositoryProvider.overrideWithValue(repo),
      ]);
      addTearDown(container.dispose);
    });

    test('build() returns rules from repo', () async {
      when(() => repo.getRules()).thenAnswer(
        (_) async => [
          AutoSellRule.fromJson(_ruleJson(id: 1)),
          AutoSellRule.fromJson(_ruleJson(id: 2, name: 'AWP | Asiimov')),
        ],
      );

      final rules = await container.read(autoSellRulesProvider.future);

      expect(rules, hasLength(2));
      expect(rules.map((r) => r.id), [1, 2]);
    });

    test('createRule prepends optimistically', () async {
      when(() => repo.getRules()).thenAnswer(
        (_) async => [AutoSellRule.fromJson(_ruleJson(id: 1))],
      );
      when(() => repo.createRule(
            accountId: any(named: 'accountId'),
            marketHashName: any(named: 'marketHashName'),
            triggerType: any(named: 'triggerType'),
            triggerPriceUsd: any(named: 'triggerPriceUsd'),
            sellPriceUsd: any(named: 'sellPriceUsd'),
            sellStrategy: any(named: 'sellStrategy'),
            mode: any(named: 'mode'),
            cooldownMinutes: any(named: 'cooldownMinutes'),
          )).thenAnswer(
        (_) async => AutoSellRule.fromJson(_ruleJson(id: 99, name: 'New')),
      );

      // Materialise initial list.
      await container.read(autoSellRulesProvider.future);

      await container
          .read(autoSellRulesProvider.notifier)
          .createRule(
            accountId: 7,
            marketHashName: 'New',
            triggerType: AutoSellTriggerType.above,
            triggerPriceUsd: 10,
            sellPriceUsd: 9.99,
            sellStrategy: AutoSellStrategy.fixed,
            mode: AutoSellMode.notifyOnly,
          );

      final list = container.read(autoSellRulesProvider).value!;
      expect(list, hasLength(2));
      expect(list.first.id, 99);
    });

    test('toggleEnabled updates optimistically and confirms on server',
        () async {
      when(() => repo.getRules()).thenAnswer(
        (_) async => [AutoSellRule.fromJson(_ruleJson(id: 1, enabled: true))],
      );
      when(() => repo.patchRule(any(),
              enabled: any(named: 'enabled'),
              mode: any(named: 'mode'),
              triggerPriceUsd: any(named: 'triggerPriceUsd'),
              sellPriceUsd: any(named: 'sellPriceUsd'),
              clearSellPrice: any(named: 'clearSellPrice'),
              sellStrategy: any(named: 'sellStrategy'),
              cooldownMinutes: any(named: 'cooldownMinutes')))
          .thenAnswer(
        (_) async => AutoSellRule.fromJson(_ruleJson(id: 1, enabled: false)),
      );

      await container.read(autoSellRulesProvider.future);
      await container
          .read(autoSellRulesProvider.notifier)
          .toggleEnabled(1, false);

      final list = container.read(autoSellRulesProvider).value!;
      expect(list.first.enabled, isFalse);
    });

    test('toggleEnabled reverts on PATCH failure', () async {
      when(() => repo.getRules()).thenAnswer(
        (_) async => [AutoSellRule.fromJson(_ruleJson(id: 1, enabled: true))],
      );
      when(() => repo.patchRule(any(),
              enabled: any(named: 'enabled'),
              mode: any(named: 'mode'),
              triggerPriceUsd: any(named: 'triggerPriceUsd'),
              sellPriceUsd: any(named: 'sellPriceUsd'),
              clearSellPrice: any(named: 'clearSellPrice'),
              sellStrategy: any(named: 'sellStrategy'),
              cooldownMinutes: any(named: 'cooldownMinutes')))
          .thenThrow(DioException(requestOptions: RequestOptions(path: '')));

      await container.read(autoSellRulesProvider.future);
      try {
        await container
            .read(autoSellRulesProvider.notifier)
            .toggleEnabled(1, false);
        fail('Expected throw');
      } catch (_) {
        // expected
      }

      final list = container.read(autoSellRulesProvider).value!;
      expect(list.first.enabled, isTrue, reason: 'should revert to original');
    });

    test('deleteRule removes optimistically', () async {
      when(() => repo.getRules()).thenAnswer(
        (_) async => [
          AutoSellRule.fromJson(_ruleJson(id: 1)),
          AutoSellRule.fromJson(_ruleJson(id: 2, name: 'AWP')),
        ],
      );
      when(() => repo.deleteRule(any())).thenAnswer((_) async {});

      await container.read(autoSellRulesProvider.future);
      await container.read(autoSellRulesProvider.notifier).deleteRule(1);

      final list = container.read(autoSellRulesProvider).value!;
      expect(list.map((r) => r.id), [2]);
    });
  });

  group('AutoSellExecution.isCancellable', () {
    test('true when pending and window in the future', () {
      final exec = AutoSellExecution(
        id: 1,
        ruleId: 1,
        firedAt: DateTime.now(),
        marketHashName: 'AK-47',
        triggerPriceUsd: 10,
        actualPriceUsd: 11,
        action: AutoSellAction.pendingWindow,
        cancelWindowExpiresAt:
            DateTime.now().add(const Duration(seconds: 30)),
      );
      expect(exec.isCancellable, isTrue);
    });

    test('false when window expired', () {
      final exec = AutoSellExecution(
        id: 1,
        ruleId: 1,
        firedAt: DateTime.now().subtract(const Duration(minutes: 2)),
        marketHashName: 'AK-47',
        triggerPriceUsd: 10,
        actualPriceUsd: 11,
        action: AutoSellAction.pendingWindow,
        cancelWindowExpiresAt:
            DateTime.now().subtract(const Duration(seconds: 1)),
      );
      expect(exec.isCancellable, isFalse);
    });

    test('false when action is listed (already gone)', () {
      final exec = AutoSellExecution(
        id: 1,
        ruleId: 1,
        firedAt: DateTime.now(),
        marketHashName: 'AK-47',
        triggerPriceUsd: 10,
        actualPriceUsd: 11,
        action: AutoSellAction.listed,
        cancelWindowExpiresAt:
            DateTime.now().add(const Duration(seconds: 30)),
      );
      expect(exec.isCancellable, isFalse);
    });
  });

  group('AutoSellRule wire mappings', () {
    test('round-trips trigger / strategy / mode through enums', () {
      final rule = AutoSellRule.fromJson(_ruleJson(mode: 'auto_list'));
      expect(rule.mode, AutoSellMode.autoList);
      expect(rule.mode.wireValue, 'auto_list');
      expect(rule.triggerType.wireValue, 'above');
      expect(rule.sellStrategy.wireValue, 'fixed');
    });

    test('copyWith preserves identity fields', () {
      final rule = AutoSellRule.fromJson(_ruleJson());
      final next = rule.copyWith(enabled: false);
      expect(next.id, rule.id);
      expect(next.marketHashName, rule.marketHashName);
      expect(next.enabled, isFalse);
    });
  });
}
