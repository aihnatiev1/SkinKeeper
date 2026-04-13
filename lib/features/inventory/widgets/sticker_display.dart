import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';

/// Displays applied stickers with wear percentage.
class StickerDisplay extends StatelessWidget {
  final List<StickerInfo> stickers;

  const StickerDisplay({super.key, required this.stickers});

  @override
  Widget build(BuildContext context) {
    if (stickers.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.sticky_note_2_outlined, size: 14, color: AppTheme.textMuted),
            const SizedBox(width: 6),
            Text(
              'Stickers',
              style: AppTheme.bodySmall.copyWith(
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: stickers
              .asMap()
              .entries
              .map((e) => _StickerChip(sticker: e.value)
                  .animate()
                  .fadeIn(duration: 300.ms, delay: (e.key * 50).ms))
              .toList(),
        ),
      ],
    );
  }
}

class _StickerChip extends StatelessWidget {
  final StickerInfo sticker;

  const _StickerChip({required this.sticker});

  @override
  Widget build(BuildContext context) {
    final hasWear = sticker.wear != null && sticker.wear! > 0;
    final wearPct = hasWear ? (sticker.wear! * 100).toStringAsFixed(0) : null;
    final url = sticker.fullImageUrl;

    return Container(
      padding: const EdgeInsets.all(8),
      decoration: AppTheme.glass(radius: AppTheme.r12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Sticker image — larger for legibility
          SizedBox(
            width: 80,
            height: 60,
            child: url.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: url,
                    fit: BoxFit.contain,
                    placeholder: (_, _) => const Center(
                      child: SizedBox(width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 1.5, color: AppTheme.primary)),
                    ),
                    errorWidget: (_, _, _) => Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.sticky_note_2_rounded, size: 28, color: AppTheme.warning.withValues(alpha: 0.5)),
                        const SizedBox(height: 2),
                        Text('Sticker', style: TextStyle(fontSize: 8, color: AppTheme.textDisabled)),
                      ],
                    ),
                  )
                : Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.sticky_note_2_rounded, size: 28, color: AppTheme.warning.withValues(alpha: 0.5)),
                    ],
                  ),
          ),
          const SizedBox(height: 6),
          SizedBox(
            width: 84,
            child: Text(
              sticker.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: AppTheme.captionSmall.copyWith(fontWeight: FontWeight.w600, color: AppTheme.textPrimary, fontSize: 10),
            ),
          ),
          if (wearPct != null) ...[
            const SizedBox(height: 2),
            // Wear bar
            SizedBox(
              width: 80,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(2),
                child: LinearProgressIndicator(
                  value: 1 - (sticker.wear! ),
                  backgroundColor: AppTheme.textDisabled.withValues(alpha: 0.2),
                  color: sticker.wear! < 0.2 ? AppTheme.profit
                      : sticker.wear! < 0.5 ? AppTheme.warning
                      : AppTheme.loss,
                  minHeight: 3,
                ),
              ),
            ),
            const SizedBox(height: 2),
            Text('$wearPct% worn', style: AppTheme.captionSmall.copyWith(fontSize: 9, color: AppTheme.textMuted)),
          ],
        ],
      ),
    );
  }
}

/// Combined stickers + charms in a single compact row (like SkinSwap).
class StickersAndCharmsDisplay extends StatelessWidget {
  final List<StickerInfo> stickers;
  final List<CharmInfo> charms;

  const StickersAndCharmsDisplay({
    super.key,
    required this.stickers,
    required this.charms,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.sticky_note_2_outlined, size: 14, color: AppTheme.textMuted),
            const SizedBox(width: 6),
            Text(
              'Stickers & Charms',
              style: AppTheme.bodySmall.copyWith(
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            ...stickers.asMap().entries.expand((e) => [
              if (e.key > 0) const SizedBox(width: 6),
              _CompactStickerSlot(sticker: e.value)
                  .animate()
                  .fadeIn(duration: 300.ms, delay: (e.key * 50).ms),
            ]),
            if (stickers.isNotEmpty && charms.isNotEmpty) ...[
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 6),
                child: Text('+', style: TextStyle(fontSize: 16, color: AppTheme.textMuted)),
              ),
            ],
            ...charms.asMap().entries.expand((e) => [
              if (e.key > 0) const SizedBox(width: 6),
              _CompactCharmSlot(charm: e.value)
                  .animate()
                  .fadeIn(duration: 300.ms, delay: ((stickers.length + e.key) * 50).ms),
            ]),
          ],
        ),
      ],
    );
  }
}

class _CompactStickerSlot extends StatelessWidget {
  final StickerInfo sticker;

  const _CompactStickerSlot({required this.sticker});

  @override
  Widget build(BuildContext context) {
    final url = sticker.fullImageUrl;
    return Tooltip(
      message: sticker.wear != null && sticker.wear! > 0
          ? '${sticker.name} (${(sticker.wear! * 100).toStringAsFixed(0)}% worn)'
          : sticker.name,
      child: Container(
        width: 52,
        height: 40,
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: const Color(0xFFFBBF24).withValues(alpha: 0.2),
            width: 0.8,
          ),
        ),
        child: url.isNotEmpty
            ? CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.contain,
                placeholder: (_, _) => const Center(
                  child: SizedBox(width: 14, height: 14,
                    child: CircularProgressIndicator(strokeWidth: 1.2, color: AppTheme.warning)),
                ),
                errorWidget: (_, _, _) => Center(
                  child: Icon(Icons.sticky_note_2_rounded, size: 20, color: AppTheme.warning.withValues(alpha: 0.6)),
                ),
              )
            : Center(
                child: Icon(Icons.sticky_note_2_rounded, size: 20, color: AppTheme.warning.withValues(alpha: 0.6)),
              ),
      ),
    );
  }
}

class _CompactCharmSlot extends StatelessWidget {
  final CharmInfo charm;

  const _CompactCharmSlot({required this.charm});

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: charm.name,
      child: Container(
        width: 44,
        height: 44,
        padding: const EdgeInsets.all(4),
        decoration: AppTheme.glass(radius: AppTheme.r8),
        child: charm.fullImageUrl.isNotEmpty
            ? CachedNetworkImage(
                imageUrl: charm.fullImageUrl,
                fit: BoxFit.contain,
                placeholder: (_, _) => const SizedBox.shrink(),
                errorWidget: (_, _, _) => const Icon(
                  Icons.broken_image_outlined,
                  size: 18,
                  color: AppTheme.textDisabled,
                ),
              )
            : const Icon(Icons.auto_awesome, size: 18, color: AppTheme.textDisabled),
      ),
    );
  }
}
