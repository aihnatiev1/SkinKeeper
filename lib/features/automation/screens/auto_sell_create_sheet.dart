import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../../inventory/inventory_provider.dart';
import '../../../models/inventory_item.dart';
import '../models/auto_sell_rule.dart';
import '../providers/auto_sell_providers.dart';

/// Three-step modal sheet for creating a new auto-sell rule.
///
/// Steps:
///   1. Item picker — search the user's tradable inventory.
///   2. Trigger     — above/below toggle + USD threshold input.
///   3. Strategy    — fixed / market_max / percent + mode selector.
///
/// Edit mode: pass [existing] to pre-fill all three steps and PATCH on
/// submit instead of POST. The item picker is hidden in edit mode (you
/// can't change the rule's market_hash_name; create a new rule for that).
class AutoSellCreateSheet extends ConsumerStatefulWidget {
  const AutoSellCreateSheet({
    super.key,
    required this.accountId,
    this.existing,
  });

  final int accountId;

  /// When non-null, the sheet runs in edit mode (PATCH instead of POST).
  /// Step 1 is skipped — market_hash_name is immutable post-create.
  final AutoSellRule? existing;

  @override
  ConsumerState<AutoSellCreateSheet> createState() =>
      _AutoSellCreateSheetState();
}

class _AutoSellCreateSheetState extends ConsumerState<AutoSellCreateSheet> {
  static const _stepCount = 3;

  // ── State across steps ──
  int _step = 0;
  String? _selectedItem;
  AutoSellTriggerType _triggerType = AutoSellTriggerType.above;
  final _triggerCtrl = TextEditingController();
  AutoSellStrategy _strategy = AutoSellStrategy.fixed;
  final _sellPriceCtrl = TextEditingController();
  double _percentOfMarket = 95;
  AutoSellMode _mode = AutoSellMode.notifyOnly;
  int _cooldownMinutes = 360;
  String? _error;
  bool _submitting = false;

