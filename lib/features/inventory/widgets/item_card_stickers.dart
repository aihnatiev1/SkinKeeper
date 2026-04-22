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

  const StickerThumb({super.key, required this.sticker});

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: sticker.name.isNotEmpty ? sticker.name : 'Sticker',
      child: Container(
        width: 30,
        height: 22,
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
          child: sticker.fullImageUrl.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: sticker.fullImageUrl,
                  fit: BoxFit.contain,
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
                ),
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
