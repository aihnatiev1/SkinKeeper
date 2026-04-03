/**
 * Steam page data extraction using the onreset trick (same as CSGO Trader).
 *
 * How it works:
 * 1. Create a <div>, set onreset="..." with JS code
 * 2. Dispatch a reset event — handler runs in PAGE context (not content script)
 * 3. The code writes results to body.setAttribute('key', value)
 * 4. Content script reads body.getAttribute('key') synchronously
 * 5. Clean up the attribute
 *
 * This bypasses CSP because inline event handlers on dynamically created
 * elements are allowed, unlike <script> tags.
 */

// ─── Core: run JS in page context via onreset trick ───────────────────

function runInPage(script: string, resultKey: string): string | null {
  const div = document.createElement('div');
  div.setAttribute('onreset', script);
  div.dispatchEvent(new CustomEvent('reset'));
  div.removeAttribute('onreset');
  div.remove();

  const result = document.body.getAttribute(resultKey);
  if (result !== null) document.body.removeAttribute(resultKey);
  return result;
}

function runInPageJSON<T>(script: string, resultKey: string): T | null {
  const raw = runInPage(script, resultKey);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ─── Steam Page Variables ─────────────────────────────────────────────

export function getSteamID(): string | null {
  return runInPage(
    `document.body.setAttribute('sk_steamid', typeof g_steamID !== 'undefined' ? g_steamID : '');`,
    'sk_steamid'
  );
}

export function getSessionID(): string | null {
  return runInPage(
    `document.body.setAttribute('sk_sessionid', typeof g_sessionID !== 'undefined' ? g_sessionID : '');`,
    'sk_sessionid'
  );
}

export function getWalletInfo(): { currency: number; wallet_currency: number; country: string } | null {
  return runInPageJSON(
    `document.body.setAttribute('sk_wallet', JSON.stringify(typeof g_rgWalletInfo !== 'undefined' ? g_rgWalletInfo : null));`,
    'sk_wallet'
  );
}

export function getWalletCurrency(): number {
  const wallet = getWalletInfo();
  return wallet?.wallet_currency || wallet?.currency || 1;
}

/** Get currency code string using Steam's own GetCurrencyCode() */
export function getWalletCurrencyCode(): string | null {
  const wallet = getWalletInfo();
  if (!wallet) return null;
  const currId = wallet.wallet_currency || wallet.currency;
  if (!currId) return null;
  return runInPage(
    `document.body.setAttribute('sk_currency_code', typeof GetCurrencyCode !== 'undefined' ? GetCurrencyCode(${currId}) : '');`,
    'sk_currency_code'
  );
}

// ─── Inventory Items ──────────────────────────────────────────────────

export interface SteamItem {
  assetid: string;
  classid: string;
  instanceid: string;
  appid: string;
  name: string;
  market_hash_name: string;
  icon_url: string;
  tradable: boolean;
  marketable: boolean;
  type: string;
  rarity?: string;
  rarityColor?: string;
  inspectLink?: string;
  stickers?: Array<{ name: string; slot: number; wear?: number; icon_url?: string }>;
  casketItemCount?: number;
  // Data from m_rgAssetProperties (available without API!)
  floatValue?: number;
  paintSeed?: number;
  paintIndex?: number;
  defindex?: number;
  nameTag?: string;
  // Parsed from descriptions
  tradeLockDate?: string;   // ISO date string
  isStatTrak?: boolean;
  isSouvenir?: boolean;
}

/**
 * Read CS2 inventory items from g_ActiveInventory using UserYou.getInventory()
 */
export function readInventoryFromPage(): SteamItem[] {
  const script = `
    var items = [];
    try {
      var inv = UserYou.getInventory(730, 2);
      if (inv && inv.m_rgAssets) {
        // Properties live on INVENTORY object, not on each asset!
        // inv.m_rgAssetProperties[assetid] = [{propertyid, float_value, int_value, string_value}, ...]
        var allProps = inv.m_rgAssetProperties || {};

        for (var key in inv.m_rgAssets) {
          var a = inv.m_rgAssets[key];
          if (!a || !a.description) continue;
          var d = a.description;
          var item = {
            assetid: a.assetid,
            classid: d.classid || '',
            instanceid: d.instanceid || '',
            appid: (d.appid || 730).toString(),
            name: d.name || '',
            market_hash_name: d.market_hash_name || d.name || '',
            icon_url: d.icon_url || '',
            tradable: d.tradable == 1,
            marketable: d.marketable == 1,
            type: d.type || '',
            stickers: [],
            isStatTrak: (d.type || '').indexOf('StatTrak') !== -1,
            isSouvenir: (d.type || '').indexOf('Souvenir') !== -1
          };
          if (d.tags) {
            for (var i = 0; i < d.tags.length; i++) {
              if (d.tags[i].category === 'Rarity') {
                item.rarity = d.tags[i].localized_tag_name;
                item.rarityColor = d.tags[i].color || '';
              }
            }
          }
          if (d.actions) {
            for (var i = 0; i < d.actions.length; i++) {
              if (d.actions[i].link && d.actions[i].link.indexOf('csgo_econ_action_preview') !== -1) {
                item.inspectLink = d.actions[i].link
                  .replace('%assetid%', a.assetid)
                  .replace('%owner_steamid%', typeof g_steamID !== 'undefined' ? g_steamID : '');
              }
            }
          }
          // ── Extract float, paint_seed, paint_index from inv.m_rgAssetProperties ──
          // Exact same approach as CSGO Trader — properties are on inventory, keyed by assetid
          var props = allProps[a.assetid];
          if (props && Array.isArray(props)) {
            for (var pi = 0; pi < props.length; pi++) {
              var p = props[pi];
              if (!p) continue;
              if (p.propertyid === 1 && p.int_value) item.paintSeed = parseInt(p.int_value);
              if (p.propertyid === 2 && p.float_value) item.floatValue = parseFloat(p.float_value);
              if (p.propertyid === 3 && p.int_value) item.paintIndex = parseInt(p.int_value);
              if (p.propertyid === 5 && p.string_value) item.nameTag = p.string_value;
            }
          }
          // Fallback paint_index from app_data
          if (!item.paintIndex && d.app_data && d.app_data.paint_index) {
            item.paintIndex = parseInt(d.app_data.paint_index);
          }
          if (d.descriptions) {
            var stickers = [];
            for (var i = 0; i < d.descriptions.length; i++) {
              var desc = d.descriptions[i];
              if (desc.value && desc.value.indexOf('sticker_info') !== -1) {
                var names = desc.value.match(/Sticker: ([^<]+)/);
                if (names && names[1]) {
                  var stickerNames = names[1].split(', ');
                  for (var j = 0; j < stickerNames.length; j++) {
                    stickers.push({ name: stickerNames[j].trim(), slot: j });
                  }
                }
              }
              if (desc.value && desc.value.indexOf('Number of Items:') !== -1) {
                var m = desc.value.match(/Number of Items:\\\\s*(\\\\d+)/);
                if (m) item.casketItemCount = parseInt(m[1], 10);
              }
              // Extract trade lock date
              if (desc.value && (desc.value.indexOf('Tradable After') !== -1 || desc.value.indexOf('tradable after') !== -1)) {
                var dm = desc.value.match(/(?:Tradable|tradable)\\\\s+(?:After|after)\\\\s+(.+)/);
                if (dm) item.tradeLockDate = dm[1].trim();
              }
            }
            if (stickers.length) item.stickers = stickers;
          }
          // Trade lock from owner_descriptions
          if (!item.tradeLockDate && d.owner_descriptions) {
            for (var i = 0; i < d.owner_descriptions.length; i++) {
              var od = d.owner_descriptions[i];
              if (od.value && od.value.indexOf('Tradable After') !== -1) {
                var dm2 = od.value.match(/Tradable After (.+)/);
                if (dm2) item.tradeLockDate = dm2[1].trim();
              }
            }
          }
          items.push(item);
        }
      }
    } catch(e) {}
    document.body.setAttribute('sk_inventory', JSON.stringify(items));
  `;
  return runInPageJSON<SteamItem[]>(script, 'sk_inventory') || [];
}

/**
 * Trigger Steam to load ALL inventory pages (not just first 25)
 */
export function loadFullInventory(callback: () => void): void {
  const result = runInPage(
    `try {
      g_ActiveInventory.LoadMoreAssets(1000).done(function() {
        for (var i = 0; i < g_ActiveInventory.m_cPages; i++) {
          g_ActiveInventory.m_rgPages[i].EnsurePageItemsCreated();
          g_ActiveInventory.PreloadPageImages(i);
        }
        document.body.setAttribute('sk_loaded', 'true');
      });
    } catch(e) { document.body.setAttribute('sk_loaded', 'true'); }`,
    'sk_loaded'
  );

  if (result === 'true') {
    callback();
  } else {
    const check = setInterval(() => {
      const done = document.body.getAttribute('sk_loaded');
      if (done === 'true') {
        document.body.removeAttribute('sk_loaded');
        clearInterval(check);
        callback();
      }
    }, 1000);
    setTimeout(() => { clearInterval(check); callback(); }, 15000);
  }
}

// ─── Market Listing Data ──────────────────────────────────────────────

export interface MarketListing {
  listingid: string;
  price: number; // cents with fee
  fee: number;
  assetid: string;
  inspectLink: string;
}

export function readMarketListings(): { listings: MarketListing[]; assets: any } {
  const script = `
    document.body.setAttribute('sk_listings', JSON.stringify({
      listings: typeof g_rgListingInfo !== 'undefined' ? g_rgListingInfo : {},
      assets: typeof g_rgAssets !== 'undefined' ? g_rgAssets : {}
    }));
  `;
  const raw = runInPageJSON<{ listings: Record<string, any>; assets: any }>(script, 'sk_listings');
  if (!raw) return { listings: [], assets: {} };

  const listings: MarketListing[] = Object.entries(raw.listings).map(([id, l]: [string, any]) => ({
    listingid: id,
    price: (l.converted_price || 0) + (l.converted_fee || 0),
    fee: l.converted_fee || 0,
    assetid: l.asset?.id || '',
    inspectLink: l.asset?.market_actions?.[0]?.link
      ?.replace('%listingid%', id)
      ?.replace('%assetid%', l.asset?.id || '') || '',
  }));

  return { listings, assets: raw.assets };
}

// ─── Steam Price Formatting (use Steam's own functions) ───────────────

export function formatPriceViaSteam(cents: number): string | null {
  return runInPage(
    `try {
      document.body.setAttribute('sk_formatted', v_currencyformat(${cents}, GetCurrencyCode(g_rgWalletInfo.wallet_currency)));
    } catch(e) { document.body.setAttribute('sk_formatted', ''); }`,
    'sk_formatted'
  );
}

// ─── Bulk Price Loading ──────────────────────────────────────────────
// Primary: CSGO Trader CDN (one request, all items, free, no auth)
// Format: { "item_name": { last_24h: N, last_7d: N, last_30d: N, last_90d: N } }

const PRICE_CDN = 'https://prices.csgotrader.app/latest';
const CACHE_VERSION = 3; // Bump to invalidate stale caches

let bulkPrices: Record<string, any> | null = null;
let bulkPricesLoading = false;

/** Fetch JSON via background worker (bypasses CORS) */
function bgFetch<T>(url: string): Promise<T | null> {
  return chrome.runtime.sendMessage({ type: 'FETCH_JSON', url });
}

export async function loadBulkPrices(provider = 'steam'): Promise<Record<string, any>> {
  if (bulkPrices && Object.keys(bulkPrices).length > 10) return bulkPrices;

  // Check cache — but only if version matches
  try {
    const cached = await chrome.storage.local.get('sk_prices');
    if (
      cached.sk_prices &&
      cached.sk_prices._v === CACHE_VERSION &&
      cached.sk_prices._ts &&
      Date.now() - cached.sk_prices._ts < 60 * 60_000
    ) {
      bulkPrices = cached.sk_prices;
      console.log(`[SkinKeeper] Prices loaded from cache (${Object.keys(bulkPrices!).length - 2} items)`);
      return bulkPrices!;
    }
  } catch {}

  if (bulkPricesLoading) {
    await new Promise(r => setTimeout(r, 3000));
    return bulkPrices || {};
  }

  bulkPricesLoading = true;
  try {
    console.log('[SkinKeeper] Fetching prices from CDN...');
    const data = await bgFetch<any>(`${PRICE_CDN}/${provider}.json`);

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid price data from CDN');
    }

    // Validate format — check first entry has expected shape
    const firstKey = Object.keys(data).find(k => !k.startsWith('_'));
    if (firstKey) {
      const sample = data[firstKey];
      if (typeof sample !== 'object' || sample === null) {
        throw new Error(`Unexpected price format: ${typeof sample}`);
      }
    }

    bulkPrices = data;
    (bulkPrices as any)._ts = Date.now();
    (bulkPrices as any)._v = CACHE_VERSION;
    chrome.storage.local.set({ sk_prices: bulkPrices });
    console.log(`[SkinKeeper] Prices fetched: ${Object.keys(data).length} items`);
  } catch (err) {
    console.error('[SkinKeeper] Price fetch failed:', err);
    // Clear bad cache
    chrome.storage.local.remove('sk_prices');
    bulkPrices = {};
  }
  bulkPricesLoading = false;
  return bulkPrices!;
}

