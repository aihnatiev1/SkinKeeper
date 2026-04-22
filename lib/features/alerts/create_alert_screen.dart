import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/push_service.dart';
import '../../core/theme.dart';
import '../../models/alert.dart';
import '../inventory/inventory_provider.dart';
import 'alerts_provider.dart';
import 'widgets/alert_form_widgets.dart';

class CreateAlertScreen extends ConsumerStatefulWidget {
  final String? marketHashName;

  const CreateAlertScreen({super.key, this.marketHashName});

  @override
  ConsumerState<CreateAlertScreen> createState() => _CreateAlertScreenState();
}

class _CreateAlertScreenState extends ConsumerState<CreateAlertScreen> {
  final _searchController = TextEditingController();
  final _thresholdController = TextEditingController();
  final _thresholdFocus = FocusNode();

  String? _selectedItem;
  AlertCondition _condition = AlertCondition.below;
  AlertSource _source = AlertSource.any;
  int _cooldownMinutes = 60;
  bool _loading = false;
  String? _error;
  List<String> _suggestions = [];
  bool _showAdvanced = false;

  @override
  void initState() {
    super.initState();
    if (widget.marketHashName != null) {
      _selectedItem = widget.marketHashName;
      _searchController.text = widget.marketHashName!;
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _thresholdController.dispose();
    _thresholdFocus.dispose();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    if (query.isEmpty) {
      setState(() {
        _suggestions = [];
        _selectedItem = null;
      });
      return;
    }

    final inventory = ref.read(inventoryProvider).valueOrNull ?? [];
    final names = inventory
        .map((e) => e.marketHashName)
        .toSet()
        .where((name) => name.toLowerCase().contains(query.toLowerCase()))
        .take(6)
        .toList();

    setState(() {
      _suggestions = names;
      if (names.length == 1 &&
          names.first.toLowerCase() == query.toLowerCase()) {
        _selectedItem = names.first;
      }
    });
  }

  void _selectItem(String name) {
    setState(() {
      _selectedItem = name;
      _searchController.text = name;
      _suggestions = [];
    });
    _thresholdFocus.requestFocus();
  }

  String _cooldownLabel(int minutes) {
    return switch (minutes) {
      15 => '15 min',
      30 => '30 min',
      60 => '1 hour',
      120 => '2 hours',
      360 => '6 hours',
      1440 => '24 hours',
      _ => '$minutes min',
    };
  }

  bool get _isPercentCondition =>
      _condition == AlertCondition.changePct ||
      _condition == AlertCondition.bargain ||
      _condition == AlertCondition.sellNow ||
      _condition == AlertCondition.arbitrage;

  String? get _currentPriceHint {
    if (_selectedItem == null) return null;
    final inventory = ref.read(inventoryProvider).valueOrNull ?? [];
    final item = inventory.where((e) => e.marketHashName == _selectedItem).firstOrNull;
    if (item == null || item.steamPrice == null) return null;
    return item.steamPrice!.toStringAsFixed(2);
  }

  void _clearItem() {
    setState(() {
      _selectedItem = null;
      _searchController.clear();
      _suggestions = [];
    });
  }

  Future<void> _submit() async {
    if (_selectedItem == null) {
      setState(() => _error = 'Select an item first');
      return;
    }

    final threshold = double.tryParse(_thresholdController.text.replaceAll(',', '.'));
    if (threshold == null || threshold <= 0) {
      setState(() => _error = _isPercentCondition ? 'Enter a valid percentage' : 'Enter a valid price');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await ref.read(alertsProvider.notifier).createAlert(
            marketHashName: _selectedItem!,
            condition: _condition,
            threshold: threshold,
            source: _source,
            cooldownMinutes: _cooldownMinutes,
          );
      HapticFeedback.mediumImpact();
      PushService.requestPermissionAndRegister();
      if (mounted) context.pop();
    } on DioException catch (e) {
      final errorCode = (e.response?.data as Map<String, dynamic>?)?['error'];
      if (errorCode == 'premium_required' && mounted) {
        setState(() => _loading = false);
        context.push('/premium');
        return;
      }
      setState(() {
        _error = (e.response?.data as Map<String, dynamic>?)?['message']
            ?? e.message ?? 'Failed to create alert';
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasItem = _selectedItem != null;

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 16, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 20, color: AppTheme.textSecondary),
                    onPressed: () => context.pop(),
                  ),
                  Expanded(
                    child: Text(
                      'Create Alert'.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.5,
                        color: AppTheme.textDisabled,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(child: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        behavior: HitTestBehavior.translucent,
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── Item ──
                    if (hasItem && _suggestions.isEmpty)
                      AlertSelectedItemChip(
                        name: _selectedItem!,
                        onClear: _clearItem,
                      ).animate().fadeIn(duration: 250.ms)
                    else
                      AlertItemSearchField(
                        controller: _searchController,
                        suggestions: _suggestions,
                        onChanged: _onSearchChanged,
                        onSelect: _selectItem,
                        onClear: _clearItem,
                      ),

                    const SizedBox(height: 24),

                    // ── Notify me when price... ──
                    const Text(
                      'Notify me when price',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Condition pills
                    AlertConditionPillGroup(
                      condition: _condition,
                      onChanged: (c) => setState(() => _condition = c),
                    ),

                    const SizedBox(height: 16),

                    // Threshold input
                    AlertThresholdField(
                      controller: _thresholdController,
                      focusNode: _thresholdFocus,
                      isPercent: _isPercentCondition,
                      currentPriceHint: _currentPriceHint,
                      onChanged: () => setState(() => _error = null),
                    ),

                    const SizedBox(height: 24),

                    // ── Market source ──
                    const Text(
                      'Price source',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 10),
                    AlertSourceSelector(
                      source: _source,
                      onChanged: (s) => setState(() => _source = s),
                    ),

                    const SizedBox(height: 20),

                    // ── Advanced (cooldown) ──
                    AlertAdvancedSection(
                      expanded: _showAdvanced,
                      cooldownMinutes: _cooldownMinutes,
                      cooldownLabel: _cooldownLabel(_cooldownMinutes),
                      onToggle: () =>
                          setState(() => _showAdvanced = !_showAdvanced),
                      onCycleCooldown: () {
                        const options = [15, 30, 60, 120, 360, 1440];
                        final idx = options.indexOf(_cooldownMinutes);
                        setState(() {
                          _cooldownMinutes =
                              options[(idx + 1) % options.length];
                        });
                      },
                    ),

                    // Error
                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      Center(
                        child: Text(
                          _error!,
                          style: const TextStyle(
                              color: AppTheme.loss, fontSize: 13),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),

            // ── CTA button pinned at bottom ──
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                child: AlertCreateCtaButton(
                  hasItem: hasItem,
                  thresholdEmpty: _thresholdController.text.isEmpty,
                  loading: _loading,
                  onTap: _submit,
                ),
              ),
            ),
          ],
        ),
      )),
          ],
        ),
      ),
    );
  }
}
