import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/inventory_item.dart';
import 'inventory_provider.dart';

// ---------------------------------------------------------------------------
// Selection state provider — replaces StateProvider<Set<String>>
// ---------------------------------------------------------------------------

class SelectionState {
  final Set<String> selected;

  const SelectionState([this.selected = const {}]);

  bool contains(String assetId) => selected.contains(assetId);
  int get count => selected.length;
  bool get isNotEmpty => selected.isNotEmpty;
  bool get isEmpty => selected.isEmpty;
}

class SelectionNotifier extends Notifier<SelectionState> {
  @override
  SelectionState build() => const SelectionState();

  void toggle(String assetId) {
    final updated = Set<String>.from(state.selected);
    if (updated.contains(assetId)) {
      updated.remove(assetId);
    } else {
      updated.add(assetId);
    }
    state = SelectionState(updated);
  }

  void selectRange(List<String> assetIds) {
    final updated = Set<String>.from(state.selected);
    updated.addAll(assetIds);
    state = SelectionState(updated);
  }

  void deselectRange(List<String> assetIds) {
    final updated = Set<String>.from(state.selected);
    for (final id in assetIds) {
      updated.remove(id);
    }
    state = SelectionState(updated);
  }

  void replaceGroupSelection(List<String> groupAssetIds, List<String> chosen) {
    final updated = Set<String>.from(state.selected);
    for (final id in groupAssetIds) {
      updated.remove(id);
    }
    updated.addAll(chosen);
    state = SelectionState(updated);
  }

  void clear() {
    state = const SelectionState();
  }
}

final selectionProvider =
    NotifierProvider<SelectionNotifier, SelectionState>(SelectionNotifier.new);

/// Derived: list of selected InventoryItem objects
final selectedItemsListProvider = Provider<List<InventoryItem>>((ref) {
  final selection = ref.watch(selectionProvider);
  final allItems = ref.watch(filteredInventoryProvider).valueOrNull ?? [];
  if (selection.isEmpty) return [];
  return allItems.where((i) => selection.contains(i.assetId)).toList();
});
