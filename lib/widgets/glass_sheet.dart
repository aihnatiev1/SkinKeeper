import 'package:flutter/material.dart';

/// Show a glass-themed modal bottom sheet with transparent background.
Future<T?> showGlassSheet<T>(BuildContext context, Widget child) {
  return showModalBottomSheet<T>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => child,
  );
}

/// Show a non-dismissible glass-themed modal bottom sheet (e.g., sell progress).
Future<T?> showGlassSheetLocked<T>(BuildContext context, Widget child) {
  return showModalBottomSheet<T>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    isDismissible: false,
    enableDrag: false,
    backgroundColor: Colors.transparent,
    builder: (_) => child,
  );
}
