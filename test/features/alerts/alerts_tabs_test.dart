import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/features/alerts/alerts_provider.dart';
import 'package:skin_keeper/features/alerts/alerts_screen.dart';
import 'package:skin_keeper/features/purchases/iap_service.dart';
import 'package:skin_keeper/models/alert.dart';
import 'package:skin_keeper/widgets/shared_ui.dart';

/// Premium override so the FAB is the raw button (premium path) — keeps
/// these tests focused on tab content, separate from the gate behaviour
/// which already has dedicated coverage in alerts_screen_test.dart.
class _PremiumNotifier extends PremiumNotifier {
  @override
  Future<bool> build() async => true;
}

class _SeededAlertsNotifier extends AlertsNotifier {
  _SeededAlertsNotifier(this._seed);
  final List<PriceAlert> _seed;

  @override
  Future<List<PriceAlert>> build() async => _seed;
}

PriceAlert _alert(int id, {bool isActive = true}) => PriceAlert(
      id: id,
      marketHashName: 'AK-47 | Redline #$id',
      condition: AlertCondition.above,
      thresholdCents: 1500 + id,
      isActive: isActive,
      createdAt: DateTime.utc(2026, 4, 1),
    );

AlertHistoryItem _history(int id, int alertId) => AlertHistoryItem(
      id: id,
      alertId: alertId,
      marketHashName: 'AK-47 | Redline #$alertId',
      condition: 'above',
      thresholdCents: 1500,
      source: 'steam',
      priceCents: 1599,
      message: 'Crossed \$15.00',
      sentAt: DateTime.now().subtract(const Duration(hours: 2)),
    );

Widget _buildApp({
  required List<PriceAlert> alerts,
  required List<AlertHistoryItem> history,
}) {
  final router = GoRouter(
    initialLocation: '/alerts',
    routes: [
      GoRoute(
        path: '/alerts',
        builder: (_, _) => const AlertsScreen(),
      ),
      GoRoute(
        path: '/alerts/create',
        builder: (_, _) => const Scaffold(body: Text('CREATE')),
      ),
      GoRoute(
        path: '/watchlist',
        builder: (_, _) => const Scaffold(body: Text('WATCHLIST')),
      ),
      GoRoute(
        path: '/premium',
        builder: (_, _) => const Scaffold(body: Text('PAYWALL')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      premiumProvider.overrideWith(_PremiumNotifier.new),
      alertsProvider.overrideWith(() => _SeededAlertsNotifier(alerts)),
      alertHistoryProvider.overrideWith((ref) async => history),
    ],
    child: MaterialApp.router(
      routerConfig: router,
      theme: AppTheme.darkTheme,
    ),
  );
}

void main() {
  testWidgets('Active/History pill tabs render and are styled custom',
      (tester) async {
    await tester.pumpWidget(_buildApp(alerts: const [], history: const []));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    // Pill tabs (custom widget — not Material TabBar — per CLAUDE.md UI rules).
    expect(find.byType(PillTabSelector), findsOneWidget);
    final pill = tester.widget<PillTabSelector>(find.byType(PillTabSelector));
    expect(pill.tabs, ['Active', 'History']);
    expect(pill.selected, 0); // Active by default.

    // Material TabBar must NOT be in the tree (decision: custom pills only).
    expect(find.byType(TabBar), findsNothing);
  });

  testWidgets('Active tab shows seeded alerts; History tab shows history rows',
      (tester) async {
    await tester.pumpWidget(_buildApp(
      alerts: [_alert(1), _alert(2)],
      history: [_history(100, 1)],
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    // Active tab is the default — both alerts visible.
    expect(find.text('AK-47 | Redline #1'), findsOneWidget);
    expect(find.text('AK-47 | Redline #2'), findsOneWidget);
    // History rows rendered in the off-screen tab via PageView; pump-tap to
    // switch is the explicit test below. Existence in tree at this point is
    // expected because PageView builds adjacent pages — assert the message
    // text appears once we actually swipe.

    // Switch to History via the pill.
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();

    expect(find.text('Crossed \$15.00'), findsOneWidget);
  });

  testWidgets('Empty Active tab renders empty state', (tester) async {
    await tester.pumpWidget(_buildApp(alerts: const [], history: const []));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('No alerts yet'), findsOneWidget);
  });
}
