import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/api_client.dart';
import '../../../core/push_preferences.dart';
import '../../../core/push_service.dart';
import '../../../core/router.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../l10n/app_localizations.dart';
import '../../../widgets/ecosystem_banner.dart';
import '../../auth/session_provider.dart';
import '../../auth/steam_auth_service.dart';
import '../../onboarding/onboarding_screen.dart';

class PushPrefsSection extends ConsumerWidget {
  const PushPrefsSection({super.key});

  static const _items = <(PushPref, String, IconData)>[
    (PushPref.tradeIncoming, 'Incoming trade offers', Icons.call_received_rounded),
    (PushPref.tradeAccepted, 'Trade accepted', Icons.check_circle_outline),
    (PushPref.priceAlerts, 'Price alerts', Icons.trending_up_rounded),
    (PushPref.tradeDeclined, 'Trade declined', Icons.cancel_outlined),
    (PushPref.tradeCancelled, 'Trade cancelled', Icons.block_rounded),
    (PushPref.tradeBanExpired, 'Items now tradable', Icons.lock_open_rounded),
    (PushPref.sessionExpired, 'Steam login expired', Icons.vpn_key_off_rounded),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(pushPrefsProvider);

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: AppTheme.glass(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Text(
              'Notifications',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppTheme.textMuted,
              ),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.notifications, color: AppTheme.textSecondary),
            title: const Text('Price Alerts', style: TextStyle(fontSize: 14)),
            trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
            onTap: () => context.push('/alerts'),
          ),
          const Divider(height: 1),
          for (var i = 0; i < _items.length; i++) ...[
            if (i > 0) const Divider(height: 1),
            SwitchListTile(
              secondary: Icon(_items[i].$3, color: AppTheme.textSecondary, size: 20),
              title: Text(_items[i].$2, style: const TextStyle(fontSize: 14)),
              value: prefs.get(_items[i].$1),
              activeThumbColor: AppTheme.primary,
              onChanged: (_) {
                ref.read(pushPrefsProvider.notifier).toggle(_items[i].$1);
                PushService.syncPreferences(
                  ref.read(apiClientProvider),
                  ref.read(pushPrefsProvider),
                );
              },
            ),
          ],
        ],
      ),
    ).animate().fadeIn(duration: 300.ms, delay: 120.ms).slideY(begin: 0.05, end: 0);
  }
}

class SettingsExtensionBanner extends StatefulWidget {
  const SettingsExtensionBanner({super.key});

  @override
  State<SettingsExtensionBanner> createState() => _SettingsExtensionBannerState();
}

class _SettingsExtensionBannerState extends State<SettingsExtensionBanner> {
  bool _dismissed = false;

  @override
  Widget build(BuildContext context) {
    if (_dismissed) return const SizedBox.shrink();
    return EcosystemBanner(
      icon: '\u{1F9E9}',
      message: 'See real prices & float values on every Steam item',
      cta: 'Install Free',
      url: 'https://chromewebstore.google.com/detail/skinkeeper-%E2%80%94-cs2-inventor/lbihgifhfhpeahokiegleeknffkihbpd',
      onDismiss: () => setState(() => _dismissed = true),
    ).animate().fadeIn(duration: 300.ms, delay: 135.ms).slideY(begin: 0.05, end: 0);
  }
}

class ProfileCard extends ConsumerWidget {
  const ProfileCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authStateProvider);
    return user.whenData((u) {
      if (u == null) return const SizedBox.shrink();
      return Container(
        clipBehavior: Clip.antiAlias,
        decoration: AppTheme.glassElevated(),
        child: ListTile(
          leading: CircleAvatar(
            backgroundImage: NetworkImage(u.avatarUrl),
          ),
          title: Text(u.displayName),
          subtitle: Text(u.steamId, style: const TextStyle(color: AppTheme.textMuted)),
          trailing: u.isPremium
              ? Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.warning.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(AppTheme.r8),
                  ),
                  child: const Text(
                    'PRO',
                    style: TextStyle(
                      color: AppTheme.warning,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                )
              : null,
        ),
      ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05, end: 0);
    }).maybeWhen(orElse: () => const SizedBox.shrink());
  }
}

