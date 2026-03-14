import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:skin_keeper/features/inventory/inventory_selection_provider.dart';

import '../../helpers/test_app.dart';

void main() {
  group('SelectionNotifier', () {
    late ProviderContainer container;

    setUp(() {
      container = createTestContainer();
    });

    tearDown(() {
      container.dispose();
    });

    test('initial state is empty', () {
      final state = container.read(selectionProvider);
      expect(state.isEmpty, true);
      expect(state.count, 0);
      expect(state.isNotEmpty, false);
    });

    test('toggle adds an item', () {
      container.read(selectionProvider.notifier).toggle('asset_1');
      final state = container.read(selectionProvider);
      expect(state.contains('asset_1'), true);
      expect(state.count, 1);
    });

    test('toggle removes an already selected item', () {
      final notifier = container.read(selectionProvider.notifier);
      notifier.toggle('asset_1');
      notifier.toggle('asset_1');
      final state = container.read(selectionProvider);
      expect(state.contains('asset_1'), false);
      expect(state.count, 0);
    });

    test('toggle multiple items independently', () {
      final notifier = container.read(selectionProvider.notifier);
      notifier.toggle('a');
      notifier.toggle('b');
      notifier.toggle('c');
      final state = container.read(selectionProvider);
      expect(state.count, 3);
      expect(state.contains('a'), true);
      expect(state.contains('b'), true);
      expect(state.contains('c'), true);
    });

    test('selectRange adds batch of items', () {
      container
          .read(selectionProvider.notifier)
          .selectRange(['x', 'y', 'z']);
      final state = container.read(selectionProvider);
      expect(state.count, 3);
      expect(state.contains('x'), true);
      expect(state.contains('z'), true);
    });

    test('selectRange does not duplicate existing items', () {
      final notifier = container.read(selectionProvider.notifier);
      notifier.toggle('x');
      notifier.selectRange(['x', 'y']);
      final state = container.read(selectionProvider);
      expect(state.count, 2);
    });

    test('deselectRange removes specified items', () {
      final notifier = container.read(selectionProvider.notifier);
      notifier.selectRange(['a', 'b', 'c', 'd']);
      notifier.deselectRange(['b', 'd']);
      final state = container.read(selectionProvider);
      expect(state.count, 2);
      expect(state.contains('a'), true);
      expect(state.contains('c'), true);
      expect(state.contains('b'), false);
    });

    test('replaceGroupSelection replaces group items with chosen subset', () {
      final notifier = container.read(selectionProvider.notifier);
      notifier.selectRange(['g1', 'g2', 'g3', 'other']);
      notifier.replaceGroupSelection(['g1', 'g2', 'g3'], ['g1']);
      final state = container.read(selectionProvider);
      expect(state.count, 2); // 'g1' and 'other'
      expect(state.contains('g1'), true);
      expect(state.contains('other'), true);
      expect(state.contains('g2'), false);
    });

    test('clear resets state to empty', () {
      final notifier = container.read(selectionProvider.notifier);
      notifier.selectRange(['a', 'b', 'c']);
      notifier.clear();
      final state = container.read(selectionProvider);
      expect(state.isEmpty, true);
      expect(state.count, 0);
    });

    test('isNotEmpty returns true when items selected', () {
      container.read(selectionProvider.notifier).toggle('x');
      expect(container.read(selectionProvider).isNotEmpty, true);
    });
  });
}
