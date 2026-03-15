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
  final refreshNotifier = _RouterRefreshNotifier(ref);
  ref.onDispose(refreshNotifier.dispose);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/portfolio',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final auth = ref.read(authStateProvider);
      final session = ref.read(sessionStatusProvider);

      final location = state.matchedLocation;
      final isOnLoading = location == '/loading';
      final isOnLogin = location == '/login';
      final isOnSession = location == '/session';
      final isOnLinkAccount = location == '/link-account';

      // 1. Якщо хоча б один критичний провайдер вантажиться - йдемо на лоадер
      if (auth.isLoading || session.isLoading) {
        if (isOnLoading || isOnLogin || isOnSession) return null;
        return '/loading';
      }

      final user = auth.valueOrNull;
      final sessionData = session.valueOrNull;

      // 2. Логіка для неавторизованого користувача
      if (user == null) {
        if (isOnLogin || isOnLoading || isOnLinkAccount || isOnSession) return null;
        return '/login';
      }

      // 3. Перевірка сесії (REAUTH)
      final needsReauth = sessionData?.needsReauth ?? false;

      // Якщо потрібна реавторизація і ми не на сторінці сесії/логіну
      if (needsReauth) {
        if (isOnSession || isOnLogin) return null;
        return '/session';
      }

      // 4. Якщо залогінені і сесія ок, але ми на сервісних екранах - на головну
      if (isOnLogin || isOnLoading || isOnSession) {
        return '/portfolio';
      }

      return null;
    },
    routes: [
      GoRoute(path: '/loading', builder: (_, _) => const _LoadingScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      // Використовуємо LoginScreen для сесії, але з розумінням контексту
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