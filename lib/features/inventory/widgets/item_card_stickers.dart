import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';

class StickerValueBadge extends StatelessWidget {
  final double value;
  final CurrencyInfo? currency;

  const StickerValueBadge({super.key, required this.value, this.currency});

  @override
  Widget build(BuildContext context) {
    final text = currency?.format(value, decimals: 0) ??
        '\$${value.toStringAsFixed(0)}';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
      decoration: BoxDecoration(
        color: AppTheme.warning.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(3),
      ),
      child: Text(
        '✨$text',
        style: TextStyle(
          fontSize: 8,
          fontWeight: FontWeight.w800,
          color: AppTheme.warning.withValues(alpha: 0.9),
        ),
      ),
    );
  }
}

class StickerThumb extends StatelessWidget {
  final StickerInfo sticker;
  final double width;
  final double height;

  const StickerThumb({
    super.key,
    required this.sticker,
    this.width = 30,
    this.height = 22,
  });

  /// Scrape threshold above which we visually indicate wear (slight opacity
  /// drop). Pristine stickers (wear ~0) are 3-5x more valuable so we want the
  /// trader to see the difference at a glance.
  static const double _scrapedThreshold = 0.05;

  @override
  Widget build(BuildContext context) {
    final wear = sticker.wear;
    final scraped = wear != null && wear > _scrapedThreshold;
    final tooltip = StringBuffer(
      sticker.name.isNotEmpty ? sticker.name : 'Sticker',
    );
    if (wear != null) {
      // 0.0 = pristine, 1.0 = fully scraped. Show as scrape % so traders
      // immediately recognize the convention (matches CSFloat).
      final scrapePct = (wear * 100).clamp(0, 100).round();
      tooltip.write(' • Scrape $scrapePct%');
    }

    final image = sticker.fullImageUrl.isNotEmpty
        ? CachedNetworkImage(
            imageUrl: sticker.fullImageUrl,
            fit: BoxFit.contain,
            // Stickers render tiny (~28px wide) — decode at 56px for retina
            // and avoid keeping full-resolution Steam economy PNGs in memory
            // for 1000+ item inventories.
            memCacheWidth: 56,
            placeholder: (_, _) => const SizedBox.shrink(),
            errorWidget: (_, _, _) => const Icon(
              Icons.sticky_note_2_rounded,
              size: 12,
              color: AppTheme.warningLight,
            ),
          )
        : const Icon(
            Icons.sticky_note_2_rounded,
            size: 12,
            color: AppTheme.warningLight,
          );

    return Tooltip(
      message: tooltip.toString(),
      waitDuration: const Duration(milliseconds: 400),
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(5),
          border: Border.all(
            color: const Color(0xFFFBBF24).withValues(alpha: 0.25),
            width: 0.8,
          ),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFFFBBF24).withValues(alpha: 0.12),
              blurRadius: 4,
              spreadRadius: 0,
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(2),
          child: scraped
              // Scraped stickers render at 50% opacity so traders can spot
              // pristine ones (full opacity) instantly in a long list.
              ? Opacity(opacity: 0.5, child: image)
              : image,
        ),
      ),
    );
  }
}

class CharmThumb extends StatelessWidget {
  final CharmInfo charm;

  const CharmThumb({super.key, required this.charm});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(4),
      ),
      child: charm.fullImageUrl.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: charm.fullImageUrl,
              fit: BoxFit.contain,
              placeholder: (_, _) => const SizedBox.shrink(),
              errorWidget: (_, _, _) => const Icon(
                Icons.auto_awesome_rounded,
                size: 12,
                color: AppTheme.primaryLight,
              ),
            )
          : const Icon(
              Icons.auto_awesome_rounded,
              size: 12,
              color: AppTheme.primaryLight,
            ),
    );
  }
}
