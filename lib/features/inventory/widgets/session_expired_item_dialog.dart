import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../../../models/user.dart';
import '../../settings/accounts_provider.dart';

/// Shown when the user taps an inventory item or picks an account whose
/// Steam session has expired. Offers a Login action that switches active
/// account and routes to the login screen, or Cancel.
Future<void> showSessionExpiredItemDialog(
  BuildContext context,
  WidgetRef ref,
  SteamAccount account, {
  String? title,
}) async {
  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppTheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      title: Row(
        children: [
          const Icon(Icons.vpn_key_off_rounded, color: AppTheme.warning, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              title ?? 'Relogin to ${account.displayName}?',
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
        ],
      ),
      content: Text(
        'Steam login keys only last 24 hours — yours just ran out on '
        '${account.displayName}. Not our rule, sadly \u{1FAE0} '
        'One quick relogin and you\u2019re back in business.',
        style: const TextStyle(
          fontSize: 14,
          color: AppTheme.textSecondary,
          height: 1.4,
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: AppTheme.primary,
            foregroundColor: Colors.white,
          ),
          onPressed: () async {
            Navigator.pop(ctx);
            if (!account.isActive) {
              await ref.read(accountsProvider.notifier).setActive(account.id);
            }
            if (context.mounted) {
              context.push('/session');
            }
          },
          child: const Text('Login'),
        ),
      ],
    ),
  );
}
