/// Execution log entry — one row per rule fire. Mirrors the row shape of
/// `GET /api/auto-sell/executions` (see `backend/src/routes/autoSell.ts`).
library;

/// Action taken by the auto-sell engine for a single fire.
///
/// - [notified]: pure notification (mode=notify_only or MIN-guard refused).
/// - [pendingWindow]: 60-second cancel window is open. UI listens for these
///   and surfaces a cancel modal.
/// - [listed]: cancel window elapsed, listing was created via sellOperations.
/// - [cancelled]: user cancelled within the window.
/// - [failed]: createOperation threw or no tradable asset was found.
enum AutoSellAction { notified, pendingWindow, listed, cancelled, failed }

extension AutoSellActionWire on AutoSellAction {
  String get wireValue => switch (this) {
        AutoSellAction.notified => 'notified',
        AutoSellAction.pendingWindow => 'pending_window',
        AutoSellAction.listed => 'listed',
        AutoSellAction.cancelled => 'cancelled',
        AutoSellAction.failed => 'failed',
      };

  static AutoSellAction fromWire(String s) => switch (s) {
        'notified' => AutoSellAction.notified,
        'pending_window' => AutoSellAction.pendingWindow,
        'listed' => AutoSellAction.listed,
        'cancelled' => AutoSellAction.cancelled,
        'failed' => AutoSellAction.failed,
        _ => AutoSellAction.failed,
      };
}

class AutoSellExecution {
  final int id;
  final int ruleId;
  final DateTime firedAt;
  final String marketHashName;

  /// Threshold from the rule at fire time (snapshotted — rule may have been
  /// edited since).
  final double triggerPriceUsd;

  /// Market price observed at fire time.
  final double actualPriceUsd;

  /// Computed listing price. `null` for `notified` outcomes that never reach
  /// a listing decision.
  final double? intendedListPriceUsd;

  final AutoSellAction action;

  /// Set once the listing actually gets created (i.e. action transitions to
  /// `listed`). Useful for cross-linking to Steam listings table.
  final int? sellOperationId;

  /// Steam listing ID once Steam confirms creation. Lags `sellOperationId`
  /// by one async hop.
  final String? listingId;

  /// Populated for [AutoSellAction.failed] and [AutoSellAction.notified]
  /// when a MIN-guard refused (`refusalReason` from the engine).
  final String? errorMessage;

  /// When the 60-second cancel window expires. Always set by the engine
  /// (default `fired_at`) — `null` should not occur in practice.
  final DateTime? cancelWindowExpiresAt;

  const AutoSellExecution({
    required this.id,
    required this.ruleId,
    required this.firedAt,
    required this.marketHashName,
    required this.triggerPriceUsd,
    required this.actualPriceUsd,
    this.intendedListPriceUsd,
    required this.action,
    this.sellOperationId,
    this.listingId,
    this.errorMessage,
    this.cancelWindowExpiresAt,
  });

  factory AutoSellExecution.fromJson(Map<String, dynamic> json) {
    return AutoSellExecution(
      id: json['id'] as int,
      ruleId: json['rule_id'] as int,
      firedAt: DateTime.parse(json['fired_at'] as String),
      marketHashName: json['market_hash_name'] as String,
      triggerPriceUsd: (json['trigger_price_usd'] as num).toDouble(),
      actualPriceUsd: (json['actual_price_usd'] as num).toDouble(),
      intendedListPriceUsd:
          (json['intended_list_price_usd'] as num?)?.toDouble(),
      action: AutoSellActionWire.fromWire(json['action'] as String),
      sellOperationId: json['sell_operation_id'] as int?,
      listingId: json['listing_id'] as String?,
      errorMessage: json['error_message'] as String?,
      cancelWindowExpiresAt: json['cancel_window_expires_at'] != null
          ? DateTime.parse(json['cancel_window_expires_at'] as String)
          : null,
    );
  }

  /// Whether this execution can still be cancelled — i.e. the action is
  /// pending and the 60-second window has not yet expired locally.
  bool get isCancellable {
    if (action != AutoSellAction.pendingWindow) return false;
    final exp = cancelWindowExpiresAt;
    if (exp == null) return false;
    return exp.isAfter(DateTime.now());
  }

  /// Seconds left in the cancel window. Negative if expired. Used by the
  /// modal countdown.
  int get secondsLeftInWindow {
    final exp = cancelWindowExpiresAt;
    if (exp == null) return 0;
    return exp.difference(DateTime.now()).inSeconds;
  }
}
