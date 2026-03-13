# Phase 4: Multi-Source Pricing - Research

**Researched:** 2026-03-08
**Domain:** Third-party marketplace API integration (CSFloat, DMarket), price aggregation, cross-market comparison UI
**Confidence:** HIGH

## Summary

Phase 4 adds CSFloat and DMarket as price sources alongside existing Skinport and Steam Market. The backend already has a clean `price_history` table with `source` column and a `savePrices()` function that batch-inserts by source -- new fetchers simply produce a `Map<string, number>` and call `savePrices(prices, "csfloat"|"dmarket")`. The existing cron job, `getLatestPrices()`, and `getPriceHistory()` all work multi-source out of the box with no schema changes required.

CSFloat does NOT have a bulk-price endpoint -- it only has a listings endpoint (`GET /api/v1/listings?market_hash_name=X`) that returns individual listings (max 50 per request). To get "CSFloat price" for an item, we query listings sorted by `lowest_price` and take the first result's price. This means we cannot bulk-fetch all item prices in one call like Skinport -- we must iterate over unique `market_hash_name` values from our inventory. DMarket similarly requires per-title queries via `GET /exchange/v1/market/items?title=X&gameId=a8db&currency=USD` and returns items with `price.USD` in cents. DMarket additionally requires Ed25519 HMAC signature authentication (reference implementation exists in `/Users/abs/ideaProjects/cs/` Java bot).

On Flutter side, the `InventoryItem` model already has `Map<String, double> prices` and `bestPrice` getter. The `ItemCard` currently shows only `bestPrice`. Phase 4 needs: (1) source label on the best price, (2) a price detail screen with comparison table, (3) price history chart with per-source lines using `fl_chart` (already in pubspec).

**Primary recommendation:** Add `fetchCSFloatPrices()` and `fetchDMarketPrices()` fetcher functions following the same pattern as `fetchSkinportPrices()`, schedule them in the cron job on staggered intervals, and build a new `/item/:marketHashName` detail screen in Flutter with comparison table and fl_chart line graph.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRICE-01 | Price cron fetches from CSFloat API and DMarket API in addition to existing Skinport + Steam | CSFloat listings API and DMarket market items API documented; fetcher pattern matches existing `fetchSkinportPrices()`; Ed25519 auth for DMarket understood from reference bot |
| PRICE-02 | Inventory items show best price across all sources with source label | `InventoryItem.prices` map already holds multi-source data; `bestPrice` getter exists; need to add `bestPriceSource` getter and update `ItemCard` |
| PRICE-03 | Price detail screen shows cross-market comparison and history charts | `getPriceHistory()` already returns per-source data; `fl_chart 0.70.2` already in pubspec; need new detail screen route + comparison table widget + multi-line chart |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | ^1.13.6 | HTTP client for API calls | Already used for Skinport/Steam fetchers |
| node-cron | ^4.2.1 | Scheduled price fetching | Already running Skinport cron |
| pg | ^8.20.0 | PostgreSQL queries | Existing price_history table |
| fl_chart | ^0.70.2 | Price history line charts | Already in pubspec.yaml |
| flutter_riverpod | ^2.6.0 | State management | Project standard |
| go_router | ^15.1.2 | Navigation to detail screen | Project standard |

### New Dependencies Needed
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tweetnacl | ^1.0.3 | Ed25519 signing for DMarket API auth | DMarket HMAC signature generation |

**Note:** Node.js built-in `crypto` module supports Ed25519 since Node 15+, but `tweetnacl` is simpler for the specific DMarket signing pattern (hex seed -> sign -> hex signature). If the project uses Node 18+, native `crypto.sign('ed25519', ...)` also works and avoids a dependency.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tweetnacl | Node.js native crypto | Native crypto avoids dependency but requires more boilerplate for Ed25519 key construction |
| Per-item CSFloat queries | Scraping/unofficial bulk API | Against CSFloat TOS; per-item is the official way |

**Installation:**
```bash
cd backend && npm install tweetnacl
```

Or use native Node.js crypto (zero new deps).

## Architecture Patterns

