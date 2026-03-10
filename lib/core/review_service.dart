import 'package:in_app_review/in_app_review.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ReviewService {
  static const _lastPromptKey = 'review_last_prompt';
  static const _promptCountKey = 'review_prompt_count';
  static const _maxPrompts = 3;
  static const _cooldownDays = 30;

  static final _inAppReview = InAppReview.instance;

  /// Try to show review prompt after a positive action.
  /// Conditions:
  /// 1. Device supports in-app review
  /// 2. Haven't prompted more than 3 times total
  /// 3. At least 30 days since last prompt
  static Future<void> maybeRequestReview() async {
    try {
      final isAvailable = await _inAppReview.isAvailable();
      if (!isAvailable) return;

      final prefs = await SharedPreferences.getInstance();
      final promptCount = prefs.getInt(_promptCountKey) ?? 0;
      if (promptCount >= _maxPrompts) return;

      final lastPrompt = prefs.getInt(_lastPromptKey) ?? 0;
      if (lastPrompt > 0) {
        final daysSince = DateTime.now()
            .difference(DateTime.fromMillisecondsSinceEpoch(lastPrompt))
            .inDays;
        if (daysSince < _cooldownDays) return;
      }

      await _inAppReview.requestReview();

      await prefs.setInt(
          _lastPromptKey, DateTime.now().millisecondsSinceEpoch);
      await prefs.setInt(_promptCountKey, promptCount + 1);
    } catch (_) {
      // Silently fail — review is non-critical
    }
  }
}
