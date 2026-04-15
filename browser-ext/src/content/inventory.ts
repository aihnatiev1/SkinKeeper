import '../styles/skinkeeper.css';
import { initCollector } from '../shared/collector';
import { waitForElement, el, skBadge, sendMessage } from '../shared/dom';
import {
  readInventoryFromPage, loadFullInventory, loadBulkPrices, loadExchangeRates,
  getItemPrice, getItemPriceEntry, getWalletCurrency, getWalletCurrencyCode,
  sellItemOnMarket, calcBuyerPrice, calcSellerReceives,
  getLowestListingPrice, getHighestBuyOrder,
  getPriceAfterFees, formatCentsViaSteam, getSessionID,
  getMarketPriceOverview,
  type SteamItem, type PriceOverview
} from '../shared/steam';
import { analyzePrice, createRatioBadge, createArbitrageBadge, type MultiPrice } from '../shared/pricing';
import { formatFloat, getFloatColor, getWearName, getWearShort, getWearFromName, isLowFloat, createFloatBar } from '../shared/float';
import { getDopplerPhase, isDoppler, isFade, isMarbleFade, calculateFadePercent, analyzeMarbleFade, analyzeBlueGem, createPhaseBadge, loadDopplerIconMap, getDopplerPhaseFromIcon, type PhaseInfo } from '../shared/phases';
import { formatSP, calculateStickerSP, type StickerInfo } from '../shared/stickers';
import { formatTradeLock } from '../shared/sell';
import { calculateTradeUp, validateInputs, normalizeRarity, type TradeUpInput } from '../shared/tradeup';
import { preloadBlueGemData, getBlueGemPercentSync, isBlueGemEligible, type BlueGemEntry } from '../shared/bluegem';
import { renderItemOverlays, clearItemOverlays, type ItemOverlayData } from '../shared/itemOverlay';
import { injectMiniCard, updateMiniCardInventory } from '../shared/miniCard';
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

// Currencies where Steam uses whole numbers (no cents/kopecks)
const NO_DECIMAL_CODES = new Set(['RUB', 'UAH', 'TRY', 'KZT', 'CLP', 'PEN', 'COP', 'PHP', 'CRC', 'UYU', 'NOK']);

function fmtPrice(val: number): string {
  if (!val) return '';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  const noDecimals = NO_DECIMAL_CODES.has(currencyCode);
  if (noDecimals || abs >= 10000) return `${sign}${currencySign}${Math.round(abs).toLocaleString()}`;
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
  await new Promise(r => setTimeout(r, 1000));

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

  // Persist detected currency for miniCard and other pages
  chrome.storage.local.set({ sk_user_currency: currencyCode, sk_exchange_rate: exchangeRate });

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

    injectMiniCard();
    updateMiniCardInventory({
      itemCount: items.length,
      uniqueCount: uniqueNames.size,
      totalValue: fmtPrice(totalValue) || `${currencySign}0`,
    });
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
    startTradeLockCountdown();

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

let selectMode = false;

function injectControlBar() {
  if (document.getElementById('sk-control-bar')) return;

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

  // ── Selection buttons (SIH-style) ──
  const selectItemsBtn = el('button', ['sk-banner-cta', 'sk-cta-secondary']);
  selectItemsBtn.id = 'sk-select-items-btn';
  selectItemsBtn.textContent = 'SELECT ITEMS';
  selectItemsBtn.style.cssText += 'padding:5px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px';
  selectItemsBtn.addEventListener('click', () => enterSelectMode());
  bar.appendChild(selectItemsBtn);

  const selectAllBtn = el('button', ['sk-banner-cta', 'sk-cta-secondary']);
  selectAllBtn.id = 'sk-select-all-btn';
  selectAllBtn.textContent = 'SELECT ALL';
  selectAllBtn.style.cssText += 'padding:5px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px';
  selectAllBtn.addEventListener('click', () => selectAllItems());
  bar.appendChild(selectAllBtn);

  // Cancel button (hidden initially)
  const cancelBtn = el('button', ['sk-banner-cta', 'sk-cta-cancel']);
  cancelBtn.id = 'sk-cancel-select-btn';
  cancelBtn.textContent = 'CANCEL';
  cancelBtn.style.cssText += 'padding:5px 12px;font-size:11px;display:none;text-transform:uppercase;letter-spacing:0.5px';
  cancelBtn.addEventListener('click', () => exitSelectMode());
  bar.appendChild(cancelBtn);

  // Select locked checkbox (hidden initially)
  const lockLabel = el('label');
  lockLabel.id = 'sk-select-locked-label';
  lockLabel.style.cssText = 'display:none;font-size:11px;color:var(--sk-text-dim);cursor:pointer;align-items:center;gap:4px';
  const lockCb = document.createElement('input');
  lockCb.type = 'checkbox';
  lockCb.id = 'sk-select-locked';
  lockCb.style.cssText = 'accent-color:var(--sk-primary)';
  lockLabel.append(lockCb, document.createTextNode('Select locked'));
  lockCb.addEventListener('change', () => {
    // Re-apply cursor to all items when checkbox toggled
    if (selectMode) {
      document.querySelectorAll('.item.app730.context2').forEach(elem => {
        const htmlEl = elem as HTMLElement;
        const id = htmlEl.id?.split('_')[2];
        if (!id) return;
        const it = assetMap.get(id);
        if (!it) return;
        if (lockCb.checked || (it.marketable && it.tradable)) {
          htmlEl.style.cursor = 'pointer';
          htmlEl.style.opacity = '';
        } else {
          htmlEl.style.cursor = '';
        }
      });
    }
  });
  bar.appendChild(lockLabel);

  // Selected counter (hidden initially)
  const selectedVal = el('span');
  selectedVal.id = 'sk-selected-value';
  selectedVal.style.cssText = 'font-size:12px;color:var(--sk-primary-light);font-weight:700;display:none;white-space:nowrap';
  bar.appendChild(selectedVal);

  // Spacer
  const spacer = el('div');
  spacer.style.flex = '1';
  bar.appendChild(spacer);

  // GO TO SALE button (hidden initially, appears after selection)
  const goSaleBtn = el('button', ['sk-banner-cta', 'sk-cta-sell']);
  goSaleBtn.id = 'sk-go-sale-btn';
  goSaleBtn.textContent = 'GO TO SALE';
  goSaleBtn.style.cssText += 'padding:6px 16px;font-size:12px;font-weight:700;display:none;text-transform:uppercase;letter-spacing:0.5px;background:linear-gradient(135deg,#059669,#10b981);border:none;color:#fff';
  goSaleBtn.addEventListener('click', () => openSellQueue());
  bar.appendChild(goSaleBtn);

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
    display:none;position:absolute;top:100%;right:0;margin-top:4px;z-index:10001;
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
    const invPage = document.querySelector('.inventory_page');
    invPage?.parentElement?.insertBefore(bar, invPage);
  }
}