### Backend Fetcher Pattern (existing)
```
backend/src/services/
  prices.ts           # fetchSkinportPrices(), savePrices(), getLatestPrices(), getPriceHistory()
  priceJob.ts         # cron schedule, calls fetchers
  csfloat.ts          # NEW: fetchCSFloatPrices()
  dmarket.ts          # NEW: fetchDMarketPrices() + signRequest()
```

### Flutter Price Detail Screen
```
lib/features/inventory/
  inventory_screen.dart          # existing - add tap-to-detail navigation
  inventory_provider.dart        # existing
  widgets/
    item_card.dart               # existing - add source label
    price_comparison_table.dart  # NEW
    price_history_chart.dart     # NEW
  item_detail_screen.dart        # NEW - comparison + chart + item info
```

### Pattern 1: Price Fetcher Function
**What:** Each source has a standalone async function returning `Map<string, number>` (market_hash_name -> price USD)
**When to use:** Every new price source follows this pattern
**Example:**
```typescript
// Matches existing fetchSkinportPrices() signature
export async function fetchCSFloatPrices(
  marketHashNames: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  for (const name of marketHashNames) {
    const price = await fetchCSFloatItemPrice(name);
    if (price !== null) prices.set(name, price);
    await delay(200); // rate limiting
  }
  return prices;
}
```

### Pattern 2: DMarket Ed25519 Authentication
**What:** Sign each request with Ed25519 using method + path + body + timestamp
**When to use:** Every DMarket API call
**Example (from reference Java bot, translated to TypeScript):**
```typescript
// String to sign: METHOD + PATH_WITH_QUERY + BODY + TIMESTAMP
// Headers: X-Api-Key, X-Sign-Date, X-Request-Sign: "dmar ed25519 <hex_signature>"
function signDMarketRequest(
  method: string, path: string, body: string, timestamp: string,
  secretKeyHex: string
): string {
  const message = method + path + body + timestamp;
  const seed = Buffer.from(secretKeyHex, 'hex').subarray(0, 32);
  // Use tweetnacl or native crypto to sign
  const keyPair = nacl.sign.keyPair.fromSeed(seed);
  const signature = nacl.sign.detached(Buffer.from(message), keyPair.secretKey);
  return Buffer.from(signature).toString('hex');
}
```

### Pattern 3: Staggered Cron Scheduling
**What:** Different sources on different intervals to avoid DB write contention and respect rate limits
**When to use:** Multiple price fetchers in priceJob.ts
**Example:**
```typescript
// Skinport: every 5 min (existing, bulk endpoint)
cron.schedule("*/5 * * * *", () => fetchAndSaveSkinport());
// CSFloat: every 10 min (per-item, rate limited)
cron.schedule("2,12,22,32,42,52 * * * *", () => fetchAndSaveCSFloat());
// DMarket: every 10 min (per-item, rate limited)
cron.schedule("5,15,25,35,45,55 * * * *", () => fetchAndSaveDMarket());
```

### Pattern 4: Best Price with Source
**What:** Extend InventoryItem model to expose which source has the best price
**When to use:** Item card display, comparison table
**Example:**
```dart
String? get bestPriceSource {
  if (prices.isEmpty) return null;
  return prices.entries.reduce(
    (a, b) => a.value < b.value ? a : b,
  ).key;
}
```

### Anti-Patterns to Avoid
- **Fetching all CSFloat/DMarket items globally:** Unlike Skinport which returns ALL items in one call, CSFloat and DMarket require per-item queries. Only fetch prices for items in users' inventories, not all 20k+ CS2 items.
- **Synchronous sequential fetching:** Don't await each API call one by one. Use controlled concurrency (e.g., 3-5 parallel requests with delays).
- **Storing prices in different formats:** All sources MUST normalize to USD decimal (e.g., 12.34). DMarket returns cents (1234), CSFloat returns cents too -- divide by 100 before saving.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ed25519 signing | Custom crypto implementation | tweetnacl or Node crypto.sign() | Crypto is easy to get wrong; reference implementation exists |
| Price normalization | Per-source conversion logic scattered | Single `normalizePrice(cents: number)` utility | DMarket and CSFloat both use cents; easy to miss division |
| Rate limiting | Manual setTimeout chains | Simple concurrency limiter (p-limit or custom) | Cleaner than nested setTimeout, handles errors better |
| Multi-line charts | Custom canvas drawing | fl_chart LineChart with multiple LineChartBarData | fl_chart already in project, handles touch, legends, animations |