class AccountSection extends ConsumerWidget {
  const AccountSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionStatus = ref.watch(sessionStatusProvider);
    final l10n = AppLocalizations.of(context);

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: AppTheme.glass(),
      child: Column(
        children: [
          ListTile(
            leading: Icon(
              Icons.vpn_key,
              color: sessionStatus.whenOrNull(
                    data: (s) => s.status == 'valid' || s.status == 'expiring' ? AppTheme.profit : AppTheme.textMuted,
                  ) ??
                  AppTheme.textMuted,
            ),
            title: Text(l10n.steamSession),
            subtitle: Text(
              sessionStatus.whenOrNull(
                    data: (s) => s.status == 'valid' || s.status == 'expiring' ? l10n.connected : s.status == 'expired' ? 'Expired' : l10n.notConfigured,
                  ) ??
                  l10n.checking,
              style: TextStyle(
                color: sessionStatus.whenOrNull(
                      data: (s) => s.status == 'valid' || s.status == 'expiring' ? AppTheme.profit : AppTheme.textDisabled,
                    ) ??
                    AppTheme.textDisabled,
                fontSize: 12,
              ),
            ),
            trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
            onTap: () => context.push('/session'),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.people, color: AppTheme.textSecondary),
            title: Text(l10n.linkedAccounts),
            trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
            onTap: () => context.push('/settings/accounts'),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms, delay: 50.ms).slideY(begin: 0.05, end: 0);
  }
}

class PreferencesSection extends ConsumerWidget {
  const PreferencesSection({
    super.key,
    required this.onCurrencyTap,
    required this.onLanguageTap,
  });

  final VoidCallback onCurrencyTap;
  final VoidCallback onLanguageTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final currency = ref.watch(currencyProvider);
    final locale = ref.watch(localeProvider);

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: AppTheme.glass(),
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.attach_money, color: AppTheme.textSecondary),
            title: Text(l10n.currency),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '${currency.symbol} ${currency.code}',
                  style: const TextStyle(color: AppTheme.textMuted),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right, color: AppTheme.textMuted),
              ],
            ),
            onTap: onCurrencyTap,
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.language, color: AppTheme.textSecondary),
            title: Text(l10n.language),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  locale != null
                      ? kSupportedLocales[locale.languageCode] ?? locale.languageCode
                      : l10n.systemDefault,
                  style: const TextStyle(color: AppTheme.textMuted),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right, color: AppTheme.textMuted),
              ],
            ),
            onTap: onLanguageTap,
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms, delay: 150.ms).slideY(begin: 0.05, end: 0);
  }
}

class PremiumTourSection extends ConsumerWidget {
  const PremiumTourSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final blurFallback = ref.watch(blurFallbackProvider);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: AppTheme.glass(),
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.workspace_premium, color: AppTheme.warning),
            title: Text(l10n.upgradeToPremium),
            trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
            onTap: () => context.push('/premium'),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.play_circle_outline, color: AppTheme.textSecondary),
            title: Text(l10n.appTour),
            trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
            onTap: () async {
              await resetOnboarding();
              ref.invalidate(onboardingCompleteProvider);
              if (context.mounted) context.push('/onboarding');
            },
          ),
          // P10 dev/QA toggle: low-end blur fallback. Only visible in debug
          // builds — production users never see this. Lets QA flip the
          // BackdropFilter → solid-fallback path on a real device without
          // editing SharedPreferences manually. Production rollout will be
          // driven by Remote Config + device-class detection (PLAN.md §0).
          if (kDebugMode) ...[
            const Divider(height: 1),
            SwitchListTile(
              secondary: const Icon(
                Icons.blur_off_rounded,
                color: AppTheme.textSecondary,
              ),
              // TODO(l10n): debug-only — translation optional.
              title: const Text('Low-end blur fallback'),
              subtitle: const Text(
                'Skips BackdropFilter in PremiumGate (debug only)',
                style: TextStyle(fontSize: 11, color: AppTheme.textMuted),
              ),
              value: blurFallback,
              onChanged: (v) =>
                  ref.read(blurFallbackProvider.notifier).setEnabled(v),
            ),
          ],
        ],
      ),
    ).animate().fadeIn(duration: 300.ms, delay: 200.ms).slideY(begin: 0.05, end: 0);
  }
}

