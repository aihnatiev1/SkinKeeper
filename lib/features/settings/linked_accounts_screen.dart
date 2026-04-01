import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/user.dart';
import '../../widgets/shared_ui.dart';
import 'accounts_provider.dart';
import '../auth/session_gate.dart';
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
              padding: const EdgeInsets.fromLTRB(8, 16, 16, 0),
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
      case 'expired': return AppTheme.warning;
      default: return AppTheme.textMuted;
    }
  }

  String _statusLabel() {
    switch (account.sessionStatus) {
      case 'valid': return 'Trading enabled';
      case 'expiring': return 'Session expiring soon';
      case 'expired': return 'Trading locked — session expired';
      default: return 'Online · Trading locked';
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
                        if (account.isActive && totalAccounts > 1) ...[
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
                    icon: const Icon(Icons.check_circle_outline, size: 14),
                    label: const Text('Activate', style: TextStyle(fontSize: 12)),
                    onPressed: () async {
                      HapticFeedback.mediumImpact();
                      await ref.read(accountsProvider.notifier).setActive(account.id);
                      if (context.mounted) context.go('/portfolio');
                    },
                  ),
                ),
              if (!account.isActive) const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  icon: Icon(
                    account.sessionStatus == 'valid' || account.sessionStatus == 'expiring'
                        ? Icons.check_circle_outline
                        : Icons.lock_open_rounded,
                    size: 14,
                  ),
                  label: Text(
                    account.sessionStatus == 'valid' || account.sessionStatus == 'expiring'
                        ? 'Reconnect'
                        : 'Enable Trading',
                    style: const TextStyle(fontSize: 12),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onPressed: () async {
                    // Temporarily switch to this account for session auth, then switch back
                    final wasActive = account.isActive;
                    final previousActiveId = ref.read(authStateProvider).valueOrNull?.activeAccountId;
                    if (!wasActive) {
                      await ref.read(accountsProvider.notifier).setActive(account.id);
                    }
                    if (!context.mounted) return;
                    await requireSession(context, ref);
                    // Restore previous active account if we switched temporarily
                    if (!wasActive && previousActiveId != null) {
                      await ref.read(accountsProvider.notifier).setActive(previousActiveId);
                    }
                    // Refresh accounts to update session status display
                    ref.invalidate(accountsProvider);
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
      barrierColor: Colors.black54,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove Account?'),
        content: Text(isLastAccount
            ? 'This is your only account. Removing it will sign you out.'
            : 'Remove ${account.displayName}? This will delete cached inventory, trade history, and session data for this account.'),
        actions: [
          OutlinedButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTheme.loss),
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
            child: const Text('Remove'),
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
    final blocked = !isPremium && accountCount >= 2;

    return GradientButton(
      label: 'Add Steam Account',
      icon: Icons.add,
      height: 48,
      onPressed: () {
        if (blocked) {
          context.push('/premium');
          return;
        }
        context.push('/link-account');
      },
    );
  }
}
