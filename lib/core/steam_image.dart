import 'constants.dart';

/// Builds Steam economy image URLs using the configured CDN base.
/// To switch to a Cloudflare proxy, update [AppConstants.steamCdnBase].
class SteamImage {
  SteamImage._();

  /// Returns a full image URL for the given Steam icon hash.
  ///
  /// [hash] — raw hash from Steam (e.g. icon_url field), or already a full URL.
  /// [size] — optional Steam size suffix, e.g. '360fx360f', '128fx128f', '64fx64f'.
  static String url(String hash, {String? size}) {
    if (hash.isEmpty) return '';
    if (hash.startsWith('http')) return hash;
    final base = '${AppConstants.steamCdnBase}/economy/image/$hash';
    return size != null ? '$base/$size' : base;
  }
}
