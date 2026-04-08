import '../styles/skinkeeper.css';
import { initCollector } from '../shared/collector';
import { waitForElement, el, skBadge, sendMessage } from '../shared/dom';
import {
  readInventoryFromPage, loadFullInventory, loadBulkPrices, loadExchangeRates,
  getItemPrice, getItemPriceEntry, getWalletCurrency, getWalletCurrencyCode,
  sellItemOnMarket, calcBuyerPrice, calcSellerReceives,
  getLowestListingPrice, getHighestBuyOrder,
  getPriceAfterFees, formatCentsViaSteam, getSessionID,
  type SteamItem
} from '../shared/steam';
import { analyzePrice, createRatioBadge, createArbitrageBadge, type MultiPrice } from '../shared/pricing';
import { formatFloat, getFloatColor, getWearName, getWearShort, getWearFromName, isLowFloat, createFloatBar } from '../shared/float';
import { getDopplerPhase, isDoppler, isFade, isMarbleFade, calculateFadePercent, analyzeMarbleFade, analyzeBlueGem, createPhaseBadge, loadDopplerIconMap, getDopplerPhaseFromIcon, type PhaseInfo } from '../shared/phases';
import { formatSP, calculateStickerSP, type StickerInfo } from '../shared/stickers';
import { formatTradeLock } from '../shared/sell';
import { calculateTradeUp, validateInputs, normalizeRarity, type TradeUpInput } from '../shared/tradeup';
import { preloadBlueGemData, getBlueGemPercentSync, isBlueGemEligible, type BlueGemEntry } from '../shared/bluegem';
import { trackEvent } from '../shared/analytics';

let items: SteamItem[] = [];
let assetMap = new Map<string, SteamItem>();
let dupCount = new Map<string, number>();
let exchangeRate = 1;
let currencySign = '$';
let currencyCode = 'USD';
let detailVersion = 0;
let isOwnInventory = false;

// Enriched data from SkinKeeper API (float, phase, stickers, prices)
interface EnrichedItem {
  float_value: number | null;
  paint_seed: number | null;
  paint_index: number | null;
  trade_ban_until: string | null;
  sticker_value: number | null;
  fade_percentage: number | null;
  prices: Record<string, number>;
  stickers: Array<{ name: string; slot?: number; wear?: number }>;
  wear: string | null;
}
let enrichedMap = new Map<string, EnrichedItem>();

// P/L data from SkinKeeper portfolio (premium)
interface ItemPLData {
  avgBuyCents: number;
  currentCents: number;
  profitCents: number;
  profitPct: number;
  holding: number;
}
let plMap = new Map<string, ItemPLData>();

const CURRENCY_MAP: Record<number, [string, string]> = {
  1: ['USD', '$'], 2: ['GBP', '\u00a3'], 3: ['EUR', '\u20ac'], 5: ['RUB', '\u20bd'],
  18: ['UAH', '\u20b4'], 17: ['TRY', '\u20ba'], 23: ['CNY', '\u00a5'], 7: ['BRL', 'R$'],
  20: ['CAD', 'CA$'], 21: ['AUD', 'A$'], 37: ['KZT', '\u20b8'],
};

function fmtPrice(val: number): string {
  if (!val) return '';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 10000) return `${sign}${currencySign}${Math.round(abs).toLocaleString()}`;
  return `${sign}${currencySign}${abs.toFixed(2)}`;
}

function fmtUsd(usd: number): string {
  return fmtPrice(usd * exchangeRate);
}

// ─── Init ─────────────────────────────────────────────────────────────

// Set up detail panel enhancement IMMEDIATELY (don't wait for inventory load)
function earlyInit() {
  observeDetail();
}

// Run early init as soon as possible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', earlyInit);
} else {
  earlyInit();
}

async function init() {
  initCollector(); // Start passive price interception
  await waitForElement('.itemHolder');
  await new Promise(r => setTimeout(r, 1500));

  // Detect own inventory via injected script (reads page-world variable)
  try {
    const s = document.createElement('script');
    s.textContent = 'document.currentScript.dataset.own = !!g_bViewingOwnProfile;';
    document.head.appendChild(s);
    isOwnInventory = s.dataset.own === 'true';
    s.remove();
  } catch { /* fallback below */ }
  // Fallback: Steam shows trade offer button only on others' inventories
  if (!isOwnInventory) {
    isOwnInventory = !document.querySelector('#inventory_trade_link_btn');
  }
  console.log(`[SkinKeeper] Own inventory: ${isOwnInventory}`);

  // Preload blue gem data + doppler icon map in parallel with prices
  preloadBlueGemData();
  loadDopplerIconMap();

  const [prices, rates] = await Promise.all([
    loadBulkPrices('steam'),
    loadExchangeRates(),
  ]);

  const walletCurrency = getWalletCurrency();
  // Try Steam's own GetCurrencyCode() first (most reliable)
  const steamCurrencyCode = getWalletCurrencyCode();
  if (steamCurrencyCode && rates?.[steamCurrencyCode]) {
    currencyCode = steamCurrencyCode;
    // Find sign from CURRENCY_MAP by code
    for (const key of Object.keys(CURRENCY_MAP)) {
      const [c, s] = CURRENCY_MAP[Number(key)];
      if (c === steamCurrencyCode) { currencySign = s; break; }
    }
    exchangeRate = rates[steamCurrencyCode] || 1;
  } else {
    const [code, sign] = CURRENCY_MAP[walletCurrency] || ['USD', '$'];
    currencyCode = code;
    currencySign = sign;
    exchangeRate = rates?.[currencyCode] || 1;
  }

  console.log(`[SkinKeeper v0.9.2] Wallet currency ID: ${walletCurrency}, Steam code: ${steamCurrencyCode}, using: ${currencyCode} ${currencySign}, rate: ${exchangeRate}`);

  loadFullInventory(() => {
    items = readInventoryFromPage();
    const withFloat = items.filter(i => i.floatValue != null).length;
    const withSeed = items.filter(i => i.paintSeed != null).length;
    console.log(`[SkinKeeper v0.9.2] ${items.length} CS2 items loaded (${withFloat} with float, ${withSeed} with paint_seed from page)`);
    // Log sample item for verification
    if (items.length > 0) {
      const sample = items.find(i => i.floatValue != null) || items[0];
      console.log(`[SkinKeeper] Sample: "${sample.market_hash_name}" float=${sample.floatValue} seed=${sample.paintSeed} paintIdx=${sample.paintIndex}`);
    }
    if (items.length === 0) return;

    // Resolve Doppler phases from icon_url (Steam no longer provides paintIndex via properties)
    let dopplerResolved = 0;
    for (const item of items) {
      if (!item.paintIndex && item.icon_url && item.market_hash_name.toLowerCase().includes('doppler')) {
        const idx = getDopplerPhaseFromIcon(item.icon_url);
        if (idx) { item.paintIndex = idx; dopplerResolved++; }
      }
    }
    if (dopplerResolved > 0) console.log(`[SkinKeeper] Resolved ${dopplerResolved} doppler phases from icon_url`);

    assetMap = new Map(items.map(i => [i.assetid, i]));

    dupCount = new Map();
    for (const item of items) {
      dupCount.set(item.market_hash_name, (dupCount.get(item.market_hash_name) || 0) + 1);
    }

    let totalValue = 0;
    const pricedNames = new Set<string>();
    const uniqueNames = new Set<string>();
    let storageUnits = 0;
    let storedItems = 0;
    for (const item of items) {
      uniqueNames.add(item.market_hash_name);
      const price = getItemPrice(item.market_hash_name, exchangeRate);
      if (price > 0) { totalValue += price; pricedNames.add(item.market_hash_name); }
      if (item.type === 'Storage Unit') {
        storageUnits++;
        storedItems += item.casketItemCount || 0;
      }
    }

    injectBanner(items.length, uniqueNames.size, pricedNames.size, totalValue, storageUnits, storedItems);
    if (isOwnInventory) injectControlBar();
    trackEvent('inventory_loaded', { item_count: items.length, unique_items: uniqueNames.size });
    tagAllItems();

    const inv = document.getElementById('inventories');
    if (inv) {
      let debounce: ReturnType<typeof setTimeout>;
      new MutationObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(tagAllItems, 300);
      }).observe(inv, { childList: true, subtree: true });
    }

    observeDetail();
    setupItemSelection();
    loadActiveOfferItems();

    // Fetch enriched data from SkinKeeper API (float, phase, stickers, trade lock)
    fetchEnrichedInventory();
  });
}