/**
 * Get item price in USD (or USD * exchangeRate).
 * CSGO Trader CDN format: { last_24h, last_7d, last_30d, last_90d }
 * Values are in USD (e.g. 12.34 = $12.34)
 */
export function getItemPrice(marketHashName: string, exchangeRate = 1): number {
  if (!bulkPrices || !bulkPrices[marketHashName]) return 0;
  const entry = bulkPrices[marketHashName];
  let price: number;
  if (typeof entry === 'number') {
    price = entry;
  } else if (typeof entry === 'object' && entry !== null) {
    price = entry.last_24h ?? entry.last_7d ?? entry.last_30d ?? entry.last_90d ?? entry.price ?? 0;
  } else {
    price = 0;
  }
  if (typeof price !== 'number' || isNaN(price) || price <= 0) return 0;
  return price * exchangeRate;
}

/**
 * Get raw price entry for detail panels (trend data)
 */
export function getItemPriceEntry(marketHashName: string): {
  last_24h: number | null;
  last_7d: number | null;
  last_30d: number | null;
  last_90d: number | null;
} | null {
  if (!bulkPrices || !bulkPrices[marketHashName]) return null;
  const e = bulkPrices[marketHashName];
  if (typeof e !== 'object' || e === null) return null;
  return {
    last_24h: e.last_24h ?? null,
    last_7d: e.last_7d ?? null,
    last_30d: e.last_30d ?? null,
    last_90d: e.last_90d ?? null,
  };
}

