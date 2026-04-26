import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skin_keeper/core/theme.dart';
import 'package:skin_keeper/widgets/pro_chip.dart';

Widget _host(Widget child) => MaterialApp(
      theme: AppTheme.darkTheme,
      home: Scaffold(
        backgroundColor: AppTheme.bg,
        body: Center(child: child),
      ),
    );

void main() {
  group('ProChip', () {
    testWidgets('renders default uppercase PRO label', (tester) async {
      await tester.pumpWidget(_host(const ProChip()));
      await tester.pump();

      expect(find.text('PRO'), findsOneWidget);
    });

    testWidgets('uppercases custom label', (tester) async {
      await tester.pumpWidget(_host(const ProChip(label: 'unlock')));
      await tester.pump();

      expect(find.text('UNLOCK'), findsOneWidget);
      expect(find.text('unlock'), findsNothing);
    });

    testWidgets('renders icon when provided', (tester) async {
      await tester.pumpWidget(
        _host(const ProChip(icon: Icons.bolt_rounded)),
      );
      await tester.pump();

      expect(find.byIcon(Icons.bolt_rounded), findsOneWidget);
    });

    testWidgets('uses gold gradient (AppTheme.warning → warningLight)',
        (tester) async {
      await tester.pumpWidget(_host(const ProChip()));
      await tester.pump();

      final container = tester.widget<Container>(
        find
            .descendant(
              of: find.byType(ProChip),
              matching: find.byType(Container),
            )
            .first,
      );
      final decoration = container.decoration as BoxDecoration?;
      expect(decoration?.gradient, isA<LinearGradient>());
      final gradient = decoration!.gradient as LinearGradient;
      expect(gradient.colors, contains(AppTheme.warning));
      expect(gradient.colors, contains(AppTheme.warningLight));
    });

    testWidgets('text style uses weight 700 + uppercase letter-spacing',
        (tester) async {
      await tester.pumpWidget(_host(const ProChip()));
      await tester.pump();

      final text = tester.widget<Text>(find.text('PRO'));
      expect(text.style?.fontWeight, FontWeight.w700);
      expect(text.style?.letterSpacing, 1.2);
    });

    group('size variants', () {
      testWidgets('small renders at smaller font than medium', (tester) async {
        await tester.pumpWidget(_host(
          const Column(
            children: [
              ProChip(size: ProChipSize.small),
              ProChip(size: ProChipSize.medium),
              ProChip(size: ProChipSize.large),
            ],
          ),
        ));
        await tester.pump();

        final texts = tester.widgetList<Text>(find.text('PRO')).toList();
        expect(texts, hasLength(3));
        final fontSizes = texts.map((t) => t.style!.fontSize!).toList();
        expect(fontSizes[0] < fontSizes[1], isTrue);
        expect(fontSizes[1] < fontSizes[2], isTrue);
      });
    });
  });
}
