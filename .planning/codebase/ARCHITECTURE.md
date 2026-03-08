# Architecture

**Analysis Date:** 2026-03-08

## Pattern Overview

**Overall:** Client-Server with Flutter mobile frontend and Express.js REST API backend

**Key Characteristics:**
- Flutter app uses feature-first organization with Riverpod for state management
- Backend is a stateless Express.js API with PostgreSQL persistence
- Communication is exclusively via JSON REST API over HTTP with JWT authentication
- Background cron jobs handle price data collection independently of user requests
- Steam APIs are the primary external data source (inventory, market, transactions)

## Layers

**Flutter Presentation Layer:**
- Purpose: UI screens and widgets, user interaction
- Location: `lib/features/*/` (screens), `lib/features/*/widgets/` (feature widgets), `lib/widgets/` (shared widgets)
- Contains: Screen widgets (`*_screen.dart`), reusable feature widgets (`item_card.dart`, `sell_bottom_sheet.dart`)
- Depends on: State layer (providers), Models
- Used by: Router (`lib/core/router.dart`)

**Flutter State Layer (Riverpod Providers):**
- Purpose: Async data fetching, caching, filtering, and state notifications
- Location: `lib/features/*_provider.dart`
- Contains: `AsyncNotifierProvider` classes for server data, `StateProvider` for local UI state (filters, sort, selection)
- Depends on: `ApiClient` (`lib/core/api_client.dart`), Models
- Used by: Presentation layer via `ref.watch()` / `ref.read()`

**Flutter Core Layer:**
- Purpose: Shared infrastructure - HTTP client, routing, theming, constants
- Location: `lib/core/`
- Contains: `ApiClient` (Dio wrapper with JWT interceptor), `GoRouter` config, `AppTheme`, `AppConstants`
- Depends on: Nothing (leaf dependency)
- Used by: All feature providers and screens

**Flutter Models Layer:**
- Purpose: Data transfer objects for API responses
- Location: `lib/models/`
- Contains: Immutable data classes with `fromJson` factories (`InventoryItem`, `SteamUser`, `PriceData`, `PriceAlert`)
- Depends on: Nothing (pure data)
- Used by: State layer (providers) and Presentation layer

**Backend Route Layer:**
- Purpose: HTTP endpoint definitions, request validation, response formatting
- Location: `backend/src/routes/`
- Contains: Express Router modules (`auth.ts`, `inventory.ts`, `portfolio.ts`, `prices.ts`, `alerts.ts`, `market.ts`, `transactions.ts`)
- Depends on: Services, Database pool, Auth middleware
- Used by: Express app (`backend/src/index.ts`)

**Backend Service Layer:**
- Purpose: Business logic, external API integration, data processing
- Location: `backend/src/services/`
- Contains: Steam API client (`steam.ts`), price fetching/storage (`prices.ts`), market selling (`market.ts`), transaction history (`transactions.ts`), cron jobs (`priceJob.ts`)
- Depends on: Database pool, external APIs (Steam, Skinport)
- Used by: Route layer

**Backend Middleware Layer:**
- Purpose: Request authentication and authorization
- Location: `backend/src/middleware/`
- Contains: JWT verification middleware (`auth.ts`) that extracts `userId` and `steamId` from bearer tokens
- Depends on: `jsonwebtoken` package
- Used by: All authenticated route handlers

**Backend Database Layer:**
- Purpose: PostgreSQL connection and schema management
- Location: `backend/src/db/`
- Contains: Connection pool (`pool.ts`), SQL migration script (`migrate.ts`)
- Depends on: `pg` package, `DATABASE_URL` env var
- Used by: Routes and Services (raw SQL queries via pool)

## Data Flow

**Authentication Flow:**

1. User taps "Sign in with Steam" on `LoginScreen` (`lib/features/auth/login_screen.dart`)
2. `SteamAuthService.openSteamLogin()` opens Steam OpenID URL in external browser
3. Steam redirects back via deep link (`skintracker://auth/callback`) with OpenID params
4. App sends params to `POST /api/auth/steam/verify` (`backend/src/routes/auth.ts`)
5. Backend verifies with Steam, upserts user in DB, returns JWT + user data
6. `ApiClient` stores JWT in `FlutterSecureStorage`, `AuthNotifier` emits user state
7. `GoRouter` redirect guard detects login, navigates to `/portfolio`

**Dev Login shortcut:** `AuthNotifier.devLogin()` saves a hardcoded JWT token and calls `GET /api/auth/me`

**Inventory Fetch Flow:**

1. `InventoryNotifier.build()` calls `GET /api/inventory` via `ApiClient`
2. Backend queries `inventory_items` joined with `steam_accounts` for the user
3. Backend enriches items with latest prices from `price_history` table via `getLatestPrices()`
4. Response includes items with embedded `prices` map (source -> USD amount)
5. Flutter parses into `List<InventoryItem>`, `filteredInventoryProvider` applies sort/search