// ─── Exchange Rates ───────────────────────────────────────────────────

let exchangeRates: Record<string, number> | null = null;

export async function loadExchangeRates(): Promise<Record<string, number>> {
  if (exchangeRates) return exchangeRates;

  try {
    const data = await bgFetch<Record<string, number>>(`${PRICE_CDN}/exchange_rates.json`);
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      exchangeRates = data;
      return exchangeRates;
    }
  } catch (err) {
    console.error('[SkinKeeper] Exchange rates fetch failed:', err);
  }
  exchangeRates = { USD: 1 };
  return exchangeRates;
}

// ─── Steam Market Sell API ────────────────────────────────────────────

/**
 * List an item for sale on Steam Community Market via page context.
 * Price is in cents — what the SELLER receives after fees.
 */
export function sellItemOnMarket(assetId: string, priceCents: number): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const resultKey = `sk_sell_${assetId}`;
    const script = `
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/market/sellitem/', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            try {
              var r = JSON.parse(xhr.responseText);
              document.body.setAttribute('${resultKey}', JSON.stringify({
                success: r.success === true,
                message: r.message || (r.success ? 'Listed' : 'Failed')
              }));
            } catch(e) {
              document.body.setAttribute('${resultKey}', JSON.stringify({
                success: false, message: 'Parse error: ' + xhr.status
              }));
            }
          }
        };
        xhr.send('sessionid=' + g_sessionID + '&appid=730&contextid=2&assetid=${assetId}&amount=1&price=${priceCents}');
      } catch(e) {
        document.body.setAttribute('${resultKey}', JSON.stringify({
          success: false, message: e.toString()
        }));
      }
    `;

    runInPage(script, ''); // fire and forget the script

    // Poll for result
    const check = setInterval(() => {
      const raw = document.body.getAttribute(resultKey);
      if (raw) {
        document.body.removeAttribute(resultKey);
        clearInterval(check);
        try { resolve(JSON.parse(raw)); }
        catch { resolve({ success: false, message: 'Unknown error' }); }
      }
    }, 200);

    setTimeout(() => { clearInterval(check); resolve({ success: false, message: 'Timeout' }); }, 15000);
  });
}

