class AppConstants {
  static const String appName = 'SkinKeeper';

  // Backend API — simulator uses localhost, device needs machine IP
  static const String apiBaseUrl = 'http://localhost:3000/api';

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

  // Dev token (remove in production)
  static const String devToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInN0ZWFtSWQiOiI3NjU2MTE5OTA3NzYwNzgxMyIsImlhdCI6MTc3MjkyNTQwOCwiZXhwIjoxNzc1NTE3NDA4fQ.alKne1xdFoxLUtWtxQfuEHegLn6Z1ICoXIe-whK1WSc';
}
