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
import 'models/user.dart';
import 'features/inventory/inventory_provider.dart';
import 'features/portfolio/portfolio_provider.dart';
import 'features/portfolio/portfolio_pl_provider.dart';
import 'features/trades/trades_provider.dart';
import 'features/transactions/transactions_provider.dart';
import 'features/settings/accounts_provider.dart';
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
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

  Uri? _lastHandledDeepLink;

  void _handleDeepLink(Uri uri) {
    if (_lastHandledDeepLink == uri) return;
    _lastHandledDeepLink = uri;

    debugPrint('DEEPLINK: $uri');

    // skinkeeper://portfolio — no manual go(), router handles via auth state

    // skinkeeper://account-linked?steamId=XXX (from backend redirect after linking)
    if (uri.host == 'account-linked') {
      ref.invalidate(accountsProvider);
      ref.invalidate(inventoryProvider);
      ref.read(routerProvider).go('/settings/accounts');
      return;
    }

    // Auth callback — skinkeeper://auth?token=XXX or https://api.skinkeeper.store/auth/callback?token=XXX
    final token = uri.queryParameters['token'];
    final isAuthCallback =
        uri.host == 'auth' ||
        (uri.host == 'api.skinkeeper.store' && uri.path == '/auth/callback');

    if (isAuthCallback && token != null) {
      _handleAuthToken(token);
    }
  }

  Future<void> _handleAuthToken(String token) async {
    try {
      debugPrint('AUTH: saving token...');
      final api = ref.read(apiClientProvider);
      await api.saveToken(token);

      debugPrint('AUTH: token saved, fetching user...');
      final resp = await api.get('/auth/me');

      debugPrint('AUTH: user fetched, setting auth state...');
      final user = SteamUser.fromJson(resp.data as Map<String, dynamic>);
      ref.read(authStateProvider.notifier).setUser(user);

      // Invalidate all data providers so they fetch fresh data for this user
      ref.invalidate(inventoryProvider);
      ref.invalidate(portfolioProvider);
      ref.invalidate(portfolioPLProvider);
      ref.invalidate(tradesProvider);
      ref.invalidate(transactionsProvider);
      ref.invalidate(accountsProvider);

      // Trigger background inventory sync from Steam
      debugPrint('AUTH: triggering background sync...');
      Future.microtask(() async {
        try {
          final api = ref.read(apiClientProvider);
          await api.post('/inventory/refresh');
          ref.invalidate(inventoryProvider);
          ref.invalidate(portfolioProvider);
          debugPrint('AUTH: inventory synced from Steam');
        } catch (e) {
          debugPrint('AUTH: background sync failed (non-critical): $e');
        }
      });

      debugPrint('AUTH: done, all providers invalidated');
    } catch (e, st) {
      debugPrint('AUTH ERROR: $e');
      debugPrint('$st');
      ref.read(authStateProvider.notifier).clearUser();
    }
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

