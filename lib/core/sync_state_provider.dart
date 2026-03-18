import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Global sync state — tracks whether background data sync is in progress.
/// Used by dashboard/screens to show "syncing" indicator after login.
class SyncState {
  final bool inventorySyncing;
  final bool transactionsSyncing;
  final bool tradesSyncing;

  const SyncState({
    this.inventorySyncing = false,
    this.transactionsSyncing = false,
    this.tradesSyncing = false,
  });

  bool get isSyncing => inventorySyncing || transactionsSyncing || tradesSyncing;

  String get label {
    if (inventorySyncing) return 'Syncing inventory...';
    if (transactionsSyncing) return 'Syncing transactions...';
    if (tradesSyncing) return 'Syncing trades...';
    return '';
  }

  SyncState copyWith({
    bool? inventorySyncing,
    bool? transactionsSyncing,
    bool? tradesSyncing,
  }) =>
      SyncState(
        inventorySyncing: inventorySyncing ?? this.inventorySyncing,
        transactionsSyncing: transactionsSyncing ?? this.transactionsSyncing,
        tradesSyncing: tradesSyncing ?? this.tradesSyncing,
      );
}

final syncStateProvider =
    StateNotifierProvider<SyncStateNotifier, SyncState>((ref) {
  return SyncStateNotifier();
});

class SyncStateNotifier extends StateNotifier<SyncState> {
  SyncStateNotifier() : super(const SyncState());

  void setInventory(bool v) => state = state.copyWith(inventorySyncing: v);
  void setTransactions(bool v) => state = state.copyWith(transactionsSyncing: v);
  void setTrades(bool v) => state = state.copyWith(tradesSyncing: v);
}