  // ── Item picker ──
  final _searchCtrl = TextEditingController();
  String _query = '';

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final ex = widget.existing;
    if (ex != null) {
      _selectedItem = ex.marketHashName;
      _searchCtrl.text = ex.marketHashName;
      _triggerType = ex.triggerType;
      _triggerCtrl.text = ex.triggerPriceUsd.toStringAsFixed(2);
      _strategy = ex.sellStrategy;
      if (ex.sellStrategy == AutoSellStrategy.percentOfMarket &&
          ex.sellPriceUsd != null) {
        _percentOfMarket = ex.sellPriceUsd!.clamp(50, 99);
      } else if (ex.sellPriceUsd != null) {
        _sellPriceCtrl.text = ex.sellPriceUsd!.toStringAsFixed(2);
      }
      _mode = ex.mode;
      _cooldownMinutes = ex.cooldownMinutes;
      // Edit mode: skip the item-picker step.
      _step = 1;
    }
  }

  @override
  void dispose() {
    _triggerCtrl.dispose();
    _sellPriceCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  // ── Step validation ─────────────────────────────────────────

  bool get _step1Valid => _selectedItem != null;

  bool get _step2Valid {
    final v = double.tryParse(_triggerCtrl.text.replaceAll(',', '.'));
    return v != null && v > 0 && v < 100000;
  }

  bool get _step3Valid {
    if (_strategy == AutoSellStrategy.fixed) {
      final v = double.tryParse(_sellPriceCtrl.text.replaceAll(',', '.'));
      return v != null && v > 0 && v < 100000;
    }
    if (_strategy == AutoSellStrategy.percentOfMarket) {
      return _percentOfMarket >= 50 && _percentOfMarket <= 99;
    }
    // market_max: nothing else to validate.
    return true;
  }

  bool get _canAdvance {
    if (_step == 0) return _step1Valid;
    if (_step == 1) return _step2Valid;
    return _step3Valid;
  }

  void _next() {
    if (!_canAdvance) return;
    HapticFeedback.lightImpact();
    if (_step < _stepCount - 1) {
      setState(() => _step++);
    } else {
      _submit();
    }
  }

  void _back() {
    if (_isEdit && _step == 1) {
      Navigator.of(context).pop();
      return;
    }
    if (_step == 0) {
      Navigator.of(context).pop();
      return;
    }
    setState(() => _step--);
  }

  // ── Submit ─────────────────────────────────────────────────

  /// Auto-list mode requires explicit confirmation the first time the user
  /// switches to it within the sheet. Returns true if they continue,
  /// false if they cancel — caller falls back to notify_only.
  Future<bool> _confirmAutoListIntent() async {
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.bgSecondary,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.r20)),
        title: const Text(
          'Enable auto-listing?',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        content: const Text(
          'Auto-list creates listings without confirmation. '
          'You will see a 60-second cancel window for each fire — tap '
          '"Cancel" in the modal or the push notification to stop the '
          'listing before it goes through.',
          style: TextStyle(color: AppTheme.textSecondary, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Keep notify only'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text(
              'Enable auto-list',
              style: TextStyle(color: AppTheme.warning),
            ),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  Future<void> _submit() async {
    if (_mode == AutoSellMode.autoList && !_isEdit) {
      // Only ask once for new rules. Edits pass through — the user
      // already lived with the toggle visible.
      final keep = await _confirmAutoListIntent();
      if (!keep) {
        setState(() => _mode = AutoSellMode.notifyOnly);
      }
    }

    final triggerPrice = double.parse(_triggerCtrl.text.replaceAll(',', '.'));
    double? sellPrice;
    if (_strategy == AutoSellStrategy.fixed) {
      sellPrice = double.parse(_sellPriceCtrl.text.replaceAll(',', '.'));
    } else if (_strategy == AutoSellStrategy.percentOfMarket) {
      sellPrice = _percentOfMarket;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final notifier = ref.read(autoSellRulesProvider.notifier);
      if (_isEdit) {
        await notifier.updateRule(
          widget.existing!.id,
          mode: _mode,
          triggerPriceUsd: triggerPrice,
          sellPriceUsd: sellPrice,
          clearSellPrice: _strategy == AutoSellStrategy.marketMax,
          sellStrategy: _strategy,
          cooldownMinutes: _cooldownMinutes,
        );
      } else {
        await notifier.createRule(
          accountId: widget.accountId,
          marketHashName: _selectedItem!,
          triggerType: _triggerType,
          triggerPriceUsd: triggerPrice,
          sellPriceUsd: sellPrice,
          sellStrategy: _strategy,
          mode: _mode,
          cooldownMinutes: _cooldownMinutes,
        );
      }
      if (mounted) {
        HapticFeedback.mediumImpact();
        Navigator.of(context).pop(true);
      }
    } on DioException catch (e) {
      String msg;
      if (isPremiumRequired(e)) {
        msg = 'Premium required';
      } else if (e.response?.statusCode == 400) {
        final body = e.response?.data;
        final raw = body is Map ? body['error'] as String? : null;
        msg = raw ?? 'Invalid rule';
      } else {
        msg = friendlyError(e);
      }
      if (mounted) {
        setState(() {
          _error = msg;
          _submitting = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _submitting = false;
        });
      }
    }
  }

  // ── Build ──────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: viewInsets),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.86,
        child: Column(
          children: [
            // ── Header ──
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppTheme.textDisabled,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Text(
                    _isEdit ? 'Edit rule'.toUpperCase() : 'New rule'.toUpperCase(),
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.5,
                      color: AppTheme.textDisabled,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    'Step ${_step + 1} of $_stepCount',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textMuted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            // ── Step body ──
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
                child: switch (_step) {
                  0 => _Step1ItemPicker(
                      controller: _searchCtrl,
                      query: _query,
                      onQueryChanged: (q) => setState(() => _query = q),
                      selectedItem: _selectedItem,
                      onSelect: (n) => setState(() {
                        _selectedItem = n;
                        _searchCtrl.text = n;
                        _query = '';
                      }),
                      onClear: () => setState(() {
                        _selectedItem = null;
                        _searchCtrl.clear();
                      }),
                    ),
                  1 => _Step2Trigger(
                      type: _triggerType,
                      onTypeChange: (t) => setState(() => _triggerType = t),
                      controller: _triggerCtrl,
                      onChanged: () => setState(() {}),
                      currentMarketPrice: _currentMarketPriceFor(_selectedItem),
                    ),
                  _ => _Step3Strategy(
                      strategy: _strategy,
                      onStrategyChange: (s) => setState(() {
                        _strategy = s;
                        // Clear sell price when switching to market_max so
                        // submit doesn't try to send a stale value.
                        if (s == AutoSellStrategy.marketMax) {
                          _sellPriceCtrl.clear();
                        }
                      }),
                      sellPriceCtrl: _sellPriceCtrl,
                      onSellPriceChanged: () => setState(() {}),
                      percent: _percentOfMarket,
                      onPercentChange: (p) => setState(() => _percentOfMarket = p),
                      mode: _mode,
                      onModeChange: (m) => setState(() => _mode = m),
                      cooldownMinutes: _cooldownMinutes,
                      onCooldownChange: (m) =>
                          setState(() => _cooldownMinutes = m),
                    ),
                },
              ),
            ),
            // ── Error ──
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  _error!,
                  style: const TextStyle(color: AppTheme.loss, fontSize: 13),
                ),
              ),
            // ── Footer (Back / Next or Create) ──
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                child: Row(
                  children: [
                    OutlinedButton(
                      onPressed: _submitting ? null : _back,
                      child: Text(_step == 0 || (_isEdit && _step == 1)
                          ? 'Cancel'
                          : 'Back'),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: (_canAdvance && !_submitting) ? _next : null,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppTheme.primary,
                          padding:
                              const EdgeInsets.symmetric(vertical: 14),
                        ),
                        child: _submitting
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Text(
                                _step == _stepCount - 1
                                    ? (_isEdit ? 'Save changes' : 'Create rule')
                                    : 'Next',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  double? _currentMarketPriceFor(String? name) {
    if (name == null) return null;
    final inv = ref.read(inventoryProvider).valueOrNull ?? const [];
    final hit = inv.where((i) => i.marketHashName == name).firstOrNull;
    return hit?.steamPrice;
  }
}

// ─── Step 1: item picker ──────────────────────────────────────

class _Step1ItemPicker extends ConsumerWidget {
  const _Step1ItemPicker({
    required this.controller,
    required this.query,
    required this.onQueryChanged,
    required this.selectedItem,
    required this.onSelect,
    required this.onClear,
  });

  final TextEditingController controller;
  final String query;
  final ValueChanged<String> onQueryChanged;
  final String? selectedItem;
  final ValueChanged<String> onSelect;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inv = ref.watch(inventoryProvider).valueOrNull ?? const [];
    // Tradable filter — items in trade lock can't be auto-listed and we'd
    // surface a confusing "no asset available" failure later. Filter at the
    // picker so the user only sees viable options.
    final tradable = inv.where((i) => i.tradable).toList();
    final names = <String, InventoryItem>{};
    for (final it in tradable) {
      names.putIfAbsent(it.marketHashName, () => it);
    }
    final filtered = names.entries
        .where((e) =>
            query.isEmpty ||
            e.key.toLowerCase().contains(query.toLowerCase()))
        .take(20)
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Pick an item',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: AppTheme.textPrimary,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Auto-sell watches one item per rule. Pick from your tradable inventory.',
          style: TextStyle(fontSize: 13, color: AppTheme.textSecondary, height: 1.4),
        ),
        const SizedBox(height: 16),
        if (selectedItem != null)
          _SelectedChip(name: selectedItem!, onClear: onClear)
        else
          TextField(
            controller: controller,
            onChanged: onQueryChanged,
            autofocus: true,
            decoration: const InputDecoration(
              hintText: 'Search inventory…',
              prefixIcon: Icon(Icons.search_rounded),
            ),
          ),
        const SizedBox(height: 12),
        if (selectedItem == null)
          ...filtered.map((e) => _ItemSuggestionTile(
                name: e.key,
                price: e.value.steamPrice,
                iconUrl: e.value.fullIconUrl,
                onTap: () => onSelect(e.key),
              )),
        if (selectedItem == null && filtered.isEmpty && query.isNotEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 24),
            child: Center(
              child: Text(
                'No tradable items match',
                style: TextStyle(color: AppTheme.textMuted),
              ),
            ),
          ),
      ],
    );
  }
}

