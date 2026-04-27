import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:skin_keeper/core/api_client.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/features/alerts/widgets/alert_actions_sheet.dart';
import 'package:skin_keeper/models/alert.dart';

import '../../helpers/mocks.dart';

PriceAlert _alert() => PriceAlert(
      id: 7,
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      condition: AlertCondition.above,
      thresholdCents: 1500,
      createdAt: DateTime.utc(2026, 1, 1),
    );

/// Wrap [AlertActionsSheet] in a minimal app with a button that opens the
/// sheet. We don't render the sheet directly via the static `show` because
/// `showModalBottomSheet` requires a real [Navigator]; the helper button is
/// the canonical entry point anyway.
Widget _harness({
  required ApiClient api,
  required String routeStub,
}) {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (ctx, _) => Scaffold(
          body: Builder(
            builder: (innerCtx) => ElevatedButton(
              onPressed: () => AlertActionsSheet.show(innerCtx, _alert()),
              child: const Text('OPEN_SHEET'),
            ),
          ),
        ),
      ),
      GoRoute(
        path: '/alerts/create',
        builder: (_, _) => Scaffold(body: Text(routeStub)),
      ),
    ],
  );

  return ProviderScope(
    overrides: [apiClientProvider.overrideWithValue(api)],
    child: MaterialApp.router(
      routerConfig: router,
      theme: AppTheme.darkTheme,
    ),
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
  });

  setUp(() async {
    // SharedPreferences is used by AlertSnoozeService; reset between tests
    // so snooze state doesn't bleed across cases.
    SharedPreferences.setMockInitialValues({});
  });

  Future<void> openSheet(WidgetTester tester) async {
    await tester.tap(find.text('OPEN_SHEET'));
    await tester.pumpAndSettle();
  }

  testWidgets('renders all 3 actions with labels', (tester) async {
    final api = MockApiClient();
    await tester.pumpWidget(_harness(api: api, routeStub: 'CREATE_ROUTE'));
    await openSheet(tester);

    expect(find.text('Relist'), findsOneWidget);
    expect(find.text('Snooze 24h'), findsOneWidget);
    expect(find.text('Edit'), findsOneWidget);
    // Item name shown for context.
    expect(find.text('AK-47 | Redline (Field-Tested)'), findsOneWidget);
  });

  testWidgets('Snooze button POSTs /snooze with 24h and pops sheet',
      (tester) async {
    final api = MockApiClient();
    when(() => api.post(
          '/alerts/7/snooze',
          data: any(named: 'data'),
          queryParameters: any(named: 'queryParameters'),
          receiveTimeout: any(named: 'receiveTimeout'),
        )).thenAnswer((_) async =>
        mockResponse({'id': 7, 'is_active': false, 'snooze_until': 'x'}));

    await tester.pumpWidget(_harness(api: api, routeStub: 'CREATE_ROUTE'));
    await openSheet(tester);
    await tester.tap(find.text('Snooze 24h'));
    await tester.pumpAndSettle();

    final captured = verify(
      () => api.post(
        '/alerts/7/snooze',
        data: captureAny(named: 'data'),
        queryParameters: any(named: 'queryParameters'),
        receiveTimeout: any(named: 'receiveTimeout'),
      ),
    ).captured;
    expect(captured.single, {'hours': 24});

    // Sheet dismissed.
    expect(find.text('Snooze 24h'), findsNothing);
  });

  testWidgets('Snooze falls back to local prefs on backend failure',
      (tester) async {
    final api = MockApiClient();
    when(() => api.post(
          '/alerts/7/snooze',
          data: any(named: 'data'),
          queryParameters: any(named: 'queryParameters'),
          receiveTimeout: any(named: 'receiveTimeout'),
        )).thenThrow(Exception('network down'));

    await tester.pumpWidget(_harness(api: api, routeStub: 'CREATE_ROUTE'));
    await openSheet(tester);
    await tester.tap(find.text('Snooze 24h'));
    await tester.pumpAndSettle();

    // Sheet still dismissed — fallback path is treated as success.
    expect(find.text('Snooze 24h'), findsNothing);

    // The pending offline snooze must be persisted.
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('alert_snooze_v2');
    expect(raw, isNotNull);
    expect(raw, contains('"synced":false'));
    expect(raw, contains('"7"'));
  });

  testWidgets('Relist button POSTs /unsnooze and pops sheet', (tester) async {
    final api = MockApiClient();
    when(() => api.post(
          '/alerts/7/unsnooze',
          data: any(named: 'data'),
          queryParameters: any(named: 'queryParameters'),
          receiveTimeout: any(named: 'receiveTimeout'),
        )).thenAnswer((_) async =>
        mockResponse({'id': 7, 'is_active': true, 'snooze_until': null}));

    await tester.pumpWidget(_harness(api: api, routeStub: 'CREATE_ROUTE'));
    await openSheet(tester);
    await tester.tap(find.text('Relist'));
    await tester.pumpAndSettle();

    verify(
      () => api.post(
        '/alerts/7/unsnooze',
        data: any(named: 'data'),
        queryParameters: any(named: 'queryParameters'),
        receiveTimeout: any(named: 'receiveTimeout'),
      ),
    ).called(1);
    // Sheet popped on success.
    expect(find.text('Relist'), findsNothing);
  });

  testWidgets('Edit button navigates to /alerts/create with item name',
      (tester) async {
    final api = MockApiClient();
    await tester.pumpWidget(_harness(api: api, routeStub: 'CREATE_ROUTE'));
    await openSheet(tester);

    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();

    // `/alerts/create` route stub renders 'CREATE_ROUTE' — proves nav fired.
    expect(find.text('CREATE_ROUTE'), findsOneWidget);
  });
}
