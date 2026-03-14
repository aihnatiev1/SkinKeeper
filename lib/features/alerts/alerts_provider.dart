import 'dart:developer' as dev;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../models/alert.dart';

final alertsProvider =
    AsyncNotifierProvider<AlertsNotifier, List<PriceAlert>>(AlertsNotifier.new);

class AlertsNotifier extends AsyncNotifier<List<PriceAlert>> {
  @override
  Future<List<PriceAlert>> build() async {
    final api = ref.read(apiClientProvider);
    try {
      final res = await api.get('/alerts');
      final list = (res.data['alerts'] as List)
          .map((j) => PriceAlert.fromJson(j as Map<String, dynamic>))
          .toList();
      return list;
    } catch (e) {
      dev.log('Failed to fetch alerts: $e', name: 'Alerts');
      return [];
    }
  }

  Future<void> createAlert({
    required String marketHashName,
    required AlertCondition condition,
    required double threshold,
    AlertSource source = AlertSource.any,
    int cooldownMinutes = 60,
  }) async {
    final api = ref.read(apiClientProvider);
    await api.post('/alerts', data: {
      'market_hash_name': marketHashName,
      'condition': condition.name,
      'threshold': threshold,
      'source': source.name,
      'cooldown_minutes': cooldownMinutes,
    });
    ref.invalidateSelf();
  }

  Future<void> toggleAlert(int alertId, bool isActive) async {
    final api = ref.read(apiClientProvider);
    await api.patch('/alerts/$alertId', data: {'is_active': isActive});
    ref.invalidateSelf();
  }

  Future<void> deleteAlert(int alertId) async {
    // Optimistically remove so Dismissible doesn't linger in the tree
    state = AsyncData(
      (state.valueOrNull ?? []).where((a) => a.id != alertId).toList(),
    );
    try {
      final api = ref.read(apiClientProvider);
      await api.delete('/alerts/$alertId');
    } catch (e) {
      ref.invalidateSelf(); // revert on error
    }
  }
}

final alertHistoryProvider =
    FutureProvider<List<AlertHistoryItem>>((ref) async {
  final api = ref.read(apiClientProvider);
  try {
    final res = await api.get('/alerts/history');
    return (res.data['history'] as List)
        .map((j) => AlertHistoryItem.fromJson(j as Map<String, dynamic>))
        .toList();
  } catch (e) {
    dev.log('Failed to fetch alert history: $e', name: 'Alerts');
    return [];
  }
});
