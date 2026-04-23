import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../inventory/inventory_provider.dart';
import 'widgets/session_gate_screen.dart';

/// Gates an action behind a valid Steam session.
///
/// Returns `true` immediately if any linked account already has a valid
/// (or expiring) session.  Otherwise pushes [SessionGateScreen] as a
/// full-screen modal and returns the result (`true` on success, `false`
/// or `null` on dismiss).
///
/// Set [forceShow] to `true` when the user explicitly taps a "re-authenticate"
/// affordance (e.g. the "Extra verification needed" banner on the trade page).
/// In that case the has-session short-circuit is skipped so the modal always
/// opens — otherwise the tap appears to do nothing when another account in
/// the profile happens to have a fresh session.
Future<bool> requireSession(BuildContext context, WidgetRef ref, {bool forceShow = false}) async {
  if (!forceShow && ref.read(hasSessionProvider)) return true;

  final connected = await Navigator.of(context).push<bool>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => const SessionGateScreen(),
    ),
  );

  return connected == true;
}