**Key insight:** The existing `savePrices()` and `getLatestPrices()` functions are source-agnostic -- they already handle multi-source via the `source` column. No DB schema changes needed.

## Common Pitfalls

### Pitfall 1: CSFloat and DMarket Rate Limits
**What goes wrong:** Getting IP-banned or 429'd by hammering per-item endpoints
**Why it happens:** If a user has 500 items, that is 500 API calls per source per cron cycle
**How to avoid:** (1) Only fetch prices for unique market_hash_names (deduplicate), (2) Add 200-500ms delay between requests, (3) Limit concurrency to 2-3 parallel requests, (4) Cache results in-memory for 5-10 min to avoid re-fetching
**Warning signs:** 429 status codes, empty responses, IP blocks

### Pitfall 2: DMarket Price Format
**What goes wrong:** Prices displayed as 100x too high or too low
**Why it happens:** DMarket returns price.USD as string in cents (e.g., "1234" = $12.34). The Java reference code uses `Long` for `price.usd`. Easy to forget division by 100.
**How to avoid:** Parse to number and divide by 100 immediately in the fetcher before returning
**Warning signs:** Prices like "$1234.00" instead of "$12.34"

### Pitfall 3: CSFloat Returns Listings, Not "Market Price"
**What goes wrong:** Showing a single listing's price as "the CSFloat price" when it could be an outlier
**Why it happens:** CSFloat listings endpoint returns individual seller listings, not an aggregated market price
**How to avoid:** Sort by `lowest_price`, take the first result. This gives the "cheapest available on CSFloat" which is the most meaningful comparison price. Consider also looking at multiple listings to detect outliers.
**Warning signs:** Wildly different prices from other sources for common items

### Pitfall 4: Item Name Mismatch Between Markets
**What goes wrong:** Queries return no results for items that exist on the market
**Why it happens:** Market hash names may have slight encoding differences (e.g., special characters, the pipe character "|")
**How to avoid:** Use exact `market_hash_name` from Steam inventory. CSFloat and DMarket both index by Steam's `market_hash_name`. URL-encode when passing as query parameters.
**Warning signs:** Many items returning null prices from new sources

### Pitfall 5: Price History Table Bloat
**What goes wrong:** price_history table grows to millions of rows quickly
**Why it happens:** 4 sources x ~500 unique items x every 5-10 min = thousands of rows per hour
**How to avoid:** (1) Add a cleanup job to delete price_history older than 90 days, (2) Consider only inserting when price changed from last recorded value for that source, (3) Add index on `recorded_at` for efficient cleanup
**Warning signs:** Slow `getPriceHistory()` queries, disk usage growth

## Code Examples

### CSFloat Price Fetcher
```typescript
// Source: CSFloat API docs (docs.csfloat.com)
interface CSFloatListing {
  id: string;
  price: number; // cents
  item: {
    market_hash_name: string;
    float_value: number;
  };
}

export async function fetchCSFloatItemPrice(
  marketHashName: string,
  apiKey: string
): Promise<number | null> {
  try {
    const { data } = await axios.get<CSFloatListing[]>(
      "https://csfloat.com/api/v1/listings",
      {
        params: {
          market_hash_name: marketHashName,
          sort_by: "lowest_price",
          limit: 1,
        },
        headers: { Authorization: apiKey },
        timeout: 10000,
      }
    );
    if (data.length > 0) {
      return data[0].price / 100; // cents to USD
    }
    return null;
  } catch {
    return null;
  }
}
```

