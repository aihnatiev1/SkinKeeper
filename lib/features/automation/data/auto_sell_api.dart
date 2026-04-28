import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../models/auto_sell_execution.dart';
import '../models/auto_sell_rule.dart';
import '../models/auto_sell_stats.dart';

/// Thin HTTP layer over the `/api/auto-sell/*` routes. Pure dio (no retrofit) —
/// the project doesn't generate retrofit clients anywhere, and the surface
/// here is small enough that a code-gen step would be more friction than help.
///
/// All methods can throw [DioException]; the repository wraps them with a
/// typed exception layer ([AutoSellException]) so screens can pattern-match
/// on known error codes (`PREMIUM_REQUIRED`, `RULE_LIMIT_EXCEEDED`, …).
class AutoSellApi {
  AutoSellApi(this._client);

  final ApiClient _client;

  Future<List<AutoSellRule>> listRules() async {
    final res = await _client.get('/auto-sell/rules');
    final list = (res.data['rules'] as List)
        .map((j) => AutoSellRule.fromJson(j as Map<String, dynamic>))
        .toList();
    return list;
  }

  Future<AutoSellRule> createRule({
    required int accountId,
    required String marketHashName,
    required AutoSellTriggerType triggerType,
    required double triggerPriceUsd,
    double? sellPriceUsd,
    required AutoSellStrategy sellStrategy,
    required AutoSellMode mode,
    int cooldownMinutes = 360,
  }) async {
    final res = await _client.post('/auto-sell/rules', data: {
      'account_id': accountId,
      'market_hash_name': marketHashName,
      'trigger_type': triggerType.wireValue,
      'trigger_price_usd': triggerPriceUsd,
      if (sellPriceUsd != null) 'sell_price_usd': sellPriceUsd,
      'sell_strategy': sellStrategy.wireValue,
      'mode': mode.wireValue,
      'cooldown_minutes': cooldownMinutes,
    });
    return AutoSellRule.fromJson(res.data as Map<String, dynamic>);
  }

  /// Mirrors the backend ALLOWED_PATCH_COLUMNS allowlist: caller passes only
  /// fields they want to change. `null` means "leave unchanged" — to clear
  /// `sellPriceUsd` (e.g. switching to market_max) pass [clearSellPrice]=true.
  Future<AutoSellRule> patchRule(
    int id, {
    bool? enabled,
    AutoSellMode? mode,
    double? triggerPriceUsd,
    double? sellPriceUsd,
    bool clearSellPrice = false,
    AutoSellStrategy? sellStrategy,
    int? cooldownMinutes,
  }) async {
    final body = <String, dynamic>{};
    if (enabled != null) body['enabled'] = enabled;
    if (mode != null) body['mode'] = mode.wireValue;
    if (triggerPriceUsd != null) body['trigger_price_usd'] = triggerPriceUsd;
    if (clearSellPrice) {
      body['sell_price_usd'] = null;
    } else if (sellPriceUsd != null) {
      body['sell_price_usd'] = sellPriceUsd;
    }
    if (sellStrategy != null) body['sell_strategy'] = sellStrategy.wireValue;
    if (cooldownMinutes != null) body['cooldown_minutes'] = cooldownMinutes;

    final res = await _client.patch('/auto-sell/rules/$id', data: body);
    return AutoSellRule.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> deleteRule(int id) async {
    await _client.delete('/auto-sell/rules/$id');
  }

  Future<List<AutoSellExecution>> listExecutions({int? ruleId, int limit = 50}) async {
    final res = await _client.get('/auto-sell/executions', queryParameters: {
      if (ruleId != null) 'rule_id': ruleId,
      'limit': limit,
    });
    return (res.data['executions'] as List)
        .map((j) => AutoSellExecution.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  /// Aggregated user-scoped stats over the last [days] days. Backend gates
  /// on premium — non-premium callers will throw `PREMIUM_REQUIRED` 403.
  Future<AutoSellStats> getStats({int days = 30}) async {
    final res = await _client.get(
      '/auto-sell/stats',
      queryParameters: {'days': days},
    );
    return AutoSellStats.fromJson(res.data as Map<String, dynamic>);
  }

  /// Cancels a `pending_window` execution. Backend returns 409 if the
  /// window has already expired or the row isn't pending — we surface that
  /// as [AutoSellCancelExpiredException] so the modal can swap to a
  /// "too late" state without re-fetching.
  Future<void> cancelExecution(int id) async {
    try {
      await _client.post('/auto-sell/executions/$id/cancel');
    } on DioException catch (e) {
      if (e.response?.statusCode == 409) {
        throw const AutoSellCancelExpiredException();
      }
      rethrow;
    }
  }
}

final autoSellApiProvider = Provider<AutoSellApi>((ref) {
  return AutoSellApi(ref.read(apiClientProvider));
});

/// Raised when POST /executions/:id/cancel returns 409 — the window is
/// closed or the row is no longer pending. UI: show "Already listed" copy.
class AutoSellCancelExpiredException implements Exception {
  const AutoSellCancelExpiredException();

  @override
  String toString() => 'Cancel window already expired';
}
