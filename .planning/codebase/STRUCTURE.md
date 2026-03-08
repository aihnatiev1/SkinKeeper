# Codebase Structure

**Analysis Date:** 2026-03-08

## Directory Layout

```
skintracker/
├── lib/                        # Flutter app source (Dart)
│   ├── main.dart               # App entry point
│   ├── core/                   # Shared infrastructure
│   │   ├── api_client.dart     # Dio HTTP client with JWT interceptor
│   │   ├── constants.dart      # API URLs, Steam config, cache durations
│   │   ├── router.dart         # GoRouter config with auth guard
│   │   └── theme.dart          # Dark/light Material theme definitions
│   ├── features/               # Feature modules (screen + state + widgets)
│   │   ├── auth/               # Steam authentication
│   │   │   ├── login_screen.dart
│   │   │   └── steam_auth_service.dart  # AuthNotifier + SteamAuthService
│   │   ├── inventory/          # CS2 skin inventory
│   │   │   ├── inventory_provider.dart  # Data fetching, sort/filter state
│   │   │   ├── inventory_screen.dart    # Grid view with multi-select
│   │   │   └── widgets/
│   │   │       ├── item_card.dart       # Individual skin card
│   │   │       └── sell_bottom_sheet.dart # Market sell UI
│   │   ├── portfolio/          # Portfolio value tracking
│   │   │   ├── portfolio_provider.dart  # Summary data + inline models
│   │   │   ├── portfolio_screen.dart    # Value chart + stats
│   │   │   └── widgets/                 # (empty - widgets inline in screen)
│   │   ├── transactions/       # Buy/sell history
│   │   │   ├── transactions_provider.dart # Fetch, filters, stats, inline models
│   │   │   └── transactions_screen.dart   # List view with filter chips
│   │   ├── settings/           # User settings
│   │   │   ├── settings_screen.dart       # Profile, session config, logout
│   │   │   └── steam_session_provider.dart # Steam session token management
│   │   ├── alerts/             # (directory exists, no Dart files yet)
│   │   ├── premium/            # (directory exists, no Dart files yet)
│   │   └── prices/             # (directory exists, no Dart files yet)
│   │       └── widgets/        # (empty)
│   ├── models/                 # Shared data models
│   │   ├── alert.dart          # PriceAlert + AlertCondition enum
│   │   ├── inventory_item.dart # InventoryItem with price helpers
│   │   ├── price_data.dart     # PriceData + PriceSummary
│   │   └── user.dart           # SteamUser
│   └── widgets/                # Shared widgets
│       └── app_shell.dart      # Bottom navigation bar scaffold
├── backend/                    # Node.js Express API
│   ├── package.json            # Backend dependencies
│   ├── src/
│   │   ├── index.ts            # Express app setup, route mounting, startup
│   │   ├── db/
│   │   │   ├── pool.ts         # PostgreSQL connection pool
│   │   │   └── migrate.ts      # SQL schema + migration runner
│   │   ├── middleware/
│   │   │   └── auth.ts         # JWT verification middleware
│   │   ├── routes/
│   │   │   ├── auth.ts         # Steam OpenID verify, /me endpoint
│   │   │   ├── inventory.ts    # Inventory CRUD + Steam refresh
│   │   │   ├── portfolio.ts    # Portfolio value aggregation
│   │   │   ├── prices.ts       # Price lookup + history
│   │   │   ├── alerts.ts       # Price alert CRUD
│   │   │   ├── market.ts       # Steam Market selling, session management
│   │   │   └── transactions.ts # Transaction sync, list, stats
│   │   └── services/
│   │       ├── steam.ts        # Steam API client (profile, inventory, OpenID)
│   │       ├── prices.ts       # Skinport/Steam price fetching + DB storage
│   │       ├── priceJob.ts     # Cron job for periodic price updates
│   │       ├── market.ts       # Steam Market sell operations
│   │       └── transactions.ts # Transaction fetch, save, query, stats
│   └── node_modules/           # (not committed)
├── test/
│   └── widget_test.dart        # Single default Flutter test file
├── android/                    # Android platform project (generated)
├── ios/                        # iOS platform project (generated)
├── web/                        # Web platform project (generated)
├── linux/                      # Linux platform project (generated)
├── macos/                      # macOS platform project (generated)
├── windows/                    # Windows platform project (generated)
├── pubspec.yaml                # Flutter dependencies
├── pubspec.lock                # Flutter dependency lockfile
├── analysis_options.yaml       # Dart linting config
└── .planning/                  # GSD planning docs
    └── codebase/               # Codebase analysis docs
```

