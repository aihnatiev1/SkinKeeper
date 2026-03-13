import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/l10n/app_localizations.dart';

/// Create a test app wrapped in ProviderScope with optional overrides.
/// Uses MaterialApp (not MaterialApp.router) to avoid GoRouter dependency.
Widget createTestApp({
  required Widget child,
  List<Override> overrides = const [],
}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(
      theme: AppTheme.darkTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark,
      locale: const Locale('en'),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: child,
    ),
  );
}

/// Create a minimal test app with Scaffold wrapper for widget tests.
Widget createTestScaffold({
  required Widget body,
  List<Override> overrides = const [],
}) {
  return createTestApp(
    overrides: overrides,
    child: Scaffold(body: body),
  );
}

/// Create a test container for provider unit tests (no UI needed).
ProviderContainer createTestContainer({
  List<Override> overrides = const [],
}) {
  final container = ProviderContainer(overrides: overrides);
  return container;
}
