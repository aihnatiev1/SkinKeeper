import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/analytics_service.dart';
import '../../../core/feature_flags/feature_flags_provider.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/screen_state_builder.dart';
import '../../../widgets/premium_gate.dart';
import '../../../widgets/shared_ui.dart';
import '../../auth/steam_auth_service.dart';
import '../../purchases/iap_service.dart';
import '../models/auto_sell_rule.dart';
import '../providers/auto_sell_providers.dart';
import '../widgets/auto_sell_rule_card.dart';
import 'auto_sell_create_sheet.dart';

/// User-facing entry point for auto-sell rules. Wrapped in [PremiumGate] —
/// free users see a blurred fake-preview list with 2-3 example rules so they
/// understand what the feature does before tapping the upgrade CTA. Premium
/// users see their real rules (or an empty state).
///
/// Layout convention: matches `AlertsScreen` (CS2-style large-title + custom
/// header + FAB at the bottom). The PremiumGate wraps the whole content
/// area, so the FAB also gets gated implicitly — rather than having a free
/// user tap a real "+" button only to be denied at the API layer.
class AutoSellListScreen extends ConsumerWidget {
  const AutoSellListScreen({super.key});

  static const int rulesLimit = 10;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // P10: server-side feature flag gate sits ABOVE the PremiumGate. When the
    // backend kills the feature (rollout pause, incident response, region
    // gating) we render a "coming soon" placeholder for everyone — including
    // PRO users — instead of letting them hit a 403 at every API call.
    //
    // Default `true` so a flags-fetch failure (offline, server down) doesn't
    // hide a feature that's normally available. The 403 FEATURE_DISABLED
    // interceptor in `api_client.dart` is the safety net for stale caches.
    final autoSellEnabled =
        ref.featureFlagEnabled('auto_sell', defaultValue: true);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Custom header (CS2-style label + back) ──
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 16, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 20, color: AppTheme.textSecondary),
                    onPressed: () => context.pop(),
                  ),
                  Expanded(
                    child: Text(
                      // TODO(l10n): extract 'Auto-sell' label.
                      'Auto-sell'.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.5,
                        color: AppTheme.textDisabled,
                      ),
                    ),
                  ),
                  if (autoSellEnabled)
                    Consumer(builder: (context, ref, _) {
                      final isPremium =
                          ref.watch(premiumProvider).valueOrNull ?? false;
                      if (!isPremium) return const SizedBox.shrink();
                      final count = ref
                              .watch(autoSellRulesProvider)
                              .valueOrNull
                              ?.length ??
                          0;
                      return Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // P11 dashboard entry — chart icon next to the
                          // counter chip. Premium-only because the
                          // dashboard is gated and we don't tease here
                          // (the list screen's own gate handles that).
                          IconButton(
                            tooltip: 'My auto-sell stats',
                            icon: const Icon(Icons.insights_rounded,
                                size: 20, color: AppTheme.textSecondary),
                            onPressed: () =>
                                context.push('/auto-sell/dashboard'),
                          ),
                          _RuleCounterChip(used: count, max: rulesLimit),
                        ],
                      );
                    }),
                ],
              ),
            ),
            Expanded(
              child: autoSellEnabled
                  // The whole content area lives inside PremiumGate. Free
                  // users see the fake preview blurred; premium users see
                  // the real list.
                  ? PremiumGate(
                      featureId: 'auto_sell',
                      featureName: 'Auto-sell',
                      lockedSubtitle:
                          'Set rules — let the bot list when prices hit your target.',
                      paywallSource: PaywallSource.lockedTap,
                      child: const _AutoSellContent(),
                    )
                  : const _AutoSellComingSoon(),
            ),
          ],
        ),
      ),
    );
  }
}

/// Placeholder shown when the `auto_sell` feature flag is OFF. Distinct from
/// the PRO upgrade gate — this is a "we turned the feature off temporarily"
/// state that affects EVERY user (free and PRO alike). Don't show a paywall
/// CTA here; routing to /premium would mislead the user into paying for
/// something they can't use.
class _AutoSellComingSoon extends StatelessWidget {
  const _AutoSellComingSoon();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppTheme.primary.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.bolt_outlined,
                size: 32,
                color: AppTheme.primary,
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              // TODO(l10n): "Auto-sell coming soon!"
              'Auto-sell coming soon',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              // TODO(l10n)
              'We are polishing this feature. It will be back shortly — '
              'check back soon.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RuleCounterChip extends StatelessWidget {
  const _RuleCounterChip({required this.used, required this.max});

  final int used;
  final int max;

  @override
  Widget build(BuildContext context) {
    final atLimit = used >= max;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: (atLimit ? AppTheme.loss : AppTheme.accent)
            .withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: (atLimit ? AppTheme.loss : AppTheme.accent)
              .withValues(alpha: 0.25),
        ),
      ),
      child: Text(
        '$used of $max',
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: atLimit ? AppTheme.loss : AppTheme.accent,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

/// Real (premium) content. Renders the user's rules + FAB for adding more.
/// Free users never see this — the [PremiumGate] swaps in the blurred
/// preview from [_FakeRulesPreview] (passed as the gate's child).
///
/// We pass [_FakeRulesPreview] as the gate's child but keep the real
/// content as a sibling-by-condition: when premium=true the gate renders
/// child directly, but in our case we want a different tree (real list +
/// FAB) for premium users. To avoid double-rendering the fake list to
/// premium users we wrap the whole thing in a Consumer that picks the
/// right tree.
class _AutoSellContent extends ConsumerWidget {
  const _AutoSellContent();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isPremium = ref.watch(premiumProvider).valueOrNull ?? false;
    if (!isPremium) {
      // Free user — gate's child slot. Render the fake preview which the
      // gate then blurs.
      return const _FakeRulesPreview();
    }

    return const _RealRulesList();
  }
}