// ─── Select Mode (SIH-style) ────────────────────────────────────────

function enterSelectMode() {
  selectMode = true;
  selectedAssets.clear();
  updateSelectModeUI();
  // Mark selectable items with pointer cursor
  document.querySelectorAll('.item.app730.context2').forEach(elem => {
    const htmlEl = elem as HTMLElement;
    const assetId = htmlEl.id?.split('_')[2];
    if (!assetId) return;
    const item = assetMap.get(assetId);
    if (!item || !item.marketable) return;
    const includeLocked = (document.getElementById('sk-select-locked') as HTMLInputElement)?.checked;
    if (!item.tradable && !includeLocked) return;
    htmlEl.style.cursor = 'pointer';
  });
}

function exitSelectMode() {
  selectMode = false;
  selectedAssets.clear();
  document.querySelectorAll('.sk-item-sell-selected').forEach(e => e.classList.remove('sk-item-sell-selected'));
  updateSelectModeUI();
  // Close sell queue if open
  document.getElementById('sk-sell-queue')?.remove();
}

function selectAllItems() {
  selectMode = true;
  const includeLocked = (document.getElementById('sk-select-locked') as HTMLInputElement)?.checked;
  // Only select items on the currently visible inventory page
  const visiblePage = document.querySelector('.inventory_page:not([style*="display: none"]):not([style*="display:none"])')
    || document.querySelector('.inventory_page');
  const scope = visiblePage || document;
  scope.querySelectorAll('.item.app730.context2').forEach(elem => {
    const htmlEl = elem as HTMLElement;
    // Skip hidden items (Steam hides items not on current page)
    if (htmlEl.offsetParent === null) return;
    // Skip items already listed for sale
    if (htmlEl.style.opacity === '0.3') return;
    const assetId = htmlEl.id?.split('_')[2];
    if (!assetId) return;
    const item = assetMap.get(assetId);
    if (!item || !item.marketable) return;
    if (!item.tradable && !includeLocked) return;
    selectedAssets.add(assetId);
    htmlEl.classList.add('sk-item-sell-selected');
  });
  updateSelectModeUI();
}

function updateSelectModeUI() {
  const selectBtn = document.getElementById('sk-select-items-btn');
  const selectAllbtn = document.getElementById('sk-select-all-btn');
  const cancelBtn = document.getElementById('sk-cancel-select-btn');
  const lockLabel = document.getElementById('sk-select-locked-label');
  const counter = document.getElementById('sk-selected-value');
  const goSaleBtn = document.getElementById('sk-go-sale-btn');

  if (selectMode) {
    if (selectBtn) selectBtn.style.display = 'none';
    if (selectAllbtn) selectAllbtn.style.display = '';
    if (cancelBtn) cancelBtn.style.display = '';
    if (lockLabel) lockLabel.style.display = 'flex';
    if (counter) counter.style.display = '';
  } else {
    if (selectBtn) selectBtn.style.display = '';
    if (selectAllbtn) selectAllbtn.style.display = '';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (lockLabel) lockLabel.style.display = 'none';
    if (counter) counter.style.display = 'none';
    if (goSaleBtn) goSaleBtn.style.display = 'none';
    return;
  }

  // Update counter
  let totalValue = 0;
  for (const id of selectedAssets) {
    const item = assetMap.get(id);
    if (item) totalValue += getItemPrice(item.market_hash_name, exchangeRate);
  }
  if (counter) {
    counter.textContent = `Selected: ${selectedAssets.size} pc \u00b7 ${fmtPrice(totalValue)}`;
  }
  if (goSaleBtn) {
    goSaleBtn.style.display = selectedAssets.size > 0 ? '' : 'none';
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
    clearItemOverlays(htmlEl);
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

  // ── Shared overlays (price, exterior, float, doppler, seed, stickers, etc.) ──
  const pl = plMap.get(item.market_hash_name);
  const overlayData: ItemOverlayData = {
    market_hash_name: item.market_hash_name,
    name: item.name,
    type: item.type,
    price,
    priceFormatted: price > 0 ? fmtPrice(price) : undefined,
    floatValue: floatVal,
    paintSeed,
    paintIndex,
    defindex: item.defindex ?? null,
    isStatTrak: item.isStatTrak,
    isSouvenir: item.isSouvenir,
    tradable: item.tradable,
    tradeLockDate: item.tradeLockDate ?? null,
    tradeBanUntil: enriched?.trade_ban_until ?? null,
    stickerValueFormatted: (enriched?.sticker_value && enriched.sticker_value > 0.1) ? fmtUsd(enriched.sticker_value) : null,
    dupCount: dupCount.get(item.market_hash_name) || 0,
    plPct: (pl && pl.avgBuyCents > 0) ? pl.profitPct : null,
    plProfit: (pl && pl.avgBuyCents > 0) ? pl.profitCents >= 0 : false,
    rarityColor: item.rarityColor,
  };
  renderItemOverlays(htmlEl, overlayData);

  // ── Inventory-specific: Value-based background highlight ──

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

// ─── Item Selection (SIH-style click to select) ─────────────────────

let selectedAssetIds = new Set<string>();

function setupItemSelection() {
  // Use CAPTURE phase so our handler fires BEFORE Steam's own click handlers
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest?.('.item.app730.context2') as HTMLElement | null;
    if (!target) return;

    const assetId = target.id?.split('_')[2];
    if (!assetId) return;
    let item = assetMap.get(assetId);

    // If item not in assetMap yet (lazy loading), try to add it
    if (!item && items.length > 0) {
      const found = items.find(i => i.assetid === assetId);
      if (found) {
        assetMap.set(assetId, found);
        item = found;
      }
    }
    if (!item) return;

    // In trade-up mode: click toggles trade-up selection
    if (tradeUpMode) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!isTradeUpEligible(item)) return;
      if (tuSelected.has(assetId)) {
        tuSelected.delete(assetId);
        target.classList.remove('sk-item-tu-selected');
      } else {
        if (tuSelected.size >= 10) return;
        tuSelected.add(assetId);
        target.classList.add('sk-item-tu-selected');
      }
      // Highlight only compatible items (same rarity + StatTrak match)
      highlightTradeUpCompatible();
      updateTradeUpPanel();
      return;
    }

    // In select mode: click toggles selection for selling
    if (selectMode) {
      e.preventDefault();
      e.stopImmediatePropagation();
      // Skip items already listed for sale (faded out)
      if (target.style.opacity === '0.3') return;
      const includeLocked = (document.getElementById('sk-select-locked') as HTMLInputElement)?.checked;
      // When "Select locked" is ON, allow non-tradable items (even non-marketable ones with trade ban)
      if (!includeLocked) {
        if (!item.marketable || !item.tradable) return;
      }

      if (e.ctrlKey || e.metaKey) {
        // Ctrl+click: select/deselect ALL items with same name
        const isSelected = selectedAssets.has(assetId);
        document.querySelectorAll('.item.app730.context2').forEach((elem) => {
          const id = elem.id?.split('_')[2];
          if (!id) return;
          const it = assetMap.get(id);
          if (it?.market_hash_name !== item.market_hash_name) return;
          if (!it.marketable || (!it.tradable && !includeLocked)) return;
          if (isSelected) {
            selectedAssets.delete(id);
            (elem as HTMLElement).classList.remove('sk-item-sell-selected');
          } else {
            selectedAssets.add(id);
            (elem as HTMLElement).classList.add('sk-item-sell-selected');
          }
        });
      } else {
        if (selectedAssets.has(assetId)) {
          selectedAssets.delete(assetId);
          target.classList.remove('sk-item-sell-selected');
        } else {
          selectedAssets.add(assetId);
          target.classList.add('sk-item-sell-selected');
        }
      }
      updateSelectModeUI();
      // Also update sell queue if open
      const queue = document.getElementById('sk-sell-queue');
      if (queue) renderSellQueue();
      return;
    }

    // Normal mode: Ctrl+click for value calculation
    if (e.ctrlKey || e.metaKey) {
      if (selectedAssetIds.has(assetId)) {
        selectedAssetIds.delete(assetId);
        target.classList.remove('sk-item-selected');
      } else {
        selectedAssetIds.add(assetId);
        target.classList.add('sk-item-selected');
      }
    }
  }, true); // <-- capture phase: fires BEFORE Steam's handlers
}

