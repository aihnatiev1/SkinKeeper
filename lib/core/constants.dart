class AppConstants {
  static const String appName = 'SkinKeeper';

  static const String apiBaseUrl = 'https://api.skinkeeper.store/api';

  // Steam
  static const String steamOpenIdUrl = 'https://steamcommunity.com/openid/login';
  static const String steamAvatarBase = 'https://avatars.steamstatic.com';
  static const String steamInventoryUrl = 'https://steamcommunity.com/inventory';

  // Steam CDN — swap this to your Cloudflare proxy when ready
  // e.g. 'https://img.skinkeeper.app'
  static const String steamCdnBase = 'https://community.steamstatic.com';

  // Deep link scheme for Steam auth callback
  static const String deepLinkScheme = 'skinkeeper';
  static const String authCallbackPath = '/auth/callback';

  // Cache durations
  static const Duration inventoryCacheDuration = Duration(minutes: 5);
  static const Duration priceCacheDuration = Duration(minutes: 5);

  // CS2 App ID
  static const int cs2AppId = 730;
  static const int cs2ContextId = 2;

}
