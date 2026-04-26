import 'dart:developer' as dev;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auto_sell_repository.dart';
import '../models/auto_sell_execution.dart';
import '../models/auto_sell_rule.dart';

/// Active (non-cancelled) auto-sell rules for the current user. Driven by
/// `GET /api/auto-sell/rules`. Mutations go through [autoSellRulesProvider]'s
/// notifier so we can do optimistic updates on toggle / delete and avoid an
/// extra round-trip for the common case.
final autoSellRulesProvider =
    AsyncNotifierProvider<AutoSellRulesNotifier, List<AutoSellRule>>(
  AutoSellRulesNotifier.new,
);

class AutoSellRulesNotifier extends AsyncNotifier<List<AutoSellRule>> {
  @override
  Future<List<AutoSellRule>> build() async {
    final repo = ref.read(autoSellRepositoryProvider);
    try {
      return await repo.getRules();
    } catch (e) {
      // Same convention as alertsProvider — log + degrade to empty so a
      // single 5xx doesn't show a permanent error screen for free users
      // who'll never hit this endpoint anyway.
      dev.log('Failed to fetch auto-sell rules: $e', name: 'AutoSell');
      return [];
    }
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
    final repo = ref.read(autoSellRepositoryProvider);
    final rule = await repo.createRule(
      accountId: accountId,
      marketHashName: marketHashName,
      triggerType: triggerType,
      triggerPriceUsd: triggerPriceUsd,
      sellPriceUsd: sellPriceUsd,
      sellStrategy: sellStrategy,
      mode: mode,
      cooldownMinutes: cooldownMinutes,
    );
    // Optimistic prepend — server returns the canonical row so we can splice
    // it in without re-fetching the full list.
    final current = state.valueOrNull ?? const <AutoSellRule>[];
    state = AsyncData([rule, ...current]);
    return rule;
  }

  /// Optimistic toggle. Reverts on failure so the switch tracks server
  /// truth — important because PATCH requires premium and a lapsed user
  /// shouldn't see their toggle "stick".
  Future<void> toggleEnabled(int ruleId, bool enabled) async {
    final current = state.valueOrNull ?? const <AutoSellRule>[];
    final idx = current.indexWhere((r) => r.id == ruleId);
    if (idx == -1) return;

    final original = current[idx];
    final next = [...current];
    next[idx] = original.copyWith(enabled: enabled);
    state = AsyncData(next);

    try {
      final repo = ref.read(autoSellRepositoryProvider);
      final updated = await repo.patchRule(ruleId, enabled: enabled);
      final reread = state.valueOrNull ?? const <AutoSellRule>[];
      final j = reread.indexWhere((r) => r.id == ruleId);
      if (j != -1) {
        final list = [...reread]..[j] = updated;
        state = AsyncData(list);
      }
    } catch (e) {
      dev.log('Toggle failed: $e', name: 'AutoSell');
      final reread = state.valueOrNull ?? const <AutoSellRule>[];
      final j = reread.indexWhere((r) => r.id == ruleId);
      if (j != -1) {
        final list = [...reread]..[j] = original;
        state = AsyncData(list);
      }
      rethrow;
    }
  }

  /// Wide-PATCH — used by the edit flow. Returns the canonical row.
  Future<AutoSellRule> updateRule(
    int ruleId, {
    AutoSellMode? mode,
    double? triggerPriceUsd,
    double? sellPriceUsd,
    bool clearSellPrice = false,
    AutoSellStrategy? sellStrategy,
    int? cooldownMinutes,
  }) async {
    final repo = ref.read(autoSellRepositoryProvider);
    final updated = await repo.patchRule(
      ruleId,
      mode: mode,
      triggerPriceUsd: triggerPriceUsd,
      sellPriceUsd: sellPriceUsd,
      clearSellPrice: clearSellPrice,
      sellStrategy: sellStrategy,
      cooldownMinutes: cooldownMinutes,
    );
    final current = state.valueOrNull ?? const <AutoSellRule>[];
    final idx = current.indexWhere((r) => r.id == ruleId);
    if (idx != -1) {
      final list = [...current]..[idx] = updated;
      state = AsyncData(list);
    }
    return updated;
  }

  /// Optimistic remove. Soft-delete server-side, but the row will never come
  /// back via GET (the route filters `cancelled_at IS NULL`).
  Future<void> deleteRule(int ruleId) async {
    final current = state.valueOrNull ?? const <AutoSellRule>[];
    state = AsyncData(current.where((r) => r.id != ruleId).toList());
    try {
      final repo = ref.read(autoSellRepositoryProvider);
      await repo.deleteRule(ruleId);
    } catch (e) {
      dev.log('Delete failed, reverting: $e', name: 'AutoSell');
      ref.invalidateSelf();
      rethrow;
    }
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }
}

/// Execution history for a given rule (or all rules if [ruleId] is null).
/// Family because the detail screen wants per-rule scoping while the list
/// screen / cancel modal wants all-rules.
final autoSellExecutionsProvider =
    FutureProvider.family<List<AutoSellExecution>, int?>((ref, ruleId) async {
  final repo = ref.read(autoSellRepositoryProvider);
  try {
    return await repo.getExecutions(ruleId: ruleId, limit: 50);
  } catch (e) {
    dev.log('Failed to fetch auto-sell executions: $e', name: 'AutoSell');
    return [];
  }
});

/// All currently-cancellable executions across all rules. Polled at a slow
/// cadence (10s) so the cancel-window modal can pick up new fires reactively
/// without us wiring a websocket. The 60s cancel window is wide enough that
/// a 10s poll is fine for UX; under push-notifications the modal can also
/// be triggered explicitly via [pendingExecutionTrigger].
final pendingExecutionsProvider =
    StreamProvider<List<AutoSellExecution>>((ref) async* {
  final repo = ref.read(autoSellRepositoryProvider);

  Future<List<AutoSellExecution>> fetchPending() async {
    try {
      final all = await repo.getExecutions(limit: 50);
      return all.where((e) => e.isCancellable).toList();
    } catch (e) {
      dev.log('pending poll failed: $e', name: 'AutoSell');
      return const [];
    }
  }

  yield await fetchPending();
  // Slow poll — once the user is interacting with the cancel modal the
  // modal owns its own countdown timer. This stream just keeps `isCancellable`
  // up to date for "did a new fire arrive while I was on this screen?".
  await for (final _ in Stream.periodic(const Duration(seconds: 10))) {
    yield await fetchPending();
  }
});

/// Push notifications can call this to surface a specific execution's
/// cancel modal even when the slow poll above hasn't yet picked it up.
/// P5 territory — exposed now so the wiring is in one place when push
/// payload handling lands.
final pendingExecutionTrigger = StateProvider<int?>((_) => null);