class EcosystemSection extends StatelessWidget {
  const EcosystemSection({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: AppTheme.glass(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Text(
              'One Ecosystem. Every Skin.',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppTheme.textMuted,
                letterSpacing: 0.2,
              ),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.extension, color: AppTheme.accent),
            title: const Text('Browser Extension'),
            subtitle: const Text(
              'Live prices, floats & arbitrage deals right inside Steam. No tab switching.',
              style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
            ),
            trailing: const Icon(Icons.open_in_new, color: AppTheme.textMuted, size: 18),
            onTap: () => launchUrl(Uri.parse('https://chromewebstore.google.com/detail/skinkeeper-%E2%80%94-cs2-inventor/lbihgifhfhpeahokiegleeknffkihbpd')),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.language, color: AppTheme.accent),
            title: const Text('Web Dashboard'),
            subtitle: const Text(
              'Full portfolio analytics, deep charts & market data on any screen.',
              style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
            ),
            trailing: const Icon(Icons.open_in_new, color: AppTheme.textMuted, size: 18),
            onTap: () => launchUrl(Uri.parse('https://app.skinkeeper.store')),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.desktop_windows, color: AppTheme.accent),
            title: const Text('Desktop App'),
            subtitle: const Text(
              'Storage units, automation rules & GC operations — power user control.',
              style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
            ),
            trailing: const Icon(Icons.open_in_new, color: AppTheme.textMuted, size: 18),
            onTap: () => launchUrl(Uri.parse('https://skinkeeper.store/download')),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms, delay: 220.ms).slideY(begin: 0.05, end: 0);
  }
}

class LegalSection extends StatelessWidget {
  const LegalSection({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: AppTheme.glass(),
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.privacy_tip_outlined, color: AppTheme.textSecondary),
            title: Text(l10n.privacyPolicy),
            trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
            onTap: () {
              launchUrl(Uri.parse('https://api.skinkeeper.store/legal/privacy'));
            },
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.description_outlined, color: AppTheme.textSecondary),
            title: Text(l10n.termsOfService),
            trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
            onTap: () {
              launchUrl(Uri.parse('https://api.skinkeeper.store/legal/terms'));
            },
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms, delay: 270.ms).slideY(begin: 0.05, end: 0);
  }
}

class SignOutSection extends ConsumerWidget {
  const SignOutSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: AppTheme.glass(),
      child: ListTile(
        leading: const Icon(Icons.logout, color: AppTheme.loss),
        title: Text(l10n.signOut, style: const TextStyle(color: AppTheme.loss)),
        onTap: () {
          ref.read(authStateProvider.notifier).logout();
        },
      ),
    ).animate().fadeIn(duration: 300.ms, delay: 320.ms).slideY(begin: 0.05, end: 0);
  }
}

class DeleteAccountSection extends StatelessWidget {
  const DeleteAccountSection({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: AppTheme.glass(),
      child: ListTile(
        leading: const Icon(Icons.delete_forever, color: AppTheme.textDisabled),
        title: Text(
          'Delete Account',
          style: TextStyle(color: AppTheme.textDisabled, fontSize: 14),
        ),
        subtitle: Text(
          'Permanently delete all data',
          style: TextStyle(color: AppTheme.textDisabled.withValues(alpha: 0.6), fontSize: 11),
        ),
        onTap: onTap,
      ),
    ).animate().fadeIn(duration: 300.ms, delay: 370.ms).slideY(begin: 0.05, end: 0);
  }
}