// ─── Trade Lock Live Countdown ────────────────────────────────────────

function startTradeLockCountdown() {
  setInterval(() => {
    if (document.hidden) return;
    const now = Date.now();
    document.querySelectorAll('.sk-lock-badge[data-sk-unlock]').forEach(badge => {
      const unlock = parseInt(badge.getAttribute('data-sk-unlock') || '0');
      if (!unlock) return;
      const diff = unlock - now;
      if (diff <= 0) {
        badge.textContent = 'TRADABLE';
        (badge as HTMLElement).style.color = '#4ade80';
        (badge as HTMLElement).style.background = 'rgba(74,222,128,0.15)';
        badge.removeAttribute('data-sk-unlock');
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) badge.textContent = `${d}d ${h}h ${m}m`;
      else if (h > 0) badge.textContent = `${h}h ${m}m ${s}s`;
      else badge.textContent = `${m}m ${s}s`;
    });
  }, 1000);
}

// ─── Detail Panel ─────────────────────────────────────────────────────

let enhancingDetail = false; // guard against MutationObserver re-entrancy

function observeDetail() {
  const handleMutation = (panel: HTMLElement, mutations: MutationRecord[]) => {
    // Ignore mutations caused by our own elements (sk- prefix)
    if (enhancingDetail) return;
    const isOwnMutation = mutations.every(m => {
      for (let i = 0; i < m.addedNodes.length; i++) {
        const n = m.addedNodes[i] as HTMLElement;
        if (n.className && typeof n.className === 'string' &&
            (n.className.includes('sk-') || n.className.includes('sk_'))) continue;
        return false;
      }
      for (let i = 0; i < m.removedNodes.length; i++) {
        const n = m.removedNodes[i] as HTMLElement;
        if (n.className && typeof n.className === 'string' &&
            (n.className.includes('sk-') || n.className.includes('sk_'))) continue;
        return false;
      }
      return m.addedNodes.length > 0 || m.removedNodes.length > 0;
    });
    if (isOwnMutation) return;

    clearTimeout((panel as any)._sk);
    (panel as any)._sk = setTimeout(() => {
      enhancingDetail = true;
      try { enhanceDetail(panel); } finally { enhancingDetail = false; }
    }, 300);
  };

  // Legacy Steam: iteminfo0/iteminfo1
  for (const id of ['iteminfo0', 'iteminfo1']) {
    const panel = document.getElementById(id);
    if (!panel) continue;
    new MutationObserver((mutations) => handleMutation(panel, mutations))
      .observe(panel, { childList: true, subtree: true });
  }

  // New Steam React UI: [data-featuretarget="iteminfo"]
  const reactPanel = document.querySelector('[data-featuretarget="iteminfo"]');
  if (reactPanel) {
    new MutationObserver((mutations) => handleMutation(reactPanel as HTMLElement, mutations))
      .observe(reactPanel as HTMLElement, { childList: true, subtree: true });
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
        if (panel) {
          enhancingDetail = true;
          try { enhanceDetail(panel); } finally { enhancingDetail = false; }
        }
      }, 500);
    });
  }
}

// Track which item is currently enhanced per panel to avoid re-entrancy
const panelCurrentItem = new Map<string, string>();

function cleanupDetailPanel(panel: HTMLElement, panelKey: string) {
  panelCurrentItem.delete(panelKey);
  panel.querySelectorAll('.sk-quick-sell, .sk-market-overview, .sk-desc-toggle').forEach(e => e.remove());
  panel.querySelectorAll('[data-sk-toggled]').forEach(e => {
    (e as HTMLElement).style.display = '';
    e.removeAttribute('data-sk-toggled');
  });
}