class _SelectedChip extends StatelessWidget {
  const _SelectedChip({required this.name, required this.onClear});

  final String name;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppTheme.r12),
        border: Border.all(color: AppTheme.primary.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle, color: AppTheme.primary, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
          IconButton(
            onPressed: onClear,
            icon: const Icon(Icons.close_rounded, size: 18),
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}

class _ItemSuggestionTile extends StatelessWidget {
  const _ItemSuggestionTile({
    required this.name,
    required this.price,
    required this.iconUrl,
    required this.onTap,
  });

  final String name;
  final double? price;
  final String iconUrl;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppTheme.r12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        child: Row(
          children: [
            // Plain network image keeps test-time dependencies minimal.
            // Image errors silently fall through to the icon placeholder.
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(AppTheme.r8),
              ),
              child: const Icon(Icons.inventory_2_outlined,
                  size: 18, color: AppTheme.textMuted),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (price != null)
                    Text(
                      '\$${price!.toStringAsFixed(2)}',
                      style: AppTheme.monoSmall,
                    ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded,
                color: AppTheme.textMuted),
          ],
        ),
      ),
    );
  }
}

// ─── Step 2: trigger ──────────────────────────────────────────

class _Step2Trigger extends StatelessWidget {
  const _Step2Trigger({
    required this.type,
    required this.onTypeChange,
    required this.controller,
    required this.onChanged,
    required this.currentMarketPrice,
  });