// ─── Sync item data (float/seed/paint) to SkinKeeper backend ──────────

// ─── Fetch Enriched Data from SkinKeeper API ──────────────────────────

async function fetchEnrichedInventory() {
  // Sync float/seed/paint data to backend first
  if (isOwnInventory) {
    const toSync = items
      .filter(i => i.floatValue != null || i.paintSeed != null || i.paintIndex != null || (i.stickers && i.stickers.length > 0))
      .map(i => ({
        asset_id: i.assetid,
        float_value: i.floatValue ?? null,
        paint_seed: i.paintSeed ?? null,
        paint_index: i.paintIndex ?? null,
        stickers: i.stickers && i.stickers.length > 0 ? i.stickers : null,
      }));
    console.log(`[SkinKeeper] Items to sync: ${toSync.length} (of ${items.length} total)`);
    if (toSync.length > 0) {
      sendMessage({ type: 'SYNC_ITEMS', items: toSync })
        .then(r => console.log('[SkinKeeper] Sync result:', r))
        .catch(e => console.error('[SkinKeeper] Sync error:', e));
    }
  }

  try {
    const data = await sendMessage({ type: 'GET_INVENTORY' });
    if (!data?.items || !Array.isArray(data.items)) {
      console.log('[SkinKeeper] No enriched data (not logged in or empty)');
      return;
    }

    console.log(`[SkinKeeper] Enriched data: ${data.items.length} items from API`);

    for (const item of data.items) {
      enrichedMap.set(item.asset_id, {
        float_value: item.float_value ?? null,
        paint_seed: item.paint_seed ?? null,
        paint_index: item.paint_index ?? null,
        trade_ban_until: item.trade_ban_until ?? null,
        sticker_value: item.sticker_value ?? null,
        fade_percentage: item.fade_percentage ?? null,
        prices: item.prices ?? {},
        stickers: item.stickers ?? [],
        wear: item.wear ?? null,
      });
    }

    // Re-tag all items with enriched data
    retagAllItems();

    // Also fetch P/L data (premium only — will silently fail for free users)
    fetchPLData();
  } catch (err) {
    console.log('[SkinKeeper] Enriched fetch failed (user not logged in?)');
  }
}

async function fetchPLData() {
  try {
    const data = await sendMessage({ type: 'GET_PL_ITEMS' });
    if (!data?.items || !Array.isArray(data.items)) return;

    console.log(`[SkinKeeper] P/L data: ${data.items.length} items`);

    for (const item of data.items) {
      plMap.set(item.marketHashName || item.market_hash_name, {
        avgBuyCents: item.avgBuyPriceCents || item.avg_buy_price_cents || 0,
        currentCents: item.currentPriceCents || item.current_price_cents || 0,
        profitCents: item.unrealizedProfitCents || item.unrealized_profit_cents || 0,
        profitPct: item.profitPct || item.profit_pct || 0,
        holding: item.currentHolding || item.current_holding || 0,
      });
    }

    // Re-tag again with P/L overlays
    retagAllItems();
  } catch {
    // Premium-only endpoint — silently fail for free users
  }
}

// ─── Banner ───────────────────────────────────────────────────────────

function injectBanner(count: number, unique: number, priced: number, total: number, storageUnits = 0, storedItems = 0) {
  document.querySelector('#sk-mini-card')?.remove();

  const card = document.createElement('div');
  card.id = 'sk-mini-card';
  card.style.cssText = `
    position: fixed; top: 10px; right: 10px; z-index: 9999;
    background: rgba(13,17,23,0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(99,102,241,0.25);
    border-radius: 8px;
    padding: 10px 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    color: #e2e8f0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    width: 200px;
    pointer-events: auto;
  `;

  const row = (label: string, value: string, color = '#fff') =>
    `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
      <span style="color:#8b949e">${label}</span>
      <span style="font-weight:700;color:${color}">${value}</span>
    </div>`;

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <div style="background:#6366f1;color:#fff;padding:2px 5px;border-radius:3px;font-weight:900;font-size:10px">SK</div>
      <span style="font-size:10px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.8px">SkinKeeper</span>
    </div>
    ${row('Items', `${count} <span style="color:#8b949e;font-weight:400;font-size:10px">(${unique} unique)</span>`)}
    ${row('Value', fmtPrice(total) || `${currencySign}0`, '#4ade80')}
  `;

  // Check login — show P/L for logged users, teaser for others
  sendMessage({ type: 'GET_USER' }).then((user: any) => {
    if (user) {
      // Logged in — fetch portfolio P/L
      sendMessage({ type: 'GET_PORTFOLIO' }).then((portfolio: any) => {
        if (!portfolio) return;
        const invested = portfolio.totalInvestedCents || portfolio.total_invested_cents || 0;
        const current = portfolio.totalCurrentCents || portfolio.total_current_cents || 0;
        // Only show P/L if there's actual data
        if (invested <= 0 && current <= 0) return;
        const profitCents = current - invested;
        const profitPct = invested > 0 ? ((profitCents / invested) * 100).toFixed(1) : '0.0';
        const isProfit = profitCents >= 0;
        const sign = isProfit ? '+' : '';

        const plDiv = document.createElement('div');
        plDiv.style.cssText = 'border-top:1px solid rgba(255,255,255,0.06);margin-top:6px;padding-top:6px';
        plDiv.innerHTML = `
          ${row('Invested', fmtPrice((invested / 100) * exchangeRate))}
          ${row('P/L', `${sign}${fmtPrice(Math.abs(profitCents / 100) * exchangeRate)} (${sign}${profitPct}%)`, isProfit ? '#4ade80' : '#f87171')}
        `;
        card.appendChild(plDiv);
      });
    } else {
      // Not logged in — show locked teasers
      const teaser = document.createElement('div');
      teaser.style.cssText = 'border-top:1px solid rgba(255,255,255,0.06);margin-top:6px;padding-top:6px';
      teaser.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
          <span style="color:#8b949e">P/L</span>
          <span style="color:#4b5563;font-weight:600;filter:blur(3px)">+${currencySign}12,450 (+23%)</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
          <span style="color:#8b949e">Buff vs Steam</span>
          <span style="color:#4b5563;font-weight:600;filter:blur(3px)">0.82x (${currencySign}8,200 gap)</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px">
          <span style="color:#8b949e">Top gainer</span>
          <span style="color:#4b5563;font-weight:600;filter:blur(3px)">AK Redline +45%</span>
        </div>
      `;

      const cta = document.createElement('a');
      cta.href = 'https://app.skinkeeper.store?source=extension';
      cta.target = '_blank';
      cta.style.cssText = `
        display:block; padding:5px 0; text-align:center;
        font-size:10px; color:#6366f1; text-decoration:none;
        font-weight:700; transition: color 0.15s;
      `;
      cta.textContent = 'Unlock full analytics \u2192';
      cta.onmouseenter = () => { cta.style.color = '#818cf8'; };
      cta.onmouseleave = () => { cta.style.color = '#6366f1'; };

      teaser.appendChild(cta);
      card.appendChild(teaser);
    }
  });

  document.body.appendChild(card);
}

// ─── Control Bar (sort, select-value, sell, trade-up, export) ────────

