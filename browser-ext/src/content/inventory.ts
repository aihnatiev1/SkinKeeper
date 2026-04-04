import '../styles/skinkeeper.css';
import { waitForElement, el, skBadge, sendMessage } from '../shared/dom';
import {
  readInventoryFromPage, loadFullInventory, loadBulkPrices, loadExchangeRates,
  getItemPrice, getItemPriceEntry, getWalletCurrency, getWalletCurrencyCode,
  sellItemOnMarket, calcBuyerPrice, calcSellerReceives,
  getLowestListingPrice, getHighestBuyOrder,
  type SteamItem
} from '../shared/steam';
import { analyzePrice, createRatioBadge, createArbitrageBadge, type MultiPrice } from '../shared/pricing';
import { formatFloat, getFloatColor, getWearName, getWearShort, getWearFromName, isLowFloat, createFloatBar } from '../shared/float';
import { getDopplerPhase, isDoppler, isFade, isMarbleFade, calculateFadePercent, analyzeMarbleFade, analyzeBlueGem, createPhaseBadge, type PhaseInfo } from '../shared/phases';
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

async function init() {
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

  // Preload blue gem data in parallel with prices
  preloadBlueGemData();

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

// ─── Fetch Enriched Data from SkinKeeper API ──────────────────────────

async function fetchEnrichedInventory() {
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
  document.querySelector('.sk-banner')?.remove();
  const target = document.querySelector('.inventory_page_right');
  if (!target) return;

  const banner = el('div', 'sk-banner');

  // ── Top row: stats left, value right ──
  const topRow = el('div', 'sk-banner-top');

  if (isOwnInventory) {
    const leftInfo = el('span', 'sk-banner-left');
    const selSpan = el('span', 'sk-banner-selected');
    selSpan.id = 'sk-selected-value';
    selSpan.textContent = `Selected Items Value: ${currencySign}0`;
    leftInfo.appendChild(selSpan);
    topRow.appendChild(leftInfo);
  }

  const rightInfo = el('span', 'sk-banner-right');
  rightInfo.textContent = `Total Inventory Value: ${fmtPrice(total) || `${currencySign}0`}`;
  topRow.appendChild(rightInfo);

  banner.appendChild(topRow);

  // ── Bottom row: actions left, sort right ──
  const bottomRow = el('div', 'sk-banner-bottom');
  const actions = el('div', 'sk-banner-actions');

  // Sort dropdown
  const sortSelect = el('select', 'sk-sort-select') as HTMLSelectElement;
  const sortOptions: [string, string][] = [
    ['default', 'Default'],
    ['price-desc', 'Price ↓'], ['price-asc', 'Price ↑'],
    ['name-asc', 'Name A→Z'], ['name-desc', 'Name Z→A'],
    ['float-asc', 'Float ↑'], ['float-desc', 'Float ↓'],
    ['rarity-desc', 'Rarity ↓'], ['rarity-asc', 'Rarity ↑'],
    ['tradable', 'Tradable first'],
  ];
  for (const [val, label] of sortOptions) {
    const opt = el('option') as HTMLOptionElement;
    opt.value = val;
    opt.textContent = label;
    sortSelect.appendChild(opt);
  }
  sortSelect.addEventListener('change', () => sortInventory(sortSelect.value));

  // Sell & Trade-Up — only on own inventory
  if (isOwnInventory) {
    const sellBtn = el('button', ['sk-banner-cta', 'sk-cta-sell', 'sk-sell-toggle']);
    sellBtn.textContent = 'Sell';
    sellBtn.addEventListener('click', toggleSellMode);
    actions.appendChild(sellBtn);

    const tuBtn = el('button', ['sk-banner-cta', 'sk-cta-amber', 'sk-tu-toggle']);
    tuBtn.textContent = 'Trade-Up';
    tuBtn.addEventListener('click', toggleTradeUpMode);
    actions.appendChild(tuBtn);
  }

  // Export dropdown
  const exportWrap = el('div');
  exportWrap.style.cssText = 'position:relative;display:inline-flex';
  const exportBtn = el('button', ['sk-banner-cta', 'sk-cta-secondary']);
  exportBtn.textContent = 'Export';
  const exportMenu = el('div', 'sk-export-menu');
  exportMenu.style.display = 'none';

  const addOption = (label: string, fn: () => void) => {
    const opt = el('div', 'sk-export-option');
    opt.textContent = label;
    opt.addEventListener('click', () => { fn(); exportMenu.style.display = 'none'; });
    exportMenu.appendChild(opt);
  };
  addOption('Download CSV', exportCSV);
  addOption('Download JSON', exportJSON);
  addOption('Copy Summary', exportClipboard);

  exportBtn.addEventListener('click', () => {
    exportMenu.style.display = exportMenu.style.display === 'none' ? '' : 'none';
  });
  document.addEventListener('click', (e) => {
    if (!exportWrap.contains(e.target as Node)) exportMenu.style.display = 'none';
  });
  exportWrap.append(exportBtn, exportMenu);
  actions.appendChild(exportWrap);

  const cta = el('a', ['sk-banner-cta', 'sk-cta-secondary']) as HTMLAnchorElement;
  cta.href = 'https://app.skinkeeper.store/portfolio';
  cta.target = '_blank';
  cta.textContent = 'Dashboard';
  actions.appendChild(cta);

  // Sort dropdown (right side)
  const sortWrap = el('div', 'sk-banner-sort');
  const sortLabel = el('span');
  sortLabel.textContent = 'Sorting:';
  sortLabel.style.cssText = 'color:var(--sk-text-dim);font-size:12px;margin-right:6px';
  sortWrap.append(sortLabel, sortSelect);
  bottomRow.append(actions, sortWrap);

  banner.appendChild(bottomRow);
  target.insertBefore(banner, target.firstChild);
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
      badge.textContent = phase.emoji;
      badge.style.background = phase.color + 'cc';
      badge.title = phase.phase;
      htmlEl.appendChild(badge);
    }
  }
  if (!hasSpecial && paintSeed != null && isFade(item.market_hash_name)) {
    hasSpecial = true;
    const fade = calculateFadePercent(paintSeed);
    const badge = el('div', 'sk-item-phase');
    badge.textContent = `${fade.percentage}%`;
    badge.style.background = fade.color + 'cc';
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
  for (const id of ['iteminfo0', 'iteminfo1']) {
    const panel = document.getElementById(id);
    if (!panel) continue;
    new MutationObserver(() => {
      clearTimeout((panel as any)._sk);
      (panel as any)._sk = setTimeout(() => enhanceDetail(panel), 300);
    }).observe(panel, { childList: true, subtree: true });
  }
}

