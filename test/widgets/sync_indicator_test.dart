import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skin_keeper/core/cache_service.dart';
import 'package:skin_keeper/widgets/sync_indicator.dart';

import '../helpers/test_app.dart';

void main() {
  late Directory tempDir;

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('hive_sync_test_');
    await CacheService.initForTest(tempDir.path);
  });

  setUp(() async {
    // Clear sync state before each test
    CacheService.lastSync = null;
  });

  tearDownAll(() async {
    await tempDir.delete(recursive: true);
  });

  group('SyncIndicator widget', () {
    testWidgets('renders without crashing', (tester) async {
      await tester.pumpWidget(
        createTestScaffold(body: const SyncIndicator()),
      );
      await tester.pump();
      expect(find.byType(SyncIndicator), findsOneWidget);
    });

    testWidgets('shows cloud_off icon when no sync has occurred', (tester) async {
      await tester.pumpWidget(
        createTestScaffold(body: const SyncIndicator()),
      );
      await tester.pump();
      expect(find.byIcon(Icons.cloud_off_rounded), findsOneWidget);
    });

    testWidgets('shows Never synced label when no sync occurred', (tester) async {
      await tester.pumpWidget(
        createTestScaffold(body: const SyncIndicator()),
      );
      await tester.pump();
      expect(find.text('Never synced'), findsOneWidget);
    });

    testWidgets('tap triggers onTap callback', (tester) async {
      var called = false;
      await tester.pumpWidget(
        createTestScaffold(
          body: SyncIndicator(onTap: () async => called = true),
        ),
      );
      await tester.pump();
      await tester.tap(find.byType(GestureDetector).first);
      await tester.pumpAndSettle();
      expect(called, true);
    });
  });
}
