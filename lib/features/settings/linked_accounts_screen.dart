import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme.dart';
import '../../models/user.dart';
import 'accounts_provider.dart';
import '../auth/steam_auth_service.dart';

class LinkedAccountsScreen extends ConsumerWidget {
  const LinkedAccountsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accountsAsync = ref.watch(accountsProvider);
    final user = ref.watch(authStateProvider).valueOrNull;

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 20, color: AppTheme.textSecondary),
                    onPressed: () => context.pop(),
                  ),
                  const Expanded(
                    child: Text(
                      'Linked Accounts',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: accountsAsync.when(
                loading: () => const Center(
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppTheme.accent)),
                error: (_, _) => Center(child: Text('Failed to load', style: TextStyle(color: AppTheme.textSecondary))),
                data: (accounts) => ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    ...accounts.asMap().entries.map((entry) =>
                      _AccountCard(account: entry.value, totalAccounts: accounts.length)
                        .animate()
                        .fadeIn(duration: 300.ms, delay: (entry.key * 60).ms)
                        .slideY(begin: 0.05, end: 0),
                    ),
                    const SizedBox(height: 16),
                    _LinkAccountButton(isPremium: user?.isPremium ?? false, accountCount: accounts.length)
                      .animate()
                      .fadeIn(duration: 300.ms, delay: (accounts.length * 60 + 100).ms),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AccountCard extends ConsumerWidget {
  final SteamAccount account;
  final int totalAccounts;
  const _AccountCard({required this.account, required this.totalAccounts});

  Color _statusColor() {
    switch (account.sessionStatus) {
      case 'valid': return AppTheme.profit;
      case 'expiring': return AppTheme.warning;
      case 'expired': return AppTheme.loss;
      default: return AppTheme.textDisabled;
    }
  }

  String _statusLabel() {
    switch (account.sessionStatus) {
      case 'valid': return 'Session Active';
      case 'expiring': return 'Session Expiring';
      case 'expired': return 'Session Expired';
      default: return 'No Session';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: account.isActive
          ? AppTheme.glassAccent(accentColor: AppTheme.accent)
          : AppTheme.glass(),
      child: Column(
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundImage: account.avatarUrl.isNotEmpty
                    ? NetworkImage(account.avatarUrl)
                    : null,
                radius: 24,
                child: account.avatarUrl.isEmpty
                    ? const Icon(Icons.person)
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            account.displayName.isNotEmpty
                                ? account.displayName
                                : account.steamId,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (account.isActive) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppTheme.accent.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              'ACTIVE',
                              style: TextStyle(color: AppTheme.accent, fontSize: 10, fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Container(
                          width: 8, height: 8,
                          decoration: BoxDecoration(color: _statusColor(), shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 6),
                        Text(_statusLabel(), style: TextStyle(color: _statusColor(), fontSize: 12)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              if (!account.isActive)
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.check_circle_outline, size: 16),
                    label: const Text('Set Active'),
                    onPressed: () async {
                      HapticFeedback.mediumImpact();
                      await ref.read(accountsProvider.notifier).setActive(account.id);
                    },
                  ),
                ),
              if (!account.isActive) const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.vpn_key, size: 16),
                  label: const Text('Auth'),
                  onPressed: () {
                    context.push('/session?accountId=${account.id}');
                  },
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                icon: const Icon(Icons.delete_outline, color: AppTheme.loss, size: 20),
                onPressed: () => _confirmRemove(context, ref, totalAccounts <= 1),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _confirmRemove(BuildContext context, WidgetRef ref, bool isLastAccount) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove Account?'),
        content: Text(isLastAccount
            ? 'This is your only account. Removing it will sign you out.'
            : 'Remove ${account.displayName}? This will delete its inventory data.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await ref.read(accountsProvider.notifier).unlinkAccount(account.id);
                if (isLastAccount && context.mounted) {
                  // Last account removed — logout and redirect
                  await ref.read(authStateProvider.notifier).logout();
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(e.toString())),
                  );
                }
              }
            },
            child: const Text('Remove', style: TextStyle(color: AppTheme.loss)),
          ),
        ],
      ),
    );
  }
}

class _LinkAccountButton extends ConsumerWidget {
  final bool isPremium;
  final int accountCount;
  const _LinkAccountButton({required this.isPremium, required this.accountCount});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // TODO: re-enable premium gate after testing
    // final blocked = !isPremium && accountCount >= 1;

    return Container(
      height: 48,
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(AppTheme.r12),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () async {
            try {
              final result =
                  await ref.read(accountsProvider.notifier).startLinkAccount();
              final url = result['url'] as String?;
              if (url != null && context.mounted) {
                await launchUrl(Uri.parse(url),
                    mode: LaunchMode.externalApplication);
              }
            } on PremiumRequiredException {
              if (context.mounted) context.push('/premium');
            } catch (e) {
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Failed to start linking: $e')),
                );
              }
            }
          },
          borderRadius: BorderRadius.circular(AppTheme.r12),
          child: const Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.add, color: Colors.white, size: 20),
                SizedBox(width: 8),
                Text(
                  'Link New Account',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
