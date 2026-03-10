import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../auth/steam_auth_service.dart';
import '../../core/router.dart';
import '../onboarding/onboarding_screen.dart';
import '../auth/widgets/session_status_widget.dart';
import 'steam_session_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authStateProvider);
    final sessionStatus = ref.watch(steamSessionStatusProvider);
    final l10n = AppLocalizations.of(context);
    final currency = ref.watch(currencyProvider);
    final themeMode = ref.watch(themeModeProvider);
    final locale = ref.watch(localeProvider);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Custom header
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 0, 16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      l10n.settingsTitle,
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -0.5,
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

          // Steam Session
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: AppTheme.glass(),
            child: Column(
              children: [
                ListTile(
                  leading: Icon(
                    Icons.vpn_key,
                    color: sessionStatus.whenOrNull(
                          data: (s) => s.configured ? AppTheme.profit : AppTheme.textMuted,
                        ) ??
                        AppTheme.textMuted,
                  ),
                  title: Text(l10n.steamSession),
                  subtitle: Text(
                    sessionStatus.whenOrNull(
                          data: (s) => s.configured ? l10n.connected : l10n.notConfigured,
                        ) ??
                        l10n.checking,
                    style: TextStyle(
                      color: sessionStatus.whenOrNull(
                            data: (s) => s.configured ? AppTheme.profit : AppTheme.textDisabled,
                          ) ??
                          AppTheme.textDisabled,
                      fontSize: 12,
                    ),
                  ),
                  trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
                  onTap: () => _showSessionSetup(context, ref),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 300.ms, delay: 50.ms).slideY(begin: 0.05, end: 0),
          const SizedBox(height: 16),

          // Options
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: AppTheme.glass(),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.people, color: AppTheme.textSecondary),
                  title: Text(l10n.linkedAccounts),
                  trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
                  onTap: () => context.push('/settings/accounts'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.notifications, color: AppTheme.textSecondary),
                  title: Text(l10n.priceAlerts),
                  trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
                  onTap: () => context.push('/alerts'),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 300.ms, delay: 100.ms).slideY(begin: 0.05, end: 0),
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
                    if (context.mounted) context.go('/onboarding');
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
                    final baseUrl = AppConstants.apiBaseUrl.replaceAll('/api', '');
                    launchUrl(Uri.parse('$baseUrl/legal/privacy'));
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.description_outlined, color: AppTheme.textSecondary),
                  title: Text(l10n.termsOfService),
                  trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
                  onTap: () {
                    final baseUrl = AppConstants.apiBaseUrl.replaceAll('/api', '');
                    launchUrl(Uri.parse('$baseUrl/legal/terms'));
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
          ],
        ),
      ),
    );
  }

  void _showSessionSetup(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      builder: (_) => _SteamSessionSheet(ref: ref),
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
                      children: kCurrencies.entries.map((e) {
                        final info = e.value;
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

class _SteamSessionSheet extends StatefulWidget {
  final WidgetRef ref;

  const _SteamSessionSheet({required this.ref});

  @override
  State<_SteamSessionSheet> createState() => _SteamSessionSheetState();
}

class _SteamSessionSheetState extends State<_SteamSessionSheet> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _error;
  String? _success;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _loading = true;
      _error = null;
      _success = null;
    });

    try {
      final msg = await widget.ref
          .read(steamSessionStatusProvider.notifier)
          .submitClientToken(text);
      setState(() {
        _success = msg;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    if (data?.text != null) {
      _controller.text = data!.text!;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  l10n.connectSteamSession,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            l10n.sessionBrowserHint,
            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () => launchUrl(
              Uri.parse('https://steamcommunity.com/chat/clientjstoken'),
              mode: LaunchMode.externalApplication,
            ),
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: AppTheme.glass(radius: AppTheme.r8),
              child: Row(
                children: [
                  const Icon(Icons.open_in_new, size: 14, color: AppTheme.accent),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'steamcommunity.com/chat/clientjstoken',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppTheme.accent,
                        fontFamily: 'monospace',
                        decoration: TextDecoration.underline,
                        decorationColor: AppTheme.accent,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.copy, size: 18),
                    onPressed: () {
                      Clipboard.setData(const ClipboardData(
                        text: 'https://steamcommunity.com/chat/clientjstoken',
                      ));
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(l10n.urlCopied),
                          duration: const Duration(seconds: 1),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            l10n.sessionPasteHint,
            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _controller,
            maxLines: 4,
            style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
            decoration: InputDecoration(
              hintText: '{"logged_in":true,"steamid":"...","token":"..."}',
              hintStyle: const TextStyle(color: AppTheme.textDisabled, fontSize: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              suffixIcon: IconButton(
                icon: const Icon(Icons.paste, size: 20),
                onPressed: _paste,
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                _error!,
                style: const TextStyle(color: AppTheme.loss, fontSize: 13),
              ),
            ),
          if (_success != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                _success!,
                style: const TextStyle(color: AppTheme.profit, fontSize: 13),
              ),
            ),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(l10n.connect),
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
