import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/analytics_service.dart';
import '../../core/feature_flags/feature_flags_provider.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../core/widgets/screen_state_builder.dart';
import '../../models/alert.dart';
import '../../widgets/premium_gate.dart';
import '../../widgets/shared_ui.dart';
import '../../widgets/tease_card.dart';
import 'alerts_provider.dart';
import 'widgets/alert_actions_sheet.dart';

class AlertsScreen extends ConsumerStatefulWidget {
  const AlertsScreen({super.key});

  @override
  ConsumerState<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends ConsumerState<AlertsScreen> {
  int _selectedTab = 0;
  late final PageController _pageCtrl;

  @override
  void initState() {
    super.initState();
    _pageCtrl = PageController();
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      floatingActionButton: null,
      body: SafeArea(
        child: Stack(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Custom header ──
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
                          'Price Alerts'.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.5,
                            color: AppTheme.textDisabled,
                          ),
                        ),
                      ),
                      GestureDetector(
                        onTap: () {
                          HapticFeedback.lightImpact();
                          context.push('/watchlist');
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppTheme.accent.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: AppTheme.accent.withValues(alpha: 0.25),
                            ),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.visibility_outlined,
                                  size: 14, color: AppTheme.accent),
                              SizedBox(width: 4),
                              Text(
                                'Watchlist',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: AppTheme.accent,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                // ── Custom pill tabs ──
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: PillTabSelector(
                    tabs: const ['Active', 'History'],
                    selected: _selectedTab,
                    onChanged: (i) {
                      setState(() => _selectedTab = i);
                      _pageCtrl.animateToPage(i, duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
                    },
                  ),
                ),

                // ── Tab content ──
                Expanded(
                  child: PageView(
                    controller: _pageCtrl,
                    onPageChanged: (i) => setState(() => _selectedTab = i),
                    children: const [_ActiveAlertsTab(), _HistoryTab()],
                  ),
                ),

                // Space for FAB
                const SizedBox(height: 80),
              ],
            ),

            // ── Gradient FAB (gated behind PRO for free users) ──
            Positioned(
              bottom: 16,
              left: 0,
              right: 0,
              child: Center(
                // Reference v2 integration (PLAN §5 Phase 1 acceptance).
                // Free users see a PRO-locked version of the Create Alert
                // button; PRO users get the original behaviour (push to
                // /alerts/create) without any extra widgets in the tree.
                child: PremiumGate(
                  featureId: 'create_alert',
                  featureName: 'Create Price Alert',
                  lockedSubtitle:
                      'Get notified when prices hit your targets across every market.',
                  paywallSource: PaywallSource.lockedTap,
                  child: GestureDetector(
                    onTap: () {
                      HapticFeedback.lightImpact();
                      context.push('/alerts/create');
                    },
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
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.add_alert_rounded,
                              size: 20, color: Colors.white),
                          SizedBox(width: 8),
                          Text(
                            'Create Alert',
                            style: TextStyle(
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
        ),
      ),
    );
  }
}

class _ActiveAlertsTab extends ConsumerWidget {
  const _ActiveAlertsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alertsAsync = ref.watch(alertsProvider);

    return ScreenStateBuilder<List<PriceAlert>>(
      state: alertsAsync,
      isEmpty: (alerts) => alerts.isEmpty,
      onRetry: () => ref.invalidate(alertsProvider),
      emptyIcon: Icons.notifications_none,
      emptyTitle: 'No alerts yet',
      emptySubtitle: 'Create your first price alert',
      // P10 tease card surfaces in the empty state — that's where free users
      // spend most time before they create their first alert. The card
      // self-hides for PRO users.
      emptyAction: const _AlertsTeaseCard(),
      builder: (alerts) => AppRefreshIndicator(
        onRefresh: () async => ref.invalidate(alertsProvider),
        child: ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: alerts.length,
          itemBuilder: (_, i) => _AlertCard(alert: alerts[i])
              .animate()
              .fadeIn(duration: 300.ms, delay: (i * 50).ms)
              .slideX(begin: 0.03, end: 0),
        ),
      ),
    );
  }
}

/// P10 tease card for the alerts feature. Pitches the smart-alerts surface
/// (Active/History tabs, Relist/Snooze actions) without gating creation —
/// the existing PremiumGate on the FAB already handles the upgrade flow.
class _AlertsTeaseCard extends StatelessWidget {
  const _AlertsTeaseCard();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 16),
      child: TeaseCard(
        // TODO(l10n)
        headline: 'Active & history tabs, relist + snooze',
        subtitle:
            'PRO tracks every triggered alert and lets you re-arm or snooze '
            'without re-creating it.',
        icon: Icons.history_toggle_off_rounded,
      ),
    );
  }
}

class _AlertCard extends ConsumerWidget {
  final PriceAlert alert;
  const _AlertCard({required this.alert});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    final conditionIcon = switch (alert.condition) {
      AlertCondition.above => Icons.trending_up,
      AlertCondition.below => Icons.trending_down,
      AlertCondition.changePct => Icons.percent,
      AlertCondition.bargain => Icons.local_fire_department,
      AlertCondition.sellNow => Icons.sell_outlined,
      AlertCondition.arbitrage => Icons.compare_arrows,
    };

    final conditionColor = switch (alert.condition) {
      AlertCondition.above => AppTheme.profit,
      AlertCondition.below => AppTheme.loss,
      AlertCondition.changePct => AppTheme.warning,
      AlertCondition.bargain => AppTheme.warning,
      AlertCondition.sellNow => AppTheme.profit,
      AlertCondition.arbitrage => AppTheme.accent,
    };

