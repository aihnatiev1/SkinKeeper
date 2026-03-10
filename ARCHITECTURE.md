# CS2 Skin Tracker — Architecture

## Product Vision

Mobile-first CS2 inventory tracker with price alerts.
Competitive advantage: mobile push notifications + multi-source pricing cheaper than Skinledger.

## Business Model — Freemium

### Free Tier
- 1 Steam account
- Inventory view with Steam Market prices
- Portfolio total value
- 7-day price history

### Premium ($4.99/mo or $29.99/yr)
- Unlimited accounts
- Buff/CSFloat/Skinport prices (real market prices)
- Full price history + trend charts
- Push notifications ("AWP Asiimov +10% this week")
- Profit/loss tracking (bought at X, now worth Y)
- Cross-market price comparison
- CSV/Excel export

---

## Tech Stack

### Mobile App (Flutter)
- **State management:** Riverpod
- **Local DB:** Drift (SQLite) — cache inventory + prices offline
- **Auth:** Steam OpenID via system browser + deep link callback
- **Charts:** fl_chart
- **Notifications:** firebase_messaging (FCM)
- **Purchases:** in_app_purchase (StoreKit / Google Play Billing)

### Backend (required)
- **Runtime:** Node.js or Dart (Shelf/Serverpod)
- **Database:** PostgreSQL
- **Cache:** Redis (price caching, rate limit management)
- **Hosting:** Railway / Fly.io / VPS

Why backend is needed:
1. Steam API key must stay server-side (security)
2. Price aggregation + caching (rate limits are strict)
3. Push notification scheduling
4. Multi-account sync

---

## Architecture Diagram

```
+------------------+        +-------------------+        +------------------+
|                  |        |                   |        |                  |
|  Flutter App     | <----> |  Backend API      | <----> |  PostgreSQL      |
|  (iOS/Android)   |  REST  |  (Node.js/Dart)   |        |  + Redis cache   |
|                  |        |                   |        |                  |
+------------------+        +--------+----------+        +------------------+
                                     |
                            +--------+----------+
                            |                   |
                    +-------v--+  +----------+  +----------+
                    | Steam    |  | Skinport  |  | CSFloat  |
                    | Web API  |  | API       |  | API      |
                    +----------+  +----------+  +----------+
                                  | Pricempire|
                                  | (optional)|
                                  +-----------+
```

---

## Data Flow

### 1. Authentication
```
App -> System Browser -> Steam OpenID login
Steam -> redirect to myapp://auth?steamid=XXXX
App -> sends steamid to Backend
Backend -> verifies OpenID assertion with Steam
Backend -> creates/returns JWT token
App -> stores JWT, uses for all API calls
```

### 2. Inventory Fetch
```
App -> GET /api/inventory/{steamid}
Backend -> check Redis cache (TTL: 5 min)
  if cached -> return cached
  if not -> GET steamcommunity.com/inventory/{steamid}/730/2
         -> parse, store in PostgreSQL
         -> cache in Redis
         -> return to app
```

### 3. Price Updates (Background Job)
```
Every 5 minutes:
  Backend -> GET skinport.com/v1/items (free, no auth)
  Backend -> GET csfloat API (with API key)
  Backend -> store in price_history table
  Backend -> compare with user alerts
  Backend -> send FCM push if alert triggered
```

---

## Database Schema (PostgreSQL)

```sql
-- Users
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  steam_id      VARCHAR(17) UNIQUE NOT NULL,
  display_name  VARCHAR(100),
  avatar_url    TEXT,
  is_premium    BOOLEAN DEFAULT FALSE,
  premium_until TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Steam accounts linked to user (multi-account for premium)
CREATE TABLE steam_accounts (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  steam_id    VARCHAR(17) NOT NULL,
  display_name VARCHAR(100),
  added_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory snapshots
CREATE TABLE inventory_items (
  id              SERIAL PRIMARY KEY,
  steam_account_id INTEGER REFERENCES steam_accounts(id),
  asset_id        VARCHAR(20) NOT NULL,
  market_hash_name VARCHAR(255) NOT NULL,
  icon_url        TEXT,
  wear            VARCHAR(50),   -- Factory New, Minimal Wear, etc.
  float_value     DECIMAL(10,8),
  tradable        BOOLEAN,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Price history (per item name, not per asset)
CREATE TABLE price_history (
  id              SERIAL PRIMARY KEY,
  market_hash_name VARCHAR(255) NOT NULL,
  source          VARCHAR(20) NOT NULL, -- steam, skinport, csfloat, buff
  price_usd       DECIMAL(10,2),
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- User's purchase prices (for P/L tracking)
CREATE TABLE user_purchases (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id),
  asset_id        VARCHAR(20),
  market_hash_name VARCHAR(255),
  buy_price_usd   DECIMAL(10,2),
  buy_source      VARCHAR(20),
  bought_at       TIMESTAMPTZ
);

-- Price alerts
CREATE TABLE price_alerts (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id),
  market_hash_name VARCHAR(255) NOT NULL,
  condition       VARCHAR(10) NOT NULL, -- 'above', 'below', 'change_pct'
  threshold       DECIMAL(10,2) NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_price_history_name_date ON price_history(market_hash_name, recorded_at);
CREATE INDEX idx_inventory_account ON inventory_items(steam_account_id);
CREATE INDEX idx_alerts_active ON price_alerts(user_id, is_active);
```