### DMarket Price Fetcher
```typescript
// Source: DMarket API docs + reference Java bot AuthInterceptor
interface DMarketItem {
  title: string;
  price: { USD: string }; // cents as string
  extra: {
    exterior?: string;
    floatPartValue?: string;
  };
}

interface DMarketResponse {
  objects: DMarketItem[];
  total: { items: number };
  cursor: string;
}

export async function fetchDMarketItemPrice(
  marketHashName: string
): Promise<number | null> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = "/exchange/v1/market/items";
  const query = `?gameId=a8db&title=${encodeURIComponent(marketHashName)}&limit=1&currency=USD&orderBy=price&orderDir=asc`;
  const fullPath = path + query;

  const signature = signDMarketRequest("GET", fullPath, "", timestamp);

  try {
    const { data } = await axios.get<DMarketResponse>(
      `https://api.dmarket.com${fullPath}`,
      {
        headers: {
          "X-Api-Key": process.env.DMARKET_PUBLIC_KEY!,
          "X-Sign-Date": timestamp,
          "X-Request-Sign": `dmar ed25519 ${signature}`,
        },
        timeout: 10000,
      }
    );
    if (data.objects?.length > 0) {
      return parseInt(data.objects[0].price.USD, 10) / 100;
    }
    return null;
  } catch {
    return null;
  }
}
```

### DMarket Ed25519 Signing (from Java reference bot)
```typescript
// Source: /Users/abs/ideaProjects/cs/ AuthInterceptor.java translated
import nacl from "tweetnacl";

export function signDMarketRequest(
  method: string,
  pathWithQuery: string,
  body: string,
  timestamp: string
): string {
  const message = method + pathWithQuery + body + timestamp;
  const secretKeyHex = process.env.DMARKET_SECRET_KEY!;
  const seed = Buffer.from(secretKeyHex, "hex").subarray(0, 32);
  const keyPair = nacl.sign.keyPair.fromSeed(seed);
  const sig = nacl.sign.detached(
    Buffer.from(message, "utf-8"),
    keyPair.secretKey
  );
  return Buffer.from(sig).toString("hex");
}
```

### Flutter: Multi-Line Price History Chart
```dart
// Source: fl_chart docs (pub.dev/packages/fl_chart)
import 'package:fl_chart/fl_chart.dart';

// Each source gets its own LineChartBarData with a distinct color
final sourceColors = {
  'steam': Colors.blue,
  'skinport': Colors.green,
  'csfloat': Colors.orange,
  'dmarket': Colors.purple,
};

