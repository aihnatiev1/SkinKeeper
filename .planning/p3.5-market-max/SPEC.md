# P3.5 — `market_max` Histogram-based Pricing — SPEC

> **Owner:** domain-expert (this doc), backend-dev (implementation)
> **Status:** Ready for backend-dev implementation. Pure research output. No code changes attached.
> **Predecessor:** P3 ships `currentPrice * 0.99` placeholder for `market_max` (autoSellEngine.ts §`computeIntendedListPrice`). This spec replaces that with real top-of-book undercut.
> **Scope of upgrade:** ONE function (`computeIntendedListPrice` for `market_max`) plus a refusal layer. No schema changes. No API changes. No Flutter changes.

---

## 0. Discovery — Existing Infrastructure (good news)

Most plumbing is already in place from prior work on `quickSellPrice`. backend-dev should NOT rebuild any of this:

| Concern | Already exists | Where |
|---|---|---|
| `item_nameid` cache table | YES, `steam_item_nameids` (mh_name TEXT PK, item_nameid INT) | seeded from GitHub on startup, see `seedItemNameIds()` |
| `item_nameid` resolution: cache → DB → scrape | YES | `fetchItemNameId(marketHashName)` in `services/steamHistogram.ts` |
| Histogram fetcher (already returns lowest_sell_order in cents) | YES | `fetchHistogramPrice(marketHashName, currency)` in `services/steamHistogram.ts` |
| Proxy rotation + per-domain 429 backoff (AIMD) | YES | `services/proxyPool.ts` — 3 slots (direct + 2 proxy) with adaptive gap, used inside `fetchHistogramPrice` via `proxyRequest()` |
| Currency table + minUnit per Steam currency | YES | `services/currency.ts`, `getMinUndercutUnit(currencyId)` returns 1 cent for USD/EUR/GBP, 100 (1 hryvnia) for UAH, etc. |
| USD ↔ wallet conversion | YES | `convertUsdToWallet()`, `getExchangeRate()` |
| Price freshness window (30 min) | YES | `PRICE_FRESHNESS_MAX_AGE_MIN` in autoSellEngine — same constant applies |
| Save-to-current_prices side effect on histogram fetch | YES | `fetchHistogramPrice()` already writes USD-normalized price to `current_prices` |

**What this spec adds:**
1. A thin wrapper `computeMarketMaxListPrice(rule, currentPrice)` that uses the existing histogram fetcher with the right currency, applies undercut math, and returns USD cents (current contract).
2. A **pattern-sensitive refusal layer** — domain knowledge guard around the histogram top-of-book lookup. This is where the real value of this spec lives.
3. Three new `refusalReason` codes.

The histogram-fetcher rewrite itself is a half-day. The refusal layer is the bulk of the work.

---

## 1. Steam API Surface

### 1.1 Endpoint

```
GET https://steamcommunity.com/market/itemordershistogram
  ?country=US
  &language=english
  &currency=<steamCurrencyId>
  &item_nameid=<NNN>
  &two_factor=0
```

| Param | Purpose | Notes |
|---|---|---|
| `country` | Region for tax/listing rules | We always send `US`. Doesn't affect price returned (price is currency-driven). |
| `language` | Display language for any text | `english` — irrelevant for our parsing, but Steam expects it. |
| `currency` | Steam currency ID for prices in response | **THIS IS THE LEVER.** USD=1, GBP=2, EUR=3, RUB=5, UAH=18, etc. Full table in `services/currency.ts → STEAM_CURRENCIES`. |
| `item_nameid` | Numeric item identifier | NOT the same as classid/instanceid. Per-item, stable. |
| `two_factor` | Auth shim | `0` always — public market data, no session needed. |

**No auth required.** No `steamLoginSecure`. No `webTradeEligibility` cookie. This is the public order book endpoint, anonymously accessible.

### 1.2 `item_nameid` — what it is

A numeric ID Steam assigns to each unique `market_hash_name`. NOT the same as `classid` / `instanceid` (those are inventory-asset properties).

**Example:** `AK-47 | Redline (Field-Tested)` → `item_nameid` = `176304090`.

**Resolution chain (already implemented, do not duplicate):**
1. In-memory TTL cache (24h)
2. `steam_item_nameids` DB table (seeded from `https://github.com/Olimp666/steam-market-item-nameids` on startup; covers ~50k common items)
3. Scrape from `https://steamcommunity.com/market/listings/730/<urlencoded mhname>` HTML — regex match `ItemActivityTicker.Start( NNN );`
4. Result cached back into DB + memory

**Edge case:** New / freshly-released skin → not in seed, not in DB, scrape works. First-time hit per item is ~1.5s slower. Subsequent calls fast.

**Edge case:** `market_hash_name` with unusual characters (StatTrak™, Souvenir, ★) → `encodeURIComponent` already used. Confirmed working.

### 1.3 Currency code we use

