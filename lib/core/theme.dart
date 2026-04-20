import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// SkinKeeper Design System — Premium Dark Theme
/// Inspired by top trading & fintech apps (Robinhood, Binance, CS.Money)
class AppTheme {
  AppTheme._();

  // ─── Color Palette ───────────────────────────────────────────────
  static const Color bg = Color(0xFF0A0E1A);
  static const Color bgSecondary = Color(0xFF111827);
  static const Color surface = Color(0xFF1A1F35);
  static const Color surfaceLight = Color(0xFF232A42);
  static const Color card = Color(0xFF161C2E);
  static const Color cardHover = Color(0xFF1E2540);

  static const Color primary = Color(0xFF8B5CF6);
  static const Color primaryLight = Color(0xFFA78BFA);
  static const Color primaryDark = Color(0xFF7C3AED);
  static const Color accent = Color(0xFF06B6D4);
  static const Color accentLight = Color(0xFF22D3EE);

  static const Color profit = Color(0xFF10B981);
  static const Color profitLight = Color(0xFF34D399);
  static const Color loss = Color(0xFFEF4444);
  static const Color lossLight = Color(0xFFF87171);
  static const Color warning = Color(0xFFF59E0B);
  static const Color warningLight = Color(0xFFFBBF24);

  static const Color textPrimary = Color(0xFFF1F5F9);
  static const Color textSecondary = Color(0xFF94A3B8);
  static const Color textMuted = Color(0xFF64748B);
  static const Color textDisabled = Color(0xFF475569);
  static const Color border = Color(0xFF1E293B);
  static const Color borderLight = Color(0xFF334155);
  static const Color divider = Color(0xFF1E293B);

  // ─── Source brand colors ─────────────────────────────────────────
  static const Color steamBlue = Color(0xFF1B9FFF);
  static const Color skinportGreen = Color(0xFF4ADE80);
  static const Color csfloatOrange = Color(0xFFFB923C);
  static const Color dmarketPurple = Color(0xFFC084FC);
  static const Color buffYellow = Color(0xFFFBBF24);
  static const Color buffBidYellowDim = Color(0xFFD4A017);
  static const Color bitskinsRed = Color(0xFFEF4444);
  static const Color csmoneyTeal = Color(0xFF2DD4BF);
  static const Color youpinPink = Color(0xFFF472B6);
  static const Color lisskinsLime = Color(0xFFA3E635);

  // ─── Gradients ───────────────────────────────────────────────────
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [Color(0xFF7C3AED), Color(0xFF8B5CF6), Color(0xFFA78BFA)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient accentGradient = LinearGradient(
    colors: [Color(0xFF0891B2), Color(0xFF06B6D4), Color(0xFF22D3EE)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient profitGradient = LinearGradient(
    colors: [Color(0xFF059669), Color(0xFF10B981)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient lossGradient = LinearGradient(
    colors: [Color(0xFFDC2626), Color(0xFFEF4444)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient cardGradient = LinearGradient(
    colors: [Color(0xFF161C2E), Color(0xFF1A2139)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient surfaceGradient = LinearGradient(
    colors: [Color(0xFF0A0E1A), Color(0xFF111827)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  // ─── Spacing tokens (4px grid) ──────────────────────────────────
  static const double s2 = 2;
  static const double s4 = 4;
  static const double s6 = 6;
  static const double s8 = 8;
  static const double s10 = 10;
  static const double s12 = 12;
  static const double s14 = 14;
  static const double s16 = 16;
  static const double s20 = 20;
  static const double s24 = 24;
  static const double s28 = 28;
  static const double s32 = 32;
  static const double s40 = 40;
  static const double s48 = 48;
  static const double s56 = 56;

  // ─── Radius tokens ──────────────────────────────────────────────
  static const double r4 = 4;
  static const double r6 = 6;
  static const double r8 = 8;
  static const double r10 = 10;
  static const double r12 = 12;
  static const double r16 = 16;
  static const double r20 = 20;
  static const double r24 = 24;
  static const double r32 = 32;

  // ─── Glass decoration helpers ───────────────────────────────────

  /// Standard glassmorphic card decoration
  static BoxDecoration glass({
    Color? color,
    double borderOpacity = 0.06,
    double radius = r16,
    Color? borderColor,
  }) =>
      BoxDecoration(
        color: color ?? card,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(
          color: borderColor ?? Colors.white.withValues(alpha: borderOpacity),
          width: 1,
        ),
      );

  /// Elevated glassmorphic card with subtle glow
  static BoxDecoration glassElevated({
    Color? color,
    Color? glowColor,
    double radius = r16,
  }) =>
      BoxDecoration(
        color: color ?? card,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.08),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: (glowColor ?? primary).withValues(alpha: 0.08),
            blurRadius: 24,
            spreadRadius: -4,
            offset: const Offset(0, 8),
          ),
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      );

  /// Accent border card for highlighted state
  static BoxDecoration glassAccent({
    Color accentColor = primary,
    double radius = r16,
  }) =>
      BoxDecoration(
        color: card,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(
          color: accentColor.withValues(alpha: 0.3),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: accentColor.withValues(alpha: 0.1),
            blurRadius: 16,
            spreadRadius: -2,
          ),
        ],
      );

  // ─── Text styles ────────────────────────────────────────────────

  static const TextStyle h1 = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.w800,
    color: textPrimary,
    letterSpacing: -0.5,
    height: 1.2,
  );

  static const TextStyle h2 = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    color: textPrimary,
    letterSpacing: -0.3,
    height: 1.3,
  );

  static const TextStyle h3 = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w700,
    color: textPrimary,
    height: 1.3,
  );

  static const TextStyle title = TextStyle(
    fontSize: 17,
    fontWeight: FontWeight.w600,
    color: textPrimary,
    height: 1.4,
  );

  static const TextStyle subtitle = TextStyle(
    fontSize: 15,
    fontWeight: FontWeight.w500,
    color: textSecondary,
    height: 1.4,
  );

  static const TextStyle body = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: textPrimary,
    height: 1.5,
  );

  static const TextStyle bodySmall = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: textSecondary,
    height: 1.4,
  );

  static const TextStyle caption = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    color: textMuted,
    height: 1.3,
  );

  static const TextStyle captionSmall = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w400,
    color: textMuted,
    height: 1.3,
  );

  static const TextStyle mono = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    color: textPrimary,
    fontFeatures: [FontFeature.tabularFigures()],
    height: 1.4,
  );

