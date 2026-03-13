import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../models/alert.dart';
import '../../widgets/shared_ui.dart';
import 'alerts_provider.dart';

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
                  padding: const EdgeInsets.fromLTRB(4, 8, 16, 0),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back_ios_new_rounded,
                            size: 20, color: AppTheme.textSecondary),
                        onPressed: () => context.pop(),
                      ),
                      const Expanded(
                        child: Text(
                          'Price Alerts',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: -0.5,
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

            // ── Gradient FAB ──
            Positioned(
              bottom: 16,
              left: 0,
              right: 0,
              child: Center(
                child: GestureDetector(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    context.push('/alerts/create');
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 14),
                    decoration: BoxDecoration(
                      gradient: AppTheme.accentGradient,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.accent.withValues(alpha: 0.45),
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

    return alertsAsync.when(
      loading: () => const Center(
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
      error: (e, _) => Center(
        child: Text('Failed to load', style: const TextStyle(color: AppTheme.textSecondary)),
      ),
      data: (alerts) {
        if (alerts.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.notifications_none,
                    size: 64, color: AppTheme.textDisabled),
                const SizedBox(height: 16),
                const Text(
                  'No alerts yet',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textSecondary,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Create your first price alert',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppTheme.textMuted,
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 400.ms);
        }

        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(alertsProvider),
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: alerts.length,
            itemBuilder: (_, i) => _AlertCard(alert: alerts[i])
                .animate()
                .fadeIn(duration: 300.ms, delay: (i * 50).ms)
                .slideX(begin: 0.03, end: 0),
          ),
        );
      },
    );
  }
}

class _AlertCard extends ConsumerWidget {
  final PriceAlert alert;
  const _AlertCard({required this.alert});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conditionIcon = switch (alert.condition) {
      AlertCondition.above => Icons.trending_up,
      AlertCondition.below => Icons.trending_down,
      AlertCondition.changePct => Icons.percent,
    };

    final conditionColor = switch (alert.condition) {
      AlertCondition.above => AppTheme.profit,
      AlertCondition.below => AppTheme.loss,
      AlertCondition.changePct => AppTheme.warning,
    };

    final conditionLabel = switch (alert.condition) {
      AlertCondition.above => 'Above',
      AlertCondition.below => 'Below',
      AlertCondition.changePct => 'Change',
    };

    final thresholdStr = alert.condition == AlertCondition.changePct
        ? '${alert.threshold.toStringAsFixed(1)}%'
        : '\$${alert.threshold.toStringAsFixed(2)}';

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
        return true;
      },
      onDismissed: (_) {
        ref.read(alertsProvider.notifier).deleteAlert(alert.id);
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

    return historyAsync.when(
      loading: () => const Center(
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
      error: (e, _) => Center(
        child: Text('Failed to load', style: const TextStyle(color: AppTheme.textSecondary)),
      ),
      data: (history) {
        if (history.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.history,
                    size: 64, color: AppTheme.textDisabled),
                const SizedBox(height: 16),
                const Text(
                  'No triggered alerts yet',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textSecondary,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Alerts will appear here when triggered',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppTheme.textMuted,
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 400.ms);
        }

        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(alertHistoryProvider),
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: history.length,
            itemBuilder: (_, i) => _HistoryCard(item: history[i])
                .animate()
                .fadeIn(duration: 300.ms, delay: (i * 50).ms)
                .slideX(begin: 0.03, end: 0),
          ),
        );
      },
    );
  }
}

class _HistoryCard extends StatelessWidget {
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
  Widget build(BuildContext context) {
    return Container(
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
    );
  }
}