LineChartData buildPriceHistoryChart(
  List<PricePoint> history, // {source, priceUsd, recordedAt}
) {
  final grouped = <String, List<FlSpot>>{};
  for (final p in history) {
    grouped.putIfAbsent(p.source, () => []);
    grouped[p.source]!.add(FlSpot(
      p.recordedAt.millisecondsSinceEpoch.toDouble(),
      p.priceUsd,
    ));
  }

  return LineChartData(
    lineBarsData: grouped.entries.map((e) => LineChartBarData(
      spots: e.value,
      color: sourceColors[e.key] ?? Colors.grey,
      dotData: const FlDotData(show: false),
      isCurved: true,
      barWidth: 2,
    )).toList(),
  );
}
```

### Flutter: Price Comparison Table
```dart
// Simple comparison row for each source
Widget buildComparisonTable(Map<String, double> prices) {
  final sorted = prices.entries.toList()
    ..sort((a, b) => a.value.compareTo(b.value));
  final bestPrice = sorted.first.value;

  return Column(
    children: sorted.map((e) => ListTile(
      leading: _sourceIcon(e.key),
      title: Text(_sourceDisplayName(e.key)),
      trailing: Text(
        '\$${e.value.toStringAsFixed(2)}',
        style: TextStyle(
          fontWeight: FontWeight.bold,
          color: e.value == bestPrice ? Colors.green : Colors.white70,
        ),
      ),
    )).toList(),
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Skinport only | Multi-source (Skinport + CSFloat + DMarket + Steam) | Phase 4 | Users see real market prices, not just one source |
| Single price display | Best-price with source label + comparison table | Phase 4 | Users can make informed selling decisions |
| No price charts | Per-source line charts over time | Phase 4 | Users see price trends per marketplace |

**DMarket gameId:** CS2 items still use gameId `a8db` (originally CS:GO, DMarket has not changed this).

## Open Questions

1. **CSFloat API Rate Limits**
   - What we know: CSFloat docs do NOT document rate limits. API key is required.
   - What's unclear: Exact requests/minute before throttling. Skinport explicitly states 8 requests per 5 min.
   - Recommendation: Start conservative (1 req/sec with max 3 concurrent), log 429s, adjust dynamically. Add exponential backoff.

2. **CSFloat API Key Requirements**
   - What we know: API key from developer profile needed for API access
   - What's unclear: Whether read-only listing queries work without API key (docs suggest key is needed for write ops, unclear for read)
   - Recommendation: Require API key in env vars (`CSFLOAT_API_KEY`). Test without key first -- if it works, make it optional.

3. **How many unique items per inventory?**
   - What we know: Inventories can have 1000+ items but many duplicates
   - What's unclear: Typical unique market_hash_name count
   - Recommendation: Deduplicate names before fetching. For initial launch, only fetch prices for items in active users' inventories (query unique names from inventory_items table).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.18 |
| Config file | None detected -- needs vitest.config.ts |
| Quick run command | `cd backend && npx vitest run` |
| Full suite command | `cd backend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRICE-01a | CSFloat fetcher returns price from listings API | unit | `cd backend && npx vitest run src/services/__tests__/csfloat.test.ts -t "csfloat"` | No -- Wave 0 |
| PRICE-01b | DMarket fetcher returns price with Ed25519 auth | unit | `cd backend && npx vitest run src/services/__tests__/dmarket.test.ts -t "dmarket"` | No -- Wave 0 |
| PRICE-01c | Cron job calls all fetchers and saves prices | unit | `cd backend && npx vitest run src/services/__tests__/priceJob.test.ts -t "cron"` | No -- Wave 0 |
| PRICE-02 | bestPriceSource getter returns correct source | unit | `cd backend && npx vitest run` (Flutter: manual) | No -- Wave 0 |
| PRICE-03 | Price history endpoint returns multi-source data | integration | `cd backend && npx vitest run src/routes/__tests__/prices.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx vitest run`
- **Per wave merge:** `cd backend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/vitest.config.ts` -- vitest configuration (currently no config file)
- [ ] `backend/src/services/__tests__/csfloat.test.ts` -- CSFloat fetcher unit tests with mocked axios
- [ ] `backend/src/services/__tests__/dmarket.test.ts` -- DMarket fetcher + signing unit tests
- [ ] `backend/src/services/__tests__/priceJob.test.ts` -- Cron job orchestration tests
- [ ] `test/widget_test.dart` -- existing but likely placeholder; Flutter price widget tests if feasible

## Sources

### Primary (HIGH confidence)
- CSFloat API docs (https://docs.csfloat.com/) -- listings endpoint, query parameters, auth
- DMarket API docs (https://docs.dmarket.com/v1/swagger.html) -- market items endpoint, auth headers, gameId
- DMarket reference bot (`/Users/abs/ideaProjects/cs/`) -- AuthInterceptor.java (Ed25519 signing), DmService.java (endpoint patterns), Items.java (response model)
- Existing codebase -- `prices.ts`, `priceJob.ts`, `migrate.ts` (price_history schema), `inventory_provider.dart`, `item_card.dart`

### Secondary (MEDIUM confidence)
- DMarket API wrapper (https://github.com/Allyans3/dmarket-api) -- confirmed gameId `a8db` for CS2, limit 100, cursor pagination
- fl_chart (https://pub.dev/packages/fl_chart) -- LineChart multi-line support confirmed
- tweetnacl (https://www.npmjs.com/package/tweetnacl) -- Ed25519 signing in JavaScript

### Tertiary (LOW confidence)
- CSFloat rate limits -- undocumented, conservative estimate based on general API patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project except tweetnacl (well-established)
- Architecture: HIGH - extending existing proven pattern (fetcher -> savePrices -> getLatestPrices)
- Pitfalls: HIGH - DMarket auth verified against reference bot; rate limit concerns well-understood
- CSFloat rate limits: LOW - undocumented, needs runtime validation

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (APIs are stable, 30 days)
