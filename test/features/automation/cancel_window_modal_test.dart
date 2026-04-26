import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/features/automation/data/auto_sell_repository.dart';
import 'package:skin_keeper/features/automation/models/auto_sell_execution.dart';
import 'package:skin_keeper/features/automation/widgets/cancel_window_modal.dart';
import 'package:skin_keeper/l10n/app_localizations.dart';

class _MockRepo extends Mock implements AutoSellRepository {}

AutoSellExecution _pendingExec({int id = 42, int secondsLeft = 30}) {
  return AutoSellExecution(
    id: id,
    ruleId: 1,
    firedAt: DateTime.now(),
    marketHashName: 'AK-47 | Redline (Field-Tested)',
    triggerPriceUsd: 15,
    actualPriceUsd: 16.20,
    intendedListPriceUsd: 15.99,
    action: AutoSellAction.pendingWindow,
    cancelWindowExpiresAt:
        DateTime.now().add(Duration(seconds: secondsLeft)),
  );
}

Widget _wrapDialog(AutoSellExecution exec, _MockRepo repo) {
  return ProviderScope(
    overrides: [
      autoSellRepositoryProvider.overrideWithValue(repo),
    ],
    child: MaterialApp(
      theme: AppTheme.darkTheme,
      // Localizations are required: the dialog reads l10n strings from
      // `AppLocalizations.of(context)` (P10 l10n extraction). Without the
      // delegate the lookup throws "Null check operator used on a null value".
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: CancelWindowDialog(execution: exec)),
    ),
  );
}

void main() {
  // Regex matching "Listing in <N>s" disambiguates from the
  // "Listing in progress" dialog title which also matches "Listing in".
  final countdownPattern = RegExp(r'^Listing in \d+s$');

  testWidgets('shows item name + countdown + buttons', (tester) async {
    final repo = _MockRepo();
    final exec = _pendingExec();
    await tester.pumpWidget(_wrapDialog(exec, repo));
    await tester.pump();

    expect(find.text('AK-47 | Redline (Field-Tested)'), findsOneWidget);
    expect(find.text('Listing in progress'), findsOneWidget);
    final countdownTexts = tester
        .widgetList<Text>(find.byType(Text))
        .where((w) => countdownPattern.hasMatch(w.data ?? ''))
        .toList();
    expect(countdownTexts, hasLength(1));
    expect(find.text('Cancel'), findsOneWidget);
    expect(find.text('Continue'), findsOneWidget);

    // Tear down the periodic countdown timer by removing the dialog.
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('countdown badge surfaces seconds remaining', (tester) async {
    // Note: the countdown reads `DateTime.now()` (real wall time) inside
    // `secondsLeftInWindow`, so synthetic `tester.pump(Duration)` doesn't
    // advance the value. We assert that the badge shows a positive number
    // ≤ 30 — equivalent to "the dialog wired the countdown to the model".
    final repo = _MockRepo();
    final exec = _pendingExec(secondsLeft: 30);
    await tester.pumpWidget(_wrapDialog(exec, repo));
    await tester.pump();

    int? currentSeconds() {
      final txt = tester
          .widgetList<Text>(find.byType(Text))
          .map((w) => w.data ?? '')
          .firstWhere((s) => countdownPattern.hasMatch(s), orElse: () => '');
      final match = RegExp(r'(\d+)').firstMatch(txt);
      return match == null ? null : int.parse(match.group(1)!);
    }

    final initial = currentSeconds();
    expect(initial, isNotNull);
    expect(initial, greaterThan(0));
    expect(initial, lessThanOrEqualTo(30));

    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Cancel button calls cancelExecution', (tester) async {
    final repo = _MockRepo();
    when(() => repo.cancelExecution(any())).thenAnswer((_) async {});
    final exec = _pendingExec();

    await tester.pumpWidget(_wrapDialog(exec, repo));
    await tester.pump();

    await tester.tap(find.text('Cancel'));
    await tester.pump();
    // Allow the 500ms hold-success to settle.
    await tester.pump(const Duration(milliseconds: 600));

    verify(() => repo.cancelExecution(42)).called(1);

    await tester.pumpWidget(const SizedBox.shrink());
  });
}