## Directory Purposes

**`lib/core/`:**
- Purpose: Shared app infrastructure used by all features
- Contains: HTTP client, routing, theming, app-wide constants
- Key files: `api_client.dart` (all API calls flow through this), `router.dart` (all navigation defined here)

**`lib/features/`:**
- Purpose: Feature-first modules, each containing screen(s), provider(s), and optional widgets subdirectory
- Contains: One subdirectory per app feature
- Convention: Each feature has `*_screen.dart` (UI), `*_provider.dart` (state/data), optional `widgets/` for extracted UI components

**`lib/models/`:**
- Purpose: Shared data transfer objects used across features
- Contains: Immutable Dart classes with `fromJson` factories, no `toJson` (except `PriceAlert`)
- Note: Some models are defined inline in provider files (`PortfolioSummary` in `portfolio_provider.dart`, `TransactionItem`/`TransactionStats` in `transactions_provider.dart`)

**`lib/widgets/`:**
- Purpose: Shared widgets used across multiple features
- Contains: Currently only `app_shell.dart` (bottom navigation scaffold)

**`backend/src/routes/`:**
- Purpose: Express route handlers organized by domain
- Contains: One file per API domain, each exports a `Router`
- Convention: File name matches API path segment (e.g., `inventory.ts` -> `/api/inventory`)

**`backend/src/services/`:**
- Purpose: Business logic and external API integration
- Contains: Steam API client, price aggregation, market operations, background jobs
- Convention: Services are pure functions (no classes), exported individually

**`backend/src/db/`:**
- Purpose: Database connection and schema management
- Contains: Pool singleton, migration SQL
- Note: No ORM - all queries are raw SQL with parameterized values

**`backend/src/middleware/`:**
- Purpose: Express middleware functions
- Contains: JWT auth middleware only

## Key File Locations

**Entry Points:**
- `lib/main.dart`: Flutter app bootstrap - ProviderScope + MaterialApp.router
- `backend/src/index.ts`: Express server bootstrap - middleware, routes, migrations, cron

**Configuration:**
- `pubspec.yaml`: Flutter/Dart dependencies and SDK version
- `backend/package.json`: Backend Node.js dependencies and scripts
- `lib/core/constants.dart`: API base URL, Steam URLs, cache durations, CS2 app ID
- `lib/core/theme.dart`: Color scheme and Material theme data
- `analysis_options.yaml`: Dart linting rules

**Core Logic (Frontend):**
- `lib/core/api_client.dart`: All HTTP communication, JWT token storage
- `lib/core/router.dart`: All app routes and auth redirect guard
- `lib/features/auth/steam_auth_service.dart`: Auth state management (login, logout, dev login)
- `lib/features/inventory/inventory_provider.dart`: Inventory data + filtering/sorting logic
- `lib/features/portfolio/portfolio_provider.dart`: Portfolio summary + inline models
- `lib/features/transactions/transactions_provider.dart`: Transaction data, filters, stats

**Core Logic (Backend):**
- `backend/src/services/steam.ts`: Steam API integration (profile, inventory, OpenID verification)
- `backend/src/services/prices.ts`: Multi-source price fetching (Skinport API, Steam Market)
- `backend/src/services/market.ts`: Steam Community Market sell operations with fee calculation
- `backend/src/services/transactions.ts`: Transaction history scraping and DB queries
- `backend/src/services/priceJob.ts`: Cron-based price collection
- `backend/src/db/migrate.ts`: Complete database schema definition

**Testing:**
- `test/widget_test.dart`: Single default Flutter test (not meaningful)

