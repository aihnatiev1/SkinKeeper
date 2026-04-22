import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme.dart';
import '../../../models/alert.dart';

class AlertSelectedItemChip extends StatelessWidget {
  final String name;
  final VoidCallback onClear;

  const AlertSelectedItemChip({
    super.key,
    required this.name,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.profit.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppTheme.r12),
        border: Border.all(
          color: AppTheme.profit.withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle, color: AppTheme.profit, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              name,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.profit,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          GestureDetector(
            onTap: onClear,
            child: const Icon(Icons.close, size: 16, color: AppTheme.textMuted),
          ),
        ],
      ),
    );
  }
}

class AlertConditionPill extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const AlertConditionPill({
    super.key,
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected
                ? AppTheme.primary.withValues(alpha: 0.15)
                : AppTheme.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected ? AppTheme.primary : AppTheme.border,
            ),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: selected ? AppTheme.primaryLight : AppTheme.textMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class AlertItemSearchField extends StatelessWidget {
  final TextEditingController controller;
  final List<String> suggestions;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onSelect;
  final VoidCallback onClear;

  const AlertItemSearchField({
    super.key,
    required this.controller,
    required this.suggestions,
    required this.onChanged,
    required this.onSelect,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: controller,
          onChanged: onChanged,
          decoration: InputDecoration(
            hintText: 'Search item...',
            hintStyle:
                const TextStyle(color: AppTheme.textDisabled),
            prefixIcon:
                const Icon(Icons.search, size: 20),
            suffixIcon: controller.text.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: onClear,
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
        if (suggestions.isNotEmpty)
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
              itemCount: suggestions.length,
              itemBuilder: (_, i) {
                final name = suggestions[i];
                return InkWell(
                  onTap: () => onSelect(name),
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
    );
  }
}

class AlertConditionPillGroup extends StatelessWidget {
  final AlertCondition condition;
  final ValueChanged<AlertCondition> onChanged;

  const AlertConditionPillGroup({
    super.key,
    required this.condition,
    required this.onChanged,
  });

  void _select(AlertCondition value) {
    HapticFeedback.selectionClick();
    onChanged(value);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            AlertConditionPill(
              label: 'drops below',
              icon: Icons.trending_down,
              selected: condition == AlertCondition.below,
              onTap: () => _select(AlertCondition.below),
            ),
            const SizedBox(width: 8),
            AlertConditionPill(
              label: 'rises above',
              icon: Icons.trending_up,
              selected: condition == AlertCondition.above,
              onTap: () => _select(AlertCondition.above),
            ),
            const SizedBox(width: 8),
            AlertConditionPill(
              label: 'changes by %',
              icon: Icons.percent,
              selected: condition == AlertCondition.changePct,
              onTap: () => _select(AlertCondition.changePct),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            AlertConditionPill(
              label: 'deal alert',
              icon: Icons.local_fire_department,
              selected: condition == AlertCondition.bargain,
              onTap: () => _select(AlertCondition.bargain),
            ),
            const SizedBox(width: 8),
            AlertConditionPill(
              label: 'sell signal',
              icon: Icons.trending_up,
              selected: condition == AlertCondition.sellNow,
              onTap: () => _select(AlertCondition.sellNow),
            ),
            const SizedBox(width: 8),
            AlertConditionPill(
              label: 'arbitrage',
              icon: Icons.compare_arrows,
              selected: condition == AlertCondition.arbitrage,
              onTap: () => _select(AlertCondition.arbitrage),
            ),
          ],
        ),
      ],
    );
  }
}

class AlertThresholdField extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool isPercent;
  final String? currentPriceHint;
  final VoidCallback onChanged;

  const AlertThresholdField({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.isPercent,
    required this.currentPriceHint,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      focusNode: focusNode,
      onChanged: (_) => onChanged(),
      keyboardType: const TextInputType.numberWithOptions(
          decimal: true),
      decoration: InputDecoration(
        prefixText: isPercent ? null : '\$ ',
        prefixStyle: const TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: AppTheme.textPrimary,
        ),
        suffixText: isPercent ? '%' : null,
        suffixStyle: const TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: AppTheme.textMuted,
        ),
        hintText: isPercent
            ? '15'
            : currentPriceHint ?? '0.00',
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
    );
  }
}

class AlertSourceSelector extends StatelessWidget {
  final AlertSource source;
  final ValueChanged<AlertSource> onChanged;

  const AlertSourceSelector({
    super.key,
    required this.source,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        AlertSource.any,
        AlertSource.steam,
        AlertSource.skinport,
        AlertSource.csfloat,
        AlertSource.dmarket
      ].map((s) {
        final selected = source == s;
        final (label, color) = switch (s) {
          AlertSource.steam => ('Steam', AppTheme.steamBlue),
          AlertSource.skinport => ('Skinport', AppTheme.skinportGreen),
          AlertSource.csfloat => ('CSFloat', AppTheme.csfloatOrange),
          AlertSource.dmarket => ('DMarket', AppTheme.dmarketPurple),
          AlertSource.any => ('Any', AppTheme.primary),
        };
        return GestureDetector(
          onTap: () {
            HapticFeedback.selectionClick();
            onChanged(s);
          },
          child: AnimatedContainer(
            duration: 200.ms,
            padding: const EdgeInsets.symmetric(
                horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: selected
                  ? color.withValues(alpha: 0.15)
                  : AppTheme.surface,
              borderRadius: BorderRadius.circular(20),
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
                color: selected ? color : AppTheme.textMuted,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

class AlertAdvancedSection extends StatelessWidget {
  final bool expanded;
  final int cooldownMinutes;
  final String cooldownLabel;
  final VoidCallback onToggle;
  final VoidCallback onCycleCooldown;

  const AlertAdvancedSection({
    super.key,
    required this.expanded,
    required this.cooldownMinutes,
    required this.cooldownLabel,
    required this.onToggle,
    required this.onCycleCooldown,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: onToggle,
          child: Row(
            children: [
              Icon(
                expanded ? Icons.expand_less : Icons.expand_more,
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
        if (expanded) ...[
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
                  onCycleCooldown();
                },
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  child: Container(
                    key: ValueKey(cooldownMinutes),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.timer_outlined,
                            size: 14, color: AppTheme.textMuted),
                        const SizedBox(width: 6),
                        Text(
                          cooldownLabel,
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
      ],
    );
  }
}

class AlertCreateCtaButton extends StatelessWidget {
  final bool hasItem;
  final bool thresholdEmpty;
  final bool loading;
  final VoidCallback? onTap;

  const AlertCreateCtaButton({
    super.key,
    required this.hasItem,
    required this.thresholdEmpty,
    required this.loading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: loading ? null : onTap,
      child: AnimatedContainer(
        duration: 200.ms,
        height: 54,
        decoration: BoxDecoration(
          gradient: AppTheme.primaryGradient,
          borderRadius: BorderRadius.circular(AppTheme.r16),
        ),
        foregroundDecoration: BoxDecoration(
          color: hasItem && !thresholdEmpty
              ? Colors.transparent
              : Colors.black.withValues(alpha: 0.45),
          borderRadius: BorderRadius.circular(AppTheme.r16),
        ),
        child: Center(
          child: loading
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
    );
  }
}
