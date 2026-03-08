# Codebase Concerns

**Analysis Date:** 2026-03-08

## Tech Debt

**Hardcoded Dev Token in Source Code:**
- Issue: A hardcoded JWT dev token is committed in `lib/core/constants.dart` (line 25-26) as `AppConstants.devToken`. The login screen (`lib/features/auth/login_screen.dart` lines 101-123) exposes a "Dev Login (Quake 3)" button that uses this token to authenticate without real Steam OpenID flow.
- Files: `lib/core/constants.dart`, `lib/features/auth/login_screen.dart`
- Impact: This token is visible to anyone with source access and grants direct API access. The dev login button ships in the production UI.
- Fix approach: Gate the dev token and dev login button behind a compile-time flag (e.g., `kDebugMode` or a Dart define). Remove the hardcoded token from constants and load it from environment or secure storage during development only.

**Hardcoded localhost API URL:**
- Issue: `AppConstants.apiBaseUrl` is hardcoded to `'http://localhost:3000/api'` in `lib/core/constants.dart` (line 5). The comment acknowledges this is simulator-only, but there is no mechanism to switch for device or production builds.
- Files: `lib/core/constants.dart`
- Impact: The app cannot connect to the backend when running on a physical device or in production without manually editing source code.
- Fix approach: Use `--dart-define` or `String.fromEnvironment` to inject the API URL at build time. Provide a default for development and require explicit configuration for release builds.

**Duplicated `getUserSession` Helper:**
- Issue: The function `getUserSession(userId)` is defined identically in both `backend/src/routes/market.ts` (lines 239-249) and `backend/src/routes/transactions.ts` (lines 117-127).
- Files: `backend/src/routes/market.ts`, `backend/src/routes/transactions.ts`
- Impact: Bug fixes or changes to session retrieval logic must be applied in two places.
- Fix approach: Extract to a shared utility in `backend/src/services/` or `backend/src/db/` and import from both routes.

**No Migration Versioning:**
- Issue: Database migrations are a single monolithic SQL string in `backend/src/db/migrate.ts`. There is no version tracking, rollback capability, or sequential migration files. Schema changes are appended via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (lines 73-75) and `CREATE TABLE IF NOT EXISTS`.
- Files: `backend/src/db/migrate.ts`
- Impact: Cannot roll back schema changes. Renaming or dropping columns is risky. No audit trail of when schema changes were applied. Team coordination on schema changes is error-prone.
- Fix approach: Adopt a migration tool (e.g., `node-pg-migrate`, `knex`, or `drizzle-kit`) with numbered migration files and a migrations tracking table.

**N+1 Query in Inventory Refresh:**
- Issue: The `POST /api/inventory/refresh` handler in `backend/src/routes/inventory.ts` (lines 62-81) performs individual `INSERT ... ON CONFLICT` queries for each inventory item inside a loop. For a user with 500+ items, this generates 500+ sequential queries.
- Files: `backend/src/routes/inventory.ts`
- Impact: Inventory refresh is slow and creates high database load. Each Steam account refresh generates O(n) queries where n = number of items.
- Fix approach: Batch upserts using multi-row `INSERT ... ON CONFLICT` with chunked parameter lists (similar to the pattern already used in `backend/src/services/prices.ts` `savePrices`).

**N+1 Query in Transaction Save:**
- Issue: `saveTransactions` in `backend/src/services/transactions.ts` (lines 121-143) inserts transactions one at a time in a loop.
- Files: `backend/src/services/transactions.ts`
- Impact: Syncing 5000 transactions generates 5000 sequential INSERT queries.
- Fix approach: Batch inserts using multi-row VALUES clauses, chunked similarly to `savePrices`.

**Stub Settings Menu Items:**
- Issue: In `lib/features/settings/settings_screen.dart`, the "Linked Accounts" (line 100), "Notifications" (line 107), "Currency" (line 112), and "Upgrade to Premium" (line 129) list tiles all have empty `onTap: () {}` handlers.
- Files: `lib/features/settings/settings_screen.dart`
- Impact: Users see clickable items that do nothing. No indication these are unimplemented.
- Fix approach: Either implement the features or visually indicate they are coming soon (disabled state, "Coming Soon" badge).