/// Premium-only real rules list.
///
/// Hits an empty state when a premium user has no rules — distinct from the
/// free user's fake-preview state (gate handles that via [_FakeRulesPreview]).
class _RealRulesList extends ConsumerWidget {
  const _RealRulesList();

  void _openCreateSheet(BuildContext context, WidgetRef ref) {
    HapticFeedback.lightImpact();
    final accountId = ref.read(authStateProvider).valueOrNull?.activeAccountId;
    if (accountId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No active Steam account')),
      );
      return;
    }
    showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.bgSecondary,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppTheme.r24)),
      ),
      builder: (_) => AutoSellCreateSheet(accountId: accountId),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rulesAsync = ref.watch(autoSellRulesProvider);
    final atLimit = (rulesAsync.valueOrNull?.length ?? 0) >=
        AutoSellListScreen.rulesLimit;

    return Stack(
      children: [
        ScreenStateBuilder<List<AutoSellRule>>(
          state: rulesAsync,
          isEmpty: (rules) => rules.isEmpty,
          onRetry: () => ref.invalidate(autoSellRulesProvider),
          emptyIcon: Icons.bolt_rounded,
          emptyTitle: 'No rules yet',
          emptySubtitle: 'Create your first auto-sell rule',
          builder: (rules) => AppRefreshIndicator(
            onRefresh: () =>
                ref.read(autoSellRulesProvider.notifier).refresh(),
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
              itemCount: rules.length,
              itemBuilder: (_, i) => AutoSellRuleCard(rule: rules[i])
                  .animate()
                  .fadeIn(duration: 250.ms, delay: (i * 40).ms)
                  .slideX(begin: 0.03, end: 0),
            ),
          ),
        ),
        // FAB — disabled if at the 10-rule limit (matches counter chip).
        Positioned(
          bottom: 16,
          left: 0,
          right: 0,
          child: Center(
            child: GestureDetector(
              onTap: atLimit ? null : () => _openCreateSheet(context, ref),
              child: Opacity(
                opacity: atLimit ? 0.5 : 1.0,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 24, vertical: 14),
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.primary.withValues(alpha: 0.45),
                        blurRadius: 20,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.add_rounded,
                          size: 20, color: Colors.white),
                      const SizedBox(width: 8),
                      Text(
                        atLimit ? 'Limit reached' : 'New rule',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
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
    );
  }
}

/// Static fake rules shown to free users behind the gate's blur. Carefully
/// chosen so they read as "this is what auto-sell would look like" without
/// implying any of these are the user's rules.
///
/// These are pure visuals — no data binding, no interaction. The gate's
/// `IgnorePointer` swallows taps anyway.
class _FakeRulesPreview extends StatelessWidget {
  const _FakeRulesPreview();

  static final _now = DateTime.now();

  static final _samples = [
    AutoSellRule(
      id: -1,
      accountId: 0,
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      triggerType: AutoSellTriggerType.above,
      triggerPriceUsd: 15.00,
      sellPriceUsd: 14.99,
      sellStrategy: AutoSellStrategy.fixed,
      mode: AutoSellMode.notifyOnly,
      enabled: true,
      cooldownMinutes: 360,
      lastFiredAt: _now.subtract(const Duration(hours: 2)),
      timesFired: 3,
      createdAt: _now.subtract(const Duration(days: 4)),
    ),
    AutoSellRule(
      id: -2,
      accountId: 0,
      marketHashName: 'Glock-18 | Fade (Factory New)',
      triggerType: AutoSellTriggerType.above,
      triggerPriceUsd: 850.00,
      sellPriceUsd: null,
      sellStrategy: AutoSellStrategy.marketMax,
      mode: AutoSellMode.autoList,
      enabled: true,
      cooldownMinutes: 720,
      lastFiredAt: null,
      timesFired: 0,
      createdAt: _now.subtract(const Duration(days: 1)),
    ),
    AutoSellRule(
      id: -3,
      accountId: 0,
      marketHashName: 'AWP | Asiimov (Field-Tested)',
      triggerType: AutoSellTriggerType.below,
      triggerPriceUsd: 80.00,
      sellPriceUsd: 95.00,
      sellStrategy: AutoSellStrategy.percentOfMarket,
      mode: AutoSellMode.notifyOnly,
      enabled: false,
      cooldownMinutes: 360,
      lastFiredAt: _now.subtract(const Duration(days: 3)),
      timesFired: 7,
      createdAt: _now.subtract(const Duration(days: 12)),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _samples.length,
      itemBuilder: (_, i) =>
          AutoSellRuleCard(rule: _samples[i], readOnlyPreview: true),
    );
  }
}