function enhanceDetail(panel: HTMLElement) {
  if (!isOwnInventory) return;

  // Find item name from panel FIRST — before touching DOM
  const nameEl = panel.querySelector('.hover_item_name') || panel.querySelector('h1');
  const name = nameEl?.textContent?.trim();
  if (!name) return;

  const item = items.find(i => i.name === name || i.market_hash_name === name);
  const marketName = item?.market_hash_name || name;

  // Skip if same item is already enhanced on this panel
  const panelKey = panel.id || 'react';
  if (panelCurrentItem.get(panelKey) === marketName && panel.querySelector('.sk-quick-sell')) return;

  if (item && (!item.tradable || !item.marketable)) {
    // Clean up if switching to non-sellable item
    cleanupDetailPanel(panel, panelKey);
    return;
  }

  // Item changed — clean up old enhancements
  cleanupDetailPanel(panel, panelKey);
  panelCurrentItem.set(panelKey, marketName);

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

  // ── Collapse item description (SIH-style "Show more info") ──
  injectDescriptionToggle(panel);

  // ── Market Overview (SIH-style: lowest listing, buy orders, histogram) ──
  detailVersion++;
  loadMarketOverview(panel, marketName, walletCurr, detailVersion);
}

function injectDescriptionToggle(panel: HTMLElement) {
  if (panel.querySelector('.sk-desc-toggle')) return;

  // Old Steam UI: panel is #iteminfo0 or #iteminfo1
  // Descriptors: #iteminfo0_item_descriptors, tags: #iteminfo0_item_tags
  const panelId = panel.id; // "iteminfo0" or "iteminfo1"
  const descIds = panelId
    ? [`${panelId}_item_descriptors`, `${panelId}_item_tags`]
    : [];

  const descElements: HTMLElement[] = [];
  for (const id of descIds) {
    const el = document.getElementById(id);
    if (el && el.innerHTML.trim()) descElements.push(el);
  }

  // Fallback: generic class selectors (old Steam variants)
  if (descElements.length === 0) {
    const fallback = panel.querySelector('.item_desc_descriptors') as HTMLElement
      || panel.querySelector('[id$="_item_descriptors"]') as HTMLElement;
    if (fallback && fallback.innerHTML.trim()) descElements.push(fallback);
  }

  // New React Steam UI: find description content blocks
  if (descElements.length === 0) {
    // Look for divs containing description text (case contents, item details etc.)
    // They're typically after the name/type/image area
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        const el = node as HTMLElement;
        // Skip our own injected elements
        if (el.classList.contains('sk-quick-sell') || el.classList.contains('sk-market-overview') ||
            el.classList.contains('sk-desc-toggle')) return NodeFilter.FILTER_REJECT;
        // Skip images/buttons
        if (el.tagName === 'IMG' || el.tagName === 'BUTTON') return NodeFilter.FILTER_REJECT;
        // Target divs with substantial text content that look like descriptions
        if (el.tagName === 'DIV' && el.textContent && el.textContent.length > 200 &&
            !el.querySelector('.hover_item_name') && !el.querySelector('img')) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    });
    const found = walker.nextNode() as HTMLElement | null;
    if (found) descElements.push(found);
  }

  if (descElements.length === 0) return;

  // Find insertion point — right after the item type line
  const typeEl = panelId
    ? document.getElementById(`${panelId}_item_type`)
    : panel.querySelector('.hover_item_name')?.parentElement;
  const insertBefore = typeEl || descElements[0];

  // Create toggle link
  const toggle = document.createElement('a');
  toggle.className = 'sk-desc-toggle';
  toggle.textContent = 'Show more info';
  toggle.href = '#';
  toggle.style.cssText = `
    display:block;margin:6px 0;font-size:12px;color:#6366f1;
    text-decoration:none;font-family:var(--sk-font);cursor:pointer;
  `;

  // Hide all description elements
  for (const el of descElements) {
    el.style.display = 'none';
    el.setAttribute('data-sk-toggled', '1');
  }

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    const isHidden = descElements[0].style.display === 'none';
    for (const el of descElements) {
      el.style.display = isHidden ? '' : 'none';
    }
    toggle.textContent = isHidden ? 'Hide info' : 'Show more info';
  });

  insertBefore.insertAdjacentElement('afterend', toggle);
}

// Cache market price overview per item name
const marketPriceCache = new Map<string, PriceOverview>();