**Portfolio History Query is Incorrect:**
- Issue: The portfolio history query in `backend/src/routes/portfolio.ts` (lines 76-86) sums `price_usd` grouped by date across all matching items. This sums the individual item prices, not the portfolio value (which should multiply each item's price by the count of that item in the inventory). A user with 5 identical items would see 5x the price of one item, which is coincidentally correct, but only because the query matches every row in `price_history` for each unique name -- it does not account for item quantities at all.
- Files: `backend/src/routes/portfolio.ts`
- Impact: Portfolio history chart values are inaccurate. The SUM aggregation sums every price_history row for each item name, not the per-item price multiplied by inventory count.
- Fix approach: Join with inventory counts or store daily portfolio snapshots as a separate materialized value.

## Security Considerations

**SQL Injection in Transaction Stats:**
- Risk: The `getTransactionStats` function in `backend/src/services/transactions.ts` (lines 243-244) constructs SQL using string interpolation for date filters: `` `AND tx_date >= '${dateFrom}' AND tx_date <= '${dateTo ?? ...}'` ``. These values come from user-supplied query parameters.
- Files: `backend/src/services/transactions.ts`
- Current mitigation: None. The date strings are directly interpolated into SQL.
- Recommendations: Use parameterized queries (`$1`, `$2`) for all user input. Build date conditions the same way `getTransactions` does (with parameter index tracking).

**Steam Session Cookies Stored in Plain Text:**
- Risk: Steam session cookies (`steam_session_id`, `steam_login_secure`, `steam_access_token`) are stored as plain text columns in the `users` table (`backend/src/db/migrate.ts` lines 73-75). These credentials grant full access to a user's Steam account for market operations.
- Files: `backend/src/db/migrate.ts`, `backend/src/routes/market.ts`
- Current mitigation: None. Anyone with database read access can impersonate users on the Steam Market.
- Recommendations: Encrypt session tokens at rest using a server-side encryption key. Consider ephemeral storage with automatic expiry.

**JWT Secret via Non-Null Assertion:**
- Risk: `process.env.JWT_SECRET!` is used with a TypeScript non-null assertion in `backend/src/middleware/auth.ts` (line 22) and `backend/src/routes/auth.ts` (line 38). If `JWT_SECRET` is not set, this will use `undefined` as the secret, potentially allowing token forgery or causing runtime crashes.
- Files: `backend/src/middleware/auth.ts`, `backend/src/routes/auth.ts`
- Current mitigation: `.env.example` documents the variable, but no startup validation exists.
- Recommendations: Validate all required environment variables at startup in `backend/src/index.ts` before starting the server. Fail fast with a clear error message.

**Unrestricted CORS:**
- Risk: `backend/src/index.ts` (line 21) uses `cors()` with no configuration, which allows requests from any origin.
- Files: `backend/src/index.ts`
- Current mitigation: `helmet()` provides some header security, but CORS is fully open.
- Recommendations: Configure allowed origins explicitly, at minimum for the app's deep link scheme and any web domains.

**Price and Market Endpoints Unauthenticated:**
- Risk: `GET /api/prices/:marketHashName`, `GET /api/prices/:marketHashName/history`, `GET /api/market/price/:marketHashName`, and `GET /api/market/quickprice/:marketHashName` in `backend/src/routes/prices.ts` and `backend/src/routes/market.ts` (lines 145-170) have no `authMiddleware`.
- Files: `backend/src/routes/prices.ts`, `backend/src/routes/market.ts`
- Current mitigation: None. These endpoints are publicly accessible.
- Recommendations: Add rate limiting at minimum. Consider whether these should require authentication. The price endpoints could be abused to scrape pricing data.

**Steam OpenID Realm Uses Custom Scheme:**
- Risk: The Steam OpenID auth in `lib/features/auth/steam_auth_service.dart` (lines 80-84) uses `skintracker://` as the realm and return URL. Custom URL schemes can be hijacked by other apps on the device, potentially intercepting the auth callback.
- Files: `lib/features/auth/steam_auth_service.dart`
- Current mitigation: None.
- Recommendations: Consider using Universal Links (iOS) or App Links (Android) with a verified domain for the auth callback.

## Performance Bottlenecks

**Skinport Full Catalog Fetch Every 5 Minutes:**
- Problem: The cron job in `backend/src/services/priceJob.ts` fetches the entire Skinport catalog and saves ALL prices to the database every 5 minutes.
- Files: `backend/src/services/priceJob.ts`, `backend/src/services/prices.ts`
- Cause: `savePrices` inserts a new row for every item in the catalog (potentially 10,000+ items) every 5 minutes. This means ~2,880,000 new rows per day in `price_history`.
- Improvement path: Only save prices for items that users actually own (query distinct `market_hash_name` from `inventory_items`). Add a retention policy to prune old price_history rows. Consider storing only daily snapshots after 7 days.

**`getLatestPrices` Uses DISTINCT ON Without Row Limit:**
- Problem: The `getLatestPrices` query in `backend/src/services/prices.ts` (lines 110-117) uses `DISTINCT ON (market_hash_name, source)` across the entire `price_history` table filtered by item names. For large inventories with extensive price history, this scans significant data.
- Files: `backend/src/services/prices.ts`
- Cause: Even with the index on `(market_hash_name, source, recorded_at DESC)`, the query must evaluate all matching rows to find the latest per source.
- Improvement path: Maintain a `latest_prices` materialized view or a separate `current_prices` table updated by the cron job, avoiding repeated DISTINCT ON scans.

**Inventory Refresh is Synchronous and Blocking:**
- Problem: `POST /api/inventory/refresh` in `backend/src/routes/inventory.ts` fetches from Steam API sequentially for each linked account, with rate limit delays (1s per page, up to 20 pages per account). A user with multiple accounts could wait 40+ seconds.
- Files: `backend/src/routes/inventory.ts`, `backend/src/services/steam.ts`
- Cause: Sequential pagination with built-in delays for Steam rate limiting.
- Improvement path: Return immediately with a job ID. Process the refresh in background. Notify the client via polling or WebSocket when complete.

**Transaction Sync is Long-Running HTTP Request:**
- Problem: `POST /api/transactions/sync` in `backend/src/routes/transactions.ts` (lines 32-54) fetches up to 50 pages of 100 transactions each, with 2-second delays between pages. This can take up to 100 seconds.
- Files: `backend/src/routes/transactions.ts`
- Cause: Sequential pagination with mandatory rate limit pauses.
- Improvement path: Move to a background job pattern. Return a job status endpoint for the client to poll.

## Fragile Areas

**Steam API Integration:**
- Files: `backend/src/services/steam.ts`, `backend/src/services/market.ts`, `backend/src/services/transactions.ts`
- Why fragile: Relies on undocumented/semi-documented Steam Community endpoints (`/inventory/`, `/market/myhistory/render/`, `/market/sellitem/`). These are not official API endpoints and Steam can change them without notice. The User-Agent is hardcoded to spoof a browser.
- Safe modification: Always test against the live Steam API. Add response validation to detect format changes early. Log raw response samples for debugging.
- Test coverage: Zero tests. No mocks for Steam API responses.

**Token Exchange Flow:**
- Files: `backend/src/routes/market.ts` (lines 104-141)
- Why fragile: The `exchangeTokenForSession` function attempts to call a Steam API endpoint, but regardless of the result (success or failure), it falls through to constructing cookies manually from the access token. The `steamLoginSecure` format (`steamId||accessToken` or `steamId%7C%7CaccessToken`) is reverse-engineered and may break with Steam updates.
- Safe modification: Log which path was taken (API exchange vs manual construction). Add validation that the constructed session actually works before saving.
- Test coverage: None.

**Price History Chart Calculations:**
- Files: `backend/src/routes/portfolio.ts`
- Why fragile: The 24h and 7d change calculations depend on having price_history data at the right timestamps. If the cron job was down for a period, these calculations silently return 0 instead of indicating missing data.
- Safe modification: Add null checks and return explicit "no data" indicators when historical prices are unavailable.
- Test coverage: None.

## Scaling Limits

**price_history Table Growth:**
- Current capacity: Grows by ~2.88M rows/day if Skinport has ~10K items
- Limit: Within weeks, this table will have hundreds of millions of rows. Query performance will degrade significantly, especially for the portfolio history and DISTINCT ON queries.
- Scaling path: Add a data retention policy (e.g., keep 5-minute granularity for 7 days, daily for 90 days, weekly beyond). Partition the table by `recorded_at`. Create a `current_prices` cache table.

**Single-Process Architecture:**
- Current capacity: One Node.js process handles API requests and cron jobs
- Limit: Cron job (price fetching + bulk DB inserts) runs on the same event loop as HTTP request handling. Under load, price save operations can starve HTTP responses.
- Scaling path: Separate the cron worker into its own process. Use a job queue (e.g., BullMQ) for background tasks like inventory refresh and transaction sync.

## Dependencies at Risk

**Express 5.x:**
- Risk: Express 5 (`^5.2.1` in `backend/package.json`) was in alpha/beta for many years. Depending on when this was set up, community middleware compatibility may be uneven.
- Impact: Some Express middleware may not be fully compatible with v5 changes (e.g., path route matching, error handling).
- Migration plan: Monitor for breaking changes. Ensure all middleware (cors, helmet) explicitly supports Express 5.

**No node-cron Type Definitions:**
- Risk: `node-cron` (`^4.2.1`) is used in `backend/src/services/priceJob.ts` without `@types/node-cron` in devDependencies.
- Impact: No TypeScript type checking for cron schedule strings or API.
- Migration plan: Add `@types/node-cron` to devDependencies.

## Missing Critical Features

**No Alert Evaluation:**
- Problem: Price alerts can be created and deleted via `backend/src/routes/alerts.ts`, but there is no code anywhere that evaluates whether alert conditions have been met and notifies users.
- Blocks: The entire price alert feature is non-functional. Users can set alerts but will never receive notifications.

**No Push Notification Infrastructure:**
- Problem: There is no push notification service integration (FCM, APNs, or any notification delivery mechanism). Even if alert evaluation existed, there is no way to deliver notifications.
- Blocks: Price alerts, inventory change notifications, and any real-time user communication.

**No Token Refresh/Expiry Handling:**
- Problem: JWTs are issued with a 30-day expiry (`backend/src/routes/auth.ts` line 39) but there is no refresh token flow. When the token expires, the user is silently logged out on next API call. The Flutter client catches the error and clears the token (`lib/features/auth/steam_auth_service.dart` lines 28-32), but does not redirect to login or show an explanation.
- Blocks: Smooth long-term user experience. Users will be confused by sudden logouts.

**No Rate Limiting on API:**
- Problem: No rate limiting middleware on any endpoint. The backend is open to abuse including brute-force token attempts and price endpoint scraping.
- Blocks: Production deployment safety.

## Test Coverage Gaps

**Backend Has Zero Tests:**
- What's not tested: Every backend file -- routes, services, middleware, database operations. No test runner is even configured.
- Files: All files under `backend/src/`
- Risk: Any refactor or feature addition can break existing functionality with no safety net. The SQL injection vulnerability in `getTransactionStats` would have been caught by even basic input validation tests.
- Priority: High

**Flutter Has One Trivial Test:**
- What's not tested: All providers, all screens except a basic render check, all models' JSON parsing, API client behavior, auth flow, sell flow, transaction sync.
- Files: `test/widget_test.dart` (15 lines, only checks that "SkinTracker" text renders)
- Risk: Model `fromJson` methods, price calculations, and state management logic are completely untested. Regressions in core business logic (e.g., `bestPrice` calculation in `lib/models/inventory_item.dart`) would go unnoticed.
- Priority: High

---

*Concerns audit: 2026-03-08*
