class SteamUser {
  final String steamId;
  final String displayName;
  final String avatarUrl;
  final bool isPremium;
  final DateTime? premiumUntil;
  final int? activeAccountId;
  final int accountCount;

  const SteamUser({
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
