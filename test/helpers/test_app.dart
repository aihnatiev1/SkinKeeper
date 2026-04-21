import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/l10n/app_localizations.dart';

/// Create a test app wrapped in ProviderScope with optional overrides.
/// Provides a minimal GoRouter so widgets that call `context.push(...)` /
/// `context.go(...)` don't crash on the `inherited != null` assertion — the
/// push navigates to a stub destination that renders an empty Scaffold.
Widget createTestApp({
  required Widget child,
  List<Override> overrides = const [],
}) {
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => child),
      // Catch-all route so any context.push('/whatever') resolves.
      GoRoute(
        path: '/:rest(.*)',
        builder: (_, _) => const Scaffold(body: SizedBox.shrink()),
      ),
    ],
  );

  return ProviderScope(
    overrides: overrides,
    child: MaterialApp.router(
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
      routerConfig: router,
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
