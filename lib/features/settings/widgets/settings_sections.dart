import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/push_preferences.dart';
import '../../../core/push_service.dart';
import '../../../core/theme.dart';
import '../../../widgets/ecosystem_banner.dart';

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
