import 'dart:async';
import 'dart:developer' as dev;
import 'package:flutter/services.dart';

import 'package:app_links/app_links.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/api_client.dart';
import 'core/cache_service.dart';
import 'core/push_service.dart';
import 'core/router.dart';
import 'core/widget_service.dart';
import 'core/settings_provider.dart';
import 'core/theme.dart';
import 'features/auth/steam_auth_service.dart';
import 'features/inventory/inventory_provider.dart';
import 'features/settings/accounts_provider.dart';
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  dev.log('Firebase initialized, apps: ${Firebase.apps.length}', name: 'Firebase');
  await CacheService.init();
  await WidgetService.init();
  await WidgetService.registerBackgroundCallback();
  _trackAppOpen();
  runApp(const ProviderScope(child: SkinKeeperApp()));
}

Future<void> _trackAppOpen() async {
  final prefs = await SharedPreferences.getInstance();
  final opens = (prefs.getInt('app_open_count') ?? 0) + 1;
  await prefs.setInt('app_open_count', opens);
}

class SkinKeeperApp extends ConsumerStatefulWidget {
  const SkinKeeperApp({super.key});

  @override
  ConsumerState<SkinKeeperApp> createState() => _SkinKeeperAppState();
}

class _SkinKeeperAppState extends ConsumerState<SkinKeeperApp>
    with WidgetsBindingObserver {
  late final AppLinks _appLinks;
  StreamSubscription<Uri>? _linkSub;
  StreamSubscription<void>? _sessionExpiredSub;
  StreamSubscription<void>? _tokenExpiredSub;
  bool _pushInitialized = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _appLinks = AppLinks();
    _initDeepLinks();
    _initDeepLinkChannel();
    _sessionExpiredSub = sessionExpiredController.stream.listen((_) {
      _showSessionExpiredDialog();
    });
    _tokenExpiredSub = tokenExpiredController.stream.listen((_) {
      _handleTokenExpired();
    });
    // Init push when user becomes authenticated
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.listenManual(authStateProvider, (prev, next) {
        if (!_pushInitialized && next.valueOrNull != null) {
          _pushInitialized = true;
          PushService.init(ref.read(apiClientProvider));
        }
      }, fireImmediately: true);
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      WidgetService.pushCachedToWidget();
    }
  }


  void _initDeepLinkChannel() {
    const channel = MethodChannel('app.skinkeeper.store/deep_link');
    channel.setMethodCallHandler((call) async {
      if (call.method == 'onLink') {
        final url = call.arguments as String?;
        print('CHANNEL DEEPLINK: $url');
        if (url != null) _handleDeepLink(Uri.parse(url));
      }
    });
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
    print('DEEPLINK: $uri');

    // skinkeeper://portfolio (from home screen widget tap)
    if (uri.host == 'portfolio') {
      final router = ref.read(routerProvider);
      router.go('/portfolio');
      return;
    }

    // skinkeeper://account-linked?steamId=XXX (from backend redirect after linking)
    if (uri.host == 'account-linked') {
      ref.invalidate(accountsProvider);
      ref.invalidate(inventoryProvider);
      ref.read(routerProvider).go('/settings/accounts');
      return;
    }

    // skinkeeper://auth?token=XXX or skinkeeper://auth?error=XXX
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
    WidgetsBinding.instance.removeObserver(this);
    _linkSub?.cancel();
    _sessionExpiredSub?.cancel();
    _tokenExpiredSub?.cancel();
    super.dispose();
  }

  void _handleTokenExpired() {
    final auth = ref.read(authStateProvider);
    if (auth.valueOrNull == null) return;

    // Force logout — JWT is invalid, need full re-login
    ref.read(authStateProvider.notifier).logout();
  }

  void _showSessionExpiredDialog() {
    // Don't show if not logged in
    final auth = ref.read(authStateProvider);
    if (auth.valueOrNull == null) return;

    final router = ref.read(routerProvider);

    // Navigate directly to session screen — no optional "Later" dialog
    router.push('/session');
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    ref.watch(themeModeProvider);
    final locale = ref.watch(localeProvider);

    return MaterialApp.router(
      title: 'SkinKeeper',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark,
      routerConfig: router,
      locale: locale,
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

