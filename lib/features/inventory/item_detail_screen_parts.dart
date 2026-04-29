import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../models/inventory_item.dart';
import '../../widgets/shared_ui.dart';
import 'widgets/sticker_display.dart';
import 'widgets/sticker_value_row.dart';
import 'widgets/wear_bar.dart';

class ItemDetailHeaderBar extends StatelessWidget {
  final String title;
  final VoidCallback onBack;
  final VoidCallback onAlert;

  const ItemDetailHeaderBar({
    super.key,
    required this.title,
    required this.onBack,
    required this.onAlert,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 16, 8, 0),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded,
                size: 20, color: AppTheme.textSecondary),
            onPressed: onBack,
          ),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                letterSpacing: -0.3,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          IconButton(
            icon: const Icon(
              Icons.notifications_active_outlined,
              size: 20,
              color: AppTheme.textSecondary,
            ),
            tooltip: 'Set Alert',
            onPressed: () {
              HapticFeedback.lightImpact();
              onAlert();
            },
          ),
        ],
      ),
    );
  }
}

class ItemDetailHeroImage extends StatelessWidget {
  final String imageUrl;
  final String assetId;

  const ItemDetailHeroImage({
    super.key,
    required this.imageUrl,
    required this.assetId,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Hero(
        tag: 'item_image_$assetId',
        child: SizedBox(
          width: 220,
          height: 220,
          child: imageUrl.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: imageUrl,
                  fit: BoxFit.contain,
                  placeholder: (_, _) => const Center(
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppTheme.textDisabled,
                    ),
                  ),
                  errorWidget: (_, _, _) => const Icon(
                    Icons.image_not_supported_rounded,
                    size: 48,
                    color: AppTheme.textDisabled,
                  ),
                )
              : const Icon(
                  Icons.image_not_supported_rounded,
                  size: 48,
                  color: AppTheme.textDisabled,
                ),
        ),
      ),
    );
  }
}

class ItemDetailTitleBlock extends StatelessWidget {
  final InventoryItem item;

  const ItemDetailTitleBlock({super.key, required this.item});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          item.displayName,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: AppTheme.h2,
        ),
        if (item.isDoppler && item.dopplerPhase != null) ...[
          const SizedBox(height: AppTheme.s8),
          Center(
            child: AppBadge(
              text: item.dopplerPhase!,
              color: item.dopplerColor ?? AppTheme.textDisabled,
            ),
          ),
        ],
        const SizedBox(height: AppTheme.s4),
        Text(
          item.weaponName,
          textAlign: TextAlign.center,
          style: AppTheme.subtitle,
        ),
        if (item.collection != null) ...[
          const SizedBox(height: AppTheme.s8),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 10,
                vertical: 4,
              ),
              decoration: BoxDecoration(
                color: AppTheme.textDisabled.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(AppTheme.r6),
                border: Border.all(
                  color: AppTheme.textDisabled.withValues(alpha: 0.15),
                ),
              ),
              child: Text(
                item.collection!.name,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textSecondary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class ItemDetailWearBadgeRow extends StatelessWidget {
  final InventoryItem item;
  final Color rarityColor;

  const ItemDetailWearBadgeRow({
    super.key,
    required this.item,
    required this.rarityColor,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        AppBadge(
          text: item.wear!,
          color: rarityColor,
        ),
        if (item.floatValue != null) ...[
          const SizedBox(width: AppTheme.s10),
          AppBadge(
            text: item.floatValue!.toStringAsFixed(7),
            color: AppTheme.textSecondary,
          ),
        ],
        if (item.paintSeed != null) ...[
          const SizedBox(width: AppTheme.s10),
          AppBadge(
            text: 'Seed ${item.paintSeed}',
            color: AppTheme.textMuted,
          ),
        ],
      ],
    );
  }
}

class ItemDetailStickersSection extends StatelessWidget {
  final InventoryItem item;
  final CurrencyInfo currency;

  const ItemDetailStickersSection({
    super.key,
    required this.item,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(AppTheme.s14),
      margin: const EdgeInsets.only(bottom: AppTheme.s12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StickersAndCharmsDisplay(
            stickers: item.stickers,
            charms: item.charms,
          ),
          if (item.stickerValue != null && item.stickerValue! > 0) ...[
            const SizedBox(height: AppTheme.s10),
            StickerValueRow(
              stickerValue: item.stickerValue!,
              bestPrice: item.bestPrice,
              currency: currency,
            ),
          ],
        ],
      ),
    );
  }
}

class ItemDetailWearBarCard extends StatelessWidget {
  final InventoryItem item;

  const ItemDetailWearBarCard({super.key, required this.item});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(AppTheme.s14),
      margin: const EdgeInsets.only(bottom: AppTheme.s12),
      child: WearBar(
        floatValue: item.floatValue!,
        minFloat: item.minFloat,
        maxFloat: item.maxFloat,
      ),
    );
  }
}

class ItemDetailSteamPriceCard extends StatelessWidget {
  final double steamPrice;
  final CurrencyInfo currency;

  const ItemDetailSteamPriceCard({
    super.key,
    required this.steamPrice,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      elevated: true,
      padding: const EdgeInsets.symmetric(vertical: AppTheme.s16),
      child: Column(
        children: [
          Text('STEAM PRICE', style: AppTheme.label),
          const SizedBox(height: AppTheme.s6),
          AnimatedNumber(
            value: steamPrice,
            style: AppTheme.priceLarge,
            formatter: (v) => currency.format(v),
          ),
        ],
      ),
    );
  }
}

class ItemDetailChartErrorCard extends StatelessWidget {
  const ItemDetailChartErrorCard({super.key});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: SizedBox(
        height: 200,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline_rounded,
                  size: 32, color: AppTheme.loss),
              const SizedBox(height: AppTheme.s8),
              Text(
                'Failed to load price history',
                style: AppTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ItemDetailExportCsvButton extends StatelessWidget {
  final VoidCallback onTap;

  const ItemDetailExportCsvButton({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerRight,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(
              horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: AppTheme.primary.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(AppTheme.r8),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.file_download_outlined,
                  size: 14, color: AppTheme.primary),
              const SizedBox(width: 4),
              Text(
                'Export CSV',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.primary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
