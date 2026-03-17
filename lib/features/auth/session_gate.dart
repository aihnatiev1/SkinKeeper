import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../inventory/inventory_provider.dart';
import 'widgets/session_gate_screen.dart';

/// Gates an action behind a valid Steam session.
///
/// Returns `true` immediately if the active account already has a valid
/// (or expiring) session.  Otherwise pushes [SessionGateScreen] as a
/// full-screen modal and returns the result (`true` on success, `false`
/// or `null` on dismiss).
Future<bool> requireSession(BuildContext context, WidgetRef ref) async {
  if (ref.read(hasSessionProvider)) return true;

  final connected = await Navigator.of(context).push<bool>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => const SessionGateScreen(),
    ),
  );

  return connected == true;
}
