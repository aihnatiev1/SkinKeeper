import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../../../models/user.dart';
import '../../settings/accounts_provider.dart';
import '../trades_provider.dart';

/// Compact chip shown in the trades header that lets users filter by
/// the Steam account that owns a trade. Only renders for users with 2+
/// linked accounts; tapping it opens the _AccountFilterPicker sheet.
class TradesAccountFilter extends ConsumerWidget {
  const TradesAccountFilter({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accountsAsync = ref.watch(accountsProvider);
    return accountsAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (accounts) {
        if (accounts.length <= 1) return const SizedBox.shrink();
        final selectedId = ref.watch(
          tradesProvider.select((s) => s.valueOrNull?.selectedAccountId),
        );
        final active = selectedId != null
            ? accounts.firstWhere((a) => a.id == selectedId,
                orElse: () => accounts.first)
            : null;
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: GestureDetector(
            onTap: () => _showPicker(context, ref, accounts, selectedId),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
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
                  if (active != null)
                    _AccountAvatar(url: active.avatarUrl, size: 16)
                  else
                    _StackedAccountAvatars(accounts: accounts),
                  const SizedBox(width: 6),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 110),
                    child: Text(
                      active?.displayName ?? 'All accounts',
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
          ),
        );
      },
    );
  }

  void _showPicker(
    BuildContext context,
    WidgetRef ref,
    List<SteamAccount> accounts,
    int? currentId,
  ) {
    HapticFeedback.selectionClick();
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AccountFilterPicker(
        accounts: accounts,
        currentId: currentId,
        onSelect: (id) {
          HapticFeedback.selectionClick();
          ref.read(tradesProvider.notifier).setAccountFilter(id);
          Navigator.of(context, rootNavigator: true).pop();
        },
      ),
    );
  }
}

class _AccountFilterPicker extends StatelessWidget {
  final List<SteamAccount> accounts;
  final int? currentId;
  final void Function(int?) onSelect;

  const _AccountFilterPicker({
    required this.accounts,
    required this.currentId,
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
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 4),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.borderLight,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 8, 20, 4),
              child: Text(
                'Filter by account',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textPrimary),
              ),
            ),
            const Divider(color: AppTheme.divider, height: 1),
            _PickerRow(
              leading: _StackedAccountAvatars(accounts: accounts),
              label: 'All accounts',
              sublabel: '${accounts.length} linked',
              selected: currentId == null,
              onTap: () => onSelect(null),
            ),
            const Divider(
                color: AppTheme.divider,
                height: 1,
                indent: 20,
                endIndent: 20),
            for (final a in accounts)
              _PickerRow(
                leading: _AccountAvatar(url: a.avatarUrl, size: 36),
                label: a.displayName.isNotEmpty ? a.displayName : a.steamId,
                sublabel: a.isActive ? 'Active' : null,
                selected: currentId == a.id,
                onTap: () => onSelect(a.id),
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
                      color: selected
                          ? AppTheme.primaryLight
                          : AppTheme.textPrimary,
                    ),
                  ),
                  if (sublabel != null)
                    Text(sublabel!,
                        style: const TextStyle(
                            fontSize: 12, color: AppTheme.textMuted)),
                ],
              ),
            ),
            if (selected)
              const Icon(Icons.check_rounded,
                  size: 18, color: AppTheme.primary),
          ],
        ),
      ),
    );
  }
}

class _AccountAvatar extends StatelessWidget {
  final String url;
  final double size;
  const _AccountAvatar({required this.url, required this.size});

  @override
  Widget build(BuildContext context) {
    return ClipOval(
      child: url.isNotEmpty
          ? Image.network(url,
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => _placeholder())
          : _placeholder(),
    );
  }

  Widget _placeholder() => Container(
        width: size,
        height: size,
        color: AppTheme.surfaceLight,
        child: Icon(Icons.person_rounded,
            size: size * 0.7, color: AppTheme.textMuted),
      );
}

class _StackedAccountAvatars extends StatelessWidget {
  final List<SteamAccount> accounts;
  const _StackedAccountAvatars({required this.accounts});

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
                child: _AccountAvatar(url: shown[i].avatarUrl, size: size),
              ),
            ),
        ],
      ),
    );
  }
}
