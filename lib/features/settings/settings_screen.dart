import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../auth/steam_auth_service.dart';
import 'widgets/settings_sections.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);

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
          const ProfileCard(),
          const SizedBox(height: 16),

          // Account group: Steam Session + Linked Accounts
          const AccountSection(),
          const SizedBox(height: 16),

          // Notifications group: Price Alerts + Push Preferences
          PushPrefsSection(),
          const SizedBox(height: 16),

          // Cross-promotion: Browser Extension
          const SettingsExtensionBanner(),
          const SizedBox(height: 16),

          // Appearance & Preferences
          PreferencesSection(
            onCurrencyTap: () => _showCurrencyPicker(context, ref),
            onLanguageTap: () => _showLanguagePicker(context, ref),
          ),
          const SizedBox(height: 16),

          // Premium & Tour
          const PremiumTourSection(),
          const SizedBox(height: 16),

          // SkinKeeper Ecosystem
          const EcosystemSection(),
          const SizedBox(height: 16),

          // Legal
          const LegalSection(),
          const SizedBox(height: 16),

          // Sign Out
          const SignOutSection(),

          // Delete Account
          const SizedBox(height: 24),
          DeleteAccountSection(
            onTap: () => _showDeleteConfirmation(context, ref),
          ),
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
