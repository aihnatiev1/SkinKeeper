import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/account_scope_provider.dart';
import '../core/theme.dart';
import '../features/settings/accounts_provider.dart';
import '../models/user.dart';

/// Pill-shaped chip that lets the user pick which account scope to view.
/// Only renders when the user has more than one linked account.
///
/// null scope  → "All accounts"
/// int scope   → specific [SteamAccount]
class AccountScopeChip extends ConsumerWidget {
  const AccountScopeChip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accountsAsync = ref.watch(accountsProvider);

    return accountsAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (accounts) {
        if (accounts.length <= 1) return const SizedBox.shrink();

        final scope = ref.watch(accountScopeProvider);
        final active = scope != null
            ? accounts.firstWhere(
                (a) => a.id == scope,
                orElse: () => accounts.first,
              )
            : null;

        return _Chip(
          active: active,
          accounts: accounts,
          onTap: () => _showPicker(context, ref, accounts, scope),
        );
      },
    );
  }

  void _showPicker(
    BuildContext context,
    WidgetRef ref,
    List<SteamAccount> accounts,
    int? currentScope,
  ) {
    HapticFeedback.selectionClick();
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ScopePicker(
        accounts: accounts,
        currentScope: currentScope,
        onSelect: (id) {
          HapticFeedback.selectionClick();
          ref.read(accountScopeProvider.notifier).state = id;
          Navigator.of(context, rootNavigator: true).pop();
        },
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final SteamAccount? active;
  final List<SteamAccount> accounts;
  final VoidCallback onTap;

  const _Chip({
    required this.active,
    required this.accounts,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active != null
                ? AppTheme.primary.withValues(alpha: 0.4)
                : AppTheme.borderLight.withValues(alpha: 0.5),
            width: 0.5,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Avatar or stacked icon
            if (active != null)
              _Avatar(url: active!.avatarUrl, size: 16)
            else
              _StackedAvatars(accounts: accounts),
            const SizedBox(width: 6),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 90),
              child: Text(
                active != null ? active!.displayName : 'All accounts',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: active != null
                      ? AppTheme.primaryLight
                      : AppTheme.textSecondary,
                  overflow: TextOverflow.ellipsis,
                ),
                maxLines: 1,
              ),
            ),
            const SizedBox(width: 3),
            Icon(
              Icons.expand_more_rounded,
              size: 14,
              color: active != null
                  ? AppTheme.primaryLight.withValues(alpha: 0.7)
                  : AppTheme.textMuted,
            ),
          ],
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  final String url;
  final double size;
  const _Avatar({required this.url, required this.size});

  @override
  Widget build(BuildContext context) {
    return ClipOval(
      child: url.isNotEmpty
          ? Image.network(
              url,
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stack) => _placeholder(size),
            )
          : _placeholder(size),
    );
  }

  Widget _placeholder(double size) {
    return Container(
      width: size,
      height: size,
      color: AppTheme.surfaceLight,
      child: Icon(Icons.person_rounded, size: size * 0.7, color: AppTheme.textMuted),
    );
  }
}

/// Two overlapping mini-avatars for "all accounts" mode.
class _StackedAvatars extends StatelessWidget {
  final List<SteamAccount> accounts;
  const _StackedAvatars({required this.accounts});

  @override
  Widget build(BuildContext context) {
    const size = 14.0;
    final shown = accounts.take(2).toList();
    return SizedBox(
      width: size + (shown.length > 1 ? 8.0 : 0),
      height: size,
      child: Stack(
        children: [
          for (int i = 0; i < shown.length; i++)
            Positioned(
              left: i * 8.0,
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: AppTheme.bg, width: 0.8),
                ),
                child: _Avatar(url: shown[i].avatarUrl, size: size),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Bottom sheet picker ──────────────────────────────────────────────────────

class _ScopePicker extends StatelessWidget {
  final List<SteamAccount> accounts;
  final int? currentScope;
  final void Function(int?) onSelect;

  const _ScopePicker({
    required this.accounts,
    required this.currentScope,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 4),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.borderLight,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
              child: Text(
                'View account',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textPrimary,
                ),
              ),
            ),
            const Divider(color: AppTheme.divider, height: 1),
            // All accounts option
            _PickerRow(
              leading: _StackedAvatars(accounts: accounts),
              label: 'All accounts',
              sublabel: '${accounts.length} linked',
              selected: currentScope == null,
              onTap: () => onSelect(null),
            ),
            const Divider(color: AppTheme.divider, height: 1, indent: 20, endIndent: 20),
            // Individual accounts
            for (final account in accounts)
              _PickerRow(
                leading: _Avatar(url: account.avatarUrl, size: 36),
                label: account.displayName.isNotEmpty
                    ? account.displayName
                    : account.steamId,
                sublabel: account.isActive ? 'Active' : null,
                selected: currentScope == account.id,
                onTap: () => onSelect(account.id),
              ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}

class _PickerRow extends StatelessWidget {
  final Widget leading;
  final String label;
  final String? sublabel;
  final bool selected;
  final VoidCallback onTap;

  const _PickerRow({
    required this.leading,
    required this.label,
    this.sublabel,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Row(
          children: [
            SizedBox(width: 36, height: 36, child: Center(child: leading)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: selected ? AppTheme.primaryLight : AppTheme.textPrimary,
                    ),
                  ),
                  if (sublabel != null)
                    Text(
                      sublabel!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.textMuted,
                      ),
                    ),
                ],
              ),
            ),
            if (selected)
              const Icon(Icons.check_rounded, size: 18, color: AppTheme.primary),
          ],
        ),
      ),
    );
  }
}