async function loadMarketOverview(panel: HTMLElement, marketName: string, walletCurr: number, version: number) {
  const container = document.createElement('div');
  container.className = 'sk-market-overview';
  container.style.cssText = `
    margin-top:10px;padding:10px;border-radius:6px;
    background:rgba(0,0,0,0.25);border:1px solid rgba(99,102,241,0.2);
    font-family:var(--sk-font);font-size:12px;color:#c9d1d9;
  `;

  // Use cached result if available — show instantly
  const cached = marketPriceCache.get(marketName);
  if (cached) {
    container.innerHTML = buildMarketHtml(cached, marketName);
    panel.appendChild(container);
    return;
  }

  // No cache — show "Show price" button instead of auto-fetching (avoids 429)
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <a href="https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}" target="_blank"
         style="font-size:11px;color:#6366f1;text-decoration:none">View on Market</a>
      <span class="sk-show-price" style="font-size:11px;color:#6366f1;cursor:pointer;font-weight:600">Show price</span>
    </div>
  `;
  panel.appendChild(container);

  container.querySelector('.sk-show-price')?.addEventListener('click', async () => {
    container.querySelector('.sk-show-price')!.textContent = 'Loading...';

    try {
      const data = await getMarketPriceOverview(marketName, walletCurr);
      if (data) marketPriceCache.set(marketName, data);
      if (version !== detailVersion || !container.isConnected) return;

      if (!data) {
        container.innerHTML = '<div style="color:#8b949e;font-size:11px">Market data unavailable</div>';
        return;
      }
      container.innerHTML = buildMarketHtml(data, marketName);
    } catch {
      if (version !== detailVersion || !container.isConnected) return;
      container.innerHTML = '<div style="color:#8b949e;font-size:11px">Failed to load</div>';
    }
  });
}

function buildMarketHtml(data: PriceOverview, marketName: string): string {
  return `
    <div style="margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-weight:700;font-size:11px;color:#6366f1;text-transform:uppercase;letter-spacing:0.5px">Market</span>
      <a href="https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}" target="_blank"
         style="font-size:10px;color:#6366f1;text-decoration:none">View on Market</a>
    </div>
    <div style="display:flex;gap:12px">
      <div style="flex:1">
        <div style="color:#8b949e;font-size:10px">Starting at</div>
        <div style="font-weight:700;color:#4ade80;font-size:14px">${data.lowestPrice || '—'}</div>
      </div>
      <div style="flex:1">
        <div style="color:#8b949e;font-size:10px">Median price</div>
        <div style="font-weight:700;color:#60a5fa;font-size:14px">${data.medianPrice || '—'}</div>
      </div>
    </div>
    ${data.volume ? `<div style="color:#8b949e;font-size:10px;margin-top:4px">${Number(data.volume.replace(/[, ]/g, '')).toLocaleString()} sold in last 24h</div>` : ''}
  `;
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
// Bulk Sell System (SIH-style queue sidebar + sell modal)
// ═══════════════════════════════════════════════════════════════════════

let selectedAssets = new Set<string>(); // assetIds selected for selling
let sellInProgress = false;

function openSellQueue() {
  if (document.getElementById('sk-sell-queue')) return;
  renderSellQueue();
}

function renderSellQueue() {
  let panel = document.getElementById('sk-sell-queue');
  if (!panel) {
    panel = el('div');
    panel.id = 'sk-sell-queue';
    panel.style.cssText = `
      position:fixed;top:0;right:0;bottom:0;width:300px;z-index:10000;
      background:rgba(13,17,23,0.97);backdrop-filter:blur(16px);
      border-left:1px solid var(--sk-border);
      font-family:var(--sk-font);color:var(--sk-text);
      display:flex;flex-direction:column;
      box-shadow:-4px 0 24px rgba(0,0,0,0.5);
      overflow:hidden;
    `;
    document.body.appendChild(panel);
  }

  // Calculate totals
  let totalValue = 0;
  let totalAfterFees = 0;
  const noDecimals = NO_DECIMAL_CODES.has(currencyCode);
  const queueItems: Array<{ assetId: string; name: string; price: number; icon_url?: string }> = [];
  for (const assetId of selectedAssets) {
    const item = assetMap.get(assetId);
    if (!item) continue;
    let price = getItemPrice(item.market_hash_name, exchangeRate);
    // Round each item to whole units for no-decimal currencies (so 3×₴41 = ₴123, not ₴122)
    if (noDecimals) price = Math.round(price);
    totalValue += price;
    // Fees: convert to local currency cents for proper calculation
    const localCents = Math.round(price * 100);
    const sellerGetsCents = calcSellerReceives(localCents);
    totalAfterFees += sellerGetsCents / 100;
    queueItems.push({ assetId, name: item.market_hash_name, price, icon_url: item.icon_url });
  }

  panel.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--sk-border-subtle);flex-shrink:0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-weight:700;font-size:14px">ITEMS</span>
        <span style="background:var(--sk-primary);color:#fff;padding:2px 10px;border-radius:10px;font-size:12px;font-weight:700">${selectedAssets.size}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="color:var(--sk-text-dim)">Total</span>
        <span style="font-weight:700">${fmtPrice(totalValue)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span style="color:var(--sk-text-dim)">Without commission</span>
        <span style="font-weight:700;color:var(--sk-green)">${fmtPrice(totalAfterFees)}</span>
      </div>
    </div>

    <div style="padding:8px 12px;border-bottom:1px solid var(--sk-border-subtle);display:flex;flex-direction:column;gap:4px;flex-shrink:0">
      <button class="sk-queue-filter" data-filter="lower" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.1);color:#f87171;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--sk-font)">Remove lower</button>
      <button class="sk-queue-filter" data-filter="higher" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.1);color:#f87171;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--sk-font)">Remove higher</button>
      <button class="sk-queue-filter" data-filter="in-trade" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.1);color:#f87171;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--sk-font)">Remove in-trade</button>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
        <span style="font-size:10px;color:var(--sk-text-dim)">Sort items</span>
        <select class="sk-sort-select" id="sk-queue-sort" style="float:none;font-size:10px">
          <option value="price-desc">By Price ↓</option>
          <option value="price-asc">By Price ↑</option>
          <option value="name-asc">By Name</option>
        </select>
      </div>
    </div>

    <div id="sk-queue-items" style="flex:1;overflow-y:auto;padding:8px 0"></div>

    <div style="padding:12px 16px;border-top:1px solid var(--sk-border-subtle);flex-shrink:0">
      <select id="sk-sell-strategy" style="width:100%;padding:6px 10px;border-radius:6px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--sk-text);font-size:12px;font-family:var(--sk-font);margin-bottom:8px">
        <option value="auto">Auto-selling (lowest - 1)</option>
        <option value="custom">Custom price</option>
        <option value="buff_match">Match Buff price</option>
        <option value="buff_plus5">Buff + 5%</option>
      </select>
      <div id="sk-custom-price-row" style="display:none;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--sk-text-dim);white-space:nowrap">You receive:</span>
          <input id="sk-custom-price" type="number" min="1" step="1" placeholder="0"
            style="flex:1;padding:6px 10px;border-radius:6px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:13px;font-weight:700;font-family:var(--sk-font);text-align:right" />
          <span style="font-size:11px;color:var(--sk-text-dim)">${currencySign}</span>
        </div>
        <div id="sk-custom-buyer-pays" style="font-size:10px;color:var(--sk-text-dim);margin-top:3px;text-align:right"></div>
      </div>
      <div id="sk-sell-progress" style="display:none;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
          <span id="sk-progress-label" style="color:var(--sk-text-dim)">Selling...</span>
          <span id="sk-progress-count" style="color:var(--sk-text);font-weight:600">0/0</span>
        </div>
        <div style="height:4px;border-radius:2px;background:rgba(255,255,255,0.1);overflow:hidden">
          <div id="sk-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#059669,#10b981);border-radius:2px;transition:width 0.3s ease"></div>
        </div>
      </div>
      <button id="sk-start-sell" style="width:100%;padding:10px;border-radius:8px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;font-size:13px;font-weight:700;border:none;cursor:pointer;font-family:var(--sk-font);transition:filter 0.15s" ${selectedAssets.size === 0 ? 'disabled' : ''}>
        List ${selectedAssets.size} items on Market
      </button>
    </div>
  `;

  // Render queue items
  const itemsContainer = panel.querySelector('#sk-queue-items')!;
  for (const qi of queueItems) {
    const row = el('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 12px;font-size:11px;border-bottom:1px solid rgba(255,255,255,0.03)';
    const iconSrc = qi.icon_url
      ? `https://community.fastly.steamstatic.com/economy/image/${qi.icon_url}/64x64`
      : '';
    const shortName = qi.name.length > 28 ? qi.name.substring(0, 28) + '\u2026' : qi.name;
    row.innerHTML = `
      ${iconSrc ? `<img src="${iconSrc}" style="width:32px;height:32px;border-radius:4px;flex-shrink:0" />` : ''}
      <div style="flex:1;min-width:0">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${qi.name}">${shortName}</div>
        <div style="color:var(--sk-text-dim);font-size:10px">${qi.price > 0 ? fmtPrice(qi.price) : '\u2014'}</div>
      </div>
      <button class="sk-queue-remove" data-asset="${qi.assetId}" style="background:none;border:none;color:var(--sk-red);cursor:pointer;font-size:14px;padding:4px" title="Remove">\u00d7</button>
    `;
    itemsContainer.appendChild(row);
  }

  // Event: remove single item
  panel.querySelectorAll('.sk-queue-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.asset!;
      selectedAssets.delete(id);
      document.getElementById(`730_2_${id}`)?.classList.remove('sk-item-sell-selected');
      updateSelectModeUI();
      renderSellQueue();
    });
  });

  // Event: filter buttons
  panel.querySelectorAll('.sk-queue-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = (btn as HTMLElement).dataset.filter;
      if (!filter) return;
      const prices = [...selectedAssets].map(id => {
        const item = assetMap.get(id);
        return { id, price: item ? getItemPrice(item.market_hash_name, exchangeRate) : 0 };
      });
      if (prices.length < 2) return;
      const median = prices.sort((a, b) => a.price - b.price)[Math.floor(prices.length / 2)].price;

      const toRemove: string[] = [];
      for (const { id, price } of prices) {
        const item = assetMap.get(id);
        if (filter === 'lower' && price < median) toRemove.push(id);
        if (filter === 'higher' && price > median) toRemove.push(id);
        if (filter === 'in-trade' && item && itemsInOffers.has(id)) toRemove.push(id);
      }
      for (const id of toRemove) {
        selectedAssets.delete(id);
        document.getElementById(`730_2_${id}`)?.classList.remove('sk-item-sell-selected');
      }
      updateSelectModeUI();
      renderSellQueue();
    });
  });

  // Event: strategy change — show/hide custom price input
  panel.querySelector('#sk-sell-strategy')?.addEventListener('change', () => {
    const val = (panel.querySelector('#sk-sell-strategy') as HTMLSelectElement)?.value;
    const customRow = panel.querySelector('#sk-custom-price-row') as HTMLElement;
    if (customRow) customRow.style.display = val === 'custom' ? '' : 'none';
  });

  // Event: custom price input — show buyer pays preview
  panel.querySelector('#sk-custom-price')?.addEventListener('input', () => {
    const input = panel.querySelector('#sk-custom-price') as HTMLInputElement;
    const preview = panel.querySelector('#sk-custom-buyer-pays') as HTMLElement;
    if (!input || !preview) return;
    const val = parseFloat(input.value);
    if (!val || val <= 0) { preview.textContent = ''; return; }
    const noDecimals = NO_DECIMAL_CODES.has(currencyCode);
    const sellerCents = noDecimals ? Math.round(val) * 100 : Math.round(val * 100);
    const buyerCents = calcBuyerPrice(sellerCents);
    preview.textContent = `Buyer pays: ${formatCentsViaSteam(buyerCents)}`;
  });

  // Event: start selling
  panel.querySelector('#sk-start-sell')?.addEventListener('click', () => startBulkSell());
}

