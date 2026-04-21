import 'package:flutter/material.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';

// ── Steam Market Depth ───────────────────────────────────────────
class SteamMarketDepth extends StatelessWidget {
  final SteamDepth depth;
  final CurrencyInfo currency;

  const SteamMarketDepth({
    super.key,required this.depth, required this.currency});

  String _formatCount(int n) {
    if (n >= 10000) return '${(n / 1000).toStringAsFixed(1)}K';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return n.toString();
  }

  @override
  Widget build(BuildContext context) {
    final totalOrders = depth.buyOrderCount + depth.sellListingCount;
    final buyFraction = totalOrders > 0
        ? depth.buyOrderCount / totalOrders
        : 0.5;

    return Container(
      decoration: AppTheme.glass(),
      padding: const EdgeInsets.all(AppTheme.s14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Text('STEAM MARKET DEPTH', style: AppTheme.label),
          const SizedBox(height: AppTheme.s10),

          // Buy orders vs Sell listings counts
          Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(children: [
                    TextSpan(
                      text: 'Buy Orders  ',
                      style: TextStyle(fontSize: 11, color: AppTheme.textDisabled),
                    ),
                    TextSpan(
                      text: _formatCount(depth.buyOrderCount),
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700,
                        color: Color(0xFF10B981)), // green
                    ),
                  ]),
                ),
              ),
              Expanded(
                child: Text.rich(
                  TextSpan(children: [
                    TextSpan(
                      text: 'Listings  ',
                      style: TextStyle(fontSize: 11, color: AppTheme.textDisabled),
                    ),
                    TextSpan(
                      text: _formatCount(depth.sellListingCount),
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700,
                        color: Color(0xFFEF4444)), // red
                    ),
                  ]),
                  textAlign: TextAlign.right,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),

          // Proportional bar (green = buy orders, red = sell listings)
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: SizedBox(
              height: 6,
              child: Row(
                children: [
                  Expanded(
                    flex: (buyFraction * 100).round().clamp(1, 99),
                    child: Container(color: const Color(0xFF10B981).withValues(alpha: 0.6)),
                  ),
                  Container(width: 1, color: AppTheme.bg),
                  Expanded(
                    flex: ((1 - buyFraction) * 100).round().clamp(1, 99),
                    child: Container(color: const Color(0xFFEF4444).withValues(alpha: 0.6)),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 6),

          // Bid / Ask prices
          Row(
            children: [
              Text('Bid ', style: TextStyle(fontSize: 11, color: AppTheme.textDisabled)),
              Text(
                currency.format(depth.highestBid),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                  fontFeatures: [FontFeature.tabularFigures()]),
              ),
              const Spacer(),
              Text('Ask ', style: TextStyle(fontSize: 11, color: AppTheme.textDisabled)),
              Text(
                currency.format(depth.lowestAsk),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                  fontFeatures: [FontFeature.tabularFigures()]),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // 24h Volume + Median
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppTheme.steamBlue.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(AppTheme.r6),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.show_chart_rounded, size: 13,
                    color: AppTheme.steamBlue.withValues(alpha: 0.6)),
                const SizedBox(width: 6),
                Text(
                  '24h Volume: ${_formatCount(depth.volume24h)}',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                    color: AppTheme.steamBlue.withValues(alpha: 0.8)),
                ),
                if (depth.medianPrice > 0) ...[
                  Text(
                    '  ·  Median: ${currency.format(depth.medianPrice)}',
                    style: TextStyle(fontSize: 11,
                      color: AppTheme.steamBlue.withValues(alpha: 0.6)),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

