import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api_client.dart';
import '../../core/constants.dart';
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

    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context).settingsTitle),
        actions: const [SessionStatusWidget()],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Profile card
          user.whenData((u) {
            if (u == null) return const SizedBox.shrink();
            return Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundImage: NetworkImage(u.avatarUrl),
                ),
                title: Text(u.displayName),
                subtitle: Text(u.steamId),
                trailing: u.isPremium
                    ? Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.amber.withAlpha(30),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Text(
                          'PRO',
                          style: TextStyle(
                            color: Colors.amber,
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                        ),
                      )
                    : null,
              ),
            );
          }).maybeWhen(orElse: () => const SizedBox.shrink()),
          const SizedBox(height: 16),

          // Steam Session
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: Icon(
                    Icons.vpn_key,
                    color: sessionStatus.whenOrNull(
                          data: (s) =>
                              s.configured ? Colors.greenAccent : Colors.white54,
                        ) ??
                        Colors.white54,
                  ),
                  title: const Text('Steam Session'),
                  subtitle: Text(
                    sessionStatus.whenOrNull(
                          data: (s) => s.configured
                              ? 'Connected'
                              : 'Not configured',
                        ) ??
                        'Checking...',
                    style: TextStyle(
                      color: sessionStatus.whenOrNull(
                            data: (s) => s.configured
                                ? Colors.greenAccent
                                : Colors.white38,
                          ) ??
                          Colors.white38,
                      fontSize: 12,
                    ),
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _showSessionSetup(context, ref),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Options
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.people),
                  title: const Text('Linked Accounts'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/settings/accounts'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.notifications),
                  title: const Text('Price Alerts'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/alerts'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.attach_money),
                  title: const Text('Currency'),
                  trailing: const Text('USD',
                      style: TextStyle(color: Colors.white54)),
                  onTap: () {},
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.workspace_premium,
                      color: Colors.amber),
                  title: const Text('Upgrade to Premium'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/premium'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.play_circle_outline),
                  title: const Text('App Tour'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () async {
                    await resetOnboarding();
                    ref.invalidate(onboardingCompleteProvider);
                    if (context.mounted) context.go('/onboarding');
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.privacy_tip_outlined),
                  title: Text(AppLocalizations.of(context).privacyPolicy),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    final baseUrl = AppConstants.apiBaseUrl.replaceAll('/api', '');
                    launchUrl(Uri.parse('$baseUrl/legal/privacy'));
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.description_outlined),
                  title: Text(AppLocalizations.of(context).termsOfService),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    final baseUrl = AppConstants.apiBaseUrl.replaceAll('/api', '');
                    launchUrl(Uri.parse('$baseUrl/legal/terms'));
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: ListTile(
              leading: const Icon(Icons.logout, color: Colors.redAccent),
              title: const Text('Sign Out',
                  style: TextStyle(color: Colors.redAccent)),
              onTap: () {
                ref.read(authStateProvider.notifier).logout();
              },
            ),
          ),
        ],
      ),
    );
  }

  void _showSessionSetup(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _SteamSessionSheet(ref: ref),
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
              const Expanded(
                child: Text(
                  'Connect Steam Session',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Open this URL in your browser while logged into Steam:',
            style: TextStyle(color: Colors.white70, fontSize: 13),
          ),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () => launchUrl(
              Uri.parse('https://steamcommunity.com/chat/clientjstoken'),
              mode: LaunchMode.externalApplication,
            ),
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white.withAlpha(10),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.open_in_new, size: 14, color: Colors.cyanAccent),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'steamcommunity.com/chat/clientjstoken',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.cyanAccent,
                        fontFamily: 'monospace',
                        decoration: TextDecoration.underline,
                        decorationColor: Colors.cyanAccent,
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
                        const SnackBar(
                          content: Text('URL copied!'),
                          duration: Duration(seconds: 1),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Then paste the full JSON response below:',
            style: TextStyle(color: Colors.white70, fontSize: 13),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _controller,
            maxLines: 4,
            style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
            decoration: InputDecoration(
              hintText:
                  '{"logged_in":true,"steamid":"...","token":"..."}',
              hintStyle: const TextStyle(color: Colors.white24, fontSize: 12),
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
                style: const TextStyle(color: Colors.redAccent, fontSize: 13),
              ),
            ),
          if (_success != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                _success!,
                style:
                    const TextStyle(color: Colors.greenAccent, fontSize: 13),
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
                  : const Text('Connect'),
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