async function startBulkSell() {
  if (selectedAssets.size === 0 || sellInProgress) return;

  const strategy = (document.getElementById('sk-sell-strategy') as HTMLSelectElement)?.value || 'auto';
  const walletCurr = getWalletCurrency();
  const NO_DECIMALS: number[] = [5, 9, 10, 11, 14, 15, 17, 18, 29, 30, 37];
  const step = NO_DECIMALS.includes(walletCurr) ? 100 : 1;
  const noDecimals = NO_DECIMAL_CODES.has(currencyCode);

  const startBtn = document.getElementById('sk-start-sell') as HTMLButtonElement;
  const progressDiv = document.getElementById('sk-sell-progress') as HTMLElement;
  const progressBar = document.getElementById('sk-progress-bar') as HTMLElement;
  const progressLabel = document.getElementById('sk-progress-label') as HTMLElement;
  const progressCount = document.getElementById('sk-progress-count') as HTMLElement;

  // Custom price: read from input
  let customSellerCents = 0;
  if (strategy === 'custom') {
    const input = document.getElementById('sk-custom-price') as HTMLInputElement;
    const val = parseFloat(input?.value || '0');
    if (!val || val <= 0) { input?.focus(); return; }
    customSellerCents = noDecimals ? Math.round(val) * 100 : Math.round(val * 100);
  }

  if (startBtn) { startBtn.textContent = 'Fetching prices...'; startBtn.disabled = true; }

  // Build sell queue
  const queue: Array<{ assetId: string; name: string; priceCents: number }> = [];
  const nameToAssets = new Map<string, string[]>();
  for (const assetId of selectedAssets) {
    const item = assetMap.get(assetId);
    if (!item) continue;
    const arr = nameToAssets.get(item.market_hash_name) || [];
    arr.push(assetId);
    nameToAssets.set(item.market_hash_name, arr);
  }

  // For no-decimal currencies: snap cents to whole units (e.g. round to nearest 100 for UAH)
  const snap = (cents: number) => step > 1 ? Math.round(cents / step) * step : cents;

  const realPriceCache = new Map<string, number | null>();

  for (const [name, assetIds] of nameToAssets) {
    const enriched = enrichedMap.get(assetIds[0]);

    for (const assetId of assetIds) {
      let sellerReceivesCents: number;

      switch (strategy) {
        case 'custom':
          sellerReceivesCents = customSellerCents;
          break;
        case 'buff_match': {
          const buffPriceUsd = enriched?.prices?.buff || getItemPrice(name, 1);
          const buyerCents = snap(Math.round(buffPriceUsd * exchangeRate * 100));
          sellerReceivesCents = snap(getPriceAfterFees(buyerCents));
          break;
        }
        case 'buff_plus5': {
          const buffPriceUsd = enriched?.prices?.buff || getItemPrice(name, 1);
          const buyerCents = snap(Math.round(buffPriceUsd * exchangeRate * 100 * 1.05));
          sellerReceivesCents = snap(getPriceAfterFees(buyerCents));
          break;
        }
        default: { // auto
          if (!realPriceCache.has(name)) {
            if (startBtn) startBtn.textContent = `Fetching price: ${name.substring(0, 25)}...`;
            const lowestBuyerPays = await getLowestListingPrice(name, walletCurr);
            realPriceCache.set(name, lowestBuyerPays);
            if (realPriceCache.size > 1) await new Promise(r => setTimeout(r, 1500));
          }
          const lowestBuyerPays = realPriceCache.get(name);
          if (lowestBuyerPays && lowestBuyerPays > step) {
            sellerReceivesCents = snap(getPriceAfterFees(lowestBuyerPays - step));
          } else {
            // Fallback: CDN price → round to whole units → calc fees via Steam
            const steamPriceUsd = getItemPrice(name, 1);
            const buyerCents = snap(Math.round(steamPriceUsd * exchangeRate * 100));
            sellerReceivesCents = snap(getPriceAfterFees(buyerCents));
            if (sellerReceivesCents > step) sellerReceivesCents -= step;
          }
          break;
        }
      }
      if (sellerReceivesCents < step) sellerReceivesCents = step;
      queue.push({ assetId, name, priceCents: sellerReceivesCents });
    }
  }
  if (queue.length === 0) { if (startBtn) { startBtn.textContent = 'List items'; startBtn.disabled = false; } return; }

  const totalBuyerCents = queue.reduce((s, q) => s + calcBuyerPrice(q.priceCents), 0);
  const totalSellerCents = queue.reduce((s, q) => s + q.priceCents, 0);
  const totalFeesCents = totalBuyerCents - totalSellerCents;
  if (startBtn) { startBtn.textContent = `List ${queue.length} items on Market`; startBtn.disabled = false; }

  if (!confirm(
    `List ${queue.length} items on Steam Market?\n\n` +
    `Buyers pay: ~${formatCentsViaSteam(totalBuyerCents)}\n` +
    `You receive: ~${formatCentsViaSteam(totalSellerCents)}\n` +
    `Fees: ~${formatCentsViaSteam(totalFeesCents)}`
  )) return;

  // ── Start selling with progress bar ──
  sellInProgress = true;
  if (progressDiv) progressDiv.style.display = '';
  if (startBtn) startBtn.style.display = 'none';

  let success = 0, failed = 0;
  const failedItems: string[] = [];
  let totalListedCents = 0;

  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    const pct = Math.round(((i + 1) / queue.length) * 100);
    const shortName = q.name.length > 30 ? q.name.substring(0, 30) + '\u2026' : q.name;

    if (progressLabel) progressLabel.textContent = shortName;
    if (progressCount) progressCount.textContent = `${i + 1}/${queue.length}`;
    if (progressBar) progressBar.style.width = `${pct}%`;

    const result = await sellItemOnMarket(q.assetId, q.priceCents);
    if (result.success) {
      success++;
      totalListedCents += calcBuyerPrice(q.priceCents);
      const itemEl = document.getElementById(`730_2_${q.assetId}`);
      if (itemEl) { itemEl.style.opacity = '0.3'; itemEl.classList.remove('sk-item-sell-selected'); }
      selectedAssets.delete(q.assetId);
      // Mark item row as done in queue
      const row = document.querySelector(`[data-asset="${q.assetId}"]`)?.closest('div');
      if (row) (row as HTMLElement).style.opacity = '0.4';
    } else {
      failed++;
      failedItems.push(q.name);
    }
    if (i < queue.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  // ── Completion ──
  sellInProgress = false;
  if (progressBar) progressBar.style.width = '100%';
  if (progressBar) progressBar.style.background = success > 0 ? '#10b981' : '#ef4444';
  if (progressLabel) progressLabel.textContent = 'Done';
  if (progressCount) progressCount.textContent = `${success}/${queue.length}`;

  // Show completion summary
  showSellSummary(success, failed, failedItems, totalListedCents);

  // Exit select mode and close sell queue after completion
  setTimeout(() => {
    exitSelectMode();
  }, 2000);
}

function showSellSummary(success: number, failed: number, failedItems: string[], totalCents: number) {
  document.querySelector('#sk-sell-summary')?.remove();

  const summary = document.createElement('div');
  summary.id = 'sk-sell-summary';
  summary.style.cssText = `
    position:fixed;bottom:20px;right:20px;z-index:99999;
    background:rgba(13,17,23,0.97);backdrop-filter:blur(12px);
    border:1px solid ${success > 0 ? 'rgba(74,222,128,0.4)' : 'rgba(239,68,68,0.4)'};
    border-radius:12px;padding:16px 20px;max-width:360px;
    font-family:var(--sk-font);color:#e2e8f0;
    box-shadow:0 8px 32px rgba(0,0,0,0.5);
    animation:sk-toast-in 0.3s ease-out;
  `;

  const totalStr = totalCents > 0 ? formatCentsViaSteam(totalCents) : '';

  let html = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span style="font-size:24px">${success > 0 ? '\u2705' : '\u274c'}</span>
      <div>
        <div style="font-weight:700;font-size:14px">${success > 0 ? 'Items Listed' : 'Listing Failed'}</div>
        <div style="font-size:12px;color:#8b949e">
          ${success} listed${failed > 0 ? `, ${failed} failed` : ''}${totalStr ? ` \u00b7 ${totalStr}` : ''}
        </div>
      </div>
    </div>
  `;

  if (success > 0) {
    html += `
      <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:8px;padding:8px 12px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#fbbf24">
          <span style="font-size:16px">\ud83d\udcf1</span>
          <span style="font-weight:600">Confirm in Steam Mobile App</span>
        </div>
        <div style="font-size:11px;color:#8b949e;margin-top:4px">
          Open Steam Guard and confirm each listing
        </div>
      </div>
    `;
  }

  if (failed > 0 && failedItems.length > 0) {
    const shown = failedItems.slice(0, 3);
    html += `<div style="font-size:11px;color:#f87171;margin-top:4px">Failed: ${shown.join(', ')}${failedItems.length > 3 ? ` +${failedItems.length - 3} more` : ''}</div>`;
  }

  summary.innerHTML = html;
  summary.addEventListener('click', () => summary.remove());
  document.body.appendChild(summary);

  // Auto-dismiss after 15s
  setTimeout(() => {
    if (summary.isConnected) {
      summary.style.animation = 'sk-toast-out 0.3s ease-in forwards';
      setTimeout(() => summary.remove(), 300);
    }
  }, 15000);
}

// Keep old function name for compatibility with detail panel sell buttons
function toggleSellMode() { enterSelectMode(); }

// ═══════════════════════════════════════════════════════════════════════
// Trade-Up Calculator
// ═══════════════════════════════════════════════════════════════════════

let tradeUpMode = false;
let tuSelected = new Set<string>(); // assetIds

// Items NOT eligible for trade-up contracts (only weapon skins with wear are eligible)
const TRADE_UP_EXCLUDED_TYPES = [
  'container', 'case', 'key', 'sticker', 'graffiti', 'sealed graffiti',
  'music kit', 'patch', 'pin', 'collectible', 'agent', 'tool',
  'storage unit', 'pass', 'gift', 'tag',
];

function isTradeUpEligible(item: SteamItem): boolean {
  if (item.type === 'Storage Unit') return false;
  const typeLower = (item.type || '').toLowerCase();
  for (const excluded of TRADE_UP_EXCLUDED_TYPES) {
    if (typeLower.includes(excluded)) return false;
  }
  if (!item.rarity) return false;
  const rarity = normalizeRarity(item.rarity);
  // Only Industrial through Classified can be traded up
  const eligible = ['Industrial Grade', 'Mil-Spec Grade', 'Restricted', 'Classified'];
  if (!eligible.includes(rarity)) return false;
  return true;
}

/** Normalize rarity string — handles ★, spaces, partial matches */
function normalizeRarityLocal(rarity: string): string {
  // Strip ★ and extra whitespace
  const clean = rarity.replace(/[★]/g, '').trim();
  const lower = clean.toLowerCase();
  if (lower.includes('consumer')) return 'Consumer Grade';
  if (lower.includes('industrial')) return 'Industrial Grade';
  if (lower.includes('mil-spec') || lower.includes('mil spec') || lower === 'rare') return 'Mil-Spec Grade';
  if (lower.includes('restricted') || lower === 'mythical') return 'Restricted';
  if (lower.includes('classified') || lower === 'legendary') return 'Classified';
  if (lower.includes('covert') || lower === 'ancient') return 'Covert';
  if (lower.includes('contraband')) return 'Contraband';
  if (lower.includes('base grade')) return 'Base Grade';
  return clean;
}

function highlightTradeUpCompatible() {
  if (tuSelected.size === 0) {
    // Reset all to trade-up eligible state
    document.querySelectorAll('.item.app730.context2').forEach(elem => {
      const htmlEl = elem as HTMLElement;
      const id = htmlEl.id?.split('_')[2];
      if (!id) return;
      const it = assetMap.get(id);
      if (!it) return;
      if (isTradeUpEligible(it)) {
        htmlEl.style.opacity = '';
        htmlEl.style.pointerEvents = '';
      }
    });
    return;
  }

  // Get rarity and StatTrak status from first selected item
  const firstId = tuSelected.values().next().value;
  const firstItem = firstId ? assetMap.get(firstId) : null;
  if (!firstItem) return;
  const reqRarity = normalizeRarityLocal(firstItem.rarity || '');
  const reqStatTrak = firstItem.market_hash_name.includes('StatTrak');

  document.querySelectorAll('.item.app730.context2').forEach(elem => {
    const htmlEl = elem as HTMLElement;
    const id = htmlEl.id?.split('_')[2];
    if (!id) return;
    if (tuSelected.has(id)) return; // already selected — keep highlighted
    const it = assetMap.get(id);
    if (!it) return;

    if (!isTradeUpEligible(it)) {
      htmlEl.style.opacity = '0.15';
      htmlEl.style.pointerEvents = 'none';
      return;
    }

    const itemRarity = normalizeRarityLocal(it.rarity || '');
    const itemStatTrak = it.market_hash_name.includes('StatTrak');
    const compatible = itemRarity === reqRarity && itemStatTrak === reqStatTrak;

    htmlEl.style.opacity = compatible ? '' : '0.2';
    htmlEl.style.pointerEvents = compatible ? '' : 'none';
  });
}

function toggleTradeUpMode() {
  if (selectMode) exitSelectMode(); // exit select mode first
  tradeUpMode = !tradeUpMode;
  tuSelected.clear();

  const btn = document.querySelector('.sk-tu-toggle');
  if (btn) {
    btn.textContent = tradeUpMode ? 'Cancel Trade-Up' : 'Trade-Up';
    btn.classList.toggle('sk-cta-amber', !tradeUpMode);
    btn.classList.toggle('sk-cta-cancel', tradeUpMode);
  }

  // Dim non-eligible items in trade-up mode, restore when exiting
  document.querySelectorAll('.item.app730.context2').forEach(elem => {
    const htmlEl = elem as HTMLElement;
    const assetId = htmlEl.id?.split('_')[2];
    if (!assetId) return;
    const item = assetMap.get(assetId);
    if (!item) return;
    if (tradeUpMode) {
      if (!isTradeUpEligible(item)) {
        htmlEl.style.opacity = '0.3';
        htmlEl.style.pointerEvents = 'none';
      }
    } else {
      htmlEl.style.opacity = '';
      htmlEl.style.pointerEvents = '';
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
