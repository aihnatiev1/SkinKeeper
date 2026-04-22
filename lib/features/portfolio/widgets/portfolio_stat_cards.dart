import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../portfolio_provider.dart';

class PortfolioStatCards extends ConsumerWidget {
  final PortfolioSummary data;
  const PortfolioStatCards({super.key, required this.data});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(currencyProvider);
    return Row(
      children: [
        Expanded(child: _StatCard(
          label: 'ITEMS',
          value: NumberFormat.decimalPattern().format(data.itemCount),
          sub: 'in inventory',
          accentColor: AppTheme.primary,
          icon: Icons.inventory_2_rounded,
        )),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(
          label: '24H',
          value: AppTheme.pctText(data.change24hPct),
          sub: currency.formatCentsWithSign(data.change24hCents),
          accentColor: AppTheme.plColor(data.change24hPct),
        )),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(
          label: '7D',
          value: AppTheme.pctText(data.change7dPct),
          sub: 'this week',
          accentColor: AppTheme.plColor(data.change7dPct),
        )),
      ],
    );
  }
}

class _StatCard extends StatefulWidget {
  final String label;
  final String value;
  final String sub;
  final Color accentColor;
  final IconData? icon;

  const _StatCard({
    required this.label,
    required this.value,
    required this.sub,
    required this.accentColor,
    this.icon,
  });

  @override
  State<_StatCard> createState() => _StatCardState();
}

class _StatCardState extends State<_StatCard> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
        onTapDown: (_) => setState(() => _hovered = true),
        onTapUp: (_) => setState(() => _hovered = false),
        onTapCancel: () => setState(() => _hovered = false),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          transform: Matrix4.translationValues(0, _hovered ? -2 : 0, 0),
          padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.03),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: widget.accentColor.withValues(alpha: 0.12),
              width: 0.5,
            ),
            boxShadow: _hovered ? [
              BoxShadow(
                color: widget.accentColor.withValues(alpha: 0.08),
                blurRadius: 12,
              ),
            ] : [],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.label,
                style: const TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                  color: AppTheme.textDisabled,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                widget.value,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: widget.accentColor,
                  letterSpacing: -0.5,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 3),
              Text(
                widget.sub,
                style: const TextStyle(
                  fontSize: 10,
                  color: AppTheme.textDisabled,
                ),
              ),
            ],
          ),
        ),
    );
  }
}
