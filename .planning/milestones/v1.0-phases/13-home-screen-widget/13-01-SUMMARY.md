---
phase: "13"
plan: "01"
subsystem: widget-native
tags: [ios, android, widgetkit, appwidget, home-widget]
dependency_graph:
  requires: [cache-service]
  provides: [native-widget-extensions, widget-bridge]
  affects: [main.dart, pubspec.yaml]
tech_stack:
  added: [home_widget ^0.7.0]
  patterns: [app-groups, shared-preferences-bridge, timeline-provider]
key_files:
  created:
    - lib/core/widget_service.dart
    - ios/SkinTrackerWidget/SkinTrackerWidget.swift
    - ios/SkinTrackerWidget/SkinTrackerWidget.entitlements
    - ios/SkinTrackerWidget/Info.plist
    - android/app/src/main/kotlin/com/skintracker/skin_tracker/SkinTrackerWidget.kt
    - android/app/src/main/res/layout/widget_portfolio.xml
    - android/app/src/main/res/xml/widget_portfolio_info.xml
    - android/app/src/main/res/values/strings.xml
  modified:
    - pubspec.yaml
    - pubspec.lock
    - lib/main.dart
    - ios/Runner/Runner.entitlements
    - android/app/src/main/AndroidManifest.xml
decisions:
  - "iOS containerBackground uses availability check for iOS 17+ API with fallback gradient"
  - "Android widget uses unicode arrows instead of drawable icons for simplicity"
  - "WidgetService.updateWidget() uses Future.wait for parallel data saves"
  - "project.pbxproj not auto-modified — Xcode manual setup required for widget extension target"
metrics:
  duration: "3m"
  completed: "2026-03-09"
---

# Phase 13 Plan 01: Native Widget Extensions + home_widget Bridge Summary

iOS WidgetKit extension and Android AppWidget with dark gradient UI, portfolio value + 24h change display, premium P/L section, deep link to portfolio, bridged via home_widget Flutter package.

## What Was Built

### Flutter Bridge (lib/core/widget_service.dart)
- `WidgetService.init()` sets App Group ID for iOS data sharing
- `WidgetService.updateWidget()` saves 6-8 data keys (totalValue, change24h, change24hPct, isPositive, itemCount, lastUpdated, plus optional totalProfit/isProfitable for premium)
- Parallel data saves via `Future.wait` for performance
- Error handling with dev.log — widget failures never crash the app
- Initialized in `main.dart` after `CacheService.init()`

### iOS WidgetKit (ios/SkinTrackerWidget/)
- `PortfolioEntry` TimelineEntry with all portfolio fields + optional P/L
- `Provider` TimelineProvider reading from UserDefaults App Group `group.com.skintracker.widget`
- 30-minute timeline refresh policy
- SwiftUI view with dark gradient background (.black.gradient), white text, green/red change colors
- Supports `.systemSmall` (value + change) and `.systemMedium` (adds P/L section + absolute change)
- iOS 17+ `containerBackground` with fallback for older iOS
- Widget tap deep links to `skintracker://portfolio`
- App Group entitlements for both Runner and widget extension
- Info.plist with `com.apple.widgetkit-extension` point identifier

### Android AppWidget (android/app/)
- `SkinTrackerWidget` AppWidgetProvider reading from `HomeWidgetPlugin.getData()`
- Dynamic color setting: green (#4CAF50) for positive, red (#F44336) for negative changes
- Unicode arrow indicators (north-east / south-east)
- Dark layout (#121212 background, white/grey text hierarchy)
- `widget_portfolio_info.xml`: 180dp x 110dp minimum, 30min update period, resizable
- Widget receiver registered in AndroidManifest.xml
- Deep link PendingIntent to `skintracker://portfolio` on tap

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Added strings.xml for widget description**
- **Found during:** Task 3 (Android widget)
- **Issue:** `widget_portfolio_info.xml` referenced `@string/app_name` but no strings.xml existed
- **Fix:** Created `res/values/strings.xml` with dedicated `widget_portfolio_description` string
- **Files modified:** android/app/src/main/res/values/strings.xml, widget_portfolio_info.xml

**2. [Rule 2 - Missing] iOS version compatibility fallback**
- **Found during:** Task 2 (iOS widget)
- **Issue:** `.containerBackground()` requires iOS 17+; plan code had no fallback
- **Fix:** Added `#available(iOSApplicationExtension 17.0, *)` check with LinearGradient fallback
- **Files modified:** SkinTrackerWidget.swift

**3. [Rule 2 - Missing] Android widget package name correction**
- **Found during:** Task 3 (Android widget)
- **Issue:** Plan used `com.skintracker.app` package but actual project uses `com.skintracker.skin_tracker`
- **Fix:** Used correct package name matching existing MainActivity.kt
- **Files modified:** SkinTrackerWidget.kt

## Commits

| Hash | Message |
|------|---------|
| 1322292 | feat(13-01): add iOS WidgetKit & Android AppWidget with home_widget bridge |

## Known Limitations

- **iOS Xcode setup required**: The `project.pbxproj` was not modified. To complete iOS widget integration, open the project in Xcode and add the SkinTrackerWidget extension target manually (File > New > Target > Widget Extension, then point it at the existing Swift file).
- Widget data is not yet pushed automatically — Plan 13-02 will wire `updateWidget()` calls into portfolio provider data flow.

## Self-Check: PASSED

All 10 created/modified files verified on disk. Commit 1322292 verified in git log.
