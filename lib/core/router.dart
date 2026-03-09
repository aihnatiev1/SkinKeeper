import 'dart:developer' as dev;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/api_client.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/steam_auth_service.dart';
import '../features/auth/session_provider.dart';
import '../features/inventory/inventory_screen.dart';
import '../features/portfolio/portfolio_screen.dart';
import '../features/transactions/transactions_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/auth/steam_session_screen.dart';
import '../features/inventory/item_detail_screen.dart';
import '../features/inventory/bulk_sell_screen.dart';
import '../features/trades/trades_screen.dart';
import '../features/trades/trade_detail_screen.dart';
import '../features/trades/create_trade_screen.dart';
import '../features/purchases/paywall_screen.dart';
import '../features/alerts/alerts_screen.dart';
import '../features/alerts/create_alert_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/settings/linked_accounts_screen.dart';
import '../models/inventory_item.dart';
import '../widgets/app_shell.dart';

final _shellNavigatorKey = GlobalKey<NavigatorState>();

final onboardingCompleteProvider = FutureProvider<bool>((ref) async {
  return isOnboardingComplete();
});

final routerProvider = Provider<GoRouter>((ref) {
  final authNotifier = _AuthChangeNotifier(ref);

  return GoRouter(
    initialLocation: '/portfolio',
    refreshListenable: authNotifier,
    redirect: (context, state) {
      final uri = state.uri;

      // Intercept deep link: skintracker://portfolio (from home screen widget)
      if (uri.scheme == 'skintracker' && uri.host == 'portfolio') {
        return '/portfolio';
      }

      // Intercept deep link: skintracker://auth?token=XXX
      if (uri.scheme == 'skintracker' && uri.host == 'auth') {
        final token = uri.queryParameters['token'];
        if (token != null) {
          dev.log('Auth deep link intercepted, saving token', name: 'Router');
          // Save token and refresh auth state asynchronously
          ref.read(apiClientProvider).saveToken(token).then((_) {
            ref.invalidate(authStateProvider);
          });
        }
        return '/portfolio';
      }

      final auth = ref.read(authStateProvider);
      final isLoggedIn = auth.valueOrNull != null;
      final isLoading = auth.isLoading;
      final isOnLogin = state.matchedLocation == '/login';
      final isOnOnboarding = state.matchedLocation == '/onboarding';

      if (isLoading) return null;
      if (!isLoggedIn && !isOnLogin) return '/login';

      // First-launch onboarding redirect
      if (isLoggedIn && !isOnOnboarding) {
        final onboarding = ref.read(onboardingCompleteProvider);
        final done = onboarding.valueOrNull;
        if (done == false) return '/onboarding';
      }

      if (isLoggedIn && isOnLogin) return '/portfolio';

      // Auto-redirect to session screen when session expired
      if (isLoggedIn && state.matchedLocation != '/session') {
        final sessionStatus = ref.read(sessionStatusProvider);
        final status = sessionStatus.valueOrNull;
        if (status == 'expired') return '/session';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (_, _) => const LoginScreen(),
      ),
      GoRoute(
        path: '/onboarding',
        builder: (_, _) => const OnboardingScreen(),
      ),
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (_, _, child) => AppShell(child: child),
        routes: [
          GoRoute(
            path: '/portfolio',
            pageBuilder: (_, _) => const NoTransitionPage(
              child: PortfolioScreen(),
            ),
          ),
          GoRoute(
            path: '/inventory',
            pageBuilder: (_, _) => const NoTransitionPage(
              child: InventoryScreen(),
            ),
          ),
          GoRoute(
            path: '/inventory/item-detail',
            builder: (_, state) => ItemDetailScreen(
              item: state.extra! as InventoryItem,
            ),
          ),
          GoRoute(
            path: '/inventory/bulk-sell',
            builder: (_, _) => const BulkSellScreen(),
          ),
          GoRoute(
            path: '/trades',
            pageBuilder: (_, _) => const NoTransitionPage(
              child: TradesScreen(),
            ),
          ),
          GoRoute(
            path: '/trades/create',
            builder: (_, _) => const CreateTradeScreen(),
          ),
          GoRoute(
            path: '/trades/:id',
            builder: (_, state) => TradeDetailScreen(
              offerId: state.pathParameters['id']!,
            ),
          ),
          GoRoute(
            path: '/transactions',
            pageBuilder: (_, _) => const NoTransitionPage(
              child: TransactionsScreen(),
            ),
          ),
          GoRoute(
            path: '/settings',
            pageBuilder: (_, _) => const NoTransitionPage(
              child: SettingsScreen(),
            ),
          ),
          GoRoute(
            path: '/settings/accounts',
            builder: (_, _) => const LinkedAccountsScreen(),
          ),
          GoRoute(
            path: '/session',
            builder: (_, state) {
              final accountId = int.tryParse(
                state.uri.queryParameters['accountId'] ?? '',
              );
              return SteamSessionScreen(accountId: accountId);
            },
          ),
          GoRoute(
            path: '/premium',
            builder: (_, _) => const PaywallScreen(),
          ),
          GoRoute(
            path: '/alerts',
            pageBuilder: (_, _) => const NoTransitionPage(
              child: AlertsScreen(),
            ),
          ),
          GoRoute(
            path: '/alerts/create',
            builder: (_, state) => CreateAlertScreen(
              marketHashName: state.extra as String?,
            ),
          ),
        ],
      ),
    ],
  );
});

class _AuthChangeNotifier extends ChangeNotifier {
  _AuthChangeNotifier(Ref ref) {
    ref.listen(authStateProvider, (_, _) => notifyListeners());
  }
}