  final AutoSellTriggerType type;
  final ValueChanged<AutoSellTriggerType> onTypeChange;
  final TextEditingController controller;
  final VoidCallback onChanged;
  final double? currentMarketPrice;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'When should it fire?',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: AppTheme.textPrimary,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Choose direction and a USD threshold. The rule fires once the '
          'market price crosses your line.',
          style: TextStyle(fontSize: 13, color: AppTheme.textSecondary, height: 1.4),
        ),
        const SizedBox(height: 16),
        // Direction toggle
        Row(
          children: [
            Expanded(
              child: _DirectionToggle(
                label: 'When price >',
                color: AppTheme.profit,
                icon: Icons.trending_up_rounded,
                selected: type == AutoSellTriggerType.above,
                onTap: () => onTypeChange(AutoSellTriggerType.above),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _DirectionToggle(
                label: 'When price <',
                color: AppTheme.loss,
                icon: Icons.trending_down_rounded,
                selected: type == AutoSellTriggerType.below,
                onTap: () => onTypeChange(AutoSellTriggerType.below),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        TextField(
          controller: controller,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => onChanged(),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
          ],
          decoration: const InputDecoration(
            labelText: 'Threshold (USD)',
            prefixText: '\$ ',
            hintText: '15.00',
          ),
        ),
        if (currentMarketPrice != null) ...[
          const SizedBox(height: 8),
          Text(
            'Current market: \$${currentMarketPrice!.toStringAsFixed(2)}',
            style: AppTheme.monoSmall.copyWith(color: AppTheme.textMuted),
          ),
        ],
      ],
    );
  }
}