/**
 * Calculate what buyer pays given what seller wants to receive.
 * Steam fee: 5% (min 1¢), CS2 game fee: 10% (min 1¢)
 */
export function calcBuyerPrice(sellerReceivesCents: number): number {
  // Reverse calculation: buyer_price - steam_fee - game_fee = seller_receives
  // Approximate: buyer_price ≈ seller_receives / (1 - 0.05 - 0.10) = seller / 0.85
  // Then verify with exact fee calc
  let buyerPrice = Math.round(sellerReceivesCents / 0.85);

  // Adjust up if needed
  for (let i = 0; i < 5; i++) {
    const steamFee = Math.max(1, Math.floor(buyerPrice * 0.05));
    const gameFee = Math.max(1, Math.floor(buyerPrice * 0.10));
    const sellerGets = buyerPrice - steamFee - gameFee;
    if (sellerGets >= sellerReceivesCents) return buyerPrice;
    buyerPrice++;
  }
  return buyerPrice;
}

/**
 * Calculate what seller receives given buyer price.
 */
export function calcSellerReceives(buyerPriceCents: number): number {
  const steamFee = Math.max(1, Math.floor(buyerPriceCents * 0.05));
  const gameFee = Math.max(1, Math.floor(buyerPriceCents * 0.10));
  return buyerPriceCents - steamFee - gameFee;
}

