# External Integrations

**Analysis Date:** 2026-03-08

## APIs & External Services

### Steam Web API
- **Purpose:** User authentication (OpenID), profile data, inventory fetching, market operations
- **SDK/Client:** `axios` (backend), `dio` (Flutter)
- **Auth:** `STEAM_API_KEY` env var (for profile lookups)
- **Endpoints used:**
  - `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/` - Player profile data (`backend/src/services/steam.ts`)
  - `https://steamcommunity.com/openid/login` - OpenID authentication verification (`backend/src/services/steam.ts`)
  - `https://steamcommunity.com/inventory/{steamId}/730/2` - CS2 inventory fetch with pagination (`backend/src/services/steam.ts`)
  - `https://steamcommunity.com/market/priceoverview/` - Individual item market price (`backend/src/services/prices.ts`, `backend/src/services/market.ts`)
  - `https://steamcommunity.com/market/sellitem/` - List item for sale on Steam Market (`backend/src/services/market.ts`)
  - `https://steamcommunity.com/market/myhistory/render/` - Transaction history (`backend/src/services/transactions.ts`)
- **Rate limiting:** Manual retry with backoff on 429 responses (inventory), 1s delay between pages, 1.5s delay between sell operations
- **Session auth:** Some endpoints (sell, transaction history) require `steamLoginSecure` and `sessionid` cookies stored in `users` table columns (`steam_session_id`, `steam_login_secure`, `steam_access_token`)

### Skinport API
- **Purpose:** Bulk CS2 skin price data
- **SDK/Client:** `axios` (backend)
- **Auth:** None required (public API)
- **Endpoint:** `https://api.skinport.com/v1/items?app_id=730&currency=USD` (`backend/src/services/prices.ts`)
- **Rate limit:** 8 requests per 5 minutes (server-side cache)
- **Caching:** In-memory cache with 5-minute TTL in `backend/src/services/prices.ts`

### Steam CDN (Images)
- **Purpose:** Skin item images
- **URL pattern:** `https://community.cloudflare.steamstatic.com/economy/image/{icon_url}/360fx360f` (`lib/models/inventory_item.dart`)
- **Avatar CDN:** `https://avatars.steamstatic.com` (`lib/core/constants.dart`)
- **Auth:** None
- **Client-side caching:** `cached_network_image` Flutter package

## Data Storage

### PostgreSQL
- **Connection:** `DATABASE_URL` env var (`backend/src/db/pool.ts`)
- **Client:** `pg` ^8.20.0 (raw SQL queries, no ORM)
- **Pool:** `pg.Pool` singleton (`backend/src/db/pool.ts`)
- **Migration:** Inline SQL schema in `backend/src/db/migrate.ts`, run at server startup and via `npm run migrate`

**Tables:**
- `users` - Steam user accounts with premium status and session cookies
- `steam_accounts` - Multiple linked Steam accounts per user
- `inventory_items` - Cached CS2 inventory items per Steam account
- `price_history` - Historical price data from multiple sources (skinport, steam)
- `user_purchases` - Manual purchase tracking
- `price_alerts` - User-defined price alert thresholds
- `transactions` - Steam Market buy/sell transaction history

**Indexes:**
- `idx_price_history_name_date` on `price_history(market_hash_name, recorded_at)`
- `idx_inventory_account` on `inventory_items(steam_account_id)`
- `idx_alerts_active` on `price_alerts(user_id, is_active)`
- `idx_price_history_latest` on `price_history(market_hash_name, source, recorded_at DESC)`
- `idx_transactions_user_date` on `transactions(user_id, tx_date DESC)`
- `idx_transactions_user_type` on `transactions(user_id, type)`
- `idx_transactions_user_item` on `transactions(user_id, market_hash_name)`

### Flutter Secure Storage
- **Purpose:** JWT token persistence on client
- **Package:** `flutter_secure_storage` ^9.2.4
- **Config:** macOS uses Data Protection Keychain (`lib/core/api_client.dart`)
- **Keys stored:** `jwt_token`

