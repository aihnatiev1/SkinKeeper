# Phase 3 Research: Enhanced Selling and Session Lifecycle

## Current State

### Sell Flow
- `sell_bottom_sheet.dart` (265 lines): single "Quick Sell" button, fetches price from `/api/market/quickprice/{name}`
- `POST /api/market/sell`: single item sell via Steam's `/market/sellitem/`
- `POST /api/market/bulk-sell`: sequential loop, 1.5s delay, max 50 items, no progress tracking
- `GET /api/market/quickprice/{name}`: lowest market price minus 1 cent

### Steam Sell API
- `POST https://steamcommunity.com/market/sellitem/` (undocumented)
- Params: `sessionid`, `appid: 730`, `contextid: 2`, `assetid`, `amount: 1`, `price` (seller receives in cents)
- Auth: cookies `steamLoginSecure` + `sessionid`
- Response: `{success, requires_confirmation, message}`

### Fee Structure
- Steam: 5% (min 1 cent), CS2: 10% (min 1 cent) = 15% total
- `sellerReceivesToBuyerPays()` already implemented in `market.ts`
- Edge case: items under $0.03 have rounding issues

### Session Lifecycle
- Sessions stored once, reused until expired
- `getSessionStatus()` returns "expiring" if >20h old
- `validateSession()` checks via GET to steamcommunity.com/market/
- No auto-refresh mechanism
- `steam_refresh_token` stored (encrypted) but unused

### Rate Limits
- 1.5s delay between sells (too aggressive — community says 3-5s minimum)
- No daily volume tracking
- No adaptive backoff
- Steam throttling signals: silent `success: false`, sudden `requires_confirmation: true`, "Too many recent listings"

## What Needs to Be Built

### Plan 03-01: Backend — Sell Operations, Session Refresh, Rate Limits
1. DB migration: `sell_operations`, `sell_operation_items`, `sell_volume` tables
2. Async batch sell with per-item status tracking (queued/listing/listed/failed)
3. Session auto-refresh endpoint using stored refresh token
4. Daily volume tracking + rate limit warnings
5. Increase delay to 3s, add adaptive backoff on errors
6. New endpoints: sell operations CRUD, volume check, session refresh

### Plan 03-02: Flutter — Redesigned Sell UX
1. Dual buttons: "Quick Sell" + "Sell at Custom Price"
2. Fee breakdown UI (buyer pays / steam fee / cs2 fee / you receive)
3. Per-item progress during batch (queued/listing/listed/failed with real-time polling)
4. "Sell all duplicates" shortcut
5. Rate limit warning banner
6. Session freshness check before sell

## New Database Schema

```sql
CREATE TABLE sell_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending', -- pending|in_progress|completed|cancelled
  total_items INTEGER NOT NULL,
  succeeded INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE sell_operation_items (
  id SERIAL PRIMARY KEY,
  operation_id UUID REFERENCES sell_operations(id) ON DELETE CASCADE,
  asset_id VARCHAR(20) NOT NULL,
  market_hash_name VARCHAR(255),
  price_cents INTEGER,
  status VARCHAR(20) DEFAULT 'queued', -- queued|listing|listed|failed
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sell_volume (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  count INTEGER DEFAULT 0,
  UNIQUE(user_id, day)
);
```

## New/Modified API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/market/sell-operation` | POST | Start batch sell, return operationId |
| `/api/market/sell-operation/:id` | GET | Poll batch progress |
| `/api/market/sell-operation/:id/cancel` | POST | Cancel ongoing batch |
| `/api/market/volume` | GET | Daily sell volume + limit warnings |
| `/api/session/refresh` | POST | Auto-refresh session using stored refresh token |
| `/api/market/sell` | PATCH | Add session freshness check, duplicate listing guard |
| `/api/market/bulk-sell` | PATCH | Replace with async operation-based flow |
| `/api/inventory/duplicates` | GET | Find duplicate items for "sell all duplicates" |

## Key Risks
1. Session expires mid-batch → validate before + check periodically during batch
2. Rate limit ban → 3-5s delay, volume tracking, adaptive backoff, user warnings
3. Mobile confirmation flood → show confirmation count, don't mislead user
4. Stale quick-sell price → show timestamp, refetch before confirming
5. Items under $0.03 → fee rounding edge cases, test thoroughly
