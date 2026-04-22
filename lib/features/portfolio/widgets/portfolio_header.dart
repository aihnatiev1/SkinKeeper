import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/cache_service.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../widgets/account_scope_chip.dart';
import '../../../widgets/glass_sheet.dart';
import '../../../widgets/shared_ui.dart';
import '../../../widgets/sync_indicator.dart';
import '../portfolio_pl_provider.dart';
import '../portfolio_provider.dart';
import 'add_transaction_sheet.dart';

/// Compact "Updated Nm ago" label. Returns "" placeholder when no sync yet.
String _formatAgeLabel(DateTime? lastSync) {
  if (lastSync == null) return '';
  final diff = DateTime.now().difference(lastSync);
  if (diff.inMinutes < 1) return '· JUST NOW';
  if (diff.inMinutes < 60) return '· ${diff.inMinutes}M AGO';
  if (diff.inHours < 24) return '· ${diff.inHours}H AGO';
  return '· ${diff.inDays}D AGO';
}

/// Age-based colour: muted under 15m, amber 15-60m, red beyond.
Color _ageLabelColor(DateTime? lastSync) {
  if (lastSync == null) return AppTheme.textDisabled;
  final mins = DateTime.now().difference(lastSync).inMinutes;
  if (mins < 15) return AppTheme.textDisabled;
  if (mins < 60) return Colors.amber;
  return Colors.red;
}

class PortfolioHeader extends ConsumerWidget {
  final AsyncValue<PortfolioSummary> portfolio;
  const PortfolioHeader({super.key, required this.portfolio});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 16, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'TOTAL PORTFOLIO',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.5,
                        color: AppTheme.textDisabled,
                      ),
                    ),
                    const SizedBox(height: 6),
                    portfolio.when(
                      data: (data) => FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: AnimatedNumber(
                          value: data.totalValueCents / 100,
                          style: const TextStyle(
                            fontSize: 36,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -1.5,
                            color: Colors.white,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                          formatter: (v) => currency.format(v),
                        ),
                      ).animate().fadeIn(duration: 600.ms),
                      loading: () => const ShimmerBox(width: 200, height: 40),
                      error: (_, _) => const SizedBox.shrink(),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const AccountScopeChip(),
            ],
          ),
          const SizedBox(height: 12),
          portfolio.when(
            data: (data) {
              final isUp = data.change24hCents >= 0;
              final color = AppTheme.plColor(data.change24hCents);
              return Row(
                children: [
                  _ChangeBadge(
                    text: '${isUp ? "↑" : "↓"} ${currency.formatCentsWithSign(data.change24hCents, decimals: 0)}',
                    color: color,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '${AppTheme.pctText(data.change24hPct)} today',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textDisabled,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const Spacer(),
                  SyncIndicator(
                    onTap: () async {
                      HapticFeedback.mediumImpact();
                      await ref.read(portfolioPLProvider.notifier).recalculate();
                      ref.invalidate(portfolioProvider);
                    },
                  ),
                ],
              ).animate().fadeIn(duration: 500.ms, delay: 200.ms);
            },
            loading: () => const ShimmerBox(width: 160, height: 28),
            error: (_, _) => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _ChangeBadge extends StatelessWidget {
  final String text;
  final Color color;
  const _ChangeBadge({required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.2), width: 0.5),
      ),
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: color,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

class PortfolioPLQuickSummary extends ConsumerWidget {
  const PortfolioPLQuickSummary({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pl = ref.watch(portfolioPLProvider);
    final currency = ref.watch(currencyProvider);

    return pl.when(
      data: (data) {
        if (!data.hasData) {
          final hasPortfolioFilter = ref.watch(selectedPortfolioIdProvider) != null;
          return GestureDetector(
            onTap: () {
              HapticFeedback.mediumImpact();
              showGlassSheet(context, const AddTransactionSheet());
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: AppTheme.primary.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppTheme.primary.withValues(alpha: 0.15),
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.add_circle_outline_rounded,
                      size: 20, color: AppTheme.primary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      hasPortfolioFilter
                          ? 'No transactions in this portfolio'
                          : 'Log your first purchase to track profit',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ),
                  const Icon(Icons.arrow_forward_ios_rounded,
                      size: 14, color: AppTheme.textDisabled),
                ],
              ),
            ),
          ).animate().fadeIn(duration: 400.ms);
        }

        final plColor = AppTheme.plColor(data.totalProfitCents);
        return Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(
            color: plColor.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: plColor.withValues(alpha: 0.12),
              width: 0.5,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Text(
                          'TOTAL PROFIT',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.2,
                            color: AppTheme.textDisabled,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _formatAgeLabel(CacheService.lastSync),
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w500,
                            letterSpacing: 0.4,
                            color: _ageLabelColor(CacheService.lastSync),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Row(
                        children: [
                          Text(
                            currency.formatWithSign(data.totalProfit),
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                              color: plColor,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: plColor.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(5),
                            ),
                            child: Text(
                              AppTheme.pctText(data.totalProfitPct),
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: plColor,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _PLMiniRow(
                      label: 'Invested',
                      value: currency.format(data.totalInvested, decimals: 0)),
                  const SizedBox(height: 3),
                  _PLMiniRow(
                      label: 'Current',
                      value: currency.format(data.totalCurrentValue, decimals: 0)),
                  if (data.realizedProfitCents != 0) ...[
                    const SizedBox(height: 3),
                    _PLMiniRow(
                        label: 'Sold profit',
                        value: currency.formatWithSign(data.realizedProfit, decimals: 0),
                        valueColor: AppTheme.plColor(data.realizedProfitCents)),
                  ],
                ],
              ),
            ],
          ),
        ).animate().fadeIn(duration: 400.ms);
      },
      loading: () => const ShimmerBox(height: 64),
      error: (e, _) {
        final is403 = e.toString().contains('403') || e.toString().contains('premium');
        if (is403) {
          return GestureDetector(
            onTap: () => context.push('/premium'),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: AppTheme.warning.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.warning.withValues(alpha: 0.15)),
              ),
              child: Row(
                children: [
                  Icon(Icons.lock_outline_rounded, size: 18, color: AppTheme.warning),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Upgrade to PRO to see profit & loss',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textSecondary),
                    ),
                  ),
                  const Icon(Icons.arrow_forward_ios_rounded, size: 14, color: AppTheme.textDisabled),
                ],
              ),
            ),
          );
        }
        return const SizedBox.shrink();
      },
    );
  }
}

class _PLMiniRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _PLMiniRow({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '$label ',
          style: const TextStyle(
            fontSize: 11,
            color: AppTheme.textDisabled,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: valueColor ?? AppTheme.textSecondary,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}
