import '../styles/skinkeeper.css';
import { waitForElement, el, sendMessage } from '../shared/dom';
import {
  loadBulkPrices, loadExchangeRates, getItemPrice, getWalletCurrency, getWalletCurrencyCode,
} from '../shared/steam';
import { renderItemOverlays, clearItemOverlays, type ItemOverlayData } from '../shared/itemOverlay';
import { preloadBlueGemData } from '../shared/bluegem';
import { getDopplerPhaseFromIcon, loadDopplerIconMap } from '../shared/phases';
import { injectMiniCard } from '../shared/miniCard';

/* ═══════════════════════════════════════════════════════════════════
   SkinKeeper — Trade Offer Enhancement
   Ported from CSGO Trader's tradeOffer.js approach:
   - Reads inventories from Steam's page JS (UserYou/UserThem)
   - Single-click to move items, Ctrl+click for all same name
   - Inventory totals, in-trade totals, P/L summary
   - Price tags on every item, sorting, bulk actions
   ═══════════════════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────────────

let exchangeRate = 1;
let currencySign = '$';
let currencyCode = 'USD';

const CURRENCY_MAP: Record<number, [string, string]> = {
  1: ['USD', '$'], 2: ['GBP', '\u00a3'], 3: ['EUR', '\u20ac'], 5: ['RUB', '\u20bd'],
  18: ['UAH', '\u20b4'], 17: ['TRY', '\u20ba'], 23: ['CNY', '\u00a5'], 7: ['BRL', 'R$'],
  20: ['CAD', 'CA$'], 21: ['AUD', 'A$'], 37: ['KZT', '\u20b8'],
};

const NO_DECIMAL_CODES = new Set(['RUB', 'UAH', 'TRY', 'KZT', 'CLP', 'PEN', 'COP', 'PHP', 'CRC', 'UYU', 'NOK']);

interface ItemInfo {
  assetid: string;
  appid: string;
  contextid: string;
  name: string;
  market_hash_name: string;
  icon_url: string;
  type: string;
  marketable: boolean;
  price: number;
  owner: string;
  floatValue?: number;
  paintSeed?: number;
  paintIndex?: number;
  isStatTrak?: boolean;
  isSouvenir?: boolean;
  tradable?: boolean;
  rarityColor?: string;
  rarity?: string;
}

// Combined inventory of both users
const allItems: ItemInfo[] = [];
let userSteamID = '';

function fmtPrice(v: number): string {
  if (!v) return `${currencySign}0`;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const noDecimals = NO_DECIMAL_CODES.has(currencyCode);
  if (noDecimals || abs >= 10000) return `${sign}${currencySign}${Math.round(abs).toLocaleString()}`;
  if (abs >= 100) return `${sign}${currencySign}${Math.round(abs).toLocaleString()}`;
  if (abs >= 10) return `${sign}${currencySign}${abs.toFixed(1)}`;
  return `${sign}${currencySign}${abs.toFixed(2)}`;
}

// ─── Page-world injection helpers ────────────────────────────────

function runInPage(script: string, key: string): string | null {
  const div = document.createElement('div');
  div.setAttribute('onreset', script);
  div.dispatchEvent(new CustomEvent('reset'));
  div.removeAttribute('onreset');
  div.remove();
  const result = document.body.getAttribute(key);
  if (result !== null) document.body.removeAttribute(key);
  return result;
}

function runInPageJSON<T>(script: string, key: string): T | null {
  const raw = runInPage(script, key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

// ─── Extract inventories from Steam's page JS ───────────────────

function getUserSteamID(): string {
  return runInPage(
    `document.body.setAttribute('sk_uid', typeof g_steamID !== 'undefined' ? g_steamID : '');`,
    'sk_uid',
  ) || '';
}

function getPartnerSteamID(): string {
  return runInPage(
    `document.body.setAttribute('sk_pid', typeof g_ulTradePartnerSteamID !== 'undefined' ? g_ulTradePartnerSteamID : '');`,
    'sk_pid',
  ) || '';
}

interface RawItem {
  assetid: string; appid: string; contextid: string; name: string;
  market_hash_name: string; icon_url: string; type: string;
  marketable: number; owner: string;
  floatValue?: number; paintSeed?: number; paintIndex?: number;
  isStatTrak?: boolean; isSouvenir?: boolean;
  tradable?: boolean;
  rarityColor?: string;
  rarity?: string;
}

function extractInventory(who: 'You' | 'Them'): RawItem[] | null {
  return runInPageJSON<RawItem[]>(`
    try {
      var inv = User${who}.getInventory(730, 2);
      var assets = inv ? inv.rgInventory : null;
      var allProps = inv ? (inv.m_rgAssetProperties || {}) : {};
      var steamID = inv ? inv.owner.strSteamId : '';
      var result = [];
      if (assets) {
        for (var key in assets) {
          var a = assets[key];
          if (!a) continue;
          var item = {
            assetid: a.id.toString(),
            appid: (a.appid || 730).toString(),
            contextid: (a.contextid || 2).toString(),
            name: a.name || '',
            market_hash_name: a.market_hash_name || a.name || '',
            icon_url: a.icon_url || '',
            type: a.type || '',
            marketable: a.marketable || 0,
            tradable: a.tradable == 1,
            owner: steamID,
            isStatTrak: (a.type || '').indexOf('StatTrak') !== -1,
            isSouvenir: (a.type || '').indexOf('Souvenir') !== -1,
            rarityColor: '',
            rarity: ''
          };
          if (a.tags) {
            for (var t = 0; t < a.tags.length; t++) {
              if (a.tags[t].category === 'Rarity') {
                item.rarity = a.tags[t].localized_tag_name || '';
                item.rarityColor = a.tags[t].color || '';
              }
            }
          }
          var props = allProps[a.id];
          if (props && Array.isArray(props)) {
            for (var pi = 0; pi < props.length; pi++) {
              var p = props[pi];
              if (!p) continue;
              if (p.propertyid === 1 && p.int_value) item.paintSeed = parseInt(p.int_value);
              if (p.propertyid === 2 && p.float_value) item.floatValue = parseFloat(p.float_value);
              if (p.propertyid === 3 && p.int_value) item.paintIndex = parseInt(p.int_value);
            }
          }
          if (!item.paintIndex && a.app_data && a.app_data.paint_index) {
            item.paintIndex = parseInt(a.app_data.paint_index);
          }
          result.push(item);
        }
      }
      document.body.setAttribute('sk_inv', JSON.stringify(result));
    } catch(e) { document.body.setAttribute('sk_inv', '[]'); }
  `, 'sk_inv');
}

// ─── Item lookup ─────────────────────────────────────────────────

function getAssetIDFromElement(elem: HTMLElement): string {
  // Element IDs are like "item730_2_12345678"
  const match = elem.id?.match(/item\d+_\d+_(\d+)/);
  return match ? match[1] : '';
}

function getItemByAssetID(assetid: string): ItemInfo | undefined {
  return allItems.find(i => i.assetid === assetid);
}

function getItemNameFromElement(elem: HTMLElement): string {
  const assetid = getAssetIDFromElement(elem);
  if (assetid) {
    const item = getItemByAssetID(assetid);
    if (item) return item.market_hash_name;
  }
  return '';
}

// ─── Move items (same as CSGO Trader — dispatch dblclick) ────────

function moveItem(item: HTMLElement) {
  const event = document.createEvent('MouseEvents');
  event.initEvent('dblclick', true, true);
  item.dispatchEvent(event);
}

function removeLeftOverSlots() {
  setTimeout(() => {
    document.querySelectorAll('.itemHolder.trade_slot').forEach((slot) => {
      const parent = slot.parentElement;
      if (parent && parent.id !== 'your_slots' && parent.id !== 'their_slots') slot.remove();
    });
  }, 500);
}

// ─── Init ────────────────────────────────────────────────────────

async function init() {
  const tradeBox = await waitForElement('.trade_area, .tradeoffer');
  if (!tradeBox) return;

  const [, rates] = await Promise.all([loadBulkPrices('steam'), loadExchangeRates()]);
  const wc = getWalletCurrency();
  const steamCC = getWalletCurrencyCode();
  if (steamCC && rates?.[steamCC]) {
    currencyCode = steamCC;
    for (const key of Object.keys(CURRENCY_MAP)) {
      const [c, s] = CURRENCY_MAP[Number(key)];
      if (c === steamCC) { currencySign = s; break; }
    }
    exchangeRate = rates[steamCC] || 1;
  } else {
    const [cc, s] = CURRENCY_MAP[wc] || ['USD', '$'];
    currencyCode = cc;
    currencySign = s;
    exchangeRate = rates?.[cc] || 1;
  }

  userSteamID = getUserSteamID();
  const partnerSteamID = getPartnerSteamID();
  const isCreate = !!document.getElementById('your_slots');

  // Add partner info block (like CSGO Trader)
  addPartnerInfo(partnerSteamID);

  // Preload data needed for overlays
  preloadBlueGemData();
  loadDopplerIconMap();

  // Wait for Steam to load inventories
  await new Promise(r => setTimeout(r, 800));
  loadInventories();

  if (isCreate) {
    addFunctionBars();
    setupSingleClickToMove();
    setupCtrlRightClickSelection();
    addSummaryPanel();

    // Auto-switch to partner's inventory (like CSGO Trader)
    autoSwitchToPartnerInventory();

    // Detect items in other active offers
    detectItemsInOtherOffers();
  }

  // Context menu on items
  setupContextMenu();

  // Page title with partner name
  const pName = runInPage(
    `document.body.setAttribute('sk_pn2', typeof g_strTradePartnerPersonaName !== 'undefined' ? g_strTradePartnerPersonaName : '');`,
    'sk_pn2',
  );
  if (pName) document.title = `Trade with ${pName} - Steam`;

  // Preset trade messages
  if (isCreate) addPresetMessages();

  // URL param automation
  handleUrlParams(isCreate);

  // Observe trade slot changes for totals updates
  observeTradeSlots(isCreate);

  injectMiniCard();
  console.log('[SkinKeeper] Trade offer enhanced');
}

// ─── Partner Info (ported from CSGO Trader) ──────────────────────

function addPartnerInfo(partnerSteamID: string) {
  if (!partnerSteamID) return;
  const headline = document.querySelector('.trade_partner_headline');
  if (!headline || headline.querySelector('.sk-partner-info')) return;

  const partnerName = runInPage(
    `document.body.setAttribute('sk_pname', typeof g_strTradePartnerPersonaName !== 'undefined' ? g_strTradePartnerPersonaName : '');`,
    'sk_pname',
  ) || 'Partner';

  // Get partner's profile info (level, member since, etc.) from page
  const partnerBlock = el('div', 'sk-partner-info');
  partnerBlock.style.cssText = `
    color:#c9d1d9;font-size:12px;margin-top:6px;padding:8px 10px;
    background:rgba(13,17,23,0.6);border:1px solid rgba(99,102,241,0.15);
    border-radius:6px;font-family:var(--sk-font);
  `;

  partnerBlock.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
      <a href="https://steamcommunity.com/profiles/${partnerSteamID}" target="_blank"
         style="color:#6366f1;font-weight:700;text-decoration:none;font-size:13px">${partnerName}</a>
      <a href="https://steamcommunity.com/profiles/${partnerSteamID}/tradeoffers/" target="_blank"
         style="color:#8b949e;font-size:10px;text-decoration:none">Trade History</a>
    </div>
    <div style="display:flex;gap:12px;font-size:11px;color:#8b949e">
      <a href="https://steamcommunity.com/profiles/${partnerSteamID}/inventory/" target="_blank"
         style="color:#8b949e;text-decoration:none">View Inventory</a>
      <a href="https://steamcommunity.com/profiles/${partnerSteamID}" target="_blank"
         style="color:#8b949e;text-decoration:none">View Profile</a>
      <span id="sk-partner-level" style="color:#4ade80"></span>
    </div>
  `;

  headline.insertAdjacentElement('afterend', partnerBlock);

  // Fetch partner's Steam level async
  fetch(`https://steamcommunity.com/profiles/${partnerSteamID}`)
    .then(r => r.text())
    .then(html => {
      const levelMatch = html.match(/friendPlayerLevelNum[^>]*>(\d+)</);
      const levelEl = document.getElementById('sk-partner-level');
      if (levelMatch && levelEl) {
        levelEl.textContent = `Level ${levelMatch[1]}`;
      }
      // Check member since
      const memberMatch = html.match(/Member since (\d+ \w+, \d{4})/);
      if (memberMatch && levelEl) {
        levelEl.textContent += ` \u00b7 Since ${memberMatch[1]}`;
      }
    })
    .catch(() => {});
}

// ─── Load inventories & add overlays ─────────────────────────────

function loadInventories() {
  const yourRaw = extractInventory('You');
  const theirRaw = extractInventory('Them');

  let yourTotal = 0;
  let theirTotal = 0;

  if (yourRaw) {
    for (const raw of yourRaw) {
      const price = getItemPrice(raw.market_hash_name, exchangeRate);
      yourTotal += price;
      allItems.push({ ...raw, price, marketable: !!raw.marketable });
    }
  }
  if (theirRaw) {
    for (const raw of theirRaw) {
      const price = getItemPrice(raw.market_hash_name, exchangeRate);
      theirTotal += price;
      allItems.push({ ...raw, price, marketable: !!raw.marketable });
    }
  }

  console.log(`[SkinKeeper] Loaded ${allItems.length} items (yours: ${yourRaw?.length || 0}, theirs: ${theirRaw?.length || 0})`);

  // Add inventory totals to tab headers (like CSGO Trader)
  addInventoryTotals(yourTotal, theirTotal);

  // Add price tags to all visible items
  addOverlaysToAll();

  // Re-tag when inventory pages load
  const inv = document.getElementById('inventories');
  if (inv) {
    new MutationObserver(() => addOverlaysToAll()).observe(inv, { childList: true, subtree: true });
  }
}

function addInventoryTotals(yourTotal: number, theirTotal: number) {
  const yourTab = document.getElementById('inventory_select_your_inventory')?.querySelector('div');
  if (yourTab) {
    const origText = yourTab.textContent?.split('(')[0]?.trim() || 'Your Inventory';
    yourTab.textContent = `${origText} (${fmtPrice(yourTotal)})`;
    yourTab.style.fontSize = '13px';
  }
  const theirTab = document.getElementById('inventory_select_their_inventory')?.querySelector('div');
  if (theirTab) {
    const origText = theirTab.textContent?.split('(')[0]?.trim() || 'Their Inventory';
    theirTab.textContent = `${origText} (${fmtPrice(theirTotal)})`;
    theirTab.style.fontSize = '13px';
  }
}

function addOverlaysToAll() {
  document.querySelectorAll('.item.app730.context2').forEach(elem => {
    const htmlEl = elem as HTMLElement;
    if (htmlEl.querySelector('.sk-price-tag') || htmlEl.querySelector('.sk-item-ext')) return;
    const assetid = getAssetIDFromElement(htmlEl);
    const item = assetid ? getItemByAssetID(assetid) : undefined;
    if (!item) return;

    // Resolve doppler phase from icon if paintIndex not available
    if (!item.paintIndex && item.icon_url && item.market_hash_name.toLowerCase().includes('doppler')) {
      const idx = getDopplerPhaseFromIcon(item.icon_url);
      if (idx) item.paintIndex = idx;
    }

    const overlayData: ItemOverlayData = {
      market_hash_name: item.market_hash_name,
      name: item.name,
      type: item.type,
      price: item.price,
      priceFormatted: item.price > 0 ? fmtPrice(item.price) : undefined,
      floatValue: item.floatValue ?? null,
      paintSeed: item.paintSeed ?? null,
      paintIndex: item.paintIndex ?? null,
      isStatTrak: item.isStatTrak,
      isSouvenir: item.isSouvenir,
      tradable: item.tradable,
      rarityColor: item.rarityColor,
    };
    renderItemOverlays(htmlEl, overlayData);
  });
}

// ─── Single-click to move (ported from CSGO Trader) ──────────────

function setupSingleClickToMove() {
  // Click = move item, Ctrl+Click = move all with same name
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const itemEl = target.closest('.item.app730.context2') as HTMLElement;
    if (!itemEl) return;

    // Only in trade areas / inventory, not our sidebar
    if (target.closest('.sk-trade-sidebar') || target.closest('.sk-trade-summary')) return;

    const name = getItemNameFromElement(itemEl);
    if (!name) return;

    if (e.ctrlKey || e.metaKey) {
      // Move all items with same market_hash_name from same container
      e.preventDefault();
      e.stopPropagation();

      let container: HTMLElement | null;
      if (itemEl.closest('#their_slots') || itemEl.closest('#your_slots')) {
        container = itemEl.closest('#their_slots') || itemEl.closest('#your_slots');
      } else {
        // From inventory
        container = itemEl.closest('.inventory_ctn') as HTMLElement;
      }

      if (container) {
        const sameItems = container.querySelectorAll('.item.app730.context2');
        let delay = 0;
        sameItems.forEach(item => {
          if (getItemNameFromElement(item as HTMLElement) === name) {
            setTimeout(() => moveItem(item as HTMLElement), delay);
            delay += 100;
          }
        });
        removeLeftOverSlots();
      }
    } else {
      // Single click = move item (like CSGO Trader)
      moveItem(itemEl);
    }
  }, true);
}

// ─── Function Bars (sorting + bulk actions) ──────────────────────

function addFunctionBars() {
  // Inventory function bar (above inventory items)
  const filterCtn = document.getElementById('responsivetrade_itemfilters');
  if (filterCtn && !document.getElementById('sk-offer-bar')) {
    const bar = el('div');
    bar.id = 'sk-offer-bar';
    bar.style.cssText = `
      display:flex;gap:6px;align-items:center;flex-wrap:wrap;
      padding:6px 0;margin:4px 0;font-family:var(--sk-font);font-size:11px;
    `;

    // Sorting
    const sortLabel = el('span');
    sortLabel.textContent = 'Sort:';
    sortLabel.style.color = '#8b949e';
    const sortSelect = document.createElement('select');
    sortSelect.className = 'sk-sort-select';
    sortSelect.style.cssText = 'font-size:11px';
    for (const [val, label] of [
      ['default', 'Default'], ['price-desc', 'Price \u2193'], ['price-asc', 'Price \u2191'],
      ['name-asc', 'Name A-Z'], ['name-desc', 'Name Z-A'],
    ]) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      sortSelect.appendChild(opt);
    }
    sortSelect.addEventListener('change', () => sortInventory(sortSelect.value));

    // Take actions
    const takeAll = actionLink('Take all page', '#4ade80', () => {
      const activeInv = getActiveInventory();
      if (!activeInv) return;
      const pages = activeInv.querySelectorAll('.inventory_page');
      let activePage: Element | null = null;
      pages.forEach(p => {
        if ((p as HTMLElement).style.display !== 'none') activePage = p;
      });
      if (activePage) {
        let delay = 0;
        (activePage as HTMLElement).querySelectorAll('.item').forEach((item: Element) => {
          setTimeout(() => moveItem(item as HTMLElement), delay);
          delay += 100;
        });
      }
    });

    const takeEverything = actionLink('Take everything', '#4ade80', () => {
      const activeInv = getActiveInventory();
      if (!activeInv) return;
      let delay = 0;
      activeInv.querySelectorAll('.item').forEach(item => {
        setTimeout(() => moveItem(item as HTMLElement), delay);
        delay += 100;
      });
    });

    // Take N keys
    const keysInput = document.createElement('input');
    keysInput.type = 'number';
    keysInput.min = '1';
    keysInput.value = '1';
    keysInput.style.cssText = 'width:40px;padding:2px 4px;border-radius:4px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:11px;text-align:center';
    const takeKeys = actionLink('Keys', '#fbbf24', () => {
      const n = parseInt(keysInput.value) || 1;
      const activeInv = getActiveInventory();
      if (!activeInv) return;
      let taken = 0;
      activeInv.querySelectorAll('.item.app730.context2').forEach(item => {
        if (taken >= n) return;
        const name = getItemNameFromElement(item as HTMLElement);
        if (name.toLowerCase().includes('case key') || name.toLowerCase().includes('key')) {
          setTimeout(() => moveItem(item as HTMLElement), taken * 100);
          taken++;
        }
      });
    });

    bar.append(sortLabel, sortSelect, takeAll, takeEverything, keysInput, takeKeys);
    filterCtn.insertAdjacentElement('beforebegin', bar);
  }

  // Your side function bar
  addSideFunctionBar('your');
  addSideFunctionBar('their');
}

function addSideFunctionBar(whose: string) {
  const tradeArea = document.getElementById(`trade_${whose}s`);
  if (!tradeArea || tradeArea.querySelector('.sk-side-bar')) return;

  const header = tradeArea.querySelector('.offerheader');
  if (!header) return;

  const bar = el('div', 'sk-side-bar');
  bar.style.cssText = `
    display:flex;gap:6px;align-items:center;flex-wrap:wrap;
    padding:4px 8px;font-size:11px;font-family:var(--sk-font);
    background:rgba(0,0,0,0.15);border-radius:4px;margin:4px 0;
  `;

  const sortSelect = document.createElement('select');
  sortSelect.className = 'sk-sort-select';
  sortSelect.style.cssText = 'font-size:10px';
  for (const [val, label] of [
    ['default', 'Default'], ['price-desc', 'Price \u2193'], ['price-asc', 'Price \u2191'],
  ]) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    sortSelect.appendChild(opt);
  }
  sortSelect.addEventListener('change', () => {
    sortTradeSlots(whose, sortSelect.value);
  });

  const removeAll = actionLink('Remove all', '#f87171', () => {
    const container = document.getElementById(`${whose}_slots`);
    if (!container) return;
    let delay = 0;
    container.querySelectorAll('.item').forEach(item => {
      setTimeout(() => moveItem(item as HTMLElement), delay);
      delay += 100;
    });
    removeLeftOverSlots();
  });

  // Remove N keys
  const rKeysInput = document.createElement('input');
  rKeysInput.type = 'number';
  rKeysInput.min = '1';
  rKeysInput.value = '1';
  rKeysInput.style.cssText = 'width:36px;padding:2px 3px;border-radius:4px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:10px;text-align:center';
  const removeKeys = actionLink('Keys', '#fbbf24', () => {
    const n = parseInt(rKeysInput.value) || 1;
    const container = document.getElementById(`${whose}_slots`);
    if (!container) return;
    let removed = 0;
    container.querySelectorAll('.item.app730.context2').forEach(item => {
      if (removed >= n) return;
      const name = getItemNameFromElement(item as HTMLElement);
      if (name.toLowerCase().includes('key')) {
        setTimeout(() => moveItem(item as HTMLElement), removed * 100);
        removed++;
      }
    });
    removeLeftOverSlots();
  });

  // Remove selected (Ctrl+Right-click selected items)
  const removeSelected = actionLink('Selected', '#a78bfa', () => {
    const container = document.getElementById(`${whose}_slots`);
    if (!container) return;
    let delay = 0;
    container.querySelectorAll('.item.app730.context2.sk-selected').forEach(item => {
      const assetid = getAssetIDFromElement(item as HTMLElement);
      setTimeout(() => {
        moveItem(item as HTMLElement);
        if (assetid) selectedItems.delete(assetid);
      }, delay);
      delay += 100;
    });
    removeLeftOverSlots();
  });

  bar.append(sortSelect, removeAll, rKeysInput, removeKeys, removeSelected);
  header.insertAdjacentElement('afterend', bar);
}

function actionLink(text: string, color: string, onClick: () => void): HTMLElement {
  const link = el('span');
  link.textContent = text;
  link.style.cssText = `color:${color};cursor:pointer;font-weight:600;font-size:11px;text-decoration:underline`;
  link.addEventListener('click', onClick);
  return link;
}

function getActiveInventory(): HTMLElement | null {
  let active: HTMLElement | null = null;
  document.querySelectorAll('.inventory_ctn').forEach(inv => {
    if ((inv as HTMLElement).style.display !== 'none' && inv.id !== 'trade_inventory_unavailable') {
      active = inv as HTMLElement;
    }
  });
  return active;
}

// ─── Auto-switch to partner inventory ─────────────────────────────

function autoSwitchToPartnerInventory() {
  setTimeout(() => {
    runInPage(`
      try {
        if (typeof UserThem !== 'undefined' && typeof TradePageSelectInventory !== 'undefined') {
          TradePageSelectInventory(UserThem, 730, 2);
        }
      } catch(e) {}
    `, 'sk_switch');
  }, 500);
}

// ─── Ctrl+Right-click selection (like CSGO Trader) ───────────────

const selectedItems = new Set<string>();

function setupCtrlRightClickSelection() {
  document.addEventListener('contextmenu', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const target = e.target as HTMLElement;
    const itemEl = target.closest('.item.app730.context2') as HTMLElement;
    if (!itemEl) return;

    e.preventDefault();
    const assetid = getAssetIDFromElement(itemEl);
    if (!assetid) return;

    if (selectedItems.has(assetid)) {
      selectedItems.delete(assetid);
      itemEl.classList.remove('sk-selected');
    } else {
      selectedItems.add(assetid);
      itemEl.classList.add('sk-selected');
    }
  });
}

// ─── "In other offer" indicators ─────────────────────────────────

async function detectItemsInOtherOffers() {
  try {
    const html = await sendMessage({ type: 'FETCH_JSON', url: 'https://steamcommunity.com/my/tradeoffers/sent' });
    if (!html || typeof html !== 'string') return;

    const offerIdMatch = runInPage(
      `document.body.setAttribute('sk_oid', typeof g_strTradePartnerInventoryLoadURL !== 'undefined' ? g_strTradePartnerInventoryLoadURL.split('tradeoffer/')[1].split('/partner')[0] : '');`,
      'sk_oid',
    );
    const currentOfferId = offerIdMatch || '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const itemsInOffers = new Map<string, string[]>(); // assetid → [offerUrl, ...]

    doc.querySelectorAll('.tradeoffer').forEach((offer) => {
      const oid = offer.id?.replace('tradeofferid_', '') || '';
      if (oid === currentOfferId) return; // skip current offer
      const offerUrl = `https://steamcommunity.com/tradeoffer/${oid}/`;

      offer.querySelectorAll('.trade_item').forEach((item) => {
        const match = item.id?.match(/item\d+_\d+_(\d+)/);
        if (match) {
          const arr = itemsInOffers.get(match[1]) || [];
          arr.push(offerUrl);
          itemsInOffers.set(match[1], arr);
        }
      });
    });

    if (itemsInOffers.size === 0) return;
    console.log(`[SkinKeeper] ${itemsInOffers.size} items found in other active offers`);

    // Mark items in current trade
    document.querySelectorAll('.item.app730.context2').forEach((elem) => {
      const assetid = getAssetIDFromElement(elem as HTMLElement);
      if (assetid && itemsInOffers.has(assetid)) {
        const badge = el('div', 'sk-in-offer');
        badge.textContent = '\ud83d\udce4';
        badge.title = `This item is in ${itemsInOffers.get(assetid)!.length} other offer(s)`;
        badge.style.cssText = 'position:absolute;bottom:28px;left:2px;font-size:10px;z-index:6;cursor:pointer';
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          const urls = itemsInOffers.get(assetid)!;
          if (urls.length === 1) window.open(urls[0], '_blank');
          else {
            const list = urls.map((u, i) => `${i + 1}. ${u}`).join('\n');
            if (confirm(`Item is in ${urls.length} other offers:\n\n${list}\n\nOpen all?`)) {
              urls.forEach(u => window.open(u, '_blank'));
            }
          }
        });
        elem.appendChild(badge);
      }
    });
  } catch {
    // Silently fail
  }
}

// ─── Context Menu (right-click on items) ─────────────────────────

function setupContextMenu() {
  let activeMenu: HTMLElement | null = null;

  const dismiss = () => {
    if (activeMenu) { activeMenu.remove(); activeMenu = null; }
  };

  document.addEventListener('click', dismiss);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dismiss(); });

  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    const itemEl = target.closest('.item.app730.context2') as HTMLElement;
    if (!itemEl) return;

    // Ctrl+Right-click is for selection (Phase 2), skip menu
    if (e.ctrlKey || e.metaKey) return;

    const assetid = getAssetIDFromElement(itemEl);
    const item = assetid ? getItemByAssetID(assetid) : undefined;
    if (!item) return;

    e.preventDefault();
    dismiss();

    const name = encodeURIComponent(item.market_hash_name);
    const slug = item.market_hash_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const menu = el('div', 'sk-context-menu');
    menu.style.cssText = `
      position:fixed;z-index:99999;
      background:rgba(13,17,23,0.97);backdrop-filter:blur(12px);
      border:1px solid rgba(99,102,241,0.3);border-radius:8px;
      padding:4px 0;min-width:180px;
      box-shadow:0 8px 24px rgba(0,0,0,0.5);
      font-family:var(--sk-font);font-size:12px;color:#e2e8f0;
    `;

    const menuItem = (label: string, url: string, color = '#c9d1d9') => {
      const item = el('a');
      (item as HTMLAnchorElement).href = url;
      (item as HTMLAnchorElement).target = '_blank';
      item.textContent = label;
      item.style.cssText = `
        display:block;padding:6px 14px;color:${color};text-decoration:none;
        cursor:pointer;white-space:nowrap;
      `;
      item.onmouseenter = () => { item.style.background = 'rgba(99,102,241,0.15)'; };
      item.onmouseleave = () => { item.style.background = ''; };
      return item;
    };

    menu.append(
      menuItem('View on Steam Market', `https://steamcommunity.com/market/listings/730/${name}`, '#6366f1'),
      menuItem('View on BUFF', `https://buff.163.com/goods?game=csgo&page_num=1&search=${name}`, '#f59e0b'),
      menuItem('View on CSFloat', `https://csfloat.com/search?market_hash_name=${name}`, '#3b82f6'),
      menuItem('View on Pricempire', `https://pricempire.com/item/cs2/${slug}`, '#8b5cf6'),
    );

    // Position near cursor, but keep on screen
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    document.body.appendChild(menu);
    activeMenu = menu;
  });
}

// ─── Sorting ─────────────────────────────────────────────────────

function sortInventory(mode: string) {
  const activeInv = getActiveInventory();
  if (!activeInv) return;

  activeInv.querySelectorAll('.inventory_page').forEach(page => {
    const items = Array.from(page.querySelectorAll('.item.app730.context2')) as HTMLElement[];
    doSort(items, mode);
    items.forEach(item => page.appendChild(item));
  });

  // Reload images (like CSGO Trader's loadAllItemsProperly)
  runInPage(`
    try {
      g_ActiveInventory.pageList.forEach(function(page, index) {
        g_ActiveInventory.pageList[index].images_loaded = false;
        g_ActiveInventory.LoadPageImages(page);
      });
    } catch(e) {}
  `, 'sk_reload');
}

function sortTradeSlots(whose: string, mode: string) {
  const container = document.getElementById(`${whose}_slots`);
  if (!container) return;
  const items = Array.from(container.querySelectorAll('.item.app730.context2')) as HTMLElement[];
  doSort(items, mode);
  items.forEach(item => container.appendChild(item));
}

function doSort(items: HTMLElement[], mode: string) {
  if (mode === 'default') return;
  items.sort((a, b) => {
    const aName = getItemNameFromElement(a);
    const bName = getItemNameFromElement(b);
    const aPrice = getItemPrice(aName, exchangeRate);
    const bPrice = getItemPrice(bName, exchangeRate);
    switch (mode) {
      case 'price-desc': return bPrice - aPrice;
      case 'price-asc': return aPrice - bPrice;
      case 'name-asc': return aName.localeCompare(bName);
      case 'name-desc': return bName.localeCompare(aName);
      default: return 0;
    }
  });
}

// ─── Summary Panel (P/L, in-trade totals) ────────────────────────

function addSummaryPanel() {
  if (document.getElementById('sk-trade-summary')) return;

  const panel = el('div');
  panel.id = 'sk-trade-summary';
  panel.className = 'sk-trade-summary';

  panel.innerHTML = `
    <div class="sk-summary-header">Trade Summary</div>
    <div class="sk-summary-row">
      <span class="sk-summary-label">Your items:</span>
      <span class="sk-summary-value" id="sk-your-total">0 items \u00b7 ${currencySign}0</span>
    </div>
    <div class="sk-summary-row">
      <span class="sk-summary-label">Their items:</span>
      <span class="sk-summary-value" id="sk-their-total">0 items \u00b7 ${currencySign}0</span>
    </div>
    <div class="sk-summary-divider"></div>
    <div class="sk-summary-row" id="sk-pl-row">
      <span class="sk-summary-label">P/L:</span>
      <span class="sk-summary-value" id="sk-pl-value">${currencySign}0</span>
    </div>
    <div id="sk-trade-warn" style="display:none"></div>
  `;

  // Insert above "Make Offer" / "Click here to confirm" area
  const tradeConfirm = document.querySelector('.trade_confirm_button_area, .tutorial_arrow_ctn')
    || document.querySelector('.tradeoffer_footer');
  if (tradeConfirm) {
    tradeConfirm.insertAdjacentElement('beforebegin', panel);
  } else {
    const tradeBox = document.querySelector('.trade_area');
    if (tradeBox) tradeBox.appendChild(panel);
  }

  updateSummary();
}

function updateSummary() {
  const yourSlots = document.getElementById('your_slots');
  const theirSlots = document.getElementById('their_slots');
  if (!yourSlots || !theirSlots) return;

  let yourTotal = 0, yourCount = 0;
  yourSlots.querySelectorAll('.item').forEach(item => {
    const name = getItemNameFromElement(item as HTMLElement);
    if (name) {
      yourTotal += getItemPrice(name, exchangeRate);
      yourCount++;
    }
  });

  let theirTotal = 0, theirCount = 0;
  theirSlots.querySelectorAll('.item').forEach(item => {
    const name = getItemNameFromElement(item as HTMLElement);
    if (name) {
      theirTotal += getItemPrice(name, exchangeRate);
      theirCount++;
    }
  });

  const noDecimals = NO_DECIMAL_CODES.has(currencyCode);
  if (noDecimals) { yourTotal = Math.round(yourTotal); theirTotal = Math.round(theirTotal); }

  const diff = theirTotal - yourTotal;
  const pct = yourTotal > 0 ? (diff / yourTotal) * 100 : 0;
  const profit = diff >= 0;

  const yourEl = document.getElementById('sk-your-total');
  const theirEl = document.getElementById('sk-their-total');
  const plEl = document.getElementById('sk-pl-value');
  const warnEl = document.getElementById('sk-trade-warn');

  if (yourEl) yourEl.textContent = `${yourCount} items \u00b7 ${fmtPrice(yourTotal)}`;
  if (theirEl) theirEl.textContent = `${theirCount} items \u00b7 ${fmtPrice(theirTotal)}`;

  if (plEl) {
    const sign = profit ? '+' : '';
    plEl.textContent = `${sign}${fmtPrice(diff)} (${sign}${pct.toFixed(1)}%)`;
    plEl.style.color = profit ? '#4ade80' : '#f87171';
    plEl.style.fontWeight = '800';
  }

  // Update in-trade totals in headers (like CSGO Trader)
  updateInTradeHeader('your', yourCount, yourTotal);
  updateInTradeHeader('their', theirCount, theirTotal);

  // Warnings
  if (warnEl) {
    if (yourCount > 0 && theirCount === 0) {
      warnEl.style.display = '';
      warnEl.innerHTML = '<div style="color:#fbbf24;font-size:11px;padding:4px 0">\u26a0 One-sided trade \u2014 giving items for nothing!</div>';
    } else if (!profit && Math.abs(pct) > 10) {
      warnEl.style.display = '';
      warnEl.innerHTML = `<div style="color:#f87171;font-size:11px;padding:4px 0">\u26a0 Losing ${Math.abs(pct).toFixed(1)}% value!</div>`;
    } else {
      warnEl.style.display = 'none';
    }
  }

  // Re-add price tags on trade items
  addOverlaysToAll();
}

function updateInTradeHeader(whose: string, count: number, total: number) {
  const area = document.getElementById(`trade_${whose}s`);
  if (!area) return;
  const h2 = area.querySelector('h2.ellipsis') || area.querySelector('.offerheader h2');
  if (!h2) return;

  let totalSpan = document.getElementById(`sk-${whose}-intrade-total`);
  if (!totalSpan) {
    totalSpan = document.createElement('span');
    totalSpan.id = `sk-${whose}-intrade-total`;
    totalSpan.style.cssText = 'color:#6366f1;font-weight:700';
    h2.appendChild(document.createTextNode(' '));
    h2.appendChild(totalSpan);
  }
  totalSpan.textContent = count > 0 ? `(${fmtPrice(total)})` : '';
}

// ─── Observe trade slot changes ──────────────────────────────────

function observeTradeSlots(isCreate: boolean) {
  let timer: ReturnType<typeof setTimeout>;
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (isCreate) updateSummary();
      addOverlaysToAll();
    }, 300);
  };

  const slots = [
    document.getElementById('your_slots'),
    document.getElementById('their_slots'),
    document.querySelector('.tradeoffer_items.primary'),
    document.querySelector('.tradeoffer_items.secondary'),
  ].filter(Boolean) as HTMLElement[];

  for (const slot of slots) {
    new MutationObserver(debounced).observe(slot, { childList: true, subtree: true });
  }

  // Also update periodically (like CSGO Trader)
  if (isCreate) {
    setInterval(() => {
      if (!document.hidden) updateSummary();
    }, 2000);
  }
}

// ─── Preset Trade Messages ───────────────────────────────────────

function addPresetMessages() {
  const textarea = document.getElementById('trade_offer_note_text') as HTMLTextAreaElement;
  if (!textarea) return;

  const presets = ['', 'Thanks!', 'Enjoy!', 'Good trade!', 'Fair trade, accept please', 'Counter offer welcome'];

  const select = document.createElement('select');
  select.style.cssText = `
    padding:4px 8px;border-radius:4px;margin-bottom:6px;width:100%;
    background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);
    color:#c9d1d9;font-size:12px;font-family:var(--sk-font);
  `;
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Message presets...';
  select.appendChild(defaultOpt);

  for (const msg of presets) {
    if (!msg) continue;
    const opt = document.createElement('option');
    opt.value = msg;
    opt.textContent = msg;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    if (select.value) {
      textarea.value = select.value;
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  textarea.parentElement?.insertBefore(select, textarea);
}

// ─── URL Param Automation ────────────────────────────────────────

function handleUrlParams(isCreate: boolean) {
  const params = new URLSearchParams(window.location.search);

  // Auto-accept: ?sk_accept=true
  if (params.get('sk_accept') === 'true' && !isCreate) {
    setTimeout(() => {
      const acceptBtn = document.querySelector('.tradeoffer_footer .accept_trade_offer_btn, .accept_trade_link') as HTMLElement;
      if (acceptBtn) {
        console.log('[SkinKeeper] Auto-accepting trade offer from URL param');
        acceptBtn.click();
      }
    }, 2000);
  }

  // Auto-select items: ?sk_select_your=assetid1,assetid2 or ?sk_select_their=assetid1,assetid2
  if (isCreate) {
    const selectYour = params.get('sk_select_your');
    const selectTheir = params.get('sk_select_their');

    if (selectYour) {
      const ids = selectYour.split(',');
      setTimeout(() => moveItemsByAssetIds(ids, 'your'), 3000);
    }
    if (selectTheir) {
      const ids = selectTheir.split(',');
      setTimeout(() => moveItemsByAssetIds(ids, 'their'), 3500);
    }
  }

  // Pre-fill message: ?sk_message=text
  const msg = params.get('sk_message');
  if (msg && isCreate) {
    setTimeout(() => {
      const textarea = document.getElementById('trade_offer_note_text') as HTMLTextAreaElement;
      if (textarea) {
        textarea.value = msg;
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, 2000);
  }
}

function moveItemsByAssetIds(assetIds: string[], whose: string) {
  const invContainer = whose === 'your'
    ? document.querySelector(`[id*="inventory_${userSteamID}_730_"]`)
    : getActiveInventory();
  if (!invContainer) return;

  let delay = 0;
  for (const assetid of assetIds) {
    const itemEl = invContainer.querySelector(`[id$="_${assetid}"]`) as HTMLElement
      || document.getElementById(`item730_2_${assetid}`);
    if (itemEl) {
      setTimeout(() => moveItem(itemEl), delay);
      delay += 150;
    }
  }
}

// ─── CSS injection ───────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('sk-trade-styles')) return;
  const style = document.createElement('style');
  style.id = 'sk-trade-styles';
  style.textContent = `
    .sk-trade-summary {
      background: rgba(13,17,23,0.92);
      border: 1px solid rgba(99,102,241,0.25);
      border-radius: 8px;
      padding: 12px 14px;
      margin: 8px 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
      color: #e2e8f0;
    }
    .sk-summary-header {
      font-weight: 700;
      font-size: 13px;
      color: #6366f1;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .sk-summary-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .sk-summary-label { color: #8b949e; }
    .sk-summary-value { font-weight: 700; }
    .sk-summary-divider {
      height: 1px;
      background: rgba(255,255,255,0.06);
      margin: 8px 0;
    }
  `;
  document.head.appendChild(style);
}

// ─── Entry point ─────────────────────────────────────────────────

injectStyles();
init();