    final conditionLabel = switch (alert.condition) {
      AlertCondition.above => 'Above',
      AlertCondition.below => 'Below',
      AlertCondition.changePct => 'Change',
      AlertCondition.bargain => 'Deal',
      AlertCondition.sellNow => 'Sell',
      AlertCondition.arbitrage => 'Arb',
    };

    final thresholdStr = alert.condition == AlertCondition.changePct
        ? '${alert.thresholdPct!.toStringAsFixed(1)}%'
        : currency.formatCents(alert.thresholdCents!);

    return Dismissible(
      key: ValueKey(alert.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: AppTheme.loss.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(AppTheme.r16),
        ),
        child: const Icon(Icons.delete_outline, color: AppTheme.loss),
      ),
      confirmDismiss: (_) async {
        HapticFeedback.mediumImpact();
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: AppTheme.bgSecondary,
            title: const Text('Delete Alert?', style: TextStyle(color: Colors.white)),
            content: Text(
              'Remove alert for ${alert.marketHashName}?',
              style: const TextStyle(color: AppTheme.textSecondary),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('Cancel'),
              ),
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('Delete', style: TextStyle(color: AppTheme.loss)),
              ),
            ],
          ),
        );
        return confirmed ?? false;
      },
      onDismissed: (_) {
        ref.read(alertsProvider.notifier).deleteAlert(alert.id);
      },
      child: GestureDetector(
        // Tap on the card opens the smart-alert actions sheet (Relist /
        // Snooze 24h / Edit). Per P3-PLAN §2.4, native push action buttons
        // are deferred — these in-app actions cover the same use cases.
        //
        // P10: gated by `smart_alerts` feature flag. When OFF the sheet is
        // suppressed and we fall back to direct edit (the same path the
        // sheet's "Edit" button uses) — preserves something useful instead
        // of a no-op tap. Default `true` so the feature stays available
        // when the backend is unreachable.
        behavior: HitTestBehavior.opaque,
        onTap: () {
          final smartAlertsEnabled =
              ref.featureFlagEnabled('smart_alerts', defaultValue: true);
          if (smartAlertsEnabled) {
            AlertActionsSheet.show(context, alert);
          } else {
            HapticFeedback.lightImpact();
            context.push('/alerts/create', extra: alert.marketHashName);
          }
        },
        child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: AppTheme.glass(),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: conditionColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(AppTheme.r12),
              ),
              child: Icon(conditionIcon, color: conditionColor, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    alert.marketHashName,
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
                      Text(
                        '$conditionLabel $thresholdStr',
                        style: TextStyle(
                          fontSize: 12,
                          color: conditionColor,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(width: 8),
                      _SourceBadge(source: alert.source),
                    ],
                  ),
                ],
              ),
            ),
            Switch(
              value: alert.isActive,
              onChanged: (val) {
                HapticFeedback.lightImpact();
                ref.read(alertsProvider.notifier).toggleAlert(alert.id, val);
              },
            ),
          ],
        ),
      ),
      ),
    );
  }
}

class _SourceBadge extends StatelessWidget {
  final AlertSource source;
  const _SourceBadge({required this.source});

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (source) {
      AlertSource.steam => ('Steam', AppTheme.steamBlue),
      AlertSource.skinport => ('Skinport', AppTheme.skinportGreen),
      AlertSource.csfloat => ('CSFloat', AppTheme.csfloatOrange),
      AlertSource.dmarket => ('DMarket', AppTheme.dmarketPurple),
      AlertSource.any => ('Any', AppTheme.textMuted),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w500,
          color: color,
        ),
      ),
    );
  }
}

class _HistoryTab extends ConsumerWidget {
  const _HistoryTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(alertHistoryProvider);

    return ScreenStateBuilder<List<AlertHistoryItem>>(
      state: historyAsync,
      isEmpty: (history) => history.isEmpty,
      onRetry: () => ref.invalidate(alertHistoryProvider),
      emptyIcon: Icons.history,
      emptyTitle: 'No triggered alerts yet',
      emptySubtitle: 'Alerts will appear here when triggered',
      builder: (history) => AppRefreshIndicator(
        onRefresh: () async => ref.invalidate(alertHistoryProvider),
        child: ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: history.length,
          itemBuilder: (_, i) => _HistoryCard(item: history[i])
              .animate()
              .fadeIn(duration: 300.ms, delay: (i * 50).ms)
              .slideX(begin: 0.03, end: 0),
        ),
      ),
    );
  }
}

class _HistoryCard extends ConsumerWidget {
  final AlertHistoryItem item;
  const _HistoryCard({required this.item});

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      // Tapping a triggered-alert row opens the smart-actions sheet for the
      // underlying alert (look it up by alert_id from the live list). If the
      // alert was deleted since the trigger we silently no-op.
      //
      // P10: gated by `smart_alerts` feature flag — same fallback as the
      // active list (direct edit by market_hash_name).
      behavior: HitTestBehavior.opaque,
      onTap: () {
        final smartAlertsEnabled =
            ref.featureFlagEnabled('smart_alerts', defaultValue: true);
        if (smartAlertsEnabled) {
          final alerts = ref.read(alertsProvider).valueOrNull ?? const [];
          final hit = alerts.where((a) => a.id == item.alertId).firstOrNull;
          if (hit != null) {
            AlertActionsSheet.show(context, hit);
          }
        } else {
          HapticFeedback.lightImpact();
          context.push('/alerts/create', extra: item.marketHashName);
        }
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: AppTheme.glass(radius: AppTheme.r16),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppTheme.warning.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(AppTheme.r12),
              ),
              child: const Icon(Icons.notifications_active,
                  color: AppTheme.warning, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.marketHashName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    item.message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              _timeAgo(item.sentAt),
              style: const TextStyle(
                fontSize: 11,
                color: AppTheme.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
