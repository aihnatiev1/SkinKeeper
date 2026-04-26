/// Identifiers for the four post-purchase tour slides. Enum order is the
/// canonical slide index — `TourSlide.values.indexOf(s)` matches both the
/// [PageView] page index AND the analytics payload for
/// `tour_slide_viewed { slide: int }`. Don't reorder without a migration
/// plan in the analytics dashboards.
enum TourSlide {
  celebration,
  personalized,
  autoSellPitch,
  featureGrid;

  static TourSlide fromIndex(int index) {
    if (index < 0 || index >= values.length) return TourSlide.celebration;
    return values[index];
  }
}

/// Persisted-state key for the "user has finished (or skipped) the tour
/// once" flag. Stored in [SharedPreferences] under this name as a bool.
/// On first purchase: not set → tour shows. On any exit (Done / skip /
/// "Try it now"): set to `true` → tour never shows again.
const kTourCompletedKey = 'tour_v1_completed';
