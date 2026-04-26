class SteamUser {
  /// Backend `users.id` (numeric primary key).
  ///
  /// Distinct from [steamId] (Steam's external identifier). Required for
  /// security checks where we need to confirm an inbound payload (e.g. push
  /// notification `userId`) actually targets the currently-signed-in user
  /// rather than a previously-signed-in user whose token is still cached.
  ///
  /// Nullable for forward-compat: older backend builds didn't return `id` on
  /// `/auth/me`, and users with stale clients should still authenticate
  /// successfully — the security check downgrades to "skip verification" in
  /// that case (and logs a warning) instead of locking everyone out.
  final int? userId;
  final String steamId;
  final String displayName;
  final String avatarUrl;
  final bool isPremium;
  final DateTime? premiumUntil;
  final int? activeAccountId;
  final int accountCount;

  const SteamUser({
    this.userId,
    required this.steamId,
    required this.displayName,
    required this.avatarUrl,
    this.isPremium = false,
    this.premiumUntil,
    this.activeAccountId,
    this.accountCount = 1,
  });

  factory SteamUser.fromJson(Map<String, dynamic> json) {
    return SteamUser(
      userId: json['id'] as int?,
      steamId: json['steam_id'] as String,
      displayName: json['display_name'] as String,
      avatarUrl: json['avatar_url'] as String,
      isPremium: json['is_premium'] as bool? ?? false,
      premiumUntil: json['premium_until'] != null
          ? DateTime.parse(json['premium_until'] as String)
          : null,
      activeAccountId: json['active_account_id'] as int?,
      accountCount: json['account_count'] as int? ?? 1,
    );
  }
}

class SteamAccount {
  final int id;
  final String steamId;
  final String displayName;
  final String avatarUrl;
  final bool isActive;
  final String sessionStatus;
  final DateTime addedAt;

  const SteamAccount({
    required this.id,
    required this.steamId,
    required this.displayName,
    required this.avatarUrl,
    this.isActive = false,
    this.sessionStatus = 'none',
    required this.addedAt,
  });

  factory SteamAccount.fromJson(Map<String, dynamic> json) {
    return SteamAccount(
      id: json['id'] as int,
      steamId: json['steamId'] as String,
      displayName: json['displayName'] as String? ?? '',
      avatarUrl: json['avatarUrl'] as String? ?? '',
      isActive: json['isActive'] as bool? ?? false,
      sessionStatus: json['sessionStatus'] as String? ?? 'none',
      addedAt: DateTime.parse(json['addedAt'] as String),
    );
  }
}