class _DirectionToggle extends StatelessWidget {
  const _DirectionToggle({
    required this.label,
    required this.color,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final Color color;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.16) : AppTheme.surface,
          borderRadius: BorderRadius.circular(AppTheme.r12),
          border: Border.all(
            color: selected
                ? color.withValues(alpha: 0.6)
                : AppTheme.border,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 18, color: selected ? color : AppTheme.textMuted),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: selected ? color : AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Step 3: strategy + mode ──────────────────────────────────

class _Step3Strategy extends StatelessWidget {
  const _Step3Strategy({
    required this.strategy,
    required this.onStrategyChange,
    required this.sellPriceCtrl,
    required this.onSellPriceChanged,
    required this.percent,
    required this.onPercentChange,
    required this.mode,
    required this.onModeChange,
    required this.cooldownMinutes,
    required this.onCooldownChange,
  });

  final AutoSellStrategy strategy;
  final ValueChanged<AutoSellStrategy> onStrategyChange;
  final TextEditingController sellPriceCtrl;
  final VoidCallback onSellPriceChanged;
  final double percent;
  final ValueChanged<double> onPercentChange;
  final AutoSellMode mode;
  final ValueChanged<AutoSellMode> onModeChange;
  final int cooldownMinutes;
  final ValueChanged<int> onCooldownChange;

  String _cooldownLabel(int m) => switch (m) {
        15 => '15 min',
        30 => '30 min',
        60 => '1 hour',
        120 => '2 hours',
        360 => '6 hours',
        720 => '12 hours',
        1440 => '24 hours',
        _ => '$m min',
      };

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'How should it sell?',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: AppTheme.textPrimary,
          ),
        ),
        const SizedBox(height: 14),
        // Strategy radios
        _StrategyRadio(
          label: 'Fixed price',
          subtitle: 'List at the price I type',
          selected: strategy == AutoSellStrategy.fixed,
          onTap: () => onStrategyChange(AutoSellStrategy.fixed),
        ),
        const SizedBox(height: 6),
        _StrategyRadio(
          label: 'Market max',
          subtitle: '1% undercut of current market',
          selected: strategy == AutoSellStrategy.marketMax,
          onTap: () => onStrategyChange(AutoSellStrategy.marketMax),
        ),
        const SizedBox(height: 6),
        _StrategyRadio(
          label: 'Percent of market',
          subtitle: 'List at chosen % of current price',
          selected: strategy == AutoSellStrategy.percentOfMarket,
          onTap: () => onStrategyChange(AutoSellStrategy.percentOfMarket),
        ),
        const SizedBox(height: 14),
        if (strategy == AutoSellStrategy.fixed)
          TextField(
            controller: sellPriceCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
            ],
            onChanged: (_) => onSellPriceChanged(),
            decoration: const InputDecoration(
              labelText: 'List price (USD)',
              prefixText: '\$ ',
            ),
          ),
        if (strategy == AutoSellStrategy.percentOfMarket) ...[
          Row(
            children: [
              Text(
                '${percent.round()}% of market',
                style: AppTheme.mono.copyWith(fontSize: 16),
              ),
              const Spacer(),
              const Text('50–99%', style: TextStyle(color: AppTheme.textMuted)),
            ],
          ),
          Slider(
            value: percent,
            min: 50,
            max: 99,
            divisions: 49,
            onChanged: onPercentChange,
          ),
        ],
        const SizedBox(height: 18),
        const Text(
          'Mode',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppTheme.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        _ModeRadio(
          label: 'Notify only',
          subtitle: "I'll just tell you when the condition is met.",
          selected: mode == AutoSellMode.notifyOnly,
          onTap: () => onModeChange(AutoSellMode.notifyOnly),
        ),
        const SizedBox(height: 6),
        _ModeRadio(
          label: 'Auto list',
          subtitle: 'Create the listing automatically. 60 s to cancel each fire.',
          selected: mode == AutoSellMode.autoList,
          accent: AppTheme.warning,
          onTap: () => onModeChange(AutoSellMode.autoList),
        ),
        const SizedBox(height: 18),
        const Text(
          'Cooldown',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppTheme.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [60, 120, 360, 720, 1440].map((m) {
            final active = cooldownMinutes == m;
            return GestureDetector(
              onTap: () => onCooldownChange(m),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: active
                      ? AppTheme.primary.withValues(alpha: 0.18)
                      : AppTheme.surface,
                  borderRadius: BorderRadius.circular(AppTheme.r10),
                  border: Border.all(
                    color: active
                        ? AppTheme.primary.withValues(alpha: 0.5)
                        : AppTheme.border,
                  ),
                ),
                child: Text(
                  _cooldownLabel(m),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: active ? AppTheme.primary : AppTheme.textSecondary,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}

class _StrategyRadio extends StatelessWidget {
  const _StrategyRadio({
    required this.label,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppTheme.r12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.primary.withValues(alpha: 0.10)
              : AppTheme.surface,
          borderRadius: BorderRadius.circular(AppTheme.r12),
          border: Border.all(
            color: selected
                ? AppTheme.primary.withValues(alpha: 0.5)
                : AppTheme.border,
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              color: selected ? AppTheme.primary : AppTheme.textMuted,
              size: 20,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ModeRadio extends StatelessWidget {
  const _ModeRadio({
    required this.label,
    required this.subtitle,
    required this.selected,
    required this.onTap,
    this.accent = AppTheme.primary,
  });

  final String label;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppTheme.r12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected ? accent.withValues(alpha: 0.10) : AppTheme.surface,
          borderRadius: BorderRadius.circular(AppTheme.r12),
          border: Border.all(
            color: selected ? accent.withValues(alpha: 0.5) : AppTheme.border,
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              color: selected ? accent : AppTheme.textMuted,
              size: 20,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: selected ? accent : AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