function enhanceDetail(panel: HTMLElement) {
  panel.querySelectorAll('.sk-detail, .sk-inline').forEach(e => e.remove());

  const nameEl = panel.querySelector('.hover_item_name');
  const name = nameEl?.textContent?.trim();
  if (!name) return;

  const item = items.find(i => i.name === name || i.market_hash_name === name);
  const marketName = item?.market_hash_name || name;
  const steamPrice = getItemPrice(marketName, exchangeRate);
  const priceEntry = getItemPriceEntry(marketName);
  const count = dupCount.get(marketName) || 1;
  const enriched = item ? enrichedMap.get(item.assetid) : undefined;
  const floatVal = item?.floatValue ?? enriched?.float_value ?? null;
  const paintSeed = item?.paintSeed ?? enriched?.paint_seed ?? null;

  const version = ++detailVersion;
  const isOwn = isOwnInventory;

  // ── Inline overlay: Copy links + count badge (injected into image area) ──
  const panelId = panel.id; // e.g. 'iteminfo0'
  const imageArea = panel.querySelector(`#${panelId}_item_icon`) || panel.querySelector('.item_desc_icon') || panel.querySelector('.economy_item_hovering');
  if (imageArea) {
    (imageArea as HTMLElement).style.position = 'relative';

    // Copy links (top-left of image)
    const copyBlock = el('div', 'sk-inline sk-copy-links');
    const addCopy = (label: string, value: string) => {
      const btn = el('div', 'sk-copy-btn');
      btn.textContent = label;
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(value);
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = label, 1500);
      });
      copyBlock.appendChild(btn);
    };
    if (item?.assetid) addCopy('Copy ID', item.assetid);
    addCopy('Copy Name', marketName);
    if (item?.inspectLink) addCopy('Copy Link', item.inspectLink);
    imageArea.appendChild(copyBlock);

    // Count badge (bottom-right of image)
    if (count > 1) {
      const countBadge = el('div', 'sk-inline sk-count-badge');
      countBadge.textContent = `x${count}`;
      imageArea.appendChild(countBadge);
    }
  }

  // ── Float + float bar (injected between image and name) ──
  const actualNameEl = panel.querySelector(`#${panelId}_item_name`) || nameEl;
  if (floatVal != null && actualNameEl) {
    const floatBlock = el('div', 'sk-inline sk-detail-float');
    const floatText = el('span');
    floatText.textContent = `Float: ${floatVal.toFixed(10).replace(/0+$/, '').replace(/\.$/, '')}`;
    floatText.style.cssText = 'color:var(--sk-text);font-size:13px;font-weight:600';
    floatBlock.appendChild(floatText);

    // Float bar
    const bar = el('div', 'sk-detail-float-bar');
    const marker = el('div', 'sk-detail-float-marker');
    marker.style.left = `${(floatVal * 100).toFixed(1)}%`;
    bar.appendChild(marker);
    floatBlock.appendChild(bar);

    actualNameEl.parentElement?.insertBefore(floatBlock, actualNameEl);
  }

  // ── Main section (appended to item_desc_content) ──
  const section = el('div', 'sk-detail');

  // ── Storage Unit special display ──
  if (item?.type === 'Storage Unit') {
    const countRow = el('div', 'sk-price-row');
    const cLabel = el('span', 'sk-price-source');
    cLabel.textContent = 'Stored Items';
    const cVal = el('span', 'sk-price-value');
    cVal.textContent = `${item.casketItemCount || 0}`;
    countRow.append(cLabel, cVal);
    section.appendChild(countRow);

    const target = panel.querySelector('.item_desc_content') || panel.querySelector('[id$="_content"]');
    if (target) target.appendChild(section);
    return;
  }

  // ── Prices (Steam from CDN, rest from enriched) ──
  if (steamPrice) {
    const row = el('div', 'sk-price-row');
    const src = el('span', 'sk-price-source');
    src.textContent = 'Steam';
    const val = el('span', 'sk-price-value');
    val.textContent = fmtPrice(steamPrice);
    if (priceEntry) {
      const cur = priceEntry.last_24h ?? priceEntry.last_7d;
      const prev = priceEntry.last_7d ?? priceEntry.last_30d;
      if (cur && prev && prev > 0) {
        const pct = ((cur - prev) / prev) * 100;
        if (Math.abs(pct) > 0.5) {
          const t = el('span', ['sk-price-trend', pct > 0 ? 'sk-up' : 'sk-down']);
          t.textContent = ` ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
          val.appendChild(t);
        }
      }
    }
    row.append(src, val);
    section.appendChild(row);
  }

  // Multi-source from enriched data (instant, no extra API call)
  if (enriched?.prices) {
    const sourceMap: [string, string][] = [
      ['buff', 'Buff163'], ['csfloat', 'CSFloat'], ['skinport', 'Skinport'],
      ['dmarket', 'DMarket'], ['bitskins', 'BitSkins'],
    ];
    for (const [key, label] of sourceMap) {
      const p = enriched.prices[key];
      if (!p || p <= 0) continue;
      const row = el('div', 'sk-price-row');
      const src = el('span', 'sk-price-source');
      src.textContent = label;
      const val = el('span', 'sk-price-value');
      val.textContent = fmtUsd(p);
      row.append(src, val);
      section.appendChild(row);
    }
  }

  // Use page data first, enriched as supplement
  const detailFloat = item?.floatValue ?? enriched?.float_value ?? null;
  const detailSeed = item?.paintSeed ?? enriched?.paint_seed ?? null;
  const detailPaintIdx = item?.paintIndex ?? enriched?.paint_index ?? null;

  // ── Badges row: ratio, arbitrage, phase, fade, blue gem, SP ──
  const badges = el('div');
  badges.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:4px 0';

  // Buff/Steam ratio + Arbitrage
  if (enriched?.prices && steamPrice) {
    const mp: MultiPrice = {
      steam: Math.round((steamPrice / exchangeRate) * 100),
      buff: enriched.prices.buff ? Math.round(enriched.prices.buff * 100) : undefined,
      csfloat: enriched.prices.csfloat ? Math.round(enriched.prices.csfloat * 100) : undefined,
      skinport: enriched.prices.skinport ? Math.round(enriched.prices.skinport * 100) : undefined,
    };
    const analysis = analyzePrice(mp);
    if (analysis.buffSteamRatio !== null) badges.appendChild(createRatioBadge(analysis.buffSteamRatio));
    if (analysis.arbitrage?.viable) badges.appendChild(createArbitrageBadge(analysis.arbitrage));
  }

  // Phase / Fade / Marble Fade / Blue Gem — from page data!
  if (detailPaintIdx) {
    const phase = getDopplerPhase(detailPaintIdx);
    if (phase) badges.appendChild(createPhaseBadge(phase));
  }
  if (detailSeed != null && isFade(marketName)) {
    const fade = calculateFadePercent(detailSeed);
    const fb = el('span', 'sk-phase-badge');
    fb.style.cssText = `background:${fade.color}22;color:${fade.color};border:1px solid ${fade.color}44;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700`;
    fb.textContent = fade.tier;
    badges.appendChild(fb);
  }
  if (detailSeed != null && isMarbleFade(marketName)) {
    badges.appendChild(createPhaseBadge(analyzeMarbleFade(detailSeed)));
  }
  if (detailSeed != null && isBlueGemEligible(marketName)) {
    const bgDetail = (detailPaintIdx != null || item?.defindex)
      ? getBlueGemPercentSync(item?.defindex || 0, detailPaintIdx || 44, detailSeed)
      : null;
    if (bgDetail && bgDetail.pb > 0) {
      const bgBadge = el('span', 'sk-phase-badge');
      const tier = bgDetail.pb >= 90 ? 'Tier 1' : bgDetail.pb >= 70 ? 'Tier 2' : bgDetail.pb >= 50 ? 'Tier 3' : '';
      const label = tier ? `${tier} ${bgDetail.pb}%` : `${bgDetail.pb}% blue`;
      bgBadge.style.cssText = 'background:rgba(0,191,255,0.15);color:deepskyblue;border:1px solid rgba(0,191,255,0.3);padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700';
      bgBadge.textContent = `💎 ${label}`;
      bgBadge.title = `Playside: ${bgDetail.pb}% blue\nBackside: ${bgDetail.bb}% blue`;
      badges.appendChild(bgBadge);
    } else {
      // Fallback to heuristic analysis
      const gem = analyzeBlueGem(marketName, detailSeed);
      if (gem) badges.appendChild(createPhaseBadge(gem));
    }
  }

  // Sticker Premium
  if (enriched?.sticker_value && enriched.sticker_value > 0 && steamPrice) {
    const baseCents = Math.round((steamPrice / exchangeRate) * 100);
    const svCents = Math.round(enriched.sticker_value * 100);
    if (svCents > 0) {
      const spPct = Math.round((svCents / baseCents) * 1000) / 10;
      if (spPct > 1) {
        const spBadge = el('span', 'sk-phase-badge');
        const color = spPct >= 50 ? '#ef4444' : spPct >= 20 ? '#f97316' : spPct >= 5 ? '#4ade80' : '#94a3b8';
        spBadge.style.cssText = `background:${color}15;color:${color};border:1px solid ${color}33;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700`;
        spBadge.textContent = `SP ${spPct}%`;
        spBadge.title = `Sticker value: ${fmtUsd(enriched.sticker_value)} (${spPct}% of skin price)`;
        badges.appendChild(spBadge);
      }
    }
  }

  // StatTrak badge
  if (item?.isStatTrak) {
    const stBadge = el('span', 'sk-phase-badge');
    stBadge.style.cssText = 'background:rgba(207,106,50,0.15);color:#cf6a32;border:1px solid rgba(207,106,50,0.3);padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700';
    stBadge.textContent = 'StatTrak™';
    badges.appendChild(stBadge);
  }
  if (item?.isSouvenir) {
    const svBadge = el('span', 'sk-phase-badge');
    svBadge.style.cssText = 'background:rgba(255,215,0,0.15);color:#ffd700;border:1px solid rgba(255,215,0,0.3);padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700';
    svBadge.textContent = 'Souvenir';
    badges.appendChild(svBadge);
  }

  if (badges.childElementCount > 0) section.appendChild(badges);

  // ── Float (from page data!) ──
  if (detailFloat != null) {
    const row = el('div', 'sk-price-row');
    const label = el('span', 'sk-price-source');
    label.textContent = 'Float';
    const val = el('span', 'sk-price-value');
    val.style.fontFamily = 'monospace';
    val.style.color = getFloatColor(detailFloat);
    val.textContent = `${formatFloat(detailFloat)} ${getWearName(detailFloat)}`;
    if (isLowFloat(detailFloat, getWearName(detailFloat))) {
      const low = el('span');
      low.style.cssText = 'font-size:9px;color:#fbbf24;margin-left:4px;font-weight:700';
      low.textContent = 'LOW';
      val.appendChild(low);
    }
    row.append(label, val);
    section.appendChild(row);

    // Float bar with colored segments
    const barWrap = el('div');
    barWrap.style.cssText = 'position:relative;height:6px;border-radius:3px;margin:3px 0;overflow:hidden;display:flex';
    const segments: [string, number][] = [
      ['#57cbde', 7], ['#90ba3c', 8], ['#fbbf24', 23], ['#f97316', 7], ['#ef4444', 55],
    ];
    for (const [color, width] of segments) {
      const seg = el('div');
      seg.style.cssText = `width:${width}%;height:100%;background:${color}`;
      barWrap.appendChild(seg);
    }
    const pointer = el('div');
    pointer.style.cssText = `position:absolute;left:${detailFloat * 100}%;top:-2px;width:2px;height:10px;background:#fff;border-radius:1px;transform:translateX(-50%);box-shadow:0 0 3px rgba(0,0,0,0.8)`;
    barWrap.appendChild(pointer);
    section.appendChild(barWrap);
  }

  // ── Paint Seed / Pattern ──
  if (detailSeed != null) {
    const row = el('div', 'sk-price-row');
    const label = el('span', 'sk-price-source');
    label.textContent = 'Pattern';
    const val = el('span', 'sk-price-value');
    val.style.fontFamily = 'monospace';
    val.textContent = `${detailSeed}`;
    row.append(label, val);
    section.appendChild(row);
  }

  // ── P/L (cost basis) ──
  const pl = plMap.get(marketName);
  if (pl && pl.avgBuyCents > 0) {
    const buyRow = el('div', 'sk-price-row');
    const buyLabel = el('span', 'sk-price-source');
    buyLabel.textContent = 'Bought at';
    const buyVal = el('span', 'sk-price-value');
    buyVal.textContent = fmtPrice((pl.avgBuyCents / 100) * exchangeRate);
    buyRow.append(buyLabel, buyVal);
    section.appendChild(buyRow);

    const plRow = el('div', 'sk-price-row');
    const plLabel = el('span', 'sk-price-source');
    plLabel.textContent = 'P/L';
    const plVal = el('span', 'sk-price-value');
    const profitUsd = (pl.profitCents / 100) * exchangeRate;
    const isProfit = pl.profitCents >= 0;
    const sign = isProfit ? '+' : '';
    plVal.style.color = isProfit ? 'var(--sk-green)' : 'var(--sk-red)';
    plVal.textContent = `${sign}${fmtPrice(Math.abs(profitUsd))} (${sign}${pl.profitPct.toFixed(1)}%)`;
    plRow.append(plLabel, plVal);
    section.appendChild(plRow);
  }

  // ── Quantity ──
  if (count > 1) {
    const allOfType = items.filter(i => i.market_hash_name === marketName);
    const tradableCount = allOfType.filter(i => i.tradable).length;
    const lockedCount = count - tradableCount;

    const row = el('div', 'sk-price-row');
    const label = el('span', 'sk-price-source');
    label.textContent = 'Quantity';
    const val = el('span', 'sk-price-value');
    if (lockedCount > 0 && tradableCount > 0) {
      val.innerHTML = `${count} <span style="font-size:10px;color:var(--sk-text-dim);font-weight:500">(${tradableCount} tradable, ${lockedCount} locked)</span>`;
    } else if (lockedCount === count) {
      val.innerHTML = `${count} <span style="font-size:10px;color:var(--sk-red);font-weight:500">(all locked)</span>`;
    } else {
      val.textContent = `${count}`;
    }
    row.append(label, val);
    section.appendChild(row);

    if (steamPrice) {
      const totalRow = el('div', 'sk-price-row');
      const tl = el('span', 'sk-price-source');
      tl.textContent = 'Total Value';
      const tv = el('span', 'sk-price-value');
      tv.style.color = 'var(--sk-primary-light)';
      tv.textContent = fmtPrice(steamPrice * count);
      totalRow.append(tl, tv);
      section.appendChild(totalRow);
    }
  }

  // ── Rarity ──
  if (item?.rarity) {
    const rarity = el('span', 'sk-rarity');
    rarity.textContent = item.rarity;
    if (item.rarityColor) {
      rarity.style.color = '#' + item.rarityColor;
      rarity.style.borderColor = '#' + item.rarityColor + '44';
    }
    section.appendChild(rarity);
  }

  // ── Stickers with wear % (from page data or enriched) ──
  const stickerList = enriched?.stickers?.length ? enriched.stickers : (item?.stickers || []);
  if (stickerList.length > 0) {
    const div = el('div', 'sk-stickers');
    for (const s of stickerList) {
      const chip = el('span', 'sk-sticker-chip');
      const wearPct = s.wear != null ? Math.round(Math.abs(1 - s.wear) * 100) : null;
      if (wearPct != null && wearPct < 100) {
        chip.innerHTML = `${s.name} <span style="color:${wearPct > 80 ? 'var(--sk-green)' : wearPct > 50 ? 'var(--sk-amber)' : 'var(--sk-red)'};font-weight:700">${wearPct}%</span>`;
        chip.style.opacity = String(Math.max(0.4, wearPct / 100));
      } else {
        chip.textContent = s.name;
      }
      div.appendChild(chip);
    }
    if (enriched?.sticker_value && enriched.sticker_value > 0) {
      const total = el('span', 'sk-sticker-chip');
      total.style.cssText = 'color:var(--sk-amber);border-color:rgba(251,191,36,0.2);font-weight:700';
      total.textContent = `= ${fmtUsd(enriched.sticker_value)}`;
      div.appendChild(total);
    }
    section.appendChild(div);
  }

  // ── Trade lock countdown ──
  if (enriched?.trade_ban_until) {
    const remaining = formatTradeLock(enriched.trade_ban_until);
    if (remaining) {
      const row = el('div', 'sk-price-row');
      const label = el('span', 'sk-price-source');
      label.textContent = 'Trade Lock';
      const val = el('span', 'sk-price-value');
      val.style.color = 'var(--sk-red)';
      val.textContent = remaining;
      row.append(label, val);
      section.appendChild(row);
    }
  } else if (count === 1 && item && !item.tradable) {
    const row = el('div', 'sk-price-row');
    const label = el('span', 'sk-price-source');
    label.textContent = 'Status';
    const val = el('span', 'sk-price-value');
    val.style.color = 'var(--sk-red)';
    val.textContent = 'Not Tradable';
    row.append(label, val);
    section.appendChild(row);
  }

  // ── StatTrak kills (from Steam DOM descriptions) ──
  const descArea = panel.querySelector('.item_desc_descriptors, .item_desc_description');
  if (descArea) {
    const descText = descArea.textContent || '';
    const stMatch = descText.match(/StatTrak.*?:\s*([\d,]+)/i);
    if (stMatch) {
      const row = el('div', 'sk-price-row');
      const label = el('span', 'sk-price-source');
      label.textContent = 'StatTrak™ Kills';
      const val = el('span', 'sk-price-value');
      val.style.color = '#cf6a32';
      val.textContent = stMatch[1];
      row.append(label, val);
      section.appendChild(row);
    }
  }

  // ── Case contents (from Steam DOM) ──
  const allDescs = Array.from(panel.querySelectorAll('.item_desc_description'));
  for (const desc of allDescs) {
    const html = desc.innerHTML || '';
    if (html.includes('Contains one of the following') || html.includes('Contains the following')) {
      const itemLinks = desc.querySelectorAll('a, .hover_item_name');
      if (itemLinks.length > 0) {
        const caseRow = el('div', 'sk-price-row');
        const label = el('span', 'sk-price-source');
        label.textContent = 'Contains';
        const val = el('span', 'sk-price-value');
        val.textContent = `${itemLinks.length} items`;
        val.style.fontSize = '11px';
        caseRow.append(label, val);
        section.appendChild(caseRow);
      }
      break;
    }
  }

  // ── Market data (async — starting price + volume) ──
  if (item?.marketable) {
    const marketWrap = el('div', 'sk-detail');
    marketWrap.style.cssText = 'margin:0;padding:0;border:0;background:none;backdrop-filter:none';
    const loadingLabel = el('div', 'sk-price-source');
    loadingLabel.textContent = 'Loading market data...';
    loadingLabel.style.fontSize = '10px';
    marketWrap.appendChild(loadingLabel);
    section.appendChild(marketWrap);

    const url = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=${getWalletCurrency()}&market_hash_name=${encodeURIComponent(marketName)}`;
    sendMessage({ type: 'FETCH_JSON', url }).then((data: any) => {
      if (version !== detailVersion) return;
      marketWrap.innerHTML = '';
      if (!data) return;
      if (data.lowest_price) {
        const row = el('div', 'sk-price-row');
        const l = el('span', 'sk-price-source'); l.textContent = 'Starting at';
        const v = el('span', 'sk-price-value'); v.textContent = data.lowest_price;
        row.append(l, v);
        marketWrap.appendChild(row);
      }
      if (data.volume) {
        const row = el('div', 'sk-price-row');
        const l = el('span', 'sk-price-source'); l.textContent = 'Volume';
        const v = el('span', 'sk-price-value'); v.textContent = `${data.volume} sold in the last 24 hours`;
        v.style.fontSize = '11px';
        row.append(l, v);
        marketWrap.appendChild(row);
      }
    }).catch(() => { marketWrap.innerHTML = ''; });
  }

  // ── Instant Sell / Quick Sell — only on own inventory ──
  // Detect own inventory: Steam shows trade/market links only for own items
  const isOwnDetail = isOwnInventory;
  if (isOwnDetail && item?.tradable && item?.marketable) {
    const sellRow = el('div', 'sk-detail-links');
    const walletCurr = getWalletCurrency();

    const instantBtn = el('button', 'sk-ext-link') as HTMLButtonElement;
    instantBtn.textContent = '⚡ Instant Sell';
    instantBtn.style.cursor = 'pointer';
    instantBtn.title = 'Sell at highest buy order (instant)';
    instantBtn.addEventListener('click', async () => {
      instantBtn.textContent = '⚡ Loading...';
      const buyOrder = await getHighestBuyOrder(marketName, walletCurr);
      if (!buyOrder || version !== detailVersion) { instantBtn.textContent = '⚡ No orders'; return; }
      const sellerGets = calcSellerReceives(buyOrder);
      if (confirm(`Instant Sell "${item.name}" for ${fmtPrice(sellerGets / 100 * exchangeRate)}? (Buyer pays ${fmtPrice(buyOrder / 100 * exchangeRate)})`)) {
        const res = await sellItemOnMarket(item.assetid, sellerGets);
        instantBtn.textContent = res.success ? '✓ Sold!' : '✗ Failed';
        instantBtn.style.color = res.success ? '#4ade80' : '#f87171';
      } else {
        instantBtn.textContent = `⚡ ${fmtPrice(sellerGets / 100 * exchangeRate)}`;
      }
    });
    sellRow.appendChild(instantBtn);

    const quickBtn = el('button', 'sk-ext-link') as HTMLButtonElement;
    quickBtn.textContent = '🏷️ Quick Sell';
    quickBtn.style.cursor = 'pointer';
    quickBtn.title = 'List at lowest price -1¢ (cheapest listing)';
    quickBtn.addEventListener('click', async () => {
      quickBtn.textContent = '🏷️ Loading...';
      const lowest = await getLowestListingPrice(marketName, walletCurr);
      if (!lowest || version !== detailVersion) { quickBtn.textContent = '🏷️ No listings'; return; }
      const undercut = Math.max(3, lowest - 1); // -1¢, min 3¢
      const sellerGets = calcSellerReceives(undercut);
      if (confirm(`Quick Sell "${item.name}" for ${fmtPrice(sellerGets / 100 * exchangeRate)}? (Undercuts lowest by 1¢)`)) {
        const res = await sellItemOnMarket(item.assetid, sellerGets);
        quickBtn.textContent = res.success ? '✓ Listed!' : '✗ Failed';
        quickBtn.style.color = res.success ? '#4ade80' : '#f87171';
      } else {
        quickBtn.textContent = `🏷️ ${fmtPrice(sellerGets / 100 * exchangeRate)}`;
      }
    });
    sellRow.appendChild(quickBtn);

    section.appendChild(sellRow);
  }

  // ── Show Technical (expandable — full float, paint index, origin, min/max) ──
  if (detailFloat != null || detailSeed != null || detailPaintIdx != null) {
    const techToggle = el('div', 'sk-ext-link');
    techToggle.textContent = '▸ Show Technical';
    techToggle.style.cssText += 'cursor:pointer;font-size:10px;margin:2px 0;display:inline-block';
    const techDiv = el('div');
    techDiv.style.cssText = 'display:none;font-size:10px;color:var(--sk-text-dim);font-family:monospace;padding:4px 0;line-height:1.6';
    const lines: string[] = [];
    if (detailFloat != null) lines.push(`Float: ${detailFloat}`);
    if (detailSeed != null) lines.push(`Paint Seed: ${detailSeed}`);
    if (detailPaintIdx != null) lines.push(`Paint Index: ${detailPaintIdx}`);
    if (item?.defindex) lines.push(`Def Index: ${item.defindex}`);
    if (item?.nameTag) lines.push(`Name Tag: "${item.nameTag}"`);
    techDiv.innerHTML = lines.join('<br>');
    techToggle.addEventListener('click', () => {
      const open = techDiv.style.display !== 'none';
      techDiv.style.display = open ? 'none' : 'block';
      techToggle.textContent = open ? '▸ Show Technical' : '▾ Hide Technical';
    });
    section.append(techToggle, techDiv);
  }

  // ── Other Exteriors (links to all 5 wear conditions on market) ──
  const baseNameMatch = marketName.match(/^(.+?)\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/);
  if (baseNameMatch) {
    const baseName = baseNameMatch[1].trim();
    const extRow = el('div', 'sk-detail-links');
    const wears: [string, string][] = [['FN', 'Factory New'], ['MW', 'Minimal Wear'], ['FT', 'Field-Tested'], ['WW', 'Well-Worn'], ['BS', 'Battle-Scarred']];
    for (const [short, full] of wears) {
      const link = el('a', 'sk-ext-link') as HTMLAnchorElement;
      link.href = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(`${baseName} (${full})`)}`;
      link.target = '_blank';
      link.textContent = short;
      if (full === baseNameMatch[2]) { link.style.color = 'var(--sk-primary-light)'; link.style.fontWeight = '800'; }
      extRow.appendChild(link);
    }
    // StatTrak variant
    if (!item?.isStatTrak && !item?.isSouvenir) {
      const stLink = el('a', 'sk-ext-link') as HTMLAnchorElement;
      stLink.href = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(`StatTrak™ ${baseName} (${baseNameMatch[2]})`)}`;
      stLink.target = '_blank';
      stLink.textContent = 'ST';
      stLink.style.color = '#cf6a32';
      extRow.appendChild(stLink);
    }
    section.appendChild(extRow);
  }

  // ── Inspect links (Game, 3D Server, Browser screenshot) ──
  const inspectLinks = el('div', 'sk-detail-links');
  if (item?.inspectLink) {
    const gameBtn = el('a', 'sk-ext-link') as HTMLAnchorElement;
    gameBtn.href = item.inspectLink;
    gameBtn.textContent = '🎮 Inspect in Game';
    inspectLinks.appendChild(gameBtn);

    const serverBtn = el('a', 'sk-ext-link') as HTMLAnchorElement;
    serverBtn.href = `https://www.cs2inspects.com/?apply=${encodeURIComponent(item.inspectLink)}`;
    serverBtn.target = '_blank';
    serverBtn.textContent = '🖥️ 3D Inspect';
    inspectLinks.appendChild(serverBtn);

    const screenshotBtn = el('a', 'sk-ext-link') as HTMLAnchorElement;
    screenshotBtn.href = `https://swap.gg/screenshot?inspectLink=${encodeURIComponent(item.inspectLink)}`;
    screenshotBtn.target = '_blank';
    screenshotBtn.textContent = '📷 Screenshot';
    inspectLinks.appendChild(screenshotBtn);
  }
  if (inspectLinks.childElementCount > 0) section.appendChild(inspectLinks);

  // ── External links (Market, Buff, CSFloat, FloatDB) ──
  const extLinks = el('div', 'sk-detail-links');
  const mktLink = el('a', 'sk-ext-link') as HTMLAnchorElement;
  mktLink.href = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`;
  mktLink.target = '_blank';
  mktLink.textContent = '🛒 Market';
  extLinks.appendChild(mktLink);

  if (isOwnDetail && count > 1 && item?.marketable) {
    const multiLink = el('a', 'sk-ext-link') as HTMLAnchorElement;
    multiLink.href = `https://steamcommunity.com/market/multisell?appid=730&contextid=2&items[]=${encodeURIComponent(marketName)}`;
    multiLink.target = '_blank';
    multiLink.textContent = '📦 Multisell';
    extLinks.appendChild(multiLink);
  }

  const buffLink = el('a', 'sk-ext-link') as HTMLAnchorElement;
  buffLink.href = `https://buff.163.com/market/csgo#tab=selling&page_num=1&search=${encodeURIComponent(marketName)}`;
  buffLink.target = '_blank';
  buffLink.textContent = 'Buff163';
  extLinks.appendChild(buffLink);

  const csfLink = el('a', 'sk-ext-link') as HTMLAnchorElement;
  csfLink.href = `https://csfloat.com/search?market_hash_name=${encodeURIComponent(marketName)}`;
  csfLink.target = '_blank';
  csfLink.textContent = 'CSFloat';
  extLinks.appendChild(csfLink);

  const skinportLink = el('a', 'sk-ext-link') as HTMLAnchorElement;
  skinportLink.href = `https://skinport.com/market?search=${encodeURIComponent(marketName)}&cat=any`;
  skinportLink.target = '_blank';
  skinportLink.textContent = 'Skinport';
  extLinks.appendChild(skinportLink);
  section.appendChild(extLinks);

  // ── Copy buttons ──
  const copyRow = el('div', 'sk-detail-links');
  if (item) {
    const mkCopy = (label: string, value: string) => {
      const btn = el('span', 'sk-ext-link');
      btn.textContent = label;
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(value).then(() => {
          btn.textContent = '✓ Copied';
          setTimeout(() => { btn.textContent = label; }, 1500);
        });
      });
      return btn;
    };
    copyRow.appendChild(mkCopy('📋 Name', marketName));
    copyRow.appendChild(mkCopy('📋 ID', item.assetid));
    if (item.inspectLink) copyRow.appendChild(mkCopy('📋 Link', item.inspectLink));
  }
  if (copyRow.childElementCount > 0) section.appendChild(copyRow);

  // ── Actions ──
  const actions = el('div', 'sk-actions');

  // Bookmark + Notify (ported from CSGO Trader)
  if (item && !item.tradable) {
    const bmBtn = el('button', 'sk-alert-btn');
    bmBtn.textContent = '🔔 Bookmark & Notify';
    bmBtn.addEventListener('click', async () => {
      const tradeLock = enriched?.trade_ban_until || item.tradeLockDate || null;
      const bookmark = {
        assetid: item.assetid,
        name: item.market_hash_name,
        icon_url: item.icon_url,
        tradeLockDate: tradeLock,
        added: Date.now(),
      };
      const res = await sendMessage({ type: 'ADD_BOOKMARK', bookmark });
      if (res?.ok) {
        bmBtn.textContent = '✓ Bookmarked!';
        bmBtn.style.color = '#4ade80';
        if (tradeLock) {
          bmBtn.title = `Will notify when tradable (${tradeLock})`;
        }
      }
    });
    actions.appendChild(bmBtn);
  }

  actions.appendChild(skBadge('Track', () => {
    window.open(`https://app.skinkeeper.store/inventory?search=${encodeURIComponent(marketName)}`, '_blank');
  }));
  if (steamPrice) {
    const alertBtn = el('button', 'sk-alert-btn');
    alertBtn.textContent = 'Set Alert';
    alertBtn.addEventListener('click', () => {
      try {
        sendMessage({ type: 'CREATE_ALERT', market_hash_name: marketName, condition: 'below', threshold: Math.round(steamPrice * 100 * 0.9) });
        alertBtn.textContent = 'Alert Set!';
        alertBtn.style.color = '#4ade80';
      } catch { window.open('https://app.skinkeeper.store/alerts', '_blank'); }
    });
    actions.appendChild(alertBtn);
  }
  section.appendChild(actions);

  // ── Smart CTAs to web/desktop app ──
  const ctaDiv = el('div', 'sk-powered');
  ctaDiv.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin-top:4px';
  if (pl && pl.avgBuyCents > 0) {
    const plCta = el('a', 'sk-powered') as HTMLAnchorElement;
    plCta.href = `https://app.skinkeeper.store/portfolio?search=${encodeURIComponent(marketName)}`;
    plCta.target = '_blank';
    plCta.innerHTML = '📊 <a href="https://app.skinkeeper.store/portfolio" target="_blank" style="color:var(--sk-primary-light)">See full P/L history & charts →</a>';
    ctaDiv.appendChild(plCta);
  } else if (steamPrice && steamPrice > 5) {
    const trackCta = el('div', 'sk-powered');
    trackCta.innerHTML = '💰 <a href="https://app.skinkeeper.store/portfolio" target="_blank" style="color:var(--sk-primary-light)">Track profit/loss across accounts →</a>';
    ctaDiv.appendChild(trackCta);
  }
  if (item?.type === 'Storage Unit') {
    const suCta = el('div', 'sk-powered');
    suCta.innerHTML = '📦 <a href="https://app.skinkeeper.store/storage-units" target="_blank" style="color:var(--sk-primary-light)">Browse storage contents in Desktop App →</a>';
    ctaDiv.appendChild(suCta);
  }
  section.appendChild(ctaDiv);

  const powered = el('div', 'sk-powered');
  powered.innerHTML = 'by <a href="https://skinkeeper.store" target="_blank">SkinKeeper</a>';
  section.appendChild(powered);

  const target = panel.querySelector('.item_desc_content') || panel.querySelector('[id$="_content"]');
  if (target) target.appendChild(section);
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
