import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/steam_auth_service.dart';
import '../features/auth/login_screen.dart';
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
import '../features/alerts/alerts_screen.dart';
import '../features/alerts/create_alert_screen.dart';
import '../models/inventory_item.dart';
import '../models/user.dart';
import '../widgets/app_shell.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

final onboardingCompleteProvider = FutureProvider<bool>((ref) async {
  return isOnboardingComplete();
});

final routerProvider = Provider<GoRouter>((ref) {
  // ref.watch ensures router rebuilds when auth/session state changes
  final auth = ref.watch(authStateProvider);
  final session = ref.watch(sessionStatusProvider);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/loading',
    debugLogDiagnostics: true,
    redirect: (context, state) {
      final location = state.matchedLocation;
      final isOnLoading = location == '/loading';
      final isOnLogin = location == '/login';
      final isOnSession = location == '/session';
      final isOnLinkAccount = location == '/link-account';
      final isOnOnboarding = location == '/onboarding';

      debugPrint(
        'REDIRECT | uri=${state.uri} '
        'matched=$location '
        'authLoading=${auth.isLoading} '
        'authValue=${auth.valueOrNull} '
        'sessionLoading=${session.isLoading} '
        'needsReauth=${session.valueOrNull?.needsReauth}',
      );

      if (auth.isLoading) {
        return isOnLoading ? null : '/loading';
      }

      final isLoggedIn = auth.valueOrNull != null;

      if (!isLoggedIn) {
        if (isOnLogin || isOnLoading || isOnLinkAccount) {
          return null;
        }
        return '/login';
      }

      final needsReauth = session.valueOrNull?.needsReauth ?? false;
      if (needsReauth && !isOnSession) {
        return '/session';
      }

      if (isOnLogin || isOnLoading) {
        return '/portfolio';
      }

      if (isOnSession && !needsReauth) {
        return '/portfolio';
      }

      if (isOnOnboarding) {
        return null;
      }

      return null;
    },
    routes: [
      GoRoute(path: '/loading', builder: (_, _) => const _LoadingScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/session', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/link-account', builder: (_, _) => const LoginScreen(isLinking: true)),
      GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen()),
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
          GoRoute(path: '/premium', builder: (_, _) => const PaywallScreen()),
          GoRoute(path: '/alerts', pageBuilder: (_, _) => const NoTransitionPage(child: AlertsScreen())),
          GoRoute(path: '/alerts/create', builder: (_, state) => CreateAlertScreen(marketHashName: state.extra as String?)),
        ],
      ),
    ],
    errorBuilder: (context, state) {
      debugPrint('ROUTER ERROR | uri=${state.uri} error=${state.error}');
      return Scaffold(
        backgroundColor: const Color(0xFF0A0E1A),
        body: Center(
          child: Text('Route error: ${state.uri}', style: const TextStyle(color: Colors.white)),
        ),
      );
    },
  );
});

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
            colors: [Color(0xFF1A0A35), Color(0xFF0A0E1A)],
          ),
        ),
        child: const Center(
          child: CircularProgressIndicator(
            color: Color(0xFF8B5CF6),
            strokeWidth: 2.5,
          ),
        ),
      ),
    );
  }
}