---

## API Endpoints (Backend REST)

### Auth
- `POST /auth/steam/verify` — verify OpenID assertion, return JWT
- `GET  /auth/me` — current user info

### Inventory
- `GET  /inventory` — current user's inventory (all accounts)
- `GET  /inventory/{steam_id}` — specific account inventory
- `POST /inventory/refresh` — force re-fetch from Steam

### Prices
- `GET  /prices/{market_hash_name}` — current prices from all sources
- `GET  /prices/{market_hash_name}/history?days=30` — price history
- `GET  /prices/compare/{market_hash_name}` — cross-market comparison

### Portfolio
- `GET  /portfolio/summary` — total value, daily change, top items
- `GET  /portfolio/history?days=30` — portfolio value over time
- `POST /portfolio/purchase` — record a purchase price
- `GET  /portfolio/pnl` — profit/loss report

### Alerts (Premium)
- `GET    /alerts` — list user's alerts
- `POST   /alerts` — create alert
- `DELETE /alerts/{id}` — delete alert

### Account (Premium)
- `POST /accounts` — link additional Steam account
- `DELETE /accounts/{steam_id}` — unlink account

---

## Flutter App Structure

```
lib/
  main.dart
  app.dart

  core/
    api_client.dart          -- HTTP client with JWT auth
    constants.dart
    router.dart              -- GoRouter navigation
    theme.dart

  features/
    auth/
      steam_auth_service.dart
      auth_provider.dart
      login_screen.dart

    inventory/
      inventory_provider.dart
      inventory_screen.dart
      item_detail_screen.dart
      widgets/
        item_card.dart
        inventory_grid.dart
        filter_bar.dart

    portfolio/
      portfolio_provider.dart
      portfolio_screen.dart
      widgets/
        value_chart.dart
        pnl_card.dart
        top_items_list.dart

    prices/
      prices_provider.dart
      price_detail_screen.dart
      widgets/
        price_chart.dart
        market_comparison.dart

    alerts/
      alerts_provider.dart
      alerts_screen.dart
      create_alert_screen.dart

    settings/
      settings_screen.dart
      accounts_screen.dart

    premium/
      paywall_screen.dart
      purchase_service.dart

  models/
    user.dart
    inventory_item.dart
    price_data.dart
    alert.dart

  widgets/
    skin_image.dart
    wear_badge.dart
    price_tag.dart
    loading_skeleton.dart
```

---

## Price Sources Strategy

| Source | Auth | Rate Limit | Cost | Data Quality |
|--------|------|-----------|------|-------------|
| Skinport | None | 8/5min | Free | Good, all items |
| CSFloat | API key | ~moderate | Free | Best for float data |
| Steam Market | None | Very strict | Free | Inflated prices |
| Pricempire | API key | 10k/day | Paid ($) | Best, 30+ sources |

**Strategy:**
- MVP: Skinport (free, no auth) + Steam Market
- V2: Add CSFloat
- V3: Add Pricempire for Buff prices (when revenue covers API cost)

---

## MVP Roadmap

### Phase 1 — Core (weeks 1-4)
- [ ] Flutter project setup + navigation
- [ ] Backend: auth + inventory endpoints
- [ ] Steam OpenID login
- [ ] Inventory view with Steam Market prices
- [ ] Basic portfolio value

### Phase 2 — Prices (weeks 5-6)
- [ ] Skinport price integration
- [ ] Price history charts
- [ ] Cross-market comparison (Steam vs Skinport)

### Phase 3 — Premium (weeks 7-8)
- [ ] In-app purchases (StoreKit / Google Play)
- [ ] Push notifications + price alerts
- [ ] Multi-account support
- [ ] P/L tracking

### Phase 4 — Polish (weeks 9-10)
- [ ] Onboarding flow
- [ ] Search/filter/sort inventory
- [ ] Settings, dark/light theme
- [ ] App Store / Play Store submission