Per-rule the histogram MUST be queried in the **user's wallet currency**, not USD, for two reasons:
1. Steam's `lowest_sell_order` is the actual integer the next listing must beat. If we query in USD but the user's wallet is UAH, we'd undercut the USD listing by 1¢ and then convert that to UAH — but UAH has minUnit=100 (1 hryvnia, not 1 kopeck), so the undercut of "1 cent" becomes meaningless after rounding.
2. The undercut step itself is currency-scoped (`getMinUndercutUnit(currencyId)`).

**Implementation note:** The rule itself is stored in USD (`trigger_price_usd`, `sell_price_usd`). The wallet currency comes from the rule's `account_id` → `steam_accounts.wallet_currency`. If null, default to USD (currency_id=1).

### 1.4 Response shape

```json
{
  "success": 1,
  "sell_order_count": "1234",
  "sell_order_price": "$12.34",
  "sell_order_table": "<table>...HTML...</table>",
  "buy_order_count": "567",
  "buy_order_price": "$11.50",
  "buy_order_table": "<table>...HTML...</table>",
  "highest_buy_order": "1150",
  "lowest_sell_order": "1234",
  "buy_order_graph": [[11.50, 5, "5 buy orders at $11.50 or higher"], ...],
  "sell_order_graph": [[12.34, 3, "3 sell orders at $12.34 or lower"], ...],
  "graph_max_y": 4321,
  "graph_min_x": 11.0,
  "graph_max_x": 13.0,
  "price_prefix": "$",
  "price_suffix": ""
}
```

