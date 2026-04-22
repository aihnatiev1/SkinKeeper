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
                    else ...[
                      TextField(
                        controller: _searchController,
                        onChanged: _onSearchChanged,
                        decoration: InputDecoration(
                          hintText: 'Search item...',
                          hintStyle:
                              const TextStyle(color: AppTheme.textDisabled),
                          prefixIcon:
                              const Icon(Icons.search, size: 20),
                          suffixIcon: _searchController.text.isNotEmpty
                              ? IconButton(
                                  icon: const Icon(Icons.close, size: 18),
                                  onPressed: _clearItem,
                                )
                              : null,
                          filled: true,
                          fillColor: AppTheme.surface,
                          border: OutlineInputBorder(
                            borderRadius:
                                BorderRadius.circular(AppTheme.r12),
                            borderSide: BorderSide.none,
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 12),
                        ),
                        style: const TextStyle(fontSize: 14),
                      ),
                      if (_suggestions.isNotEmpty)
                        Container(
                          margin: const EdgeInsets.only(top: 4),
                          constraints: const BoxConstraints(maxHeight: 220),
                          decoration: BoxDecoration(
                            color: AppTheme.card,
                            borderRadius:
                                BorderRadius.circular(AppTheme.r12),
                            border: Border.all(color: AppTheme.border),
                          ),
                          child: ListView.builder(
                            shrinkWrap: true,
                            padding: EdgeInsets.zero,
                            itemCount: _suggestions.length,
                            itemBuilder: (_, i) {
                              final name = _suggestions[i];
                              return InkWell(
                                onTap: () => _selectItem(name),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 14, vertical: 11),
                                  child: Text(
                                    name,
                                    style: const TextStyle(fontSize: 13),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                    ],

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
                    Row(
                      children: [
                        AlertConditionPill(
                          label: 'drops below',
                          icon: Icons.trending_down,
                          selected:
                              _condition == AlertCondition.below,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            setState(
                                () => _condition = AlertCondition.below);
                          },
                        ),
                        const SizedBox(width: 8),
                        AlertConditionPill(
                          label: 'rises above',
                          icon: Icons.trending_up,
                          selected:
                              _condition == AlertCondition.above,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            setState(
                                () => _condition = AlertCondition.above);
                          },
                        ),
                        const SizedBox(width: 8),
                        AlertConditionPill(
                          label: 'changes by %',
                          icon: Icons.percent,
                          selected:
                              _condition == AlertCondition.changePct,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            setState(() =>
                                _condition = AlertCondition.changePct);
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    // Smart alert pills
                    Row(
                      children: [
                        AlertConditionPill(
                          label: 'deal alert',
                          icon: Icons.local_fire_department,
                          selected:
                              _condition == AlertCondition.bargain,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            setState(
                                () => _condition = AlertCondition.bargain);
                          },
                        ),
                        const SizedBox(width: 8),
                        AlertConditionPill(
                          label: 'sell signal',
                          icon: Icons.trending_up,
                          selected:
                              _condition == AlertCondition.sellNow,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            setState(
                                () => _condition = AlertCondition.sellNow);
                          },
                        ),
                        const SizedBox(width: 8),
                        AlertConditionPill(
                          label: 'arbitrage',
                          icon: Icons.compare_arrows,
                          selected:
                              _condition == AlertCondition.arbitrage,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            setState(() =>
                                _condition = AlertCondition.arbitrage);
                          },
                        ),
                      ],
                    ),

                    const SizedBox(height: 16),

                    // Threshold input
                    TextField(
                      controller: _thresholdController,
                      focusNode: _thresholdFocus,
                      onChanged: (_) => setState(() => _error = null),
                      keyboardType: const TextInputType.numberWithOptions(
                          decimal: true),
                      decoration: InputDecoration(
                        prefixText: _isPercentCondition ? null : '\$ ',
                        prefixStyle: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textPrimary,
                        ),
                        suffixText: _isPercentCondition ? '%' : null,
                        suffixStyle: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textMuted,
                        ),
                        hintText: _isPercentCondition
                            ? '15'
                            : _currentPriceHint ?? '0.00',
                        hintStyle: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textDisabled.withValues(alpha: 0.3),
                        ),
                        filled: true,
                        fillColor: AppTheme.surface,
                        border: OutlineInputBorder(
                          borderRadius:
                              BorderRadius.circular(AppTheme.r12),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 16),
                      ),
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                      textAlign: TextAlign.center,
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
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [AlertSource.any, AlertSource.steam, AlertSource.skinport, AlertSource.csfloat, AlertSource.dmarket].map((s) {
                        final selected = _source == s;
                        final (label, color) = switch (s) {
                          AlertSource.steam =>
                            ('Steam', AppTheme.steamBlue),
                          AlertSource.skinport =>
                            ('Skinport', AppTheme.skinportGreen),
                          AlertSource.csfloat =>
                            ('CSFloat', AppTheme.csfloatOrange),
                          AlertSource.dmarket =>
                            ('DMarket', AppTheme.dmarketPurple),
                          AlertSource.any =>
                            ('Any', AppTheme.primary),
                        };
                        return GestureDetector(
                          onTap: () {
                            HapticFeedback.selectionClick();
                            setState(() => _source = s);
                          },
                          child: AnimatedContainer(
                            duration: 200.ms,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: selected
                                  ? color.withValues(alpha: 0.15)
                                  : AppTheme.surface,
                              borderRadius:
                                  BorderRadius.circular(20),
                              border: Border.all(
                                color: selected
                                    ? color.withValues(alpha: 0.5)
                                    : AppTheme.border,
                              ),
                            ),
                            child: Text(
                              label,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: selected
                                    ? color
                                    : AppTheme.textMuted,
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),

                    const SizedBox(height: 20),

                    // ── Advanced (cooldown) ──
                    GestureDetector(
                      onTap: () => setState(
                          () => _showAdvanced = !_showAdvanced),
                      child: Row(
                        children: [
                          Icon(
                            _showAdvanced
                                ? Icons.expand_less
                                : Icons.expand_more,
                            size: 18,
                            color: AppTheme.textMuted,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'More options',
                            style: TextStyle(
                              fontSize: 13,
                              color: AppTheme.textMuted,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (_showAdvanced) ...[
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          const Text(
                            'Cooldown',
                            style: TextStyle(
                              fontSize: 13,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                          const Spacer(),
                          GestureDetector(
                            onTap: () {
                              HapticFeedback.selectionClick();
                              const options = [15, 30, 60, 120, 360, 1440];
                              final idx = options.indexOf(_cooldownMinutes);
                              setState(() {
                                _cooldownMinutes = options[(idx + 1) % options.length];
                              });
                            },
                            child: AnimatedSwitcher(
                              duration: const Duration(milliseconds: 200),
                              child: Container(
                                key: ValueKey(_cooldownMinutes),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 8),
                                decoration: BoxDecoration(
                                  color: AppTheme.surface,
                                  borderRadius:
                                      BorderRadius.circular(20),
                                  border: Border.all(color: AppTheme.border),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.timer_outlined,
                                        size: 14, color: AppTheme.textMuted),
                                    const SizedBox(width: 6),
                                    Text(
                                      _cooldownLabel(_cooldownMinutes),
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                        color: AppTheme.textPrimary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],

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
                child: GestureDetector(
                  onTap: _loading ? null : _submit,
                  child: AnimatedContainer(
                    duration: 200.ms,
                    height: 54,
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      borderRadius: BorderRadius.circular(AppTheme.r16),
                    ),
                    foregroundDecoration: BoxDecoration(
                      color: hasItem && _thresholdController.text.isNotEmpty
                          ? Colors.transparent
                          : Colors.black.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(AppTheme.r16),
                    ),
                    child: Center(
                      child: _loading
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.notifications_active_rounded,
                                  size: 20,
                                  color: hasItem
                                      ? Colors.white
                                      : AppTheme.textDisabled,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Create Alert',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: hasItem
                                        ? Colors.white
                                        : AppTheme.textDisabled,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ),
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