**Inventory Refresh Flow:**

1. Pull-to-refresh triggers `InventoryNotifier.refresh()` -> `POST /api/inventory/refresh`
2. Backend fetches all linked Steam accounts, calls `fetchSteamInventory()` for each
3. Steam inventory API is paginated (500 items/page) with retry logic for rate limiting
4. Items are upserted, stale items deleted, then re-fetched from DB

**Price Collection Flow (Background):**

1. `startPriceJobs()` in `backend/src/services/priceJob.ts` runs on server start
2. Cron job executes every 5 minutes: fetches all CS2 skin prices from Skinport API
3. Prices are batch-inserted into `price_history` table (500 items per INSERT)
4. In-memory cache (`skinportCache`) prevents redundant API calls within 5-minute window

**Market Selling Flow:**

1. User selects items in inventory grid (long-press for multi-select)
2. `SellBottomSheet` opens, fetches quick-sell price via `GET /api/market/quickprice/:name`
3. Quick-sell price = lowest market price minus fees minus 1 cent
4. User confirms -> `POST /api/market/sell` (single) or `POST /api/market/bulk-sell` (batch)
5. Backend sends sell request to Steam Market API using stored session cookies
6. Rate-limited: 1.5s pause between bulk sell requests

**Portfolio Summary Flow:**

1. `PortfolioNotifier.build()` calls `GET /api/portfolio/summary`
2. Backend aggregates current prices for all user items (prefers Skinport, falls back to Steam)
3. Computes 24h and 7d value changes by comparing with historical prices
4. Returns 30-day daily value history for chart display

**Transaction Sync Flow:**

1. User taps sync icon -> `TransactionsNotifier.sync()` -> `POST /api/transactions/sync`
2. Backend uses stored Steam session cookies to scrape `steamcommunity.com/market/myhistory`
3. Paginates through all history (100 per page, up to 50 pages, 2s delay between pages)
4. Transactions (buy/sell events) are parsed and upserted into `transactions` table

**State Management:**

- **Server data:** `AsyncNotifierProvider` for async data with loading/error states (`inventoryProvider`, `portfolioProvider`, `transactionsProvider`, `authStateProvider`)
- **UI-local state:** `StateProvider` for filters, sort options, selection state (`sortOptionProvider`, `searchQueryProvider`, `txTypeFilterProvider`, `selectedItemsProvider`)
- **Derived state:** `Provider` for computed values (`filteredInventoryProvider` combines inventory data with sort/search state)

## Key Abstractions

**ApiClient:**
- Purpose: Centralized HTTP client with automatic JWT injection
- Location: `lib/core/api_client.dart`
- Pattern: Singleton via Riverpod `Provider`, Dio instance with interceptors for auth token and logging. Stores JWT in `FlutterSecureStorage`.

**AsyncNotifier (Riverpod):**
- Purpose: Manages async data lifecycle (loading, data, error) with mutation methods
- Examples: `AuthNotifier` (`lib/features/auth/steam_auth_service.dart`), `InventoryNotifier` (`lib/features/inventory/inventory_provider.dart`), `PortfolioNotifier` (`lib/features/portfolio/portfolio_provider.dart`), `TransactionsNotifier` (`lib/features/transactions/transactions_provider.dart`)
- Pattern: `build()` method fetches initial data, additional methods (`refresh()`, `sync()`, `logout()`) mutate state

**AppShell:**
- Purpose: Shared navigation scaffold with bottom navigation bar
- Location: `lib/widgets/app_shell.dart`
- Pattern: GoRouter `ShellRoute` wraps all authenticated screens, provides persistent bottom nav

**AuthRequest (Backend):**
- Purpose: Extended Express Request with authenticated user info
- Location: `backend/src/middleware/auth.ts`
- Pattern: `authMiddleware` verifies JWT, attaches `userId` and `steamId` to request object

**SteamSession (Backend):**
- Purpose: Encapsulates Steam session cookies needed for authenticated Steam API calls
- Location: Used in `backend/src/routes/market.ts`, `backend/src/routes/transactions.ts`, `backend/src/services/market.ts`
- Pattern: Retrieved from DB per-request via `getUserSession()` helper (duplicated in market.ts and transactions.ts)

## Entry Points

**Flutter App:**
- Location: `lib/main.dart`
- Triggers: App launch
- Responsibilities: Initializes Flutter binding, wraps app in `ProviderScope`, creates `MaterialApp.router` with dark theme default

