import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:skin_tracker/main.dart';

void main() {
  testWidgets('App renders login screen', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: SkinTrackerApp()),
    );
    await tester.pumpAndSettle();

    expect(find.text('SkinTracker'), findsOneWidget);
  });
}