function injectControlBar() {
  if (document.getElementById('sk-control-bar')) return;

  // Find Steam's inventory navigation/controls area
  const anchor = document.querySelector('.filter_ctn.inventory_filters')
    || document.querySelector('#inventory_applogo')
    || document.querySelector('.inventory_links');

  const bar = el('div');
  bar.id = 'sk-control-bar';
  bar.style.cssText = `
    display:flex;align-items:center;gap:8px;padding:8px 0;margin:6px 0;
    font-family:var(--sk-font);flex-wrap:wrap;
  `;

  // Sort dropdown
  const sortSelect = document.createElement('select');
  sortSelect.className = 'sk-sort-select';
  sortSelect.innerHTML = `
    <option value="default">Default Order</option>
    <option value="price-desc">Price: High → Low</option>
    <option value="price-asc">Price: Low → High</option>
    <option value="float-asc">Float: Low → High</option>
    <option value="float-desc">Float: High → Low</option>
    <option value="name-asc">Name: A → Z</option>
    <option value="name-desc">Name: Z → A</option>
    <option value="rarity-desc">Rarity: High → Low</option>
    <option value="tradable">Tradable First</option>
  `;
  sortSelect.addEventListener('change', () => sortInventory(sortSelect.value));
  bar.appendChild(sortSelect);

  // Selected value counter
  const selectedVal = el('span');
  selectedVal.id = 'sk-selected-value';
  selectedVal.style.cssText = 'font-size:12px;color:var(--sk-text-dim);margin-left:4px;white-space:nowrap';
  selectedVal.textContent = `Selected: ${currencySign}0`;
  bar.appendChild(selectedVal);

  // Spacer
  const spacer = el('div');
  spacer.style.flex = '1';
  bar.appendChild(spacer);

  // Sell button
  const sellBtn = el('button', ['sk-banner-cta', 'sk-cta-sell', 'sk-sell-toggle']);
  sellBtn.textContent = 'Sell';
  sellBtn.style.cssText += 'padding:5px 12px;font-size:11px';
  sellBtn.addEventListener('click', () => toggleSellMode());
  bar.appendChild(sellBtn);

  // Trade-Up button
  const tuBtn = el('button', ['sk-banner-cta', 'sk-cta-amber', 'sk-tu-toggle']);
  tuBtn.textContent = 'Trade-Up';
  tuBtn.style.cssText += 'padding:5px 12px;font-size:11px';
  tuBtn.addEventListener('click', () => toggleTradeUpMode());
  bar.appendChild(tuBtn);

  // Export dropdown
  const exportWrap = el('div');
  exportWrap.style.cssText = 'position:relative';
  const exportBtn = el('button', ['sk-banner-cta', 'sk-cta-secondary']);
  exportBtn.textContent = 'Export ▾';
  exportBtn.style.cssText += 'padding:5px 12px;font-size:11px';
  const exportMenu = el('div', 'sk-export-menu');
  exportMenu.style.cssText = `
    display:none;position:absolute;top:100%;right:0;margin-top:4px;z-index:999;
    background:rgba(13,17,23,0.95);backdrop-filter:blur(8px);
    border:1px solid var(--sk-border);border-radius:var(--sk-radius-sm);
    padding:4px 0;min-width:140px;box-shadow:0 4px 12px rgba(0,0,0,0.4);
  `;
  const menuItem = (label: string, fn: () => void) => {
    const item = el('div', 'sk-export-option');
    item.textContent = label;
    item.style.cssText = 'padding:6px 12px;font-size:12px;color:var(--sk-text);cursor:pointer;font-family:var(--sk-font)';
    item.onmouseenter = () => { item.style.background = 'rgba(99,102,241,0.15)'; };
    item.onmouseleave = () => { item.style.background = ''; };
    item.addEventListener('click', () => { fn(); exportMenu.style.display = 'none'; });
    return item;
  };
  exportMenu.append(
    menuItem('CSV', exportCSV),
    menuItem('JSON', exportJSON),
    menuItem('Copy Summary', exportClipboard),
  );
  exportBtn.addEventListener('click', () => {
    exportMenu.style.display = exportMenu.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', (e) => {
    if (!exportWrap.contains(e.target as Node)) exportMenu.style.display = 'none';
  });
  exportWrap.append(exportBtn, exportMenu);
  bar.appendChild(exportWrap);

  if (anchor) {
    anchor.parentElement?.insertBefore(bar, anchor.nextSibling);
  } else {
    // Fallback: insert before the first inventory page
    const invPage = document.querySelector('.inventory_page');
    invPage?.parentElement?.insertBefore(bar, invPage);
  }
}

// ─── Item Tags (on each item in Steam grid) ──────────────────────────

function tagAllItems() {
  document.querySelectorAll('.item.app730.context2').forEach((elem) => {
    const htmlEl = elem as HTMLElement;
    if (htmlEl.dataset.skTagged) return;

    const assetId = htmlEl.id?.split('_')[2];
    if (!assetId) return;
    const item = assetMap.get(assetId);
    if (!item) return;

    htmlEl.dataset.skTagged = '1';
    htmlEl.style.position = 'relative';

    tagItem(htmlEl, item, assetId);
  });
}

/** Re-tag after enriched data arrives */
function retagAllItems() {
  document.querySelectorAll('.item.app730.context2').forEach((elem) => {
    const htmlEl = elem as HTMLElement;
    const assetId = htmlEl.id?.split('_')[2];
    if (!assetId) return;
    const item = assetMap.get(assetId);
    if (!item) return;

    // Remove old tags
    htmlEl.querySelectorAll('.sk-price-tag, .sk-dup-badge, .sk-lock-badge, .sk-item-float, .sk-item-wear, .sk-item-ext, .sk-item-phase, .sk-item-seed, .sk-item-sticker-val, .sk-item-pl, .sk-float-bar').forEach(e => e.remove());
    delete htmlEl.dataset.skTagged;
    htmlEl.dataset.skTagged = '1';

    tagItem(htmlEl, item, assetId);
  });
}

// ─── Sorting ─────────────────────────────────────────────────────────

const RARITY_ORDER: Record<string, number> = {
  'Contraband': 7, 'Covert': 6, 'Classified': 5, 'Restricted': 4,
  'Mil-Spec Grade': 3, 'Industrial Grade': 2, 'Consumer Grade': 1, 'Base Grade': 0,
};

let originalOrder: string[] = []; // assetIds in original DOM order

function sortInventory(mode: string) {
  // Try multiple selectors for the item container
  const holder = document.querySelector('.inventory_page:not([style*="display: none"]) .itemHolder')
    || document.querySelector('.inventory_page:not([style*="display:none"]) .itemHolder')
    || document.querySelector('.itemHolder');
  if (!holder) { console.warn('[SkinKeeper] Sort: no itemHolder found'); return; }

  const itemEls = Array.from(holder.querySelectorAll('.item.app730.context2')) as HTMLElement[];
  if (itemEls.length === 0) return;

  // Save original order on first sort
  if (originalOrder.length === 0) {
    originalOrder = itemEls.map(e => e.id?.split('_')[2] || '');
  }

  if (mode === 'default') {
    // Restore original order
    const orderMap = new Map(originalOrder.map((id, i) => [id, i]));
    itemEls.sort((a, b) => {
      const ai = orderMap.get(a.id?.split('_')[2] || '') ?? 9999;
      const bi = orderMap.get(b.id?.split('_')[2] || '') ?? 9999;
      return ai - bi;
    });
  } else {
    itemEls.sort((a, b) => {
      const aId = a.id?.split('_')[2] || '';
      const bId = b.id?.split('_')[2] || '';
      const aItem = assetMap.get(aId);
      const bItem = assetMap.get(bId);
      if (!aItem || !bItem) return 0;

      const aEnriched = enrichedMap.get(aId);
      const bEnriched = enrichedMap.get(bId);

      switch (mode) {
        case 'price-desc':
        case 'price-asc': {
          const aP = getItemPrice(aItem.market_hash_name, exchangeRate);
          const bP = getItemPrice(bItem.market_hash_name, exchangeRate);
          return mode === 'price-desc' ? bP - aP : aP - bP;
        }
        case 'name-asc': return aItem.market_hash_name.localeCompare(bItem.market_hash_name);
        case 'name-desc': return bItem.market_hash_name.localeCompare(aItem.market_hash_name);
        case 'float-asc':
        case 'float-desc': {
          const aF = aEnriched?.float_value ?? (mode === 'float-asc' ? 2 : -1);
          const bF = bEnriched?.float_value ?? (mode === 'float-asc' ? 2 : -1);
          return mode === 'float-asc' ? aF - bF : bF - aF;
        }
        case 'rarity-desc':
        case 'rarity-asc': {
          const aR = RARITY_ORDER[aItem.rarity?.replace(/[★\s]+/g, '').trim() || ''] ?? 0;
          const bR = RARITY_ORDER[bItem.rarity?.replace(/[★\s]+/g, '').trim() || ''] ?? 0;
          return mode === 'rarity-desc' ? bR - aR : aR - bR;
        }
        case 'tradable': {
          const aT = aItem.tradable ? 0 : 1;
          const bT = bItem.tradable ? 0 : 1;
          return aT - bT;
        }
        default: return 0;
      }
    });
  }

  // Reorder DOM
  for (const elem of itemEls) {
    holder.appendChild(elem);
  }
}

function tagItem(htmlEl: HTMLElement, item: SteamItem, assetId: string) {
  const enriched = enrichedMap.get(assetId);
  const price = getItemPrice(item.market_hash_name, exchangeRate);

  // Use page data first, enriched as enhancement
  const floatVal = item.floatValue ?? enriched?.float_value ?? null;
  const paintSeed = item.paintSeed ?? enriched?.paint_seed ?? null;
  const paintIndex = item.paintIndex ?? enriched?.paint_index ?? null;

  // ── Storage unit: show item count instead of price ──
  if (item.type === 'Storage Unit') {
    const count = item.casketItemCount || 0;
    const badge = el('div', 'sk-storage-badge');
    badge.textContent = `${count} items`;
    badge.title = `${item.name}: ${count} items stored`;
    htmlEl.appendChild(badge);
    return;
  }

  // ── Top-right: ST/Souvenir + Exterior label ──
  const wearShort = floatVal != null ? getWearShort(floatVal) : getWearFromName(item.market_hash_name);
  if (wearShort || item.isStatTrak || item.isSouvenir) {
    const extTag = el('div', 'sk-item-ext');
    const parts: string[] = [];
    if (item.isStatTrak) parts.push('ST');
    if (item.isSouvenir) parts.push('SV');
    if (wearShort) parts.push(wearShort);
    extTag.textContent = parts.join(' ');
    const wearColors: Record<string, string> = { FN: '#4ade80', MW: '#22d3ee', FT: '#a78bfa', WW: '#f97316', BS: '#ef4444' };
    if (item.isStatTrak) extTag.style.color = '#cf6a32';
    else if (item.isSouvenir) extTag.style.color = '#ffd700';
    else if (wearShort && wearColors[wearShort]) extTag.style.color = wearColors[wearShort];
    htmlEl.appendChild(extTag);
  }

  // ── Top-center: Doppler phase / Fade % / Marble Fade ──
  let hasSpecial = false;
  if (paintIndex) {
    const phase = getDopplerPhase(paintIndex);
    if (phase) {
      hasSpecial = true;
      const badge = el('div', 'sk-item-phase');
      if (phase.tier === 1) {
        badge.textContent = phase.phase;
        badge.style.cssText += `font-weight:800;font-size:10px;padding:2px 5px;line-height:1.4;background:linear-gradient(135deg,${phase.color}ee,${phase.color}99);text-shadow:0 0 8px ${phase.color};`;
      } else {
        badge.textContent = phase.emoji;
        badge.style.background = phase.color + 'cc';
      }
      badge.title = phase.phase;
      htmlEl.appendChild(badge);
    }
  }
  if (!hasSpecial && paintSeed != null && isFade(item.market_hash_name)) {
    hasSpecial = true;
    const fade = calculateFadePercent(paintSeed);
    const badge = el('div', 'sk-item-phase');
    badge.textContent = `${fade.percentage}%`;
    badge.style.cssText += `font-weight:800;font-size:10px;padding:2px 5px;line-height:1.4;background:linear-gradient(135deg,#ff6b35,#f7c948,#6dd5ed);color:#000;text-shadow:0 0 3px rgba(255,255,255,0.4);`;
    badge.title = fade.tier;
    htmlEl.appendChild(badge);
  }
  if (!hasSpecial && paintSeed != null && isMarbleFade(item.market_hash_name)) {
    hasSpecial = true;
    const mf = analyzeMarbleFade(paintSeed);
    const badge = el('div', 'sk-item-phase');
    badge.textContent = mf.pattern === 'Fire & Ice' ? '🔥❄️' : mf.pattern.substring(0, 3);
    badge.style.background = mf.color + 'cc';
    badge.title = mf.pattern;
    htmlEl.appendChild(badge);
  }

  // ── Top-left: Trade lock ──
  if (!item.tradable) {
    if (enriched?.trade_ban_until) {
      const remaining = formatTradeLock(enriched.trade_ban_until);
      if (remaining) {
        const lock = el('div', 'sk-lock-badge');
        lock.textContent = remaining;
        lock.title = `Tradable in ${remaining}`;
        htmlEl.appendChild(lock);
      }
    } else if (item.tradeLockDate) {
      const lock = el('div', 'sk-lock-badge');
      lock.textContent = item.tradeLockDate.replace(/,?\s*\d{4}.*/, '').trim();
      lock.title = `Tradable After ${item.tradeLockDate}`;
      htmlEl.appendChild(lock);
    } else {
      const lock = el('div', 'sk-lock-badge');
      lock.textContent = '🔒';
      lock.title = 'Not tradable';
      htmlEl.appendChild(lock);
    }
  }

  // ── Bottom-left: Float value ──
  if (floatVal != null) {
    const floatTag = el('div', 'sk-item-float');
    floatTag.textContent = formatFloat(floatVal);
    floatTag.style.color = 'rgba(255,255,255,0.85)';
    htmlEl.appendChild(floatTag);
  }

  // ── Bottom-right: Price ──
  if (price > 0) {
    const tag = el('div', 'sk-price-tag');
    tag.textContent = fmtPrice(price);
    htmlEl.appendChild(tag);
  }

  // ── Paint seed + blue gem % (right side, below ext label) ──
  if (paintSeed != null && (isDoppler(item.market_hash_name) || isFade(item.market_hash_name) || isMarbleFade(item.market_hash_name) || isBlueGemEligible(item.market_hash_name))) {
    const seedTag = el('div', 'sk-item-seed');
    // Check for blue gem data
    const bgData = (paintIndex != null || item.defindex)
      ? getBlueGemPercentSync(item.defindex || 0, paintIndex || 44, paintSeed)
      : null;
    if (bgData && bgData.pb > 0) {
      seedTag.innerHTML = `${paintSeed} <span style="color:deepskyblue">(${bgData.pb}%)</span>`;
      seedTag.title = `Seed: ${paintSeed} | Playside: ${bgData.pb}% blue | Backside: ${bgData.bb}% blue`;
      if (bgData.pb >= 70) {
        seedTag.style.color = 'deepskyblue';
        seedTag.style.fontWeight = '800';
      }
    } else {
      seedTag.textContent = `${paintSeed}`;
      seedTag.title = `Pattern / Paint Seed: ${paintSeed}`;
    }
    htmlEl.appendChild(seedTag);
  }

  // ── Sticker value (above price, right side) ──
  if (enriched?.sticker_value && enriched.sticker_value > 0.1) {
    const sv = el('div', 'sk-item-sticker-val');
    sv.textContent = fmtUsd(enriched.sticker_value);
    sv.title = `Sticker value: ${fmtUsd(enriched.sticker_value)}`;
    htmlEl.appendChild(sv);
  }

  // ── Duplicate count (small badge, top-right area) ──
  const dups = dupCount.get(item.market_hash_name) || 0;
  if (dups > 1) {
    const dup = el('div', 'sk-dup-badge');
    dup.textContent = `x${dups}`;
    dup.title = `You have ${dups} of this item`;
    htmlEl.appendChild(dup);
  }

  // ── Float bar at very bottom of tile ──
  if (floatVal != null) {
    const bar = document.createElement('div');
    bar.className = 'sk-float-bar';
    const marker = document.createElement('div');
    marker.className = 'sk-float-marker';
    marker.style.left = `${floatVal * 100}%`;
    bar.appendChild(marker);
    htmlEl.appendChild(bar);
  }

  // ── P/L overlay ──
  const pl = plMap.get(item.market_hash_name);
  if (pl && pl.avgBuyCents > 0) {
    const profitUsd = (pl.profitCents / 100) * exchangeRate;
    const isProfit = pl.profitCents >= 0;
    const plTag = el('div', 'sk-item-pl');
    plTag.classList.add(isProfit ? 'sk-pl-profit' : 'sk-pl-loss');
    const sign = isProfit ? '+' : '';
    const pctStr = `${sign}${pl.profitPct.toFixed(1)}%`;
    plTag.textContent = pctStr;
    plTag.title = `Bought: ${fmtPrice((pl.avgBuyCents / 100) * exchangeRate)}\nNow: ${fmtPrice((pl.currentCents / 100) * exchangeRate)}\nP/L: ${sign}${fmtPrice(Math.abs(profitUsd))} (${pctStr})`;
    htmlEl.appendChild(plTag);
  }

  // ── Colorful inventory — rarity-based border ──
  if (item.rarityColor) {
    htmlEl.style.borderLeft = `3px solid #${item.rarityColor}`;
  }

  // ── Value-based background highlight — only truly expensive items ──
  const priceUsd = getItemPrice(item.market_hash_name, 1); // USD price for threshold
  if (priceUsd >= 2000) {
    htmlEl.style.background = 'linear-gradient(135deg, rgba(220,38,38,0.30) 0%, rgba(220,38,38,0.10) 100%)';
  } else if (priceUsd >= 1000) {
    htmlEl.style.background = 'linear-gradient(135deg, rgba(220,38,38,0.15) 0%, rgba(220,38,38,0.05) 100%)';
  }

  // ── Doppler phase colored background (overrides value-based) ──
  if (paintIndex) {
    const phase = getDopplerPhase(paintIndex);
    if (phase) {
      if (phase.tier === 1) {
        // Ruby, Sapphire, Black Pearl, Emerald — strong glow
        htmlEl.style.background = `linear-gradient(135deg, ${phase.color}55 0%, ${phase.color}20 100%)`;
        htmlEl.style.boxShadow = `inset 0 0 20px ${phase.color}30, 0 0 8px ${phase.color}40`;
      } else {
        htmlEl.style.background = `linear-gradient(135deg, ${phase.color}22 0%, ${phase.color}0a 100%)`;
      }
    }
  }
}