**Backend Server:**
- Location: `backend/src/index.ts`
- Triggers: `npm run dev` (tsx watch) or `npm start` (compiled)
- Responsibilities: Configures Express middleware (helmet, cors, JSON), mounts all route modules under `/api/*`, runs DB migrations, starts price cron jobs, listens on port 3000

**DB Migrations:**
- Location: `backend/src/db/migrate.ts`
- Triggers: Server startup (`start()` function in index.ts) or standalone `npm run migrate`
- Responsibilities: Executes `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS` statements. Idempotent - safe to run repeatedly.

## Error Handling

**Strategy:** Try-catch at route/provider level, generic error responses

**Frontend Patterns:**
- `AsyncValue.when()` renders loading/error/data states in UI (`CircularProgressIndicator`, error text with retry button)
- `ref.listen()` on `authStateProvider` shows SnackBar on auth errors (`lib/features/auth/login_screen.dart`)
- `ApiClient` catches no errors itself - errors propagate to provider callers

**Backend Patterns:**
- Every route handler wrapped in try-catch, returns `{ error: "message" }` with 500 status
- Auth middleware returns 401 for missing/invalid tokens
- Steam API calls include retry logic for 429 rate limits (exponential backoff in `fetchSteamInventory`)
- Failed Steam inventory page fetches return partial results rather than throwing

## Cross-Cutting Concerns

**Logging:**
- Frontend: `dart:developer` `dev.log()` with name tags (e.g., `name: 'Auth'`, `name: 'API'`). Dio `LogInterceptor` logs response bodies.
- Backend: `console.log()` / `console.error()` with prefixes like `[CRON]`, `[Steam]`, `[Transactions]`

**Validation:**
- Frontend: Minimal - relies on backend validation
- Backend: Manual checks in route handlers (`if (!field) return 400`), no validation library

**Authentication:**
- JWT Bearer tokens with 30-day expiry
- Frontend stores token in `FlutterSecureStorage` (macOS Keychain)
- Backend `authMiddleware` applied to all protected routes; prices endpoint is public
- Steam session cookies stored in `users` table for market operations

## Database Schema

**Tables (defined in `backend/src/db/migrate.ts`):**
- `users` - Core user accounts (steam_id, display_name, avatar, premium status, session cookies)
- `steam_accounts` - Linked Steam accounts per user (supports multiple accounts)
- `inventory_items` - Cached CS2 inventory items per Steam account
- `price_history` - Time-series price data from multiple sources (skinport, steam)
- `user_purchases` - Manual purchase tracking (not fully wired up)
- `price_alerts` - User-configured price threshold alerts
- `transactions` - Market buy/sell history synced from Steam

**Key Indexes:**
- `idx_price_history_name_date` - Price lookups by item name and date range
- `idx_price_history_latest` - Latest price per item/source (DESC ordering)
- `idx_inventory_account` - Fast inventory queries per Steam account
- `idx_alerts_active` - Active alerts per user
- `idx_transactions_user_date` - Transaction history ordered by date
- `idx_transactions_user_type` - Filter transactions by buy/sell
- `idx_transactions_user_item` - Filter transactions by item name

**No ORM is used.** All database access is raw SQL via `pg.Pool.query()` with parameterized queries.

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/steam/verify` | No | Verify Steam OpenID, return JWT |
| GET | `/api/auth/me` | Yes | Get current user profile |
| GET | `/api/inventory` | Yes | List all inventory items with prices |
| POST | `/api/inventory/refresh` | Yes | Re-fetch inventory from Steam |
| GET | `/api/portfolio/summary` | Yes | Portfolio value, changes, history |
| GET | `/api/prices/:name` | No | Current prices for an item |
| GET | `/api/prices/:name/history` | No | Price history for an item |
| GET | `/api/alerts` | Yes | List user's price alerts |
| POST | `/api/alerts` | Yes | Create a price alert |
| DELETE | `/api/alerts/:id` | Yes | Delete a price alert |
| POST | `/api/market/session` | Yes | Store Steam session cookies |
| POST | `/api/market/clienttoken` | Yes | Store Steam client token |
| GET | `/api/market/session/status` | Yes | Check if session is configured |
| GET | `/api/market/price/:name` | No | Get Steam Market price |
| GET | `/api/market/quickprice/:name` | No | Get quick-sell price |
| POST | `/api/market/sell` | Yes | Sell single item on market |
| POST | `/api/market/bulk-sell` | Yes | Bulk sell items (max 50) |
| POST | `/api/transactions/sync` | Yes | Sync transaction history from Steam |
| GET | `/api/transactions` | Yes | List transactions with filters |
| GET | `/api/transactions/items` | Yes | Unique item names for filter |
| GET | `/api/transactions/stats` | Yes | Buy/sell summary statistics |
| GET | `/api/health` | No | Health check |

---

*Architecture analysis: 2026-03-08*
