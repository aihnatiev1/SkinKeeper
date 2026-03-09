---
phase: "13"
plan: "02"
subsystem: flutter-widget-data
tags: [widget, portfolio, background-refresh, deep-link, premium]
dependency_graph:
  requires: [13-01]
  provides: [widget-data-pipeline, widget-deep-link, widget-background-refresh]
  affects: [portfolio_provider, widget_service, cache_service, main, router]
tech_stack:
  added: []
  patterns: [WidgetsBindingObserver, background-callback, TTL-ignoring-cache]
key_files:
  created: []
  modified:
    - lib/features/portfolio/portfolio_provider.dart
    - lib/core/widget_service.dart
    - lib/core/cache_service.dart
    - lib/main.dart
    - lib/core/router.dart
decisions:
  - Background callback uses CacheService.getPortfolioRaw() to ignore TTL (stale widget data > no widget data)
  - pushCachedToWidget() helper avoids code duplication between foreground resume and background callback
  - Premium P/L read from cached JSON total_profit field, only pushed when premiumProvider confirms premium
metrics:
  duration: 169s
  completed: "2026-03-09T10:05:45Z"
---

# Phase 13 Plan 02: Widget Data Provider & Background Refresh Summary

Widget data pipeline wired: portfolio provider pushes formatted values to native widget after every fetch, background callback reads from Hive cache for OS-triggered refreshes, deep link routes widget taps to portfolio screen.

## What Was Done

### Task 1 & 5: Portfolio Provider Widget Push + Premium P/L
- After every portfolio fetch (cache hit or API response), `_pushToWidget()` formats and pushes data to WidgetService
- Formats: `$X.XX` for value, `+$X.XX` / `-$X.XX` for change, `+X.X%` for percentage
- Premium users get `totalProfit` and `isProfitable` fields; free users get null (widget shows value + 24h change only)

### Task 2: Background Widget Refresh
- Added `registerBackgroundCallback()` to WidgetService, called in `main()` during startup
- `_backgroundCallback()` annotated with `@pragma('vm:entry-point')` for isolate entry
- Re-inits CacheService (Hive) in isolate, reads raw portfolio data, pushes to widget
- Added `CacheService.getPortfolioRaw()` — returns portfolio without TTL check (stale data better than empty widget)
- Added `pushCachedToWidget()` convenience method for non-provider contexts

### Task 3: Widget Deep Link
- Added `skintracker://portfolio` handling in GoRouter redirect (before auth check)
- Added portfolio deep link handling in `_handleDeepLink()` in main.dart (for warm start)

### Task 4: App Foreground Widget Update
- Mixed `WidgetsBindingObserver` into `_SkinTrackerAppState`
- On `AppLifecycleState.resumed`, calls `WidgetService.pushCachedToWidget()`
- Properly adds/removes observer in initState/dispose

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| c0b2947 | feat(13-02): wire widget data provider with background refresh & deep links |

## Self-Check: PASSED
