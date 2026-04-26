import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/steam_auth_service.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/initial_sync_screen.dart';
import '../features/auth/session_provider.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/portfolio/portfolio_screen.dart';
import '../features/inventory/inventory_screen.dart';
import '../features/inventory/item_detail_screen.dart';
import '../features/inventory/bulk_sell_screen.dart';
import '../features/trades/trades_screen.dart';
import '../features/trades/trade_detail_screen.dart';
import '../features/trades/create_trade_screen.dart';
import '../features/transactions/transactions_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/settings/linked_accounts_screen.dart';
import '../features/purchases/paywall_screen.dart';
import '../features/purchases/tour/tour_screen.dart';
import '../core/analytics_service.dart';
import '../core/sync_state_provider.dart';
import '../features/alerts/alerts_screen.dart';
import '../features/alerts/create_alert_screen.dart';
import '../features/automation/models/auto_sell_rule.dart';
import '../features/automation/screens/auto_sell_detail_screen.dart';
import '../features/automation/screens/auto_sell_list_screen.dart';
import '../features/market/deals_screen.dart';
import '../features/watchlist/watchlist_screen.dart';
import '../features/tradeup/tradeup_screen.dart';
import '../models/inventory_item.dart';
import '../models/user.dart';
import '../widgets/app_shell.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

final onboardingCompleteProvider = FutureProvider<bool>((ref) async {
  return isOnboardingComplete();
});

final routerProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _RouterRefreshNotifier(ref);
  ref.onDispose(refreshNotifier.dispose);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/portfolio',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final auth = ref.read(authStateProvider);

      final location = state.matchedLocation;
      final isOnLoading = location == '/loading';
      final isOnLogin = location == '/login';
      final isOnSession = location == '/session';

      // 1. Якщо auth вантажиться — чекаємо (session не блокує)
      if (auth.isLoading) {
        if (isOnLoading || isOnLogin || isOnSession) return null;
        return '/loading';
      }

      final user = auth.valueOrNull;

      // 2. Логіка для неавторизованого користувача
      if (user == null) {
        if (isOnLogin) return null;
        return '/login';
      }

      // 3. Якщо залогінені, але ми на сервісних екранах - на головну
      if (isOnLogin || isOnLoading) {
        final needsSync = ref.read(needsInitialSyncProvider);
        return needsSync ? '/initial-sync' : '/portfolio';
      }

      // Session reauth is NOT forced — user can browse with public data.
      // Sell/trade/sync features check session status themselves.

      return null;
    },
    routes: [
      GoRoute(path: '/loading', builder: (_, _) => const _LoadingScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/initial-sync', builder: (_, _) => const InitialSyncScreen()),
      // Використовуємо LoginScreen для сесії, але з розумінням контексту
      GoRoute(path: '/session', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/link-account', builder: (_, _) => const LoginScreen(isLinking: true)),
      GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen()),
      // Post-purchase tour — fullscreen dialog so popping returns the user
      // to whichever shell screen they were on before the tour mounted.
      // P8: triggered once per user from `IAPService` after a fresh purchase
      // success (NOT on restore), guarded by the `tour_v1_completed` flag.
      GoRoute(
        path: '/tour',
        parentNavigatorKey: rootNavigatorKey,
        pageBuilder: (_, _) => const MaterialPage<void>(
          fullscreenDialog: true,
          child: TourScreen(),
        ),
      ),
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (_, _, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/portfolio', pageBuilder: (_, _) => const NoTransitionPage(child: PortfolioScreen())),
          GoRoute(path: '/inventory', pageBuilder: (_, _) => const NoTransitionPage(child: InventoryScreen())),
          GoRoute(path: '/inventory/item-detail', builder: (_, state) => ItemDetailScreen(item: state.extra! as InventoryItem)),
          GoRoute(path: '/inventory/bulk-sell', builder: (_, _) => const BulkSellScreen()),
          GoRoute(path: '/trades', pageBuilder: (_, _) => const NoTransitionPage(child: TradesScreen())),
          GoRoute(path: '/trades/create', builder: (_, _) => const CreateTradeScreen()),
          GoRoute(path: '/trades/:id', builder: (_, state) => TradeDetailScreen(offerId: state.pathParameters['id']!)),
          GoRoute(path: '/transactions', pageBuilder: (_, _) => const NoTransitionPage(child: TransactionsScreen())),
          GoRoute(path: '/settings', pageBuilder: (_, _) => const NoTransitionPage(child: SettingsScreen())),
          GoRoute(path: '/settings/accounts', builder: (_, _) => const LinkedAccountsScreen()),
          GoRoute(
            path: '/premium',
            builder: (_, state) {
              // Callers push `/premium` with a typed `PaywallSource` extra
              // (PremiumGate, tease cards, settings). Cold-start / deep-link
              // hits the route with no extra → fall back to deepLink.
              final extra = state.extra;
              final source = extra is PaywallSource ? extra : PaywallSource.deepLink;
              return PaywallScreen(source: source);
            },
          ),
          GoRoute(path: '/alerts', pageBuilder: (_, _) => const NoTransitionPage(child: AlertsScreen())),
          GoRoute(path: '/alerts/create', builder: (_, state) => CreateAlertScreen(marketHashName: state.extra as String?)),
          GoRoute(
            path: '/auto-sell',
            pageBuilder: (_, _) =>
                const NoTransitionPage(child: AutoSellListScreen()),
          ),
          GoRoute(
            path: '/auto-sell/:id',
            builder: (_, state) {
              final id = int.tryParse(state.pathParameters['id'] ?? '') ?? 0;
              final extra = state.extra;
              return AutoSellDetailScreen(
                ruleId: id,
                initial: extra is AutoSellRule ? extra : null,
              );
            },
          ),
          GoRoute(path: '/deals', builder: (_, _) => const DealsScreen()),
          GoRoute(path: '/tradeup', builder: (_, _) => const TradeUpScreen()),
          GoRoute(path: '/watchlist', builder: (_, _) => const WatchlistScreen()),
        ],
      ),
    ],
    errorBuilder: (context, state) {
      // Catch auth callback URLs that GoRouter doesn't recognize as routes
      final uri = state.uri;
      if (uri.path.contains('/auth/callback') && uri.queryParameters.containsKey('token')) {
        // Redirect to portfolio — polling or deep link handler will pick up the token
        WidgetsBinding.instance.addPostFrameCallback((_) {
          GoRouter.of(context).go('/portfolio');
        });
        return const Scaffold(backgroundColor: Color(0xFF0A0E1A));
      }
      return Scaffold(
        backgroundColor: const Color(0xFF0A0E1A),
        body: Center(child: Text('Route error: ${state.uri}', style: const TextStyle(color: Colors.white))),
      );
    },
  );
});

class _RouterRefreshNotifier extends ChangeNotifier {
  _RouterRefreshNotifier(Ref ref) {
    ref.listen<AsyncValue<SteamUser?>>(authStateProvider, (prev, next) {
      if (prev?.valueOrNull != next.valueOrNull) {
        notifyListeners();
      }
    });
    ref.listen(sessionStatusProvider, (prev, next) {
      if (prev?.valueOrNull?.needsReauth != next.valueOrNull?.needsReauth) {
        notifyListeners();
      }
    });
  }
}

class _LoadingScreen extends StatelessWidget {
  const _LoadingScreen();
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF1A0A35), Color(0xFF0A0E1A)]
          ),
        ),
        child: const Center(child: CircularProgressIndicator(color: Color(0xFF8B5CF6), strokeWidth: 2.5)),
      ),
    );
  }
}