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
          // Fallback: detect Doppler phase from instanceid mapping
          // Steam encodes phase info in instanceid — mapped via CSFloat API as last resort
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

/**
 * Get seller-receives price from buyer-pays total, using Steam's own GetItemPriceFromTotal().
 * This is the CORRECT way — Steam's fee calc is complex and varies by game.
 * Same approach as CSGO Trader.
 */
export function getPriceAfterFees(buyerPaysCents: number): number {
  const raw = runInPage(
    `try {
      document.body.setAttribute('sk_price_after_fees', GetItemPriceFromTotal(${buyerPaysCents}, g_rgWalletInfo).toString());
    } catch(e) { document.body.setAttribute('sk_price_after_fees', '0'); }`,
    'sk_price_after_fees'
  );
  return parseInt(raw || '0', 10);
}

/**
 * Format cents in user's wallet currency using Steam's v_currencyformat().
 */
export function formatCentsViaSteam(cents: number): string {
  return formatPriceViaSteam(cents) || `${cents / 100}`;
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

// ─── Steam Price Overview (lightweight, reliable) ────────────────────

export interface PriceOverview {
  lowestPrice: string | null;  // formatted string e.g. "42₴"
  medianPrice: string | null;
  volume: string | null;       // e.g. "415,955"
}

export async function getMarketPriceOverview(marketHashName: string, currencyId: number): Promise<PriceOverview | null> {
  const url = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=${currencyId}&market_hash_name=${encodeURIComponent(marketHashName)}`;
  try {
    // Try direct fetch first (works on Steam pages, same-origin)
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data?.success) {
        return {
          lowestPrice: data.lowest_price || null,
          medianPrice: data.median_price || null,
          volume: data.volume || null,
        };
      }
    }
  } catch { /* fall through to background fetch */ }

  // Fallback: fetch via background worker (bypasses CORS)
  try {
    const data = await bgFetch<any>(url);
    if (data?.success) {
      return {
        lowestPrice: data.lowest_price || null,
        medianPrice: data.median_price || null,
        volume: data.volume || null,
      };
    }
  } catch { /* ignore */ }

  return null;
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

// ─── Market Buy / Order API (ported from CSGO Trader) ────────────────

/**
 * Buy a listing instantly (one click, no dialog).
 * Listing object needs: listingid, converted_price, converted_fee, converted_currencyid
 */
export function buyListing(listing: { listingid: string; converted_price: number; converted_fee: number; converted_currencyid: number }): Promise<boolean> {
  return new Promise((resolve) => {
    const currencyID = listing.converted_currencyid - 2000;
    const total = listing.converted_price + listing.converted_fee;
    const resultKey = `sk_buy_${listing.listingid}`;

    // Execute in page context (has full session/cookies)
    const script = `
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://steamcommunity.com/market/buylisting/${listing.listingid}', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            document.body.setAttribute('${resultKey}', (xhr.status === 200 || xhr.status === 406) ? 'ok' : 'fail_' + xhr.status);
          }
        };
        var billingCountry = document.getElementById('billing_country_buynow') || document.getElementById('billing_country');
        var params = 'sessionid=' + g_sessionID
          + '&currency=${currencyID}'
          + '&fee=${listing.converted_fee}'
          + '&subtotal=${listing.converted_price}'
          + '&total=${total}'
          + '&quantity=1'
          + '&billing_state=' + encodeURIComponent((document.getElementById('billing_state_buynow') || document.getElementById('billing_state') || {}).value || '')
          + '&first_name=' + encodeURIComponent((document.getElementById('first_name_buynow') || document.getElementById('first_name') || {}).value || '')
          + '&last_name=' + encodeURIComponent((document.getElementById('last_name_buynow') || document.getElementById('last_name') || {}).value || '')
          + '&billing_address=' + encodeURIComponent((document.getElementById('billing_address_buynow') || document.getElementById('billing_address') || {}).value || '')
          + '&billing_address_two=' + encodeURIComponent((document.getElementById('billing_address_two_buynow') || document.getElementById('billing_address_two') || {}).value || '')
          + '&billing_country=' + encodeURIComponent((billingCountry || {}).value || '')
          + '&billing_city=' + encodeURIComponent((document.getElementById('billing_city_buynow') || document.getElementById('billing_city') || {}).value || '')
          + '&billing_postal_code=' + encodeURIComponent((document.getElementById('billing_postal_code_buynow') || document.getElementById('billing_postal_code') || {}).value || '')
          + '&save_my_address=1';
        xhr.send(params);
      } catch(e) {
        document.body.setAttribute('${resultKey}', 'fail_error');
      }
    `;

    const div = document.createElement('div');
    div.setAttribute('onreset', script);
    div.dispatchEvent(new CustomEvent('reset'));
    div.remove();

    // Poll for result
    const check = setInterval(() => {
      const result = document.body.getAttribute(resultKey);
      if (result) {
        document.body.removeAttribute(resultKey);
        clearInterval(check);
        resolve(result === 'ok');
      }
    }, 100);
    setTimeout(() => { clearInterval(check); resolve(false); }, 15000);
  });
}

/** Read billing KYC data from Steam's hidden form fields */
function getBuyerKYCFromPage(): Record<string, string> {
  // Steam uses different suffixes for commodity vs non-commodity items
  for (const suffix of ['_buynow', '']) {
    const country = document.getElementById(`billing_country${suffix}`) as HTMLInputElement | null;
    if (country?.value) {
      const val = (id: string) => {
        const el = document.getElementById(`${id}${suffix}`) as HTMLInputElement | null;
        return el?.value ? encodeURIComponent(el.value) : '';
      };
      return {
        first_name: val('first_name'),
        last_name: val('last_name'),
        billing_address: val('billing_address'),
        billing_address_two: val('billing_address_two'),
        billing_country: val('billing_country'),
        billing_city: val('billing_city'),
        billing_state: val('billing_state'),
        billing_postal_code: val('billing_postal_code'),
      };
    }
  }
  return {
    first_name: '', last_name: '', billing_address: '', billing_address_two: '',
    billing_country: '', billing_city: '', billing_state: '', billing_postal_code: '',
  };
}

/**
 * Create a buy order on the market.
 */
export async function createBuyOrder(marketHashName: string, priceCents: number, quantity = 1): Promise<{ success: boolean; message?: string }> {
  const sessionId = getSessionID();
  if (!sessionId) return { success: false, message: 'No session' };

  const walletInfo = getWalletInfo();
  const currency = walletInfo?.wallet_currency || 1;

  try {
    const res = await fetch('https://steamcommunity.com/market/createbuyorder/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      credentials: 'include',
      body: `sessionid=${sessionId}&currency=${currency}&appid=730&market_hash_name=${encodeURIComponent(marketHashName)}&price_total=${priceCents * quantity}&quantity=${quantity}&first_name=&last_name=&billing_address=&billing_address_two=&billing_country=&billing_city=&billing_state=&billing_postal_code=&save_my_address=0`,
    });
    if (!res.ok) return { success: false, message: `HTTP ${res.status}` };
    const data = await res.json();
    return data?.success === 1 ? { success: true } : { success: false, message: data?.message || 'Failed' };
  } catch (e) {
    return { success: false, message: String(e) };
  }
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
  const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}/render/?query=&start=0&count=10&country=US&language=english&currency=${currencyId}`;

  const extractPrice = (data: any): number | null => {
    if (!data?.success || !data?.listinginfo) return null;
    const listings = Object.values(data.listinginfo) as any[];
    for (const listing of listings) {
      if (listing.converted_price !== undefined && listing.converted_fee !== undefined) {
        return listing.converted_price + listing.converted_fee;
      }
    }
    return null;
  };

  // Try direct fetch first (same-origin on Steam pages)
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const price = extractPrice(data);
      if (price !== null) return price;
    }
  } catch { /* fall through */ }

  // Fallback: fetch via background worker
  try {
    const data = await bgFetch<any>(url);
    return extractPrice(data);
  } catch {
    return null;
  }
}

/**
 * Get highest buy order (cents) via /market/itemordershistogram
 * Two-step: first get item_nameid from listing page, then fetch histogram
 */
export async function getHighestBuyOrder(marketHashName: string, currencyId: number): Promise<number | null> {
  try {
    let itemNameId = itemNameIdCache.get(marketHashName);

    if (!itemNameId) {
      // Step 1: Get item_nameid from market listing page
      const pageUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
      let pageHtml: string | null = null;

      // Try direct fetch first, fallback to background
      try {
        const pageRes = await fetch(pageUrl);
        if (pageRes.ok) pageHtml = await pageRes.text();
      } catch { /* fall through */ }
      if (!pageHtml) {
        pageHtml = await bgFetch<string>(pageUrl) as string | null;
      }
      if (!pageHtml) return null;

      const match = pageHtml.match(/Market_LoadOrderSpread\(\s*(\d+)/);
      if (!match) return null;
      itemNameId = match[1];
      itemNameIdCache.set(marketHashName, itemNameId);
    }

    // Step 2: Fetch histogram
    const histUrl = `https://steamcommunity.com/market/itemordershistogram?country=US&language=english&currency=${currencyId}&item_nameid=${itemNameId}`;
    let hist: any = null;

    try {
      const histRes = await fetch(histUrl);
      if (histRes.ok) hist = await histRes.json();
    } catch { /* fall through */ }
    if (!hist) {
      hist = await bgFetch<any>(histUrl);
    }
    if (!hist?.highest_buy_order) return null;

    return parseInt(hist.highest_buy_order);
  } catch (e) {
    console.warn('[SkinKeeper] Instant Sell error:', e);
    return null;
  }
}

/**
 * Get full market overview: lowest listing, highest buy order, sell/buy order tables.
 * Combines listings/render + itemordershistogram in 2 requests.
 */
export interface MarketOverview {
  lowestSellOrder: number | null;   // cents, buyer pays
  highestBuyOrder: number | null;   // cents
  sellOrderCount: string;           // e.g. "415955"
  buyOrderCount: string;            // e.g. "1120058"
  sellOrderTable: string;           // HTML table rows
  buyOrderTable: string;            // HTML table rows
}

const itemNameIdCache = new Map<string, string>();

export async function getMarketOverview(marketHashName: string, currencyId: number): Promise<MarketOverview | null> {
  try {
    let itemNameId = itemNameIdCache.get(marketHashName);

    if (!itemNameId) {
      // Step 1: Get item_nameid from listing page
      const pageUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const pageRes = await fetch(pageUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!pageRes.ok) return null;
      const pageHtml = await pageRes.text();

      const match = pageHtml.match(/Market_LoadOrderSpread\(\s*(\d+)/);
      if (!match) return null;
      itemNameId = match[1];
      itemNameIdCache.set(marketHashName, itemNameId);
    }

    // Step 2: Fetch histogram
    const histUrl = `https://steamcommunity.com/market/itemordershistogram?country=US&language=english&currency=${currencyId}&item_nameid=${itemNameId}&two_factor=0`;
    const histRes = await fetch(histUrl);
    if (!histRes.ok) return null;
    const hist = await histRes.json();
    if (!hist?.success) return null;

    return {
      lowestSellOrder: hist.lowest_sell_order ? parseInt(hist.lowest_sell_order) : null,
      highestBuyOrder: hist.highest_buy_order ? parseInt(hist.highest_buy_order) : null,
      sellOrderCount: hist.sell_order_count || '0',
      buyOrderCount: hist.buy_order_count || '0',
      sellOrderTable: hist.sell_order_table || '',
      buyOrderTable: hist.buy_order_table || '',
    };
  } catch (e) {
    console.warn('[SkinKeeper] Market overview error:', e);
    return null;
  }
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

// ─── Market Management API ──────────────────────────────────────

/** Remove a sell listing from the market */
export async function removeListing(listingId: string): Promise<boolean> {
  const sessionId = getSessionID();
  if (!sessionId) return false;
  try {
    const res = await fetch(`https://steamcommunity.com/market/removelisting/${listingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      credentials: 'include',
      body: `sessionid=${sessionId}`,
    });
    return res.ok;
  } catch { return false; }
}

/** Cancel an active buy order */
export async function cancelBuyOrder(orderId: string): Promise<boolean> {
  const sessionId = getSessionID();
  if (!sessionId) return false;
  try {
    const res = await fetch('https://steamcommunity.com/market/cancelbuyorder/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      credentials: 'include',
      body: `sessionid=${sessionId}&buy_orderid=${orderId}`,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.success === 1;
  } catch { return false; }
}

/** Fetch market history (transactions, listings, cancellations) */
export async function getMarketHistory(start: number, count: number): Promise<{
  success: boolean; results_html: string; hovers: string;
  assets: any; total_count: number; pagesize: number;
} | null> {
  try {
    const res = await fetch(
      `https://steamcommunity.com/market/myhistory/?start=${start}&count=${count}`,
      { credentials: 'include' },
    );
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}
