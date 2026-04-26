import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../models/auto_sell_rule.dart';
import '../providers/auto_sell_providers.dart';

/// Single row in the rules list. Renders the rule's market name, the trigger
/// description ("Sell when price > $15"), a mode chip, last-fired info, and
/// the enable/disable switch. Tap navigates to the detail screen.
///
/// In [readOnlyPreview] mode the switch is non-interactive and tap is a
/// no-op — used for the free-user fake-preview list behind the [PremiumGate].
class AutoSellRuleCard extends ConsumerWidget {
  const AutoSellRuleCard({
    super.key,
    required this.rule,
    this.readOnlyPreview = false,
  });

  final AutoSellRule rule;
  final bool readOnlyPreview;

  String _triggerSummary(AutoSellRule r) {
    final dir = r.triggerType == AutoSellTriggerType.above ? '>' : '<';
    final price = r.triggerPriceUsd.toStringAsFixed(2);
    return 'Sell when price $dir \$$price';
  }

  String _lastFiredSummary(AutoSellRule r) {
    final last = r.lastFiredAt;
    if (last == null) return 'Never fired';
    final diff = DateTime.now().difference(last);
    if (diff.inMinutes < 1) return 'Fired just now';
    if (diff.inMinutes < 60) return 'Fired ${diff.inMinutes}m ago';
    if (diff.inHours < 24) return 'Fired ${diff.inHours}h ago';
    if (diff.inDays < 7) return 'Fired ${diff.inDays}d ago';
    return 'Fired ${last.day}/${last.month}/${last.year}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isAbove = rule.triggerType == AutoSellTriggerType.above;
    final triggerColor = isAbove ? AppTheme.profit : AppTheme.loss;

    return GestureDetector(
      onTap: readOnlyPreview
          ? null
          : () {
              HapticFeedback.lightImpact();
              context.push('/auto-sell/${rule.id}', extra: rule);
            },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: AppTheme.glass(),
        child: Row(
          children: [
            // Trigger icon
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: triggerColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(AppTheme.r12),
              ),
              child: Icon(
                isAbove
                    ? Icons.trending_up_rounded
                    : Icons.trending_down_rounded,
                color: triggerColor,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    rule.marketHashName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          _triggerSummary(rule),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            color: triggerColor,
                            fontWeight: FontWeight.w500,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _ModeChip(mode: rule.mode),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    _lastFiredSummary(rule),
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            Switch(
              value: rule.enabled,
              onChanged: readOnlyPreview
                  ? null
                  : (val) {
                      HapticFeedback.lightImpact();
                      ref
                          .read(autoSellRulesProvider.notifier)
                          .toggleEnabled(rule.id, val);
                    },
            ),
          ],
        ),
      ),
    );
  }
}

class _ModeChip extends StatelessWidget {
  const _ModeChip({required this.mode});

  final AutoSellMode mode;

  @override
  Widget build(BuildContext context) {
    final isAuto = mode == AutoSellMode.autoList;
    // AUTO LIST is the spicier path — gold to match the pro chip vibe.
    // NOTIFY is informational — neutral grey.
    final color = isAuto ? AppTheme.warning : AppTheme.textMuted;
    final label = isAuto ? 'AUTO LIST' : 'NOTIFY';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
          color: color,
        ),
      ),
    );
  }
}