## Naming Conventions

**Dart Files:**
- `snake_case.dart` for all files: `inventory_provider.dart`, `steam_auth_service.dart`
- Screens: `*_screen.dart` (e.g., `portfolio_screen.dart`)
- Providers: `*_provider.dart` (e.g., `inventory_provider.dart`)
- Models: Singular noun matching the primary class (e.g., `alert.dart` for `PriceAlert`)

**TypeScript Files:**
- `camelCase.ts` or `lowercase.ts`: `priceJob.ts`, `market.ts`, `auth.ts`
- Routes named after API path segment: `inventory.ts` -> `/api/inventory`
- Services named after domain: `steam.ts`, `prices.ts`, `market.ts`

**Dart Classes/Types:**
- `PascalCase` for classes: `InventoryItem`, `SteamUser`, `PortfolioSummary`
- `PascalCase` for enums: `SortOption`, `AlertCondition`
- `camelCase` for providers: `inventoryProvider`, `authStateProvider`, `txStatsProvider`
- Private widgets prefixed with `_`: `_ValueCard`, `_StatsBar`, `_FilterChip`

**TypeScript Interfaces:**
- `PascalCase`: `SteamSession`, `SellResult`, `AuthRequest`, `ParsedInventoryItem`

**Directories:**
- `snake_case` for Dart feature directories: `features/inventory/`, `features/auth/`
- `lowercase` for backend directories: `routes/`, `services/`, `db/`, `middleware/`

## Where to Add New Code

**New Flutter Feature (e.g., "alerts" screen):**
- Create screen: `lib/features/alerts/alerts_screen.dart`
- Create provider: `lib/features/alerts/alerts_provider.dart`
- Create widgets: `lib/features/alerts/widgets/` (if needed)
- Add route: in `lib/core/router.dart` inside the `ShellRoute.routes` list
- Add nav item: in `lib/widgets/app_shell.dart` destinations list and index mapping
- Model already exists: `lib/models/alert.dart`

**New Shared Widget:**
- Place in `lib/widgets/` (e.g., `lib/widgets/price_badge.dart`)

**New Data Model:**
- Place in `lib/models/` with `fromJson` factory
- Or define inline in the provider file if only used by one feature

**New Backend API Endpoint (existing domain):**
- Add route handler in existing file: `backend/src/routes/{domain}.ts`
- Add service function if needed: `backend/src/services/{domain}.ts`

**New Backend API Domain:**
- Create route file: `backend/src/routes/{domain}.ts` exporting a `Router`
- Mount in `backend/src/index.ts`: `app.use("/api/{domain}", {domain}Routes)`
- Create service if needed: `backend/src/services/{domain}.ts`
- Apply `authMiddleware` to protected routes

**New Database Table:**
- Add `CREATE TABLE IF NOT EXISTS` to `backend/src/db/migrate.ts` schema string
- Add indexes in the same migration string
- Migration is idempotent - runs on every server start

**New Background Job:**
- Add to `backend/src/services/priceJob.ts` or create new service
- Register in `startPriceJobs()` or call from `start()` in `backend/src/index.ts`

## Special Directories

**`lib/features/alerts/`, `lib/features/premium/`, `lib/features/prices/`:**
- Purpose: Placeholder directories for planned but unimplemented features
- Generated: No (manually created)
- Committed: Yes, but contain no Dart files
- Note: Backend routes for alerts and prices already exist; Flutter UI not yet built

**`android/`, `ios/`, `web/`, `linux/`, `macos/`, `windows/`:**
- Purpose: Platform-specific project files generated by Flutter
- Generated: Yes (flutter create)
- Committed: Yes
- Note: Minimal customization. iOS/Android used for mobile development.

**`build/`:**
- Purpose: Flutter build output
- Generated: Yes
- Committed: Should not be (check .gitignore)

**`.dart_tool/`:**
- Purpose: Dart/Flutter tooling cache
- Generated: Yes
- Committed: No

**`backend/node_modules/`:**
- Purpose: Backend npm dependencies
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-03-08*
