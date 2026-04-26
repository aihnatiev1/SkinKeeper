import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/analytics_service.dart';
import '../core/theme.dart';
import '../features/purchases/iap_service.dart';
import 'pro_chip.dart';

/// Compact decorative banner pitching a PRO feature. Unlike [PremiumGate] this
/// does NOT gate functionality — it's an invitation card placed above an
/// existing free-user UI surface (watchlist, alerts empty-state, portfolio
/// per-account view).
///
/// Visibility contract:
///   - Free user: render the card.
///   - PRO user: render nothing (the card has served its purpose).
///   - Loading state: render nothing — we'd rather miss a beat than flash a
///     paywall pitch in someone's face who's already paid.
///
/// Tap → push `/premium` with [PaywallSource.teaseCard]. Analytics is wired
/// at the route level (`PaywallScreen.initState` reads the source from
/// `state.extra`), so we don't double-log here.
///
/// Visual: gold-tinted glass card with a [ProChip], headline, optional
/// subtitle, and a chevron. Stays low-contrast so it doesn't compete with
/// primary screen content for attention. Uses flutter standard widgets only —
/// no `BackdropFilter` so it's safe to scatter across screens.
class TeaseCard extends ConsumerWidget {
  const TeaseCard({
    super.key,
    required this.headline,
    this.subtitle,
    this.icon,
    this.padding = const EdgeInsets.fromLTRB(16, 12, 16, 12),
    this.margin = const EdgeInsets.fromLTRB(16, 12, 16, 4),
  });

  /// One-line headline, e.g. "Smart alerts on this list".
  final String headline;

  /// Optional secondary text under the headline. Keep it short — this is a
  /// banner, not a value-prop section.
  final String? subtitle;

  /// Optional emoji-style leading icon. Defaults to a bolt accent.
  final IconData? icon;

  final EdgeInsets padding;
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final premiumAsync = ref.watch(premiumProvider);
    final isPremium = premiumAsync.valueOrNull;
    // Hide while loading (null) AND when premium=true. We only show the pitch
    // to confirmed-free users — flashing the card during a 200ms auth load
    // would feel sloppy.
    if (isPremium != false) return const SizedBox.shrink();

    return Padding(
      padding: margin,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            HapticFeedback.lightImpact();
            context.push('/premium', extra: PaywallSource.teaseCard);
          },
          borderRadius: BorderRadius.circular(AppTheme.r16),
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  AppTheme.warning.withValues(alpha: 0.10),
                  AppTheme.primary.withValues(alpha: 0.06),
                ],
              ),
              borderRadius: BorderRadius.circular(AppTheme.r16),
              border: Border.all(
                color: AppTheme.warning.withValues(alpha: 0.28),
                width: 0.7,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppTheme.warning.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(AppTheme.r10),
                  ),
                  child: Icon(
                    icon ?? Icons.bolt_rounded,
                    color: AppTheme.warning,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              headline,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          const ProChip(size: ProChipSize.small),
                        ],
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          subtitle!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppTheme.textSecondary,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(
                  Icons.chevron_right_rounded,
                  color: AppTheme.warning,
                  size: 20,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
