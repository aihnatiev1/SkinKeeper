import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme.dart';

class SellSheetSessionWarning extends StatelessWidget {
  const SellSheetSessionWarning({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppTheme.warning.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppTheme.warning.withValues(alpha: 0.25)),
        ),
        child: Row(
          children: [
            const Icon(Icons.warning_rounded,
                color: AppTheme.warning, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Session expiring soon — refresh after selling',
                style: AppTheme.captionSmall.copyWith(
                  color: AppTheme.warning,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SellSheetVolumeWarning extends StatelessWidget {
  final int today;
  final int limit;
  final int remaining;

  const SellSheetVolumeWarning({
    super.key,
    required this.today,
    required this.limit,
    required this.remaining,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppTheme.warning.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppTheme.warning.withValues(alpha: 0.25)),
        ),
        child: Row(
          children: [
            const Icon(Icons.speed, color: AppTheme.warning, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '$today of $limit daily listings used — $remaining remaining',
                style: AppTheme.captionSmall.copyWith(
                  color: AppTheme.warning,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SellSheetStalePriceWarning extends StatelessWidget {
  final String? marketUrl;

  const SellSheetStalePriceWarning({super.key, this.marketUrl});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: AppTheme.loss.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppTheme.loss.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Row(
              children: [
                const Icon(Icons.warning_amber_rounded,
                    color: AppTheme.loss, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Price may be outdated — enter manually or check Steam Market',
                    style: AppTheme.captionSmall.copyWith(
                      color: AppTheme.loss,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
            if (marketUrl != null) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                height: 36,
                child: OutlinedButton.icon(
                  onPressed: () => launchUrl(Uri.parse(marketUrl!),
                      mode: LaunchMode.externalApplication),
                  icon: const Icon(Icons.open_in_new, size: 16),
                  label: const Text('Open on Steam Market'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.loss,
                    side: BorderSide(color: AppTheme.loss.withValues(alpha: 0.4)),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
