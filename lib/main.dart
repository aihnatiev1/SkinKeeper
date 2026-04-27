import 'dart:async';
import 'dart:developer' as dev;
import 'package:flutter/services.dart';

import 'package:app_links/app_links.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/analytics_service.dart';
import 'core/api_client.dart';
import 'core/cache_service.dart';
import 'core/feature_flags/feature_flags_provider.dart';
import 'core/push_service.dart';
import 'core/router.dart';
import 'core/widget_service.dart';
import 'core/settings_provider.dart';
import 'core/theme.dart';
import 'features/auth/steam_auth_service.dart';
import 'models/user.dart';
import 'features/alerts/services/alert_snooze_service.dart';
import 'features/purchases/iap_service.dart';
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
  await Analytics.init();
  // Clear secure storage on fresh install (iOS keeps keychain after app deletion)
  final prefs = await SharedPreferences.getInstance();
  if (prefs.getBool('has_launched_v2') != true) {
    try {
      await const FlutterSecureStorage().deleteAll()
          .timeout(const Duration(seconds: 3), onTimeout: () {
        dev.log('Secure storage clear timed out — skipping', name: 'Init');
      });
    } catch (e) {
      dev.log('Failed to clear secure storage: $e', name: 'Init');
    }
    await prefs.setBool('has_launched_v2', true);
  }
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
  StreamSubscription<String?>? _featureDisabledSub;
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
    // P10: server-side feature-flag kill-switch handling. When the backend
    // returns 403 FEATURE_DISABLED we invalidate the cached flags so the next
    // frame reflects the new server state, then toast the user. Without the
    // invalidation a stale cached `true` would let the user keep tapping a
    // gated CTA only to be denied at the API layer every time.
    _featureDisabledSub =
        featureDisabledController.stream.listen(_handleFeatureDisabled);
    // P8: wire the IAPService → tour trigger. Fires once per fresh purchase
    // (NOT restore) provided `tour_v1_completed` is unset. The 800ms delay
    // gives any in-flight `PremiumGate` unlock choreography time to finish
    // (PLAN.md §7) so the tour doesn't slam the screen mid-animation.
    //
    // P10: also gated by the server-side `tour` feature flag. We re-read the
    // flag at trigger time (not at hook installation) so an experiment that
    // turns the tour off mid-session takes effect immediately for the next
    // purchase. Defaults to `true` to preserve the existing behaviour when
    // the backend is unreachable.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(iapServiceProvider).onFreshPurchaseSuccess = () {
        final tourEnabled = ref
            .read(featureFlagsProvider)
            .maybeWhen(
              data: (flags) => flags['tour'] ?? true,
              orElse: () => true,
            );
        if (!tourEnabled) {
          dev.log('Tour skipped: feature flag disabled', name: 'Tour');
          return;
        }
        Future.delayed(const Duration(milliseconds: 800), () {
          if (!mounted) return;
          ref.read(routerProvider).push('/tour');
        });
      };
    });

    // Init push when user becomes authenticated
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.listenManual(authStateProvider, (prev, next) {
        if (!_pushInitialized && next.valueOrNull != null) {
          _pushInitialized = true;
          PushService.setRouter(
            ref,
            container: ProviderScope.containerOf(context, listen: false),
          );
          PushService.initHandlers(ref.read(apiClientProvider));
        }
        // Replay pending offline snoozes + drop expired local hint rows
        // whenever the auth identity changes (initial login or account
        // switch). Server-side snoozes auto-clear via the engine — this
        // path only flushes writes that never reached the server.
        if (next.valueOrNull != null) {
          AlertSnoozeService(ref.read(apiClientProvider))
              .replayPendingSnoozes();
        }
        // Reset locked-feature dedupe set whenever the active identity
        // changes (login, logout, account switch). Lets the new session log
        // fresh `locked_feature_viewed` events without double-counting.
        // Identity = (steamId, activeAccountId) tuple — a switch between
        // linked accounts is also a context reset.
        final prev0 = prev?.valueOrNull;
        final next0 = next.valueOrNull;
        final prevKey = prev0 == null
            ? null
            : '${prev0.steamId}:${prev0.activeAccountId}';
        final nextKey = next0 == null
            ? null
            : '${next0.steamId}:${next0.activeAccountId}';
        if (prevKey != nextKey) {
          Analytics.resetLockedFeatureSession();
          // P10: feature flags are scoped to the user/account; clear the
          // cache on identity change so the new session fetches fresh
          // server-side toggles instead of inheriting the previous user's.
          ref.invalidate(featureFlagsProvider);
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
        dev.log('CHANNEL DEEPLINK: $url', name: 'DeepLink');
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

    // Referral link — skinkeeper://ref?code=XXX or https://skinkeeper.store/ref/XXX
    final refCode = uri.queryParameters['code'] ??
        (uri.pathSegments.length >= 2 && uri.pathSegments[0] == 'ref' ? uri.pathSegments[1] : null);
    if (refCode != null && (uri.host == 'ref' || uri.path.startsWith('/ref/'))) {
      _saveReferralCode(refCode);
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

  Future<void> _saveReferralCode(String code) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('pending_referral_code', code);
    debugPrint('REFERRAL: saved pending code $code');
  }

  /// Apply pending referral code after login (if any)
  Future<void> _applyPendingReferral() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString('pending_referral_code');
    if (code == null) return;
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/auth/referral/apply', data: {'code': code});
      await prefs.remove('pending_referral_code');
      debugPrint('REFERRAL: applied code $code');
    } catch (e) {
      debugPrint('REFERRAL: apply failed: $e');
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

      // Apply pending referral code if user came via referral link
      _applyPendingReferral();

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
    _featureDisabledSub?.cancel();
    super.dispose();
  }

  /// React to a server-side `FEATURE_DISABLED` 403. Invalidates the cached
  /// flags (next read fetches fresh) and surfaces a non-blocking snackbar so
  /// the user understands why the action they just took did nothing.
  ///
  /// The argument is the canonical flag name (e.g. `auto_sell`) emitted by the
  /// dio interceptor — it reads `data['flag']` from the backend's payload
  /// (`middleware/auth.ts`). We pretty-print known flags so the toast reads
  /// like a human wrote it instead of leaking snake_case identifiers at users.
  ///
  /// Best-effort UI: if there's no scaffold mounted (cold start, error
  /// screens) we skip the toast — the feature flag invalidation is the
  /// load-bearing side effect.
  void _handleFeatureDisabled(String? flag) {
    ref.invalidate(featureFlagsProvider);
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;
    final label = _featureDisabledMessage(flag);
    messenger.showSnackBar(
      SnackBar(
        content: Text(label),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  /// Map a backend flag identifier to a user-facing message. Falls through to
  /// a generic line for unknown flags so a freshly-added kill switch on the
  /// server doesn't look broken in production until we ship a new client.
  String _featureDisabledMessage(String? flag) {
    switch (flag) {
      case 'auto_sell':
        return 'Auto-sell is currently unavailable';
      case 'smart_alerts':
        return 'Smart alerts are currently unavailable';
      case 'tour':
        return 'The app tour is currently unavailable';
      case null:
      case '':
        return 'This feature is currently unavailable';
      default:
        return 'Feature "$flag" is currently unavailable';
    }
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

    return GestureDetector(
      onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
      child: MaterialApp.router(
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
      ),
    );
  }
}

