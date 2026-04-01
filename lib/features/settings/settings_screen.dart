import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants.dart';
import '../../core/push_preferences.dart';
import '../../core/push_service.dart';
import '../../core/api_client.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../widgets/shared_ui.dart';
import '../auth/steam_auth_service.dart';
import '../../core/router.dart';
import '../onboarding/onboarding_screen.dart';
import '../auth/widgets/session_status_widget.dart';
import '../auth/session_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authStateProvider);
    final sessionStatus = ref.watch(sessionStatusProvider);
    final l10n = AppLocalizations.of(context);
    final currency = ref.watch(currencyProvider);
    final themeMode = ref.watch(themeModeProvider);
    final locale = ref.watch(localeProvider);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
          children: [
            // Custom header
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 0, 16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      l10n.settingsTitle.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.5,
                        color: AppTheme.textDisabled,
                      ),
                    ),
                  ),
                  // SessionStatusWidget removed — session issues shown via dialog
                ],
              ),
            ),
          // Profile card
          user.whenData((u) {
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
          }).maybeWhen(orElse: () => const SizedBox.shrink()),
          const SizedBox(height: 16),

          // Account group: Steam Session + Linked Accounts
          Container(
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
          ).animate().fadeIn(duration: 300.ms, delay: 50.ms).slideY(begin: 0.05, end: 0),
          const SizedBox(height: 16),

          // Notifications group: Price Alerts + Push Preferences
          _PushPrefsSection(),
          const SizedBox(height: 16),

          // Appearance & Preferences
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: AppTheme.glass(),
            child: Column(
              children: [
                // Currency
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
                  onTap: () => _showCurrencyPicker(context, ref),
                ),
                const Divider(height: 1),
                // Language
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
                  onTap: () => _showLanguagePicker(context, ref),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 300.ms, delay: 150.ms).slideY(begin: 0.05, end: 0),
          const SizedBox(height: 16),

          // Premium & Tour
          Container(
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
              ],
            ),
          ).animate().fadeIn(duration: 300.ms, delay: 200.ms).slideY(begin: 0.05, end: 0),
          const SizedBox(height: 16),

          // Legal
          Container(
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
          ).animate().fadeIn(duration: 300.ms, delay: 250.ms).slideY(begin: 0.05, end: 0),
          const SizedBox(height: 16),

          // Sign Out
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: AppTheme.glass(),
            child: ListTile(
              leading: const Icon(Icons.logout, color: AppTheme.loss),
              title: Text(l10n.signOut, style: const TextStyle(color: AppTheme.loss)),
              onTap: () {
                ref.read(authStateProvider.notifier).logout();
              },
            ),
          ).animate().fadeIn(duration: 300.ms, delay: 300.ms).slideY(begin: 0.05, end: 0),

          // Delete Account
          const SizedBox(height: 24),
          Container(
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
              onTap: () => _showDeleteConfirmation(context, ref),
            ),
          ).animate().fadeIn(duration: 300.ms, delay: 350.ms).slideY(begin: 0.05, end: 0),
          ],
        ),
      ),
    );
  }

  void _showDeleteConfirmation(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.bgSecondary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Delete Account?', style: TextStyle(color: AppTheme.textPrimary)),
        content: const Text(
          'This will permanently delete your account, all linked Steam accounts, inventory data, transactions, alerts, and trade history.\n\nThis action cannot be undone.',
          style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              // Second confirmation
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (ctx2) => AlertDialog(
                  backgroundColor: AppTheme.bgSecondary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  title: const Text('Are you sure?', style: TextStyle(color: AppTheme.loss)),
                  content: const Text(
                    'All your data will be permanently deleted. There is no way to recover it.',
                    style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx2, false),
                      child: const Text('Go back'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(ctx2, true),
                      child: const Text('Delete Everything',
                          style: TextStyle(color: AppTheme.loss, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              );
              if (confirmed == true) {
                final success = await ref.read(authStateProvider.notifier).deleteAccount();
                if (!success && context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Failed to delete account. Try again.')),
                  );
                }
              }
            },
            child: const Text('Delete', style: TextStyle(color: AppTheme.loss)),
          ),
        ],
      ),
    );
  }

  void _showCurrencyPicker(BuildContext context, WidgetRef ref) {
    final current = ref.read(currencyProvider);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return DraggableScrollableSheet(
          initialChildSize: 0.55,
          maxChildSize: 0.7,
          minChildSize: 0.3,
          expand: false,
          builder: (_, scrollCtrl) {
            return SafeArea(
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      AppLocalizations.of(context).currency,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ),
                  Expanded(
                    child: ListView(
                      controller: scrollCtrl,
                      children: availableCurrencyCodes.map((code) {
                        final info = buildCurrency(code);
                        final selected = info.code == current.code;
                        return ListTile(
                          leading: Text(info.symbol, style: const TextStyle(fontSize: 20)),
                          title: Text(info.code),
                          trailing: selected
                              ? const Icon(Icons.check_circle, color: AppTheme.primary)
                              : null,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            ref.read(currencyProvider.notifier).setCurrency(info.code);
                            Navigator.pop(ctx);
                          },
                        );
                      }).toList(),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _showLanguagePicker(BuildContext context, WidgetRef ref) {
    final current = ref.read(localeProvider);
    final l10n = AppLocalizations.of(context);
    showModalBottomSheet(
      context: context,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  l10n.language,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              // System default
              ListTile(
                leading: const Icon(Icons.phone_android),
                title: Text(l10n.systemDefault),
                trailing: current == null
                    ? const Icon(Icons.check_circle, color: AppTheme.primary)
                    : null,
                onTap: () {
                  HapticFeedback.selectionClick();
                  ref.read(localeProvider.notifier).setLocale(null);
                  Navigator.pop(ctx);
                },
              ),
              ...kSupportedLocales.entries.map((e) {
                final selected = current?.languageCode == e.key;
                return ListTile(
                  title: Text(e.value),
                  subtitle: Text(e.key.toUpperCase(),
                      style: const TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                  trailing: selected
                      ? const Icon(Icons.check_circle, color: AppTheme.primary)
                      : null,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    ref.read(localeProvider.notifier).setLocale(Locale(e.key));
                    Navigator.pop(ctx);
                  },
                );
              }),
              const SizedBox(height: 16),
            ],
          ),
        );
      },
    );
  }
}

class _PushPrefsSection extends ConsumerWidget {
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
          // Price Alerts nav row
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
              activeColor: AppTheme.primary,
              onChanged: (_) {
                ref.read(pushPrefsProvider.notifier).toggle(_items[i].$1);
                // Sync to backend
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

