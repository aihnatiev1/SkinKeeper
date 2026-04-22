import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../trades_provider.dart';

class FriendPickerStep extends ConsumerWidget {
  final TextEditingController searchCtrl;
  final ValueChanged<SteamFriend> onSelect;

  const FriendPickerStep({
    super.key,
    required this.searchCtrl,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final friendsAsync = ref.watch(steamFriendsProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
          child: Text(
            'Choose who to trade with',
            style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
          child: TextField(
            controller: searchCtrl,
            decoration: InputDecoration(
              hintText: 'Search friends...',
              prefixIcon: const Icon(Icons.search, size: 20),
              filled: true,
              fillColor: AppTheme.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.r16),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
        Expanded(
          child: friendsAsync.when(
            data: (friends) => ValueListenableBuilder(
              valueListenable: searchCtrl,
              builder: (context, _, _) {
                final query = searchCtrl.text.toLowerCase();
                var filtered = query.isEmpty
                    ? friends
                    : friends
                        .where((f) =>
                            f.personaName.toLowerCase().contains(query) ||
                            f.steamId.contains(query))
                        .toList();
                filtered = [...filtered]..sort((a, b) {
                  final aOnline = a.isOnline ? 0 : 1;
                  final bOnline = b.isOnline ? 0 : 1;
                  return aOnline.compareTo(bOnline);
                });

                if (filtered.isEmpty) {
                  return Center(
                    child: Text(
                      query.isEmpty
                          ? 'No friends found'
                          : 'No matches for "$query"',
                      style: const TextStyle(
                          fontSize: 14, color: AppTheme.textMuted),
                    ),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) => _FriendTile(
                    friend: filtered[i],
                    onTap: () => onSelect(filtered[i]),
                  ).animate()
                      .fadeIn(duration: 200.ms, delay: (i * 30).ms),
                );
              },
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.error_outline,
                        size: 40, color: AppTheme.textDisabled),
                    const SizedBox(height: 12),
                    Text(friendlyError(e),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            fontSize: 13, color: AppTheme.textSecondary)),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () => ref.invalidate(steamFriendsProvider),
                      icon: const Icon(Icons.refresh, size: 16),
                      label: const Text('Retry'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primary,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _FriendTile extends StatelessWidget {
  final SteamFriend friend;
  final VoidCallback onTap;

  const _FriendTile({required this.friend, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final statusColor = switch (friend.onlineStatus) {
      'online' => AppTheme.accent,
      'looking_to_trade' => AppTheme.profit,
      'busy' || 'away' || 'snooze' => AppTheme.warning,
      _ => AppTheme.textMuted,
    };

    final isOffline = !friend.isOnline;

    return Opacity(
      opacity: isOffline ? 0.5 : 1.0,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
        decoration: AppTheme.glass(radius: AppTheme.r16),
        child: ListTile(
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
          onTap: onTap,
          leading: Stack(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: AppTheme.surface,
                backgroundImage: CachedNetworkImageProvider(friend.avatarUrl),
              ),
              Positioned(
                right: 0,
                bottom: 0,
                child: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: statusColor,
                    shape: BoxShape.circle,
                    border: Border.all(
                        color: AppTheme.bg, width: 2),
                  ),
                ),
              ),
            ],
          ),
          title: Text(
            friend.personaName,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: friend.isLookingToTrade
              ? const Text('Looking to Trade',
                  style: TextStyle(fontSize: 11, color: AppTheme.profit))
              : Text(
                  friend.isOnline ? 'Online' : 'Offline',
                  style: TextStyle(
                    fontSize: 11,
                    color: friend.isOnline
                        ? AppTheme.accent
                        : AppTheme.textDisabled,
                  ),
                ),
          trailing:
              Icon(Icons.chevron_right, size: 20, color: AppTheme.textSecondary),
        ),
      ),
    );
  }
}
