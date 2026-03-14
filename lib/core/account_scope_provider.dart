import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The account scope filter applied to inventory / portfolio / transactions.
///
/// null  = all linked accounts (default)
/// int   = specific steam_account id (filter to that account only)
final accountScopeProvider = StateProvider<int?>((ref) => null);
