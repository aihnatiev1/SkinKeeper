import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/auto_sell_execution.dart';
import '../models/auto_sell_rule.dart';
import 'auto_sell_api.dart';

/// Repository over [AutoSellApi]. Right now it's a pass-through — we don't
/// persist rules in Hive because the active rules list is tiny (max 10) and
/// always behind a network call anyway. If P5 adds a "rules-on-cold-start"
/// requirement we'll grow a Hive box here, but YAGNI for P4.
///
/// Lives behind [autoSellRepositoryProvider] so providers can be overridden
/// in widget tests without mocking dio directly.
class AutoSellRepository {
  AutoSellRepository(this._api);

  final AutoSellApi _api;

  Future<List<AutoSellRule>> getRules() => _api.listRules();

  Future<AutoSellRule> createRule({
    required int accountId,
    required String marketHashName,
    required AutoSellTriggerType triggerType,
    required double triggerPriceUsd,
    double? sellPriceUsd,
    required AutoSellStrategy sellStrategy,
    required AutoSellMode mode,
    int cooldownMinutes = 360,
  }) {
    return _api.createRule(
      accountId: accountId,
      marketHashName: marketHashName,
      triggerType: triggerType,
      triggerPriceUsd: triggerPriceUsd,
      sellPriceUsd: sellPriceUsd,
      sellStrategy: sellStrategy,
      mode: mode,
      cooldownMinutes: cooldownMinutes,
    );
  }

  Future<AutoSellRule> patchRule(
    int id, {
    bool? enabled,
    AutoSellMode? mode,
    double? triggerPriceUsd,
    double? sellPriceUsd,
    bool clearSellPrice = false,
    AutoSellStrategy? sellStrategy,
    int? cooldownMinutes,
  }) {
    return _api.patchRule(
      id,
      enabled: enabled,
      mode: mode,
      triggerPriceUsd: triggerPriceUsd,
      sellPriceUsd: sellPriceUsd,
      clearSellPrice: clearSellPrice,
      sellStrategy: sellStrategy,
      cooldownMinutes: cooldownMinutes,
    );
  }

  Future<void> deleteRule(int id) => _api.deleteRule(id);

  Future<List<AutoSellExecution>> getExecutions({int? ruleId, int limit = 50}) {
    return _api.listExecutions(ruleId: ruleId, limit: limit);
  }

  Future<void> cancelExecution(int id) => _api.cancelExecution(id);
}

final autoSellRepositoryProvider = Provider<AutoSellRepository>((ref) {
  return AutoSellRepository(ref.read(autoSellApiProvider));
});