// ─── "In Other Offer" indicator (ported from CSGO Trader) ────────────

let itemsInOffers = new Map<string, string>(); // assetid → offer URL

async function loadActiveOfferItems() {
  try {
    // Fetch active trade offers page to find items in pending offers
    const html = await sendMessage({ type: 'FETCH_JSON', url: 'https://steamcommunity.com/my/tradeoffers/sent' });
    if (!html || typeof html !== 'string') return;

    // Parse offer items from HTML — find assetids in trade offer item elements
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('.tradeoffer').forEach((offer) => {
      const offerId = offer.id?.replace('tradeofferid_', '') || '';
      const offerUrl = `https://steamcommunity.com/tradeoffer/${offerId}`;
      // Items you're giving away
      offer.querySelectorAll('.tradeoffer_items.secondary .trade_item, .tradeoffer_item_list .trade_item').forEach((item) => {
        const match = item.id?.match(/item\d+_\d+_(\d+)/);
        if (match) itemsInOffers.set(match[1], offerUrl);
      });
    });

    if (itemsInOffers.size > 0) {
      console.log(`[SkinKeeper] ${itemsInOffers.size} items found in active trade offers`);
      // Mark items on tiles
      document.querySelectorAll('.item.app730.context2').forEach((elem) => {
        const assetId = elem.id?.split('_')[2];
        if (assetId && itemsInOffers.has(assetId)) {
          const indicator = el('div', 'sk-in-offer');
          indicator.textContent = '📤';
          indicator.title = 'This item is in an active trade offer';
          indicator.style.cssText = 'position:absolute;bottom:28px;left:2px;font-size:10px;z-index:6;cursor:pointer';
          indicator.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(itemsInOffers.get(assetId), '_blank');
          });
          elem.appendChild(indicator);
        }
      });
    }
  } catch {
    // Silently fail — user may not have sent offers
  }
}

// ─── Selected Items Value (ported from CSGO Trader) ──────────────────

let selectedAssetIds = new Set<string>();

function setupItemSelection() {
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest?.('.item.app730.context2') as HTMLElement | null;
    if (!target) return;
    // Don't interfere with sell mode or trade-up mode
    if (sellMode || document.querySelector('.sk-tu-panel')) return;

    const assetId = target.id?.split('_')[2];
    if (!assetId) return;
    const item = assetMap.get(assetId);
    if (!item) return;

    if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: select/deselect ALL items with same name
      const allOfType = document.querySelectorAll('.item.app730.context2');
      const isCurrentlySelected = selectedAssetIds.has(assetId);
      allOfType.forEach((elem) => {
        const id = elem.id?.split('_')[2];
        if (!id) return;
        const it = assetMap.get(id);
        if (it?.market_hash_name !== item.market_hash_name) return;
        if (isCurrentlySelected) {
          selectedAssetIds.delete(id);
          (elem as HTMLElement).classList.remove('sk-item-selected');
        } else {
          selectedAssetIds.add(id);
          (elem as HTMLElement).classList.add('sk-item-selected');
        }
      });
    } else {
      // Normal click: toggle single item
      if (selectedAssetIds.has(assetId)) {
        selectedAssetIds.delete(assetId);
        target.classList.remove('sk-item-selected');
      } else {
        selectedAssetIds.add(assetId);
        target.classList.add('sk-item-selected');
      }
    }

    updateSelectedValue();
  });
}

function updateSelectedValue() {
  let totalValue = 0;
  for (const id of selectedAssetIds) {
    const item = assetMap.get(id);
    if (item) totalValue += getItemPrice(item.market_hash_name, exchangeRate);
  }
  const counter = document.getElementById('sk-selected-value');
  if (counter) {
    if (selectedAssetIds.size === 0) {
      counter.textContent = `Selected Items Value: ${currencySign}0`;
      counter.style.color = 'var(--sk-text-dim)';
    } else {
      counter.textContent = `Selected Items Value: ${fmtPrice(totalValue)} (${selectedAssetIds.size})`;
      counter.style.color = 'var(--sk-primary-light)';
    }
  }
}

// ─── Detail Panel ─────────────────────────────────────────────────────

function observeDetail() {
  // Legacy Steam: iteminfo0/iteminfo1
  for (const id of ['iteminfo0', 'iteminfo1']) {
    const panel = document.getElementById(id);
    if (!panel) continue;
    new MutationObserver(() => {
      clearTimeout((panel as any)._sk);
      (panel as any)._sk = setTimeout(() => enhanceDetail(panel), 300);
    }).observe(panel, { childList: true, subtree: true });
  }

  // New Steam React UI: [data-featuretarget="iteminfo"]
  const reactPanel = document.querySelector('[data-featuretarget="iteminfo"]');
  if (reactPanel) {
    new MutationObserver(() => {
      clearTimeout((reactPanel as any)._sk);
      (reactPanel as any)._sk = setTimeout(() => enhanceDetail(reactPanel as HTMLElement), 300);
    }).observe(reactPanel, { childList: true, subtree: true });
  }

  // Fallback: click listener on inventory items
  const inv = document.getElementById('inventories');
  if (inv) {
    inv.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.item.app730.context2');
      if (!target) return;
      setTimeout(() => {
        const panel = document.querySelector('[data-featuretarget="iteminfo"]') as HTMLElement
          || document.getElementById('iteminfo0')
          || document.getElementById('iteminfo1');
        if (panel) enhanceDetail(panel);
      }, 500);
    });
  }
}