  static const TextStyle monoSmall = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: textSecondary,
    fontFeatures: [FontFeature.tabularFigures()],
    height: 1.3,
  );

  static const TextStyle price = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w700,
    color: accent,
    fontFeatures: [FontFeature.tabularFigures()],
    height: 1.2,
  );

  static const TextStyle priceLarge = TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.w800,
    color: textPrimary,
    fontFeatures: [FontFeature.tabularFigures()],
    letterSpacing: -0.5,
    height: 1.2,
  );

  static const TextStyle label = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w600,
    color: textMuted,
    letterSpacing: 0.5,
    height: 1.3,
  );

  // ─── Theme Data ─────────────────────────────────────────────────

  static final darkTheme = ThemeData(
    brightness: Brightness.dark,
    useMaterial3: true,
    fontFamily: '.SF Pro Display',
    colorScheme: const ColorScheme.dark(
      primary: primary,
      secondary: accent,
      surface: surface,
      error: loss,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onSurface: textPrimary,
      onError: Colors.white,
    ),
    scaffoldBackgroundColor: bg,
    cardTheme: CardThemeData(
      color: card,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(r16)),
        side: BorderSide(color: Colors.white.withValues(alpha: 0.06)),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      systemOverlayStyle: SystemUiOverlayStyle.light,
      titleTextStyle: TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.w700,
        color: textPrimary,
        letterSpacing: -0.3,
      ),
      iconTheme: IconThemeData(color: textSecondary, size: 22),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.transparent,
      elevation: 0,
      height: 64,
      indicatorColor: primary.withValues(alpha: 0.15),
      labelTextStyle: WidgetStatePropertyAll(
        TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: textMuted,
          height: 1.2,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const IconThemeData(color: primary, size: 22);
        }
        return const IconThemeData(color: textMuted, size: 22);
      }),
    ),
    dividerTheme: DividerThemeData(
      color: divider,
      thickness: 1,
      space: 1,
    ),
    textTheme: const TextTheme(
      headlineLarge: h1,
      headlineMedium: h2,
      headlineSmall: h3,
      titleLarge: title,
      titleMedium: subtitle,
      bodyLarge: body,
      bodyMedium: bodySmall,
      bodySmall: caption,
      labelLarge: label,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: s16, vertical: s14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(r12),
        borderSide: BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(r12),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(r12),
        borderSide: const BorderSide(color: primary, width: 1.5),
      ),
      hintStyle: const TextStyle(color: textDisabled, fontSize: 14),
      prefixIconColor: textMuted,
      suffixIconColor: textMuted,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: s24, vertical: s14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(r12),
        ),
        textStyle: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.2,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: textPrimary,
        side: BorderSide(color: borderLight),
        padding: const EdgeInsets.symmetric(horizontal: s20, vertical: s12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(r12),
        ),
        textStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: primary,
        textStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: surface,
      selectedColor: primary.withValues(alpha: 0.15),
      disabledColor: surface,
      labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
      side: BorderSide(color: border),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(r8),
      ),
      padding: const EdgeInsets.symmetric(horizontal: s8, vertical: s4),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: bgSecondary,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(r24)),
      ),
      dragHandleColor: textDisabled,
      showDragHandle: false,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: bgSecondary,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(r20),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: surfaceLight,
      contentTextStyle: const TextStyle(color: textPrimary, fontSize: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(r12),
      ),
      behavior: SnackBarBehavior.floating,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: primary,
      linearTrackColor: surface,
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: surfaceLight,
      elevation: 8,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(r12),
        side: BorderSide(color: border),
      ),
      textStyle: const TextStyle(fontSize: 14, color: textPrimary),
    ),
    tabBarTheme: TabBarThemeData(
      indicatorColor: primary,
      labelColor: textPrimary,
      unselectedLabelColor: textMuted,
      indicatorSize: TabBarIndicatorSize.label,
      labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      unselectedLabelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w400),
      dividerColor: Colors.transparent,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return primary;
        return textMuted;
      }),
      trackColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return primary.withValues(alpha: 0.3);
        }
        return surface;
      }),
    ),
    sliderTheme: SliderThemeData(
      activeTrackColor: primary,
      inactiveTrackColor: surface,
      thumbColor: primary,
      overlayColor: primary.withValues(alpha: 0.1),
    ),
  );

  // ─── Light Theme ────────────────────────────────────────────────

  // Light palette
  static const Color lightBg = Color(0xFFF5F5F7);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightCard = Color(0xFFFFFFFF);
  static const Color lightBorder = Color(0xFFE2E8F0);
  static const Color lightTextPrimary = Color(0xFF1A1A2E);
  static const Color lightTextSecondary = Color(0xFF64748B);
  static const Color lightTextMuted = Color(0xFF94A3B8);

  static final lightTheme = ThemeData(
    brightness: Brightness.light,
    useMaterial3: true,
    fontFamily: '.SF Pro Display',
    colorScheme: const ColorScheme.light(
      primary: primary,
      secondary: accent,
      surface: lightSurface,
      error: loss,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onSurface: lightTextPrimary,
      onError: Colors.white,
    ),
    scaffoldBackgroundColor: lightBg,
    cardTheme: CardThemeData(
      color: lightCard,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(r16)),
        side: BorderSide(color: lightBorder.withValues(alpha: 0.5)),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      systemOverlayStyle: SystemUiOverlayStyle.dark,
      titleTextStyle: TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.w700,
        color: lightTextPrimary,
        letterSpacing: -0.3,
      ),
      iconTheme: IconThemeData(color: lightTextSecondary, size: 22),
    ),
    dividerTheme: DividerThemeData(
      color: lightBorder,
      thickness: 1,
      space: 1,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: lightBg,
      contentPadding: const EdgeInsets.symmetric(horizontal: s16, vertical: s14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(r12),
        borderSide: BorderSide(color: lightBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(r12),
        borderSide: BorderSide(color: lightBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(r12),
        borderSide: const BorderSide(color: primary, width: 1.5),
      ),
      hintStyle: const TextStyle(color: lightTextMuted, fontSize: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: s24, vertical: s14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(r12),
        ),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: lightSurface,
      elevation: 0,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(r24)),
      ),
      dragHandleColor: lightTextMuted,
      showDragHandle: false,
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: lightTextPrimary,
      contentTextStyle: const TextStyle(color: Colors.white, fontSize: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(r12),
      ),
      behavior: SnackBarBehavior.floating,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: primary,
      linearTrackColor: lightBg,
    ),
    tabBarTheme: TabBarThemeData(
      indicatorColor: primary,
      labelColor: lightTextPrimary,
      unselectedLabelColor: lightTextMuted,
      indicatorSize: TabBarIndicatorSize.label,
      labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      unselectedLabelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w400),
      dividerColor: Colors.transparent,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return primary;
        return lightTextMuted;
      }),
      trackColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return primary.withValues(alpha: 0.3);
        }
        return lightBorder;
      }),
    ),
  );

  // ─── Convenience helpers ────────────────────────────────────────

  /// Profit/loss color
  static Color plColor(num value) => value >= 0 ? profit : loss;

  /// Percentage text with sign and directional arrow.
  /// The arrow is essential for colorblind accessibility — ~8% of male users
  /// cannot reliably distinguish profit-green from loss-red.
  static String pctText(double value, {int decimals = 1}) {
    final prefix = value >= 0 ? '+' : '';
    final arrow = value >= 0 ? '↑' : '↓';
    return '$arrow $prefix${value.toStringAsFixed(decimals)}%';
  }
}
