import 'dart:developer' as dev;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/api_client.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/steam_auth_service.dart';
import '../features/inventory/inventory_screen.dart';
import '../features/portfolio/portfolio_screen.dart';
import '../features/transactions/transactions_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/auth/steam_session_screen.dart';
import '../features/inventory/item_detail_screen.dart';
import '../models/inventory_item.dart';
import '../widgets/app_shell.dart';

final _shellNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final authNotifier = _AuthChangeNotifier(ref);

  return GoRouter(
    initialLocation: '/portfolio',
    refreshListenable: authNotifier,
    redirect: (context, state) {
      final uri = state.uri;

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
        // Redirect to portfolio (or login — the auth redirect below will handle it)
        return '/portfolio';
      }

      final auth = ref.read(authStateProvider);
      final isLoggedIn = auth.valueOrNull != null;
      final isLoading = auth.isLoading;
      final isOnLogin = state.matchedLocation == '/login';

      if (isLoading) return null;
      if (!isLoggedIn && !isOnLogin) return '/login';
      if (isLoggedIn && isOnLogin) return '/portfolio';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (_, _) => const LoginScreen(),
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
            path: '/session',
            builder: (_, _) => const SteamSessionScreen(),
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
