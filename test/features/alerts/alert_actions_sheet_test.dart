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

  testWidgets('Snooze button calls PATCH is_active=false and pops sheet',
      (tester) async {
    final api = MockApiClient();
    when(() => api.patch('/alerts/7', data: any(named: 'data')))
        .thenAnswer((_) async => mockResponse({'id': 7, 'is_active': false}));

    await tester.pumpWidget(_harness(api: api, routeStub: 'CREATE_ROUTE'));
    await openSheet(tester);
    await tester.tap(find.text('Snooze 24h'));
    await tester.pumpAndSettle();

    final captured = verify(
      () => api.patch('/alerts/7', data: captureAny(named: 'data')),
    ).captured;
    expect(captured.single, {'is_active': false});

    // Sheet dismissed.
    expect(find.text('Snooze 24h'), findsNothing);
  });

  testWidgets('Relist button calls PATCH is_active=true', (tester) async {
    final api = MockApiClient();
    when(() => api.patch('/alerts/7', data: any(named: 'data')))
        .thenAnswer((_) async => mockResponse({'id': 7, 'is_active': true}));

    await tester.pumpWidget(_harness(api: api, routeStub: 'CREATE_ROUTE'));
    await openSheet(tester);
    await tester.tap(find.text('Relist'));
    await tester.pumpAndSettle();

    // Relist is followed by a snooze-clear (duration zero) which also issues
    // a PATCH is_active=false; the *first* patch we care about is the re-arm.
    // `captured` returns a flat list of every captured arg across all
    // matching invocations. Map literal `==` is identity in Dart, so we
    // assert via `any` + manual key check rather than `contains(literalMap)`.
    final calls = verify(
      () => api.patch('/alerts/7', data: captureAny(named: 'data')),
    ).captured;
    final reArmed = calls
        .whereType<Map<String, dynamic>>()
        .any((m) => m['is_active'] == true);
    expect(reArmed, isTrue, reason: 'Relist must PATCH is_active=true');
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
