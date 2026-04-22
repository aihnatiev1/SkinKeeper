import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';

// ── Marketplace Links (with prices) ──────────────────────────────
class MarketplaceLinks extends StatelessWidget {
  final Map<String, String> links;
  final Map<String, double> prices;
  final CurrencyInfo currency;
  final String? originName;
  final IconData? originIcon;

  const MarketplaceLinks({
    super.key,
    required this.links,
    required this.prices,
    required this.currency,
    this.originName,
    this.originIcon,
  });

  // source key in links → (label, color, icon, price source key)
  static const _linkConfig = <String, (String, Color, IconData, String)>{
    'buff': ('Buff163', AppTheme.buffYellow, Icons.storefront_rounded, 'buff'),
    'skinport': ('Skinport', AppTheme.skinportGreen, Icons.shopping_bag_rounded, 'skinport'),
    'csfloat': ('CSFloat', AppTheme.csfloatOrange, Icons.waves_rounded, 'csfloat'),
    'steam': ('Steam', AppTheme.steamBlue, Icons.store_rounded, 'steam'),
  };

  @override
  Widget build(BuildContext context) {
    final available = links.entries
        .where((e) => _linkConfig.containsKey(e.key))
        .toList();
    if (available.isEmpty) return const SizedBox.shrink();

    return Container(
      decoration: AppTheme.glass(),
      padding: const EdgeInsets.fromLTRB(
        AppTheme.s16,
        AppTheme.s14,
        AppTheme.s16,
        AppTheme.s14,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('MARKETPLACE', style: AppTheme.label),
              const Spacer(),
              // Origin inline if available
              if (originName != null)
                Flexible(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(originIcon ?? Icons.inventory_2_rounded, size: 12, color: AppTheme.textMuted),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          originName!,
                          style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppTheme.s10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: available.map((entry) {
                final config = _linkConfig[entry.key]!;
                final (label, color, icon, priceKey) = config;
                final price = prices[priceKey];
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _MarketButton(
                    label: label,
                    color: color,
                    icon: icon,
                    url: entry.value,
                    price: price,
                    currency: currency,
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _MarketButton extends StatelessWidget {
  final String label;
  final Color color;
  final IconData icon;
  final String url;
  final double? price;
  final CurrencyInfo currency;

  const _MarketButton({
    required this.label,
    required this.color,
    required this.icon,
    required this.url,
    required this.currency,
    this.price,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(AppTheme.r8),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
            if (price != null && price! > 0) ...[
              const SizedBox(width: 6),
              Text(
                currency.format(price!),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: color.withValues(alpha: 0.7),
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