function enhanceDetail(panel: HTMLElement) {
  // Remove previously injected SK buttons
  panel.querySelectorAll('.sk-quick-sell').forEach(e => e.remove());

  if (!isOwnInventory) return;

  // Find item name from panel
  const nameEl = panel.querySelector('.hover_item_name') || panel.querySelector('h1');
  const name = nameEl?.textContent?.trim();
  if (!name) return;

  const item = items.find(i => i.name === name || i.market_hash_name === name);
  // If items not loaded yet, use name from panel; skip tradable check
  const marketName = item?.market_hash_name || name;
  if (item && (!item.tradable || !item.marketable)) return;

  // Make item name clickable — goes to market listing page
  if (nameEl && !(nameEl as HTMLElement).dataset.skLinked) {
    (nameEl as HTMLElement).dataset.skLinked = '1';
    (nameEl as HTMLElement).style.cursor = 'pointer';
    (nameEl as HTMLElement).title = 'View on Market';
    (nameEl as HTMLElement).addEventListener('click', () => {
      window.open(`https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`, '_blank');
    });
  }
  const walletCurr = getWalletCurrency();

  // Already injected? Skip
  if (panel.querySelector('.sk-quick-sell')) return;

  // Find Steam's Sell button
  const sellBtn = panel.querySelector('button[data-accent-color="green"]')
    || Array.from(panel.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Sell');
  if (!sellBtn) return;

  // Shared button style
  const btnStyle = `
    padding: 5px 10px; font-size: 12px; font-weight: 700; cursor: pointer;
    border: none; border-radius: 4px; color: #fff; white-space: nowrap;
    transition: filter 0.15s ease;
  `;

  // 🏷️ Quick Sell (first — most common action)
  const quickBtn = document.createElement('button') as HTMLButtonElement;
  quickBtn.className = 'sk-quick-sell';
  quickBtn.textContent = 'Quick Sell';
  quickBtn.style.cssText = btnStyle + 'background:#6366f1; margin-left:6px;';
  quickBtn.title = 'List 1 cent cheaper than lowest listing';
  quickBtn.onmouseenter = () => { quickBtn.style.filter = 'brightness(1.2)'; };
  quickBtn.onmouseleave = () => { quickBtn.style.filter = ''; };
  quickBtn.addEventListener('click', async () => {
    quickBtn.textContent = 'Loading...';
    quickBtn.disabled = true;
    try {
      const lowestBuyerPays = await getLowestListingPrice(marketName, walletCurr);
      if (!lowestBuyerPays) { quickBtn.textContent = 'No listings'; quickBtn.disabled = false; return; }
      // Currencies without decimals: undercut by 1 whole unit
      // Currencies with cents (USD, EUR, GBP): undercut by 1 cent
      const NO_DECIMALS: number[] = [5, 9, 10, 11, 14, 15, 17, 18, 29, 30, 37]; // RUB, NOK, CLP, PEN, COP, PHP, TRY, UAH, CRC, UYU, KZT
      const step = NO_DECIMALS.includes(walletCurr) ? 100 : 1;
      const undercutBuyerPays = Math.max(step, lowestBuyerPays - step);
      const sellerGets = getPriceAfterFees(undercutBuyerPays);
      const buyerStr = formatCentsViaSteam(undercutBuyerPays);
      const sellerStr = formatCentsViaSteam(sellerGets);
      if (confirm(`Quick Sell "${marketName}"?\n\nBuyer pays: ${buyerStr}\nYou receive: ${sellerStr}\n(Cheapest on market)`)) {
        const assetId = item?.assetid || document.querySelector('.activeInfo')?.id?.split('_')[2] || '';
        const res = await sellItemOnMarket(assetId, sellerGets);
        if (res.success) {
          quickBtn.textContent = 'Listed!';
          quickBtn.style.background = '#16a34a';
          showSellNotification(`"${marketName}" listed for ${buyerStr}. Confirm in Steam Mobile app.`);
        } else {
          quickBtn.textContent = 'Failed';
          quickBtn.style.background = '#dc2626';
        }
      } else {
        quickBtn.textContent = 'Quick Sell';
        quickBtn.disabled = false;
      }
    } catch {
      quickBtn.textContent = 'Error';
      quickBtn.disabled = false;
    }
  });

  // ⚡ Instant Sell (second — more aggressive)
  const instantBtn = document.createElement('button') as HTMLButtonElement;
  instantBtn.className = 'sk-quick-sell';
  instantBtn.textContent = 'Instant Sell';
  instantBtn.style.cssText = btnStyle + 'background:#dc2626; margin-left:6px;';
  instantBtn.title = 'Sell at highest buy order (instant)';
  instantBtn.onmouseenter = () => { instantBtn.style.filter = 'brightness(1.2)'; };
  instantBtn.onmouseleave = () => { instantBtn.style.filter = ''; };
  instantBtn.addEventListener('click', async () => {
    instantBtn.textContent = 'Loading...';
    instantBtn.disabled = true;
    try {
      const buyerPays = await getHighestBuyOrder(marketName, walletCurr);
      if (!buyerPays) { instantBtn.textContent = 'No orders'; instantBtn.disabled = false; return; }
      const sellerGets = getPriceAfterFees(buyerPays);
      const buyerStr = formatCentsViaSteam(buyerPays);
      const sellerStr = formatCentsViaSteam(sellerGets);
      if (confirm(`Instant Sell "${marketName}"?\n\nBuyer pays: ${buyerStr}\nYou receive: ${sellerStr}`)) {
        const assetId = item?.assetid || document.querySelector('.activeInfo')?.id?.split('_')[2] || '';
        const res = await sellItemOnMarket(assetId, sellerGets);
        if (res.success) {
          instantBtn.textContent = 'Sold!';
          instantBtn.style.background = '#16a34a';
          showSellNotification(`"${marketName}" listed for ${buyerStr}. Confirm in Steam Mobile app.`);
        } else {
          instantBtn.textContent = 'Failed';
          instantBtn.style.background = '#dc2626';
        }
      } else {
        instantBtn.textContent = 'Instant Sell';
        instantBtn.disabled = false;
      }
    } catch {
      instantBtn.textContent = 'Error';
      instantBtn.disabled = false;
    }
  });

  // Insert inline — same row as Steam's Sell button
  sellBtn.insertAdjacentElement('afterend', instantBtn);
  sellBtn.insertAdjacentElement('afterend', quickBtn);
}

// ─── Sell Notification Toast ──────────────────────────────────────────

function showSellNotification(message: string) {
  document.querySelector('#sk-sell-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'sk-sell-toast';
  toast.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 99999;
    background: rgba(13,17,23,0.95); backdrop-filter: blur(8px);
    border: 1px solid rgba(74,222,128,0.4); border-radius: 8px;
    padding: 14px 18px; max-width: 340px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    color: #e2e8f0; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    animation: sk-toast-in 0.3s ease-out;
  `;
  toast.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:20px;line-height:1">✅</span>
      <div>
        <div style="font-weight:700;font-size:13px;margin-bottom:4px">Item Listed</div>
        <div style="font-size:12px;color:#8b949e;line-height:1.4">${message}</div>
      </div>
    </div>
  `;

  // Add animation keyframes if not already added
  if (!document.querySelector('#sk-toast-style')) {
    const style = document.createElement('style');
    style.id = 'sk-toast-style';
    style.textContent = `
      @keyframes sk-toast-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes sk-toast-out { from { opacity: 1; } to { opacity: 0; transform: translateY(10px); } }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  // Auto-dismiss after 6 seconds
  setTimeout(() => {
    toast.style.animation = 'sk-toast-out 0.3s ease-in forwards';
    setTimeout(() => toast.remove(), 300);
  }, 6000);

  // Click to dismiss
  toast.addEventListener('click', () => toast.remove());
}

// ═══════════════════════════════════════════════════════════════════════
// Bulk Sell System
// ═══════════════════════════════════════════════════════════════════════

let sellMode = false;
let selectedAssets = new Set<string>(); // assetIds selected for selling
let sellInProgress = false;

function toggleSellMode() {
  sellMode = !sellMode;
  selectedAssets.clear();

  const btn = document.querySelector('.sk-sell-toggle');
  if (btn) {
    btn.textContent = sellMode ? 'Cancel Sell' : 'Sell';
    btn.classList.toggle('sk-cta-sell', !sellMode);
    btn.classList.toggle('sk-cta-cancel', sellMode);
  }

  // Toggle checkboxes on items
  document.querySelectorAll('.item.app730.context2').forEach(elem => {
    const htmlEl = elem as HTMLElement;
    const assetId = htmlEl.id?.split('_')[2];
    if (!assetId) return;
    const item = assetMap.get(assetId);
    if (!item || !item.tradable || !item.marketable) return;

    let cb = htmlEl.querySelector('.sk-sell-cb') as HTMLElement | null;
    if (sellMode) {
      if (!cb) {
        cb = el('div', 'sk-sell-cb');
        cb.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (selectedAssets.has(assetId)) {
            selectedAssets.delete(assetId);
            cb!.classList.remove('sk-checked');
            htmlEl.classList.remove('sk-item-sell-selected');
          } else {
            selectedAssets.add(assetId);
            cb!.classList.add('sk-checked');
            htmlEl.classList.add('sk-item-sell-selected');
          }
          updateSellBar();
        });
        htmlEl.appendChild(cb);
      }
      cb.style.display = '';
    } else {
      if (cb) cb.style.display = 'none';
      cb?.classList.remove('sk-checked');
      htmlEl.classList.remove('sk-item-sell-selected');
    }
  });

  if (sellMode) {
    showSellBar();
  } else {
    hideSellBar();
  }
}

function showSellBar() {
  if (document.getElementById('sk-sell-bar')) return;

  const bar = el('div');
  bar.id = 'sk-sell-bar';
  bar.className = 'sk-sell-bar';
  bar.innerHTML = `
    <div class="sk-sell-bar-info">
      <span class="sk-sell-count">0 items</span>
      <span class="sk-sell-total"></span>
    </div>
    <div class="sk-sell-bar-controls">
      <select class="sk-sell-strategy">
        <option value="steam_lowest">Steam lowest - 1¢</option>
        <option value="buff_match">Match Buff price</option>
        <option value="buff_plus5">Buff + 5%</option>
      </select>
      <button class="sk-sell-btn" disabled>List on Market</button>
    </div>
  `;
  document.body.appendChild(bar);

  bar.querySelector('.sk-sell-btn')?.addEventListener('click', startBulkSell);
}

function hideSellBar() {
  document.getElementById('sk-sell-bar')?.remove();
}

function updateSellBar() {
  const countEl = document.querySelector('.sk-sell-count');
  const totalEl = document.querySelector('.sk-sell-total');
  const btnEl = document.querySelector('.sk-sell-btn') as HTMLButtonElement | null;

  if (!countEl) return;

  let total = 0;
  for (const assetId of selectedAssets) {
    const item = assetMap.get(assetId);
    if (item) total += getItemPrice(item.market_hash_name, exchangeRate);
  }

  countEl.textContent = `${selectedAssets.size} item${selectedAssets.size !== 1 ? 's' : ''}`;
  if (totalEl) totalEl.textContent = total > 0 ? `~ ${fmtPrice(total)}` : '';
  if (btnEl) btnEl.disabled = selectedAssets.size === 0 || sellInProgress;
}

async function startBulkSell() {
  if (selectedAssets.size === 0 || sellInProgress) return;

  const strategy = (document.querySelector('.sk-sell-strategy') as HTMLSelectElement)?.value || 'steam_lowest';

  // Build sell queue with prices
  const queue: Array<{ assetId: string; name: string; priceCents: number }> = [];

  for (const assetId of selectedAssets) {
    const item = assetMap.get(assetId);
    if (!item) continue;

    const steamPriceUsd = getItemPrice(item.market_hash_name, 1); // USD
    const enriched = enrichedMap.get(assetId);
    const buffPriceUsd = enriched?.prices?.buff || steamPriceUsd;

    let sellerReceivesCents: number;
    switch (strategy) {
      case 'buff_match':
        sellerReceivesCents = Math.round(buffPriceUsd * 100);
        break;
      case 'buff_plus5':
        sellerReceivesCents = Math.round(buffPriceUsd * 100 * 1.05);
        break;
      case 'steam_lowest':
      default:
        // Seller receives = steam price (what buyer pays) minus fees
        sellerReceivesCents = calcSellerReceives(Math.round(steamPriceUsd * 100));
        if (sellerReceivesCents > 1) sellerReceivesCents -= 1; // undercut by 1¢
        break;
    }

    if (sellerReceivesCents < 3) sellerReceivesCents = 3; // Steam minimum

    queue.push({ assetId, name: item.market_hash_name, priceCents: sellerReceivesCents });
  }

  if (queue.length === 0) return;

  // Confirmation
  const totalBuyer = queue.reduce((s, q) => s + calcBuyerPrice(q.priceCents), 0);
  const totalSeller = queue.reduce((s, q) => s + q.priceCents, 0);

  const confirmed = confirm(
    `List ${queue.length} items on Steam Market?\n\n` +
    `Buyers pay: ~$${(totalBuyer / 100).toFixed(2)}\n` +
    `You receive: ~$${(totalSeller / 100).toFixed(2)}\n` +
    `Fees: ~$${((totalBuyer - totalSeller) / 100).toFixed(2)}\n\n` +
    `This will take ~${Math.ceil(queue.length * 1.5 / 60)} minutes.`
  );
  if (!confirmed) return;

  // Execute queue
  sellInProgress = true;
  const btnEl = document.querySelector('.sk-sell-btn') as HTMLButtonElement | null;
  const countEl = document.querySelector('.sk-sell-count');
  let success = 0;
  let failed = 0;

  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    if (countEl) countEl.textContent = `Selling ${i + 1}/${queue.length}...`;
    if (btnEl) btnEl.textContent = `${i + 1}/${queue.length}`;

    const result = await sellItemOnMarket(q.assetId, q.priceCents);
    if (result.success) {
      success++;
      // Mark item as sold visually
      const itemEl = document.getElementById(`730_2_${q.assetId}`);
      if (itemEl) {
        itemEl.style.opacity = '0.3';
        itemEl.classList.remove('sk-item-sell-selected');
        const cb = itemEl.querySelector('.sk-sell-cb');
        if (cb) (cb as HTMLElement).style.display = 'none';
      }
      selectedAssets.delete(q.assetId);
    } else {
      failed++;
      console.warn(`[SkinKeeper] Failed to sell ${q.name}: ${result.message}`);
    }

    // Rate limit: 1.5s between requests
    if (i < queue.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  sellInProgress = false;
  if (countEl) countEl.textContent = `Done: ${success} listed, ${failed} failed`;
  if (btnEl) { btnEl.textContent = 'List on Market'; btnEl.disabled = true; }

  // Exit sell mode after 3s
  setTimeout(() => {
    if (sellMode) toggleSellMode();
  }, 3000);
}

// ═══════════════════════════════════════════════════════════════════════
// Trade-Up Calculator
// ═══════════════════════════════════════════════════════════════════════

let tradeUpMode = false;
let tuSelected = new Set<string>(); // assetIds

function toggleTradeUpMode() {
  if (sellMode) toggleSellMode(); // exit sell mode first
  tradeUpMode = !tradeUpMode;
  tuSelected.clear();

  const btn = document.querySelector('.sk-tu-toggle');
  if (btn) {
    btn.textContent = tradeUpMode ? 'Cancel Trade-Up' : 'Trade-Up';
    btn.classList.toggle('sk-cta-amber', !tradeUpMode);
    btn.classList.toggle('sk-cta-cancel', tradeUpMode);
  }

  // Toggle checkboxes on marketable items (not storage units, not tools)
  document.querySelectorAll('.item.app730.context2').forEach(elem => {
    const htmlEl = elem as HTMLElement;
    const assetId = htmlEl.id?.split('_')[2];
    if (!assetId) return;
    const item = assetMap.get(assetId);
    if (!item || item.type === 'Storage Unit' || !item.marketable) return;

    let cb = htmlEl.querySelector('.sk-tu-cb') as HTMLElement | null;
    if (tradeUpMode) {
      if (!cb) {
        cb = el('div', ['sk-sell-cb', 'sk-tu-cb']);
        cb.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (tuSelected.has(assetId)) {
            tuSelected.delete(assetId);
            cb!.classList.remove('sk-checked');
            htmlEl.classList.remove('sk-item-tu-selected');
          } else {
            if (tuSelected.size >= 10) return; // max 10
            tuSelected.add(assetId);
            cb!.classList.add('sk-checked');
            htmlEl.classList.add('sk-item-tu-selected');
          }
          updateTradeUpPanel();
        });
        htmlEl.appendChild(cb);
      }
      cb.style.display = '';
    } else {
      if (cb) cb.style.display = 'none';
      cb?.classList.remove('sk-checked');
      htmlEl.classList.remove('sk-item-tu-selected');
    }
  });

  if (tradeUpMode) {
    showTradeUpPanel();
  } else {
    hideTradeUpPanel();
  }
}

function showTradeUpPanel() {
  if (document.getElementById('sk-tu-panel')) return;

  const panel = el('div');
  panel.id = 'sk-tu-panel';
  panel.className = 'sk-tu-panel';
  panel.innerHTML = `
    <div class="sk-tu-header">
      <span style="font-weight:700;font-size:14px">Trade-Up Calculator</span>
      <span class="sk-tu-count">0/10 selected</span>
    </div>
    <div class="sk-tu-body">
      <div class="sk-tu-hint">Select up to 10 items of the same rarity</div>
    </div>
  `;
  document.body.appendChild(panel);
}

function hideTradeUpPanel() {
  document.getElementById('sk-tu-panel')?.remove();
}

async function updateTradeUpPanel() {
  const panel = document.getElementById('sk-tu-panel');
  if (!panel) return;

  const countEl = panel.querySelector('.sk-tu-count');
  const bodyEl = panel.querySelector('.sk-tu-body');
  if (!countEl || !bodyEl) return;

  countEl.textContent = `${tuSelected.size}/10 selected`;

  if (tuSelected.size === 0) {
    bodyEl.innerHTML = '<div class="sk-tu-hint">Select up to 10 items of the same rarity</div>';
    return;
  }

  // Build inputs
  const inputs: TradeUpInput[] = [];
  for (const assetId of tuSelected) {
    const item = assetMap.get(assetId);
    if (!item) continue;
    const enriched = enrichedMap.get(assetId);
    const price = getItemPrice(item.market_hash_name, exchangeRate);

    inputs.push({
      name: item.name,
      market_hash_name: item.market_hash_name,
      collection: enriched?.prices ? (enrichedMap.get(assetId) as any)?.collection || 'Unknown' : 'Unknown',
      rarity: normalizeRarity(item.rarity || 'Unknown'),
      float_value: enriched?.float_value || 0.5,
      price,
      stattrak: item.market_hash_name.includes('StatTrak'),
    });
  }

  // Validate
  const validation = validateInputs(inputs);

  // Show selected items list
  const inputCost = inputs.reduce((s, i) => s + i.price, 0);
  const avgFloat = inputs.reduce((s, i) => s + i.float_value, 0) / inputs.length;
  const rarities = [...new Set(inputs.map(i => i.rarity))];

  let html = '<div class="sk-tu-items">';
  html += '<div class="sk-tu-section-label">Selected Items</div>';
  for (const inp of inputs) {
    const shortName = inp.name.replace(/^StatTrak™ /, 'ST ');
    html += `<div class="sk-tu-item-row">
      <span class="sk-tu-item-name" title="${inp.name}">${shortName}</span>
      <span class="sk-tu-item-price">${inp.price > 0 ? fmtPrice(inp.price) : '—'}</span>
    </div>`;
  }
  html += '</div>';

  html += `
    <div class="sk-price-row"><span class="sk-price-source">Input Cost</span><span class="sk-price-value">${fmtPrice(inputCost)}</span></div>
    <div class="sk-price-row"><span class="sk-price-source">Avg Float</span><span class="sk-price-value" style="font-family:monospace">${avgFloat.toFixed(4)}</span></div>
    <div class="sk-price-row"><span class="sk-price-source">Rarity</span><span class="sk-price-value">${rarities.join(', ')}</span></div>
  `;

  if (!validation.valid) {
    html += `<div class="sk-trade-warning" style="margin:6px 0">${validation.error}</div>`;
    bodyEl.innerHTML = html;
    return;
  }

  if (tuSelected.size < 10) {
    html += `<div class="sk-tu-hint" style="margin-top:6px">Need ${10 - tuSelected.size} more items</div>`;
  }

  // Calculate trade-up (async — fetches collection data)
  if (tuSelected.size === 10) {
    html += '<div class="sk-tu-hint">Calculating outputs...</div>';
    bodyEl.innerHTML = html;

    const result = await calculateTradeUp(inputs);

    // Re-check panel still exists and selection unchanged
    if (!document.getElementById('sk-tu-panel') || tuSelected.size !== 10) return;

    let outputHtml = html.replace('Calculating outputs...', '');

    if (result.outputs.length === 0) {
      outputHtml += '<div class="sk-trade-warning">No valid outputs found for these collections</div>';
    } else {
      outputHtml += '<div style="border-top:1px solid var(--sk-border-subtle);margin:6px 0;padding-top:6px">';
      outputHtml += '<div class="sk-tu-section-label">Possible Outputs</div>';

      // Calculate EV using bulk prices
      let ev = 0;
      for (const out of result.outputs) {
        const outPrice = getItemPrice(out.market_hash_name, exchangeRate);
        ev += out.probability * outPrice;
        const pctStr = (out.probability * 100).toFixed(1);
        const priceStr = outPrice > 0 ? fmtPrice(outPrice) : '?';

        outputHtml += `<div class="sk-price-row" style="font-size:11px">
          <span class="sk-price-source" style="flex:1" title="${out.collection}">${out.name}</span>
          <span style="color:var(--sk-text-dim);font-size:10px;margin:0 6px">${pctStr}%</span>
          <span class="sk-price-value">${priceStr}</span>
        </div>`;
      }
      outputHtml += '</div>';

      // EV + Profit
      const profit = ev - inputCost;
      const roi = inputCost > 0 ? (profit / inputCost) * 100 : 0;
      const isProfit = profit >= 0;

      outputHtml += `
        <div style="border-top:1px solid var(--sk-border-subtle);margin:6px 0;padding-top:6px">
          <div class="sk-price-row"><span class="sk-price-source">Expected Value</span><span class="sk-price-value">${fmtPrice(ev)}</span></div>
          <div class="sk-price-row"><span class="sk-price-source">Profit</span><span class="sk-price-value" style="color:${isProfit ? 'var(--sk-green)' : 'var(--sk-red)'}">${isProfit ? '+' : ''}${fmtPrice(profit)} (${isProfit ? '+' : ''}${roi.toFixed(1)}%)</span></div>
        </div>
      `;
    }

    bodyEl.innerHTML = outputHtml;
    return;
  }

  bodyEl.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════
// Export Inventory
// ═══════════════════════════════════════════════════════════════════════

function buildExportData(): Array<Record<string, any>> {
  const rows: Array<Record<string, any>> = [];
  const seen = new Map<string, boolean>();

  for (const item of items) {
    if (item.type === 'Storage Unit') continue;

    const enriched = enrichedMap.get(item.assetid);
    const price = getItemPrice(item.market_hash_name, exchangeRate);
    const pl = plMap.get(item.market_hash_name);

    rows.push({
      name: item.market_hash_name,
      price: price ? Math.round(price * 100) / 100 : 0,
      currency: currencyCode,
      float: enriched?.float_value ?? '',
      wear: enriched?.wear ?? '',
      paint_seed: enriched?.paint_seed ?? '',
      rarity: item.rarity ?? '',
      tradable: item.tradable,
      sticker_value: enriched?.sticker_value ?? '',
      buy_price: pl ? Math.round((pl.avgBuyCents / 100) * exchangeRate * 100) / 100 : '',
      profit_pct: pl?.profitPct ?? '',
      type: item.type,
    });
  }
  return rows;
}

function exportCSV() {
  const rows = buildExportData();
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const v = r[h];
      if (typeof v === 'string' && (v.includes(',') || v.includes('"'))) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    }).join(','))
  ].join('\n');

  downloadFile(csv, 'skinkeeper-inventory.csv', 'text/csv');
}

function exportJSON() {
  const rows = buildExportData();
  const json = JSON.stringify(rows, null, 2);
  downloadFile(json, 'skinkeeper-inventory.json', 'application/json');
}

function exportClipboard() {
  const rows = buildExportData();
  let total = 0;
  const unique = new Set<string>();

  for (const r of rows) {
    total += r.price || 0;
    unique.add(r.name);
  }

  const top5 = [...rows].sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, 5);

  const text = [
    `SkinKeeper Inventory Summary`,
    `${rows.length} items | ${unique.size} unique | Total: ${fmtPrice(total)}`,
    ``,
    `Top 5:`,
    ...top5.map((r, i) => `${i + 1}. ${r.name} — ${fmtPrice(r.price)}`),
    ``,
    `Exported via SkinKeeper — skinkeeper.store`,
  ].join('\n');

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.sk-export-menu');
    if (btn) {
      const note = el('div', 'sk-export-option');
      note.style.color = 'var(--sk-green)';
      note.textContent = 'Copied!';
      btn.appendChild(note);
      setTimeout(() => note.remove(), 1500);
    }
  });
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

init();