### Shared Preferences
- **Purpose:** Local app preferences
- **Package:** `shared_preferences` ^2.3.0

**File Storage:**
- No file storage service. Images served from Steam CDN.

**Caching:**
- Backend: In-memory Skinport price cache (5-minute TTL) in `backend/src/services/prices.ts`
- Frontend: `cached_network_image` for skin images
- Frontend: 5-minute inventory and price cache durations defined in `lib/core/constants.dart`

## Authentication & Identity

**Auth Provider:** Steam OpenID 2.0 (custom implementation)

**Flow:**
1. Flutter app opens Steam login URL in external browser via `url_launcher` (`lib/features/auth/steam_auth_service.dart`)
2. Steam redirects back to app via deep link scheme `skintracker://auth/callback`
3. App sends OpenID params to `POST /api/auth/steam/verify` (`backend/src/routes/auth.ts`)
4. Backend verifies with Steam OpenID endpoint, fetches profile, upserts user
5. Backend returns JWT token (30-day expiry, signed with `JWT_SECRET`)
6. Flutter stores JWT in secure storage, attaches as `Bearer` token to all API requests

**JWT payload:** `{ userId: number, steamId: string }`

**Dev auth:** Hardcoded dev token in `lib/core/constants.dart` (AppConstants.devToken) with dev login bypass in `lib/features/auth/steam_auth_service.dart`

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Crashlytics, or similar)

**Logs:**
- Backend: `console.log` / `console.error` with prefixes like `[CRON]`, `[Steam]`, `[INIT]`
- Frontend: `dart:developer` `dev.log()` with named loggers (e.g., `name: 'API'`, `name: 'Auth'`)
- Dio `LogInterceptor` logs API responses (`lib/core/api_client.dart`)

## CI/CD & Deployment

**Hosting:**
- Not configured. Backend runs locally on port 3000.

**CI Pipeline:**
- None detected.

## Background Jobs

**Price Fetching Cron:**
- Implemented with `node-cron` ^4.2.1 (`backend/src/services/priceJob.ts`)
- Schedule: Every 5 minutes (`*/5 * * * *`)
- Fetches all Skinport prices and saves to `price_history` table
- Initial fetch runs on server startup

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for signing/verifying JWT tokens
- `STEAM_API_KEY` - Steam Web API key for profile lookups
- `PORT` (optional) - Server port, defaults to 3000

**Secrets location:**
- Backend: `.env` file (not committed, loaded via `dotenv`)
- Frontend: JWT stored in platform keychain via `flutter_secure_storage`
- Steam session cookies stored in `users` database table

## API Routes

**Backend REST API** (`http://localhost:3000/api`):

| Route | Auth | Handler |
|-------|------|---------|
| `GET /api/health` | No | Health check (`backend/src/index.ts`) |
| `POST /api/auth/steam/verify` | No | Steam OpenID verification (`backend/src/routes/auth.ts`) |
| `GET /api/auth/me` | JWT | Current user profile (`backend/src/routes/auth.ts`) |
| `GET /api/inventory` | JWT | List inventory items with prices (`backend/src/routes/inventory.ts`) |
| `POST /api/inventory/refresh` | JWT | Re-fetch inventory from Steam (`backend/src/routes/inventory.ts`) |
| `GET /api/prices/*` | JWT | Price data endpoints (`backend/src/routes/prices.ts`) |
| `GET /api/portfolio/*` | JWT | Portfolio analytics (`backend/src/routes/portfolio.ts`) |
| `* /api/alerts/*` | JWT | Price alert CRUD (`backend/src/routes/alerts.ts`) |
| `* /api/market/*` | JWT | Steam Market operations (`backend/src/routes/market.ts`) |
| `* /api/transactions/*` | JWT | Transaction history (`backend/src/routes/transactions.ts`) |

## Webhooks & Callbacks

**Incoming:**
- Steam OpenID callback via deep link: `skintracker://auth/callback` (handled by Flutter app, forwarded to backend)

**Outgoing:**
- None

---

*Integration audit: 2026-03-08*
