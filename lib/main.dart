import 'dart:async';
import 'dart:developer' as dev;

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/api_client.dart';
import 'core/cache_service.dart';
import 'core/review_service.dart';
import 'core/router.dart';
import 'core/theme.dart';
import 'features/auth/steam_auth_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await CacheService.init();
  _trackAppOpen();
  runApp(const ProviderScope(child: SkinTrackerApp()));
}

Future<void> _trackAppOpen() async {
  final prefs = await SharedPreferences.getInstance();
  final opens = (prefs.getInt('app_open_count') ?? 0) + 1;
  await prefs.setInt('app_open_count', opens);
  if (opens == 5) {
    ReviewService.maybeRequestReview();
  }
}

class SkinTrackerApp extends ConsumerStatefulWidget {
  const SkinTrackerApp({super.key});

  @override
  ConsumerState<SkinTrackerApp> createState() => _SkinTrackerAppState();
}

class _SkinTrackerAppState extends ConsumerState<SkinTrackerApp> {
  late final AppLinks _appLinks;
  StreamSubscription<Uri>? _linkSub;

  @override
  void initState() {
    super.initState();
    _appLinks = AppLinks();
    _initDeepLinks();
  }

  Future<void> _initDeepLinks() async {
    // Handle link that launched the app (cold start)
    try {
      final initialUri = await _appLinks.getInitialLink();
      if (initialUri != null) _handleDeepLink(initialUri);
    } catch (e) {
      dev.log('Initial deep link error: $e', name: 'DeepLink');
    }

    // Handle links while app is running (warm start)
    _linkSub = _appLinks.uriLinkStream.listen(_handleDeepLink);
  }

  void _handleDeepLink(Uri uri) {
    dev.log('Deep link received: $uri', name: 'DeepLink');

    // skintracker://auth?token=XXX or skintracker://auth?error=XXX
    if (uri.host == 'auth') {
      final token = uri.queryParameters['token'];
      final error = uri.queryParameters['error'];

      if (token != null) {
        _handleAuthToken(token);
      } else if (error != null) {
        dev.log('Auth error from deep link: $error', name: 'DeepLink');
      }
    }
  }

  Future<void> _handleAuthToken(String token) async {
    final api = ref.read(apiClientProvider);
    await api.saveToken(token);
    // Re-fetch user — this triggers router redirect to portfolio
    ref.invalidate(authStateProvider);
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'SkinTracker',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark,
      routerConfig: router,
      localizationsDelegates: [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