| Field | Use | Caveat |
|---|---|---|
| `success` | Must be `1` | Anything else = treat as failure. |
| `lowest_sell_order` | **Primary input.** Integer in smallest unit of requested currency (cents/kopecks). | Empty string or absent → no live sellers. Confirmed in current code (`steamHistogram.ts:132`). |
| `highest_buy_order` | Out of scope for sell-side P3.5. May be useful for future "list above current buy floor" strategy. | Same units as `lowest_sell_order`. |
| `sell_order_graph` | Array of `[price_dollars, qty, label]`. `[0]` is the lowest price tier (the cheapest sell orders, what we're undercutting). | Note: `price_dollars` is a **decimal** here (12.34), unlike `lowest_sell_order` which is **cents** (1234). Don't mix them up. |
| `sell_order_count` | Total number of sell listings. | Useful for thin-book detection: `< 5` → flag. |
| `buy_order_count` | Total number of buy orders. | Useful for liquidity sanity check (no buyers + no sellers = dead skin, refuse). |
| `sell_order_price` / `buy_order_price` | Pre-formatted display strings | Don't parse — use the integer fields. |

**Top-of-book extraction:** Use `data.lowest_sell_order` directly (integer, cents in requested currency). Do **not** parse `sell_order_graph[0][0]` (decimal, locale-formatting risk). Existing `fetchHistogramPrice` does this correctly.

### 1.5 Empty graph semantics — different signals

| `lowest_sell_order` | `highest_buy_order` | Meaning | What `market_max` should do |
|---|---|---|---|
| `> 0` | any | Live sellers exist | Normal case — undercut by minUnit |
| `0` / empty | `> 0` | No sellers, but buyers exist | Fall back to `currentPrice * 0.99` and **log** — listing high is rational |
| `0` / empty | `0` / empty | Dead market — neither side | Refuse with `HISTOGRAM_EMPTY_DEAD_MARKET` and notify user. Selling here = blind |
| `> 0` | `> 0` | Healthy book | Normal case |

**Frequency in practice:** Empty `sell_order_graph` is rare for popular items but common for:
- Newly released cases (first hour after drop)
- Souvenir items from years ago (low circulation)
- StatTrak versions of niche skins
- Items currently being mass-bought (someone's running a buy-out)

Estimate: <5% of rules will hit empty histograms in any given cron tick.

### 1.6 Price units — confirmed

`lowest_sell_order` and `highest_buy_order` are **integers in the smallest unit of the requested currency** (cents for USD, kopecks for UAH/RUB, yen for JPY where decimals=0). `sell_order_graph[*][0]` is a **decimal** (dollars). Do not mix.

---

## 2. Rate Limits and Quirks

### 2.1 Observed limits

Steam's histogram endpoint is **less aggressively rate-limited than `priceoverview`** — empirically (from `steamHistogram.ts` already in production use) the same proxy slots can handle 5–10x more histogram requests/min than priceoverview before 429.

**Hard numbers — needs verification with synthetic test:** ~30 req/min/IP before 429 on histogram (vs ~10 req/min/IP for priceoverview). The existing AIMD adaptive gap in `proxyPool.ts` handles this transparently.

### 2.2 Cadence — recommendation

**Option A (recommended): Inline fetch per fire.**
- Auto-sell cron is `*/15 min`. Even with 100 rules at peak premium adoption, that's 100 histogram calls per cron tick spread across 3 proxy slots = ~33/slot, well under any threshold.
- `shouldFire` already gates: only rules whose `current_price` crossed trigger get to the histogram-fetch step. Most rules won't fire on most ticks.
- Histogram results auto-write to `current_prices` (already does this) — bonus side effect, current_prices gets fresher.

**Option B (rejected): Batch precompute every 15min for all enabled rules.**
- Cost: histogram for every enabled rule, every cron tick, regardless of whether it fires. Wasteful.
- Benefit: faster fire path (no inline fetch).
- Verdict: not worth the proxy budget. Rejected.

**Option C (future, post-1k rules): Tiered cache.**
- If rule load grows beyond 200 active rules, add a 2-min in-memory cache keyed by `(market_hash_name, currency_id)`. Multiple rules on the same item in the same cron tick share one fetch. This is a P9 optimization — not needed for P3.5.

### 2.3 Cookies / session

- **No `steamLoginSecure` needed.** Public endpoint. Confirmed in existing code.
- **No `webTradeEligibility` needed.** That's for trade/listing actions, not market reads.
- **Region quirk:** `country=US` is hardcoded. Histogram prices come back in the requested `currency`, regardless of country. Country may affect tax-display but not the integer values we use. Safe.

### 2.4 Failure modes

| Failure | Response | Engine action |
|---|---|---|
| HTTP 429 | Status 429, body irrelevant | `HISTOGRAM_FETCH_FAILED` → defer fire to next 15min cron tick. Do NOT fall back to placeholder. proxyPool already increments adaptive gap. |
| HTTP 503 / 502 (Steam maintenance) | Status 5xx | Same as 429: defer. |
| Empty body / non-JSON | parse error | Defer (treat as transient). |
| `success != 1` in JSON | Steam returned valid JSON but with failure flag | Defer. May indicate item delisted or temporary issue. |
| Both `lowest_sell_order=0` and `highest_buy_order=0` | Dead market | `HISTOGRAM_EMPTY_DEAD_MARKET` — refuse fire entirely (don't even fall back to 0.99x — no liquidity = no point listing). |
| `lowest_sell_order=0`, `highest_buy_order>0` | No sellers, buyers exist | Fall back to `currentPrice * 0.99` + log. Listing high is rational; first seller sets the price. |
| Network timeout (10s) | `proxyRequest` throws | Defer. |
| `item_nameid` resolution returns null | Item not in seed/DB and scrape failed | Refuse with `ITEM_NAMEID_UNRESOLVED` — likely a banned/delisted item. Notify user. |

**Defer = leave rule in `enabled=true` state, don't insert execution row, log the attempt. The next 15-min cron will retry.** This is safer than guessing a price.

---

## 3. Strategy Logic — the new `computeMarketMaxListPrice`

```
Input: rule (AutoSellRule), currentPriceUsd (number)
Output: { intendedListPriceUsd: number, refusalReason: string | null }
```

### 3.1 Happy path

1. Resolve `walletCurrencyId` from `rule.account_id` → `steam_accounts.wallet_currency`. Default to `1` (USD) if null.
2. Call `fetchHistogramPrice(rule.market_hash_name, walletCurrencyId)` (existing function).
3. If returns null → `HISTOGRAM_FETCH_FAILED`, defer.
4. Extract `topSellInWallet = histo.lowestSellOrder` (cents in wallet currency).
5. If `topSellInWallet == 0`:
   - If `histo.highestBuyOrder > 0` → fallback to `currentPriceUsd * 0.99`, log `HISTOGRAM_EMPTY_FALLBACK`, continue (this is OK).
   - Else → refuse with `HISTOGRAM_EMPTY_DEAD_MARKET`.
6. Decrement: `intendedInWallet = topSellInWallet - getMinUndercutUnit(walletCurrencyId)`.
7. Convert back to USD: `intendedUsdCents = intendedInWallet / exchangeRate(walletCurrencyId)` (use `getExchangeRate`, reverse direction). Round to integer cents.
8. Apply existing MIN guard: if `intendedUsdCents / 100 < currentPriceUsd * 0.5` → already-existing `MIN_PRICE_MULTIPLIER` refusal layer in `fireRule()` will catch this. Don't duplicate.
9. **NEW MAX ceiling:** if `intendedUsdCents / 100 > currentPriceUsd * 1.2` → `INTENDED_ABOVE_MAX_CEILING`, refuse. Catches thin-book scenarios where the only seller is asking 3x median; undercutting them by 1¢ still lists at 3x median, our user gets confused, listing sits.
10. Pass the pattern-sensitive refusal layer (§4 — biggest source of complexity).
11. Return `{ intendedListPriceUsd: intendedUsdCents / 100, refusalReason: null }`.

### 3.2 Worked example

User has rule on `AK-47 | Redline (Field-Tested)`, account wallet = UAH (id=18, minUnit=100 = 1 hryvnia).

- Histogram returns `lowest_sell_order = 41200` (412.00 UAH).
- `intendedInWallet = 41200 - 100 = 41100` (411.00 UAH).
- `exchangeRate(18) ≈ 41.5` (i.e., 1 USD = 41.5 UAH).
- `intendedUsdCents = round(41100 / 41.5) = round(990.36) = 990` cents = $9.90.
- Currentprice (from `current_prices` USD) = $9.95.
- Ratio 0.995 — passes MIN (0.5x) and MAX (1.2x). OK.
- Final intended list price for `createOperation`: `$9.90` (passed in as USD; `sellOperations` converts back to UAH wallet currency at sell time and re-applies undercut math via existing `quickSellPrice` chain).

**Note:** There's a double-conversion path here (USD → wallet for histogram → USD back to engine → wallet again at sell-time). It's lossy by a few minor units but acceptable. Alternative is to pass wallet-cents directly through `auto_sell_executions.intended_list_price_usd` (rename to `intended_list_price_minor` + currency_id) — schema change, deferred.

### 3.3 Failure mode summary

| Outcome | Engine action | User push |
|---|---|---|
| Happy path | `auto_list` proceeds with calculated price | "Listing X for $Y in 60s. Tap Undo." |
| Histogram fetch failed | Defer (no execution row) | None — silent retry next tick |
| Histogram dead market | Refuse, downgrade to `notify_only` | "X has no live sellers/buyers — refused to auto-list" |
| Histogram empty sellers (buyers exist) | Fallback to 0.99x, log | "Listing X for $Y in 60s (no live sellers, priced from market average)" |
| MIN floor breach | Existing handler downgrades to `notify_only` | (existing message) |
| MAX ceiling breach | Refuse, downgrade to `notify_only` | "X top-of-book is suspiciously high vs market — refused. Review thin order book before re-arming." |
| Pattern-sensitive item | Refuse, downgrade to `notify_only` | (see §4 per-case copy) |

---

## 4. Edge Cases — Domain Knowledge (the actual value of this spec)

These are what `currentPrice * 0.99` accidentally protects against (because it's based on aggregate price, which is dampened toward the mean). Histogram top-of-book exposes them. **Without this section, P3.5 ships a regression vs P3.**

### 4.1 Doppler / Gamma Doppler / Marble Fade — pattern-locked phases

**Problem:** `market_hash_name` is `★ Karambit | Doppler (Factory New)`. The histogram returns one number — the cheapest sell order across **all phases**: Phase 1, 2, 3, 4, Ruby, Sapphire, Black Pearl. The cheapest is almost always Phase 4 (or Phase 2 for some weapons), which is the least desirable.

**Real numbers (rough):**
- Karambit Doppler P4 FN: ~$700
- Karambit Doppler P3 FN: ~$650
- Karambit Doppler P1 FN: ~$900
- Karambit Doppler **Ruby** FN: ~$3500
- Karambit Doppler **Sapphire** FN: ~$5500
- Karambit Doppler **Black Pearl** FN: ~$2800

If user has a Sapphire and `market_max` lists at top-of-book minus 1¢, they'll list a $5500 knife at ~$650. **The MIN guard (0.5x of `currentPrice`) won't catch this** because `currentPrice` from `current_prices` is the same name-scoped aggregate — it's also pulled from histogram. The guard floors at $325 vs intended $650 — passes MIN, sells the Sapphire for 12% of value.

**Solution: refuse `market_max` for any item whose `market_hash_name` matches a Doppler/Gamma Doppler pattern.**

```
DOPPLER_PATTERNS = [
  /\| Doppler \(/,
  /\| Gamma Doppler \(/,
  /Glock-18 \| Gamma Doppler/,
]
```

Any rule with `sell_strategy='market_max'` AND match → **engine refuses fire** with `PATTERN_SENSITIVE_ITEM` (downgrade to notify_only with explanatory message). Push: "Doppler items have multiple phases priced very differently. `market_max` is unsafe. Use `fixed` price strategy and check your specific phase."

**Better long-term:** P9 introduces `pattern_filter` column on rules, lets user say "only fire on phase=Sapphire" or "only fire on patterns 415,419,...". Out of scope for P3.5.

### 4.2 Marble Fade special patterns

`★ Karambit | Marble Fade (Factory New)` — base ~$2000. But specific patterns:
- "Fire & Ice" (FFI): patterns 412, 359, etc. → ~$8000–$15000
- "Max Red": ~$3000
- "Max Blue/Yellow": ~$2500

Same problem: histogram top-of-book is ~$2000. User with FFI gets ripped.

**Solution:** Same pattern-list refusal. Add Marble Fade to refused names:
```
/\| Marble Fade \(/   // for knives only — no impact on Glock | Marble Fade etc.
```

Actually — Glock | Marble Fade also has patterns but the spread is much smaller (~5% premium). Knife Marble Fade is the high-stakes case. Recommendation: refuse Marble Fade for **knife skins only** (`★ ` prefix, including stripped-skin variants like `★ StatTrak™`).

### 4.3 Case Hardened — Blue Gem patterns

`AK-47 | Case Hardened (Factory New)` — base ~$120. But:
- Tier 1 Blue Gem (pattern 661): ~$8000+
- Tier 2 (pattern 670, 321): ~$3000
- Tier 3: ~$800

Same disaster as Doppler.

**Solution:** Refuse `market_max` for Case Hardened entirely.
```
/\| Case Hardened \(/
```

This catches AK-47, Karambit, Five-SeveN, Bayonet, Butterfly, all Case Hardened variants. All have blue-gem patterns.

### 4.4 Fade — fade percentage premium

`Glock-18 | Fade (Factory New)` — base ~$300. But:
- 100% Fade: ~$700
- 95–99% Fade: ~$450
- 80–90% Fade: ~$300

Karambit Fade similar but more extreme: $1500 base, 100% Fade ~$3500.

**Solution:** Refuse `market_max` for any `| Fade (` named item.
```
/\| Fade \(/
```

Note: there are also lookalike names that include "Fade" — e.g. `| Asiimov`, `| Crimson Web` don't, but `| Sun in Leo` doesn't either. Pattern matching on " | Fade " with the spaces and pipe is precise enough.

### 4.5 Crimson Web / Stained — web density

Crimson Web on knives has 1-web through 5-web variants. 5-web = "Trip Web" = 2x base. 100% Crimson (very rare) = 4x base.

Stained, Forest DDPAT, etc. — similar pattern-sensitive.

**Solution:** Refuse `market_max` for these knife-specific finishes.
```
/\| Crimson Web \(/
/\| Stained \(/
/\| Forest DDPAT \(/
/\| Slaughter \(/  // Karambit Slaughter has pattern variants, less extreme but still
```

For pistols/rifles with these names, the pattern variance is much smaller. To keep refusal narrow, only apply when `★ ` (knife) prefix is present:

```
isPatternSensitive(mhname):
  if matches DOPPLER_PATTERNS: return true
  if matches CASE_HARDENED_PATTERN: return true
  if matches FADE_PATTERN: return true
  if mhname startsWith "★ " (knife) and matches MARBLE_FADE/CRIMSON_WEB/STAINED: return true
  return false
```

### 4.6 Stickered items — value above the gun

A stock `AK-47 | Vulcan (Factory New)` is ~$120. With 4× **Crown Foil** stickers applied (each ~$200): the gun sells for ~$700 in some cases. Histogram returns ~$120 (bare gun's top-of-book). Listing the stickered version at $119.99 is a loss of $580.

**Problem:** We don't have sticker valuation data on the backend yet. The Steam description only tells us sticker NAMES; pricing requires Buff/CSFloat lookup.

**Pragmatic solution for P3.5:** at fire time, query the actual asset's sticker count from `inventory_items.stickers` (existing JSONB column). If the asset has **any** sticker applied with **scrape % = 0** (pristine), refuse the fire with `HIGH_VALUE_STICKER`. Push: "Item has pristine stickers that may multiply its value. `market_max` is name-scoped and ignores stickers. Use `fixed` strategy."

**Why pristine-only:** scraped stickers are usually worth $0–$1 (they got scratched, value evaporated). Pristine = potentially valuable. Without sticker price API, "any pristine sticker" is a conservative default. False positives (cheap pristine stickers like a $0.10 standard team logo) acceptable — user just sees explanation in push, can switch to `fixed` strategy.

**Better long-term:** P10 sticker pricing service (CSFloat sticker prices API + cache). Refusal threshold becomes `sum(pristine sticker prices) > $5` or similar. Out of scope here.

**Souvenir caveat:** Souvenir items have stickers baked in (4 player + 1 team + 1 tournament + 1 map = up to 7 stickers, all pristine, can't be removed). If we apply the "pristine sticker → refuse" rule literally, ALL Souvenir items get refused for `market_max`. This is **probably correct** — Souvenir items have wildly variable price by player/MVP-status (s1mple Cologne 2016 MVP Souvenir AWP Dragon Lore = $1.5M+; the same skin with no-name stickers = $40k+). Histogram top-of-book is the cheap one. Refuse all Souvenir items. Add a check: `mhname.includes("Souvenir ")` → refuse with `HIGH_VALUE_STICKER` reason.

### 4.7 Float-sensitive items — low-float trophies

A regular `AWP | Asiimov (Field-Tested)` with float 0.30 sells around $80. The same skin at float 0.18 (technically still FT but visually clean) sells for $130. At float 0.16 (the very edge of FT range — "low-float FT trophy") it can sell for $200+.

Histogram top-of-book is the median float. Listing a 0.16-float gun at $79.99 leaves $120+ on the table.

**Problem:** Same as stickers — need float data per asset. Existing `inventory_items.float_value` (NUMERIC) column has it (when CSFloat enrichment ran). When null (never enriched), we have to assume worst case.

**Pragmatic solution for P3.5:** at fire time, query asset's `float_value`. Apply tier-aware threshold:

| Wear tier | Float range | "Trophy" threshold (float ≤) | Logic |
|---|---|---|---|
| FN | 0.00–0.07 | 0.005 | "True FN" — premium tier |
| MW | 0.07–0.15 | 0.075 | Just-into-MW — almost-FN visual |
| FT | 0.15–0.38 | 0.16 | Low-FT — almost-MW visual |
| WW | 0.38–0.45 | 0.38 | Just-into-WW — almost-FT visual |
| BS | 0.45–1.00 | 0.46 | Just-into-BS — almost-WW visual |

If `float_value` is below the trophy threshold for its tier → refuse with `LOW_FLOAT_TROPHY`. Push: "This item has an unusually low float (X.XXX) which significantly increases value vs market average. Use `fixed` strategy."

If `float_value` is null (never enriched) → conservative path: don't refuse on float alone, but **add a soft warning to the notify-only / cancel-window push body**: "Float data unavailable — verify the asset before listing."

**Edge case — capped floats:** Some skins have inherently capped float ranges (e.g., Karambit Marble Fade max float ≈ 0.08 — always FN). Trophy threshold 0.005 still meaningful inside that range, so logic works. **No change needed for capped-float items, just be aware.**

### 4.8 Souvenir vs StatTrak

Both prefixes are part of `market_hash_name`:
- `StatTrak™ AK-47 | Redline (Field-Tested)` — distinct mhname from `AK-47 | Redline (Field-Tested)`. Histogram for one ≠ histogram for other. **No issue.**
- `Souvenir AWP | Dragon Lore (Factory New)` — distinct mhname. **But:** Souvenir items have heterogeneous baked-in stickers (different tournaments, different players, different MVP states), making name-scoped histogram useless even though it's already Souvenir-specific. Covered by §4.6 Souvenir refusal.

**StatTrak items can also have sticker overlay**, so combine §4.6 sticker check + §4.7 float check normally. No StatTrak-specific refusal needed.

### 4.9 Trade lock

Not a histogram concern, but flag for completeness: tradable=FALSE items already filtered in `executeListing`'s SQL query. Trade-locked items will be skipped at listing time, not at evaluation. No change needed.

### 4.10 Currency conversion edge case

User wallet = JPY (decimals=0, minUnit=1, but each unit is ~$0.0067).
- Histogram returns `lowest_sell_order = 1500` (¥1500 for an AK Redline).
- `intendedInWallet = 1500 - 1 = 1499` (¥1499).
- `intendedUsdCents = 1499 / 150 (rate) ≈ 10` cents.
- Doesn't cleanly round. Acceptable — user's actual list will be in JPY at sell-time.

User wallet = UAH (decimals=2, minUnit=100 = 100 kopecks = 1 hryvnia).
- minUnit really IS 100 — Steam refuses listings at 0.01 UAH precision, only whole hryvnias.
- This is already correctly captured in `getMinUndercutUnit`. Confirmed working in existing `quickSellPrice`.

---

## 5. Implementation Phases — Tasks for backend-dev

| # | Task | Est | Depends on |
|---|------|-----|------------|
| P3.5.T1 | Verify `steam_item_nameids` table + `seedItemNameIds()` running on staging. Query `SELECT COUNT(*) FROM steam_item_nameids` ≥1000 | 0.5h | — |
| P3.5.T2 | Add `computeMarketMaxListPrice(rule, currentPrice)` in `autoSellEngine.ts` — wraps `fetchHistogramPrice` with currency resolution + undercut math + USD round-trip. Pure async function, exportable for unit test. | 2h | T1 |
| P3.5.T3 | Wire `computeMarketMaxListPrice` into `computeIntendedListPrice` flow. Note: the current sync `computeIntendedListPrice` becomes async (or `market_max` branches into a separate async helper called from `fireRule`). Update tests for any signature change. | 1h | T2 |
| P3.5.T4 | Implement pattern-sensitive refusal (`isPatternSensitiveItem(mhname)`). Pure function, regex-based, ~10 lines. Unit-tested with table of 30+ mh_names from §4. | 1.5h | — |
| P3.5.T5 | Implement sticker-pristine refusal (`hasHighValueStickers(asset)`). Reads `inventory_items.stickers` JSONB. Refuse if any sticker has `wear=0` (pristine). Souvenir prefix check. | 1.5h | — |
| P3.5.T6 | Implement float-trophy refusal (`isLowFloatTrophy(asset)`). Reads `inventory_items.float_value`. Tier-aware threshold per §4.7. | 1h | — |
| P3.5.T7 | Wire all three refusal layers into `fireRule` BEFORE the histogram fetch — cheap rejects first (string/JSONB lookups, no Steam API). Order: pattern → sticker → float → histogram. | 1h | T4, T5, T6, T3 |
| P3.5.T8 | Extend refusal taxonomy: 6 new `refusalReason` codes (§6) wired through to push body and `auto_sell_executions.error_message`. | 1h | T7 |
| P3.5.T9 | Unit tests: `computeMarketMaxListPrice` (mock httpx), pattern matcher (table-driven), sticker check (3 stickered fixtures), float check (5 float fixtures across tiers). | 4h | T2, T4, T5, T6 |
| P3.5.T10 | Integration test: end-to-end `market_max` rule fires → histogram mocked → expected refusalReason or expected price. 5 scenarios: happy path, dead market, empty sellers (fallback), pattern-sensitive (refuse), histogram 429 (defer). | 3h | T7 |
| P3.5.T11 | Observability: log `auto_sell_market_max_resolved` with `{ruleId, walletCurrency, topSellWallet, intendedUsd, refusalReason}`. Add to `/api/admin/auto-sell-stats`: counters for each refusalReason. | 1.5h | T8 |
| P3.5.T12 | Documentation: extend `backend/docs/auto-sell.md` with §market_max behavior. List the refused-name pattern table for support team. | 1h | T11 |
| P3.5.T13 | Staging soak: enable for 1 internal user with 5 rules, run for 24h, review logs. | 0.5h (calendar — async) | T11 |

**Total: ~19h ≈ 2.5d execution + 0.5d buffer = 3d.**

(Symmetric with P3 itself — pattern refusal layer is the bulk of the work, not the histogram plumbing.)

---

## 6. Refusal Taxonomy — New Codes

Set as `auto_sell_executions.error_message` and as the `refusalReason` argument to existing `sendNotifyOnlyPush`. Engine downgrades from `auto_list` to `notified` mode.

| Code | When | Push body | Dashboards |
|---|---|---|---|
| `HISTOGRAM_FETCH_FAILED` | Histogram returned 429/5xx/timeout/null | (no push — defer silently, retry next cron tick) | Counter: `auto_sell.market_max.fetch_failed` — alert if >5% of fires |
| `HISTOGRAM_EMPTY_DEAD_MARKET` | Both `lowest_sell_order=0` AND `highest_buy_order=0` | "{name} has no live market — refused to auto-list. Re-arm when liquidity returns." | Counter — useful for spotting delisted items |
| `HISTOGRAM_EMPTY_FALLBACK` | `lowest_sell_order=0` but `highest_buy_order>0` | "Listing {name} for ${price} (no live sellers — priced from market average)." (NB: this is a fallback success, not a refusal — but log it) | Counter — informational, no alert |
| `INTENDED_BELOW_MIN_FLOOR` | Existing — `MIN_PRICE_MULTIPLIER` (0.5x) catches it. No change. | (existing) | (existing) |
| `INTENDED_ABOVE_MAX_CEILING` | NEW — `intended > currentPrice * 1.2`. Suspect thin book. | "{name} top-of-book is much higher than median — refused to auto-list. Review the order book before re-arming." | Counter |
| `PATTERN_SENSITIVE_ITEM` | mh_name matches Doppler/Marble Fade/Case Hardened/Fade/Crimson Web/etc. | "{name} has pattern-specific value (e.g., Doppler phases, Blue Gems, Fade %). `market_max` is name-scoped and may significantly underprice your specific copy. Use `fixed` strategy." | Counter — useful for sizing P9 pattern_filter feature demand |
| `HIGH_VALUE_STICKER` | Asset has any pristine sticker, OR is Souvenir variant | "{name} has stickers that may multiply its value — `market_max` ignores stickers. Use `fixed` strategy." | Counter |
| `LOW_FLOAT_TROPHY` | Asset's `float_value` below tier-trophy threshold (§4.7) | "{name} has an unusually low float ({float}) — value above market average. `market_max` ignores float trophies. Use `fixed` strategy." | Counter |
| `ITEM_NAMEID_UNRESOLVED` | `fetchItemNameId` returned null (not in seed/DB, scrape failed) | "Unable to look up {name} on Steam Market. May be delisted or unsupported. Rule disabled." | Counter — alert if >1/day |

All codes prefixed `AS_` if a flat namespace is preferred (e.g., `AS_PATTERN_SENSITIVE_ITEM`). Codename style matches existing `SESSION_EXPIRED`, `TOKEN_EXPIRED`, `PRICE_UNAVAILABLE_AT_LISTING` patterns in the codebase.

---

## 7. Out of Scope

Explicitly NOT in P3.5. Backend-dev should not attempt these:

- **Buy-order undercutting / "list above current buy floor" strategy.** Future strategy `place_above_buy` — separate spec.
- **Sticker pricing data source.** Need Buff/CSFloat sticker API integration. Until then, "any pristine sticker → refuse" is the heuristic. P10.
- **Float ranking integration (CSFloat float DB).** Currently we have per-asset float in `inventory_items.float_value` but no global "this is the top 1% of floats for this skin" ranking. Tier-edge threshold is the heuristic. P10/P11.
- **Pattern-aware fire (e.g., "only fire on Phase 1, not Phase 4").** Requires schema change (`auto_sell_rules.pattern_filter` JSONB). P9.
- **Per-rule strategy override** (e.g., user explicitly opts into `market_max` despite Doppler warning). P9.
- **Multi-currency arbitrage** (read histogram in EUR but list in USD wallet). For P3.5, rule fires in account's wallet currency, no cross-currency.
- **Buy-side liquidity check beyond simple count > 0.** Future spec for "minimum 5 buy orders within 10% of intended price" sanity check.
- **Histogram caching across rules in same cron tick.** P9 optimization, not needed at current rule volume.
- **Native push actions** (one-tap "Undo" from notification). Per P3 §2.4, in-app actions only.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Histogram rate limit triggers IP block | Low | High (blocks all market reads) | Reuse existing `proxyPool` AIMD backoff and 3-slot rotation. Rules fire infrequently (most ticks have 0 fires). 429 already incremental, not catastrophic. |
| Pattern refusal incorrectly opts out a high-volume item | Medium | Low (user falls back to `fixed`, slight UX friction) | Pattern list narrow — only known sensitive families. Audit log shows refusals; if a popular item is repeatedly refused, narrow the regex. Unit tests prevent regression. |
| Bug lists $500 knife at $0.01 | Low | Catastrophic | Three-layer defense: (1) MIN guard (0.5x) in `fireRule`. (2) MAX guard (5x) in `sellOperations.processOperation` (existing). (3) Mid-window drift recheck (30%, existing). Manual test: insert a stub histogram returning `lowest_sell_order=1` for a $500 item, verify MIN guard fires. (See §9.) |
| Sticker-pristine refusal false-positive on cheap stickers | Medium | Low (user gets refusal, adjusts) | Conservative for now (any pristine = refuse). Push body explains; user can switch strategy. P10 fixes properly. |
| Float-trophy threshold off (refuses borderline-trophy items unnecessarily, OR misses real trophies) | Medium | Medium | Initial thresholds in §4.7 conservative. Monitor `auto_sell.market_max.refused_low_float` counter; if ratio of refused-vs-fired diverges from expected ~5%, tune. |
| Histogram returns wallet-currency price but `convertUsdToWallet`/`getExchangeRate` rates are stale (1h cache) | Low | Low | Round-trip error <1% in normal conditions. MAX ceiling guard (1.2x) catches gross errors. |
| `fetchHistogramPrice` already writes to `current_prices` — could create feedback loop where current_prices reflects only listings checked by auto-sell rules, not the broader market | Low | Low | Existing `priceJob` 15-min crawler also writes to `current_prices`. Auto-sell adds a few hundred writes/day; crawler does ~50k. No skew. |
| Newly released skin not in `steam_item_nameids` seed AND scrape fails on first attempt (rate limited) | Medium | Low | Refuse with `ITEM_NAMEID_UNRESOLVED`; next cron tick retries scrape. Most rules created on items that already exist in seed. Edge case is real but minor. |
| User has a Sapphire Doppler, creates a `fixed`-strategy rule, later edits strategy to `market_max`. Sticker/pattern check refuses but user is confused why it worked before. | Low | Low | Explanatory push body links to in-app help. Future: warn at edit-time in Flutter UI before user saves the strategy change. |

---

## 9. Verification Tests Backend-Dev Must Run

Before merging:

1. **Manual: thin-book item.** Find a low-volume skin, query histogram, verify our refusal logic kicks in with a thin-book MAX ceiling breach. Example candidates: niche StatTrak items. Document one in test fixtures.
2. **Manual: pattern refusal table.** Run `isPatternSensitiveItem` against fixtures including "AK-47 | Redline (FT)" (pass), "★ Karambit | Doppler (FN)" (refuse), "AK-47 | Case Hardened (MW)" (refuse), "AWP | Asiimov (FT)" (pass), "★ Glock-18 | Fade (FN)" (refuse — note Glock isn't a knife but Fade is sensitive on it too — small premium spread but still real), "Glock-18 | Marble Fade (FN)" (PASS — non-knife marble fade is borderline; conservative: pass for now, narrow refusal to knives only).
3. **Manual: $500 knife at $0.01 stress test.** Insert a fake histogram returning `lowest_sell_order=100` (=$1) for a Karambit. Run rule. Verify MIN guard fires before pattern guard (defense in depth: even if pattern guard had a bug, MIN guard catches; even if MIN guard had a bug, MAX in sellOperations catches; even if all three had bugs, Steam itself rejects sells <$0.03 minimum).
4. **Soak test (T13):** 5 rules on staging account for 24h. Eyeball logs.

---

## 10. Notes for Future Iterations (P9/P10)

- Add `pattern_filter` JSONB to `auto_sell_rules`. UI: phase picker for Doppler, "Only fire if pattern in [list]" for Case Hardened.
- Add sticker pricing service (CSFloat sticker API). Replace "any pristine = refuse" with "value > threshold = refuse".
- Add float-rank lookup. Replace tier-edge threshold with "this asset is in top X% of floats for its skin = refuse (or surface premium suggestion)".
- Cache histogram per `(mhname, currency)` for 2min in-memory — saves duplicate fetches when multiple rules hit the same item.
- **Reverse use case:** P11 "buy alert" — if `market_max` would refuse with `LOW_FLOAT_TROPHY`, surface that as **information** ("Your asset is more valuable than market average — list higher manually") rather than refusal. Same data, different framing.
