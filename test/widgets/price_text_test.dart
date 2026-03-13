import 'package:flutter_test/flutter_test.dart';
import 'package:skin_keeper/widgets/price_text.dart';

import '../helpers/test_app.dart';

void main() {
  group('PriceText widget', () {
    testWidgets('displays formatted USD price', (tester) async {
      await tester.pumpWidget(
        createTestScaffold(
          body: const PriceText(price: 12.50),
        ),
      );
      expect(find.text('\$12.50'), findsOneWidget);
    });

    testWidgets('shows placeholder when price is null', (tester) async {
      await tester.pumpWidget(
        createTestScaffold(
          body: const PriceText(price: null),
        ),
      );
      // Default placeholder is em dash (\u2014)
      expect(find.text('\u2014'), findsOneWidget);
    });

    testWidgets('shows custom placeholder when price is null', (tester) async {
      await tester.pumpWidget(
        createTestScaffold(
          body: const PriceText(price: null, placeholder: 'N/A'),
        ),
      );
      expect(find.text('N/A'), findsOneWidget);
    });

    testWidgets('shows sign prefix for positive price when showSign=true', (tester) async {
      await tester.pumpWidget(
        createTestScaffold(
          body: const PriceText(price: 5.00, showSign: true),
        ),
      );
      expect(find.text('+\$5.00'), findsOneWidget);
    });

    testWidgets('shows absolute value for negative price when showSign=true', (tester) async {
      // PriceText uses profitLossColor for negative indication, not a '-' prefix
      await tester.pumpWidget(
        createTestScaffold(
          body: const PriceText(price: -3.25, showSign: true),
        ),
      );
      // No '+' prefix for negative values — just shows the absolute value
      expect(find.text('\$3.25'), findsOneWidget);
    });

    testWidgets('PriceText.pl uses showSign=true by default', (tester) async {
      await tester.pumpWidget(
        createTestScaffold(
          body: const PriceText.pl(price: 8.00),
        ),
      );
      expect(find.text('+\$8.00'), findsOneWidget);
    });

    testWidgets('PriceText.large uses larger font (finds text)', (tester) async {
      await tester.pumpWidget(
        createTestScaffold(
          body: const PriceText.large(price: 100.00),
        ),
      );
      expect(find.text('\$100.00'), findsOneWidget);
    });

    testWidgets('zero price displays as \$0.00', (tester) async {
      await tester.pumpWidget(
        createTestScaffold(
          body: const PriceText(price: 0.0),
        ),
      );
      expect(find.text('\$0.00'), findsOneWidget);
    });
  });
}