// ─── Instant Sell / Quick Sell — Steam Market API ────────────────────
// Ported from CSGO Trader pricing.js

/**
 * Get lowest listing price (cents, buyer pays) via /market/listings/render/
 * Used for "Quick Sell" = undercut by 1¢
 */
export async function getLowestListingPrice(marketHashName: string, currencyId: number): Promise<number | null> {
  const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}/render/?query=&start=0&count=5&country=US&language=english&currency=${currencyId}`;
  const data = await bgFetch<any>(url);
  if (!data?.listinginfo) return null;

  const listings = Object.values(data.listinginfo) as any[];
  for (const listing of listings) {
    if (listing.converted_price !== undefined && listing.converted_fee !== undefined) {
      return listing.converted_price + listing.converted_fee; // total cents buyer pays
    }
  }
  return null;
}

/**
 * Get highest buy order (cents) via /market/itemordershistogram
 * Used for "Instant Sell" = sell to highest bidder
 * Two-step: first get item_nameid from listing page, then fetch histogram
 */
export async function getHighestBuyOrder(marketHashName: string, currencyId: number): Promise<number | null> {
  // Step 1: Get item_nameid from market listing page
  const pageUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
  const pageHtml = await bgFetch<string>(pageUrl);
  if (!pageHtml || typeof pageHtml !== 'string') return null;

  const match = pageHtml.match(/Market_LoadOrderSpread\(\s*(\d+)/);
  if (!match) return null;
  const itemNameId = match[1];

  // Step 2: Fetch histogram
  const histUrl = `https://steamcommunity.com/market/itemordershistogram?country=US&language=english&currency=${currencyId}&item_nameid=${itemNameId}`;
  const hist = await bgFetch<any>(histUrl);
  if (!hist?.highest_buy_order) return null;

  return parseInt(hist.highest_buy_order); // cents
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Parse Steam price string to cents.
 * Handles all Steam formats:
 *   "$12.34"        → 1234
 *   "2 036₴"        → 203600
 *   "1 976,77₴"     → 197677
 *   "1.234,56€"     → 123456
 *   "¥ 1234"        → 123400
 *   "0,98₴"         → 98
 */
export function parseSteamPriceString(s: string): number {
  if (!s) return 0;

  let cleaned = s.replace(/[^\d.,' ]/g, '').trim();
  cleaned = cleaned.replace(/(\d)\s+(\d)/g, '$1$2');

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    cleaned = cleaned.replace(',', '.');
  }

  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}
