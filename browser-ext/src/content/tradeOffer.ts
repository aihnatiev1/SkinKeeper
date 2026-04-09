import '../styles/skinkeeper.css';
import { waitForElement, el } from '../shared/dom';
import { loadBulkPrices, loadExchangeRates, getItemPrice, getWalletCurrency } from '../shared/steam';

/* ═══════════════════════════════════════════════════════════════════
   SkinKeeper — Trade Offer Enhancement
   Sidebar with items/prices/P&L, inventory price tags, bulk actions
   ═══════════════════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────────────

let exchangeRate = 1;
let currencySign = '$';

const CURRENCY_MAP: Record<number, [string, string]> = {
  1: ['USD', '$'], 2: ['GBP', '\u00a3'], 3: ['EUR', '\u20ac'], 5: ['RUB', '\u20bd'],
  18: ['UAH', '\u20b4'], 17: ['TRY', '\u20ba'], 23: ['CNY', '\u00a5'], 7: ['BRL', 'R$'],
  20: ['CAD', 'CA$'], 21: ['AUD', 'A$'], 37: ['KZT', '\u20b8'],
};

interface TradeItem {
  name: string;
  price: number;
  element: HTMLElement;
}

function fmtPrice(v: number): string {
  if (!v) return `${currencySign}0`;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 100) return `${sign}${currencySign}${Math.round(abs).toLocaleString()}`;
  if (abs >= 10) return `${sign}${currencySign}${abs.toFixed(1)}`;
  return `${sign}${currencySign}${abs.toFixed(2)}`;
}

function itemName(el: HTMLElement): string {
  return el.querySelector('.trade_item_name')?.textContent?.trim()
    || (el.querySelector('img') as HTMLImageElement)?.alt?.trim() || '';
}

function itemPrice(name: string): number {
  return getItemPrice(name, exchangeRate);
}

// ─── Init ────────────────────────────────────────────────────────

async function init() {
  const tradeBox = await waitForElement('.trade_area, .tradeoffer');
  if (!tradeBox) return;

  const [, rates] = await Promise.all([loadBulkPrices('steam'), loadExchangeRates()]);
  const wc = getWalletCurrency();
  const [cc, s] = CURRENCY_MAP[wc] || ['USD', '$'];
  currencySign = s;
  exchangeRate = rates?.[cc] || 1;

  // Wait for Steam to render items
  await new Promise(r => setTimeout(r, 2000));

  // Determine page type: create trade or view trade
  const isCreate = !!document.getElementById('your_slots');

  // Build sidebar
  const sidebar = buildSidebar(isCreate);
  document.body.appendChild(sidebar);

  // Initial update
  updateSidebar();

  // Add price tags to inventory items
  tagInventoryPrices();

  // Inventory controls (create mode only)
  if (isCreate) addInventoryControls();

  // Observe trade slot changes
  observeChanges();

  console.log('[SkinKeeper] Trade offer enhanced');
}

// ═══════════════════════════════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════════════════════════════

function buildSidebar(isCreate: boolean): HTMLElement {
  const panel = el('div', 'sk-trade-sidebar');

  // ── Your Items section ──
  const yourSec = el('div', 'sk-sidebar-section');
  const yourHead = el('div', 'sk-sidebar-header');
  yourHead.textContent = 'Your Items:';
  const yourList = el('div', 'sk-sidebar-items');
  yourList.id = 'sk-your-list';
  const yourTotal = el('div', 'sk-sidebar-total');
  yourTotal.id = 'sk-your-total';
  yourSec.append(yourHead, yourList, yourTotal);

  // ── Their Items section ──
  const theirSec = el('div', 'sk-sidebar-section');
  const theirHead = el('div', 'sk-sidebar-header');
  theirHead.textContent = "Their Items:";
  const theirList = el('div', 'sk-sidebar-items');
  theirList.id = 'sk-their-list';
  const theirTotal = el('div', 'sk-sidebar-total');
  theirTotal.id = 'sk-their-total';
  theirSec.append(theirHead, theirList, theirTotal);

  // ── P/L ──
  const plSec = el('div', 'sk-sidebar-pl');
  plSec.id = 'sk-trade-pl';

  panel.append(yourSec, theirSec, plSec);

  // ── Action buttons (create mode only) ──
  if (isCreate) {
    panel.appendChild(divider());

    const actions = el('div', 'sk-sidebar-actions');

    actions.appendChild(actionBtn('By Price', 'sk-act-primary', sortInventoryByPrice));

    actions.appendChild(actionBtn('Remove all', 'sk-act-red', () => {
      clickAll('#your_slots .item');
    }));

    actions.appendChild(actionBtn('Take all', 'sk-act-green', () => {
      const inv = document.querySelectorAll(
        '#trade_theirs .inventory_page .item:not(.in_trade),'
        + '#their_slots .item'
      );
      clickAll(null, Array.from(inv) as HTMLElement[]);
    }));

    actions.appendChild(divider());

    actions.appendChild(actionBtn('Add lower priced', 'sk-act-green', () => {
      const v = prompt(`Add items priced below (${currencySign}):`);
      if (v) addByPrice(parseFloat(v), 'below');
    }));

    actions.appendChild(actionBtn('Add higher priced', 'sk-act-green', () => {
      const v = prompt(`Add items priced above (${currencySign}):`);
      if (v) addByPrice(parseFloat(v), 'above');
    }));

    actions.appendChild(divider());

    actions.appendChild(actionBtn('Remove from trade', 'sk-act-red', () => {
      clickAll('#your_slots .item');
    }));

    actions.appendChild(actionBtn('Remove lower priced', 'sk-act-red', () => {
      const v = prompt(`Remove items priced below (${currencySign}):`);
      if (v) removeByPrice(parseFloat(v), 'below');
    }));

    actions.appendChild(actionBtn('Remove higher priced', 'sk-act-red', () => {
      const v = prompt(`Remove items priced above (${currencySign}):`);
      if (v) removeByPrice(parseFloat(v), 'above');
    }));

    panel.appendChild(actions);
  }

  // ── Footer ──
  const footer = el('div', 'sk-sidebar-footer');
  footer.innerHTML = '<a href="https://skinkeeper.store" target="_blank">SkinKeeper</a>';
  panel.appendChild(footer);

  return panel;
}

function actionBtn(text: string, cls: string, onClick: () => void): HTMLElement {
  const btn = el('button', ['sk-sidebar-btn', cls]);
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function divider(): HTMLElement {
  return el('div', 'sk-sidebar-divider');
}

// ═══════════════════════════════════════════════════════════════════
//  UPDATE SIDEBAR — called on every trade change
// ═══════════════════════════════════════════════════════════════════

function updateSidebar() {
  const yourItems = collectTradeItems(
    '#your_slots .item, .tradeoffer_items.primary .trade_item'
  );
  const theirItems = collectTradeItems(
    '#their_slots .item, .tradeoffer_items.secondary .trade_item'
  );

  // Update item lists
  renderItemList('sk-your-list', 'sk-your-total', yourItems);
  renderItemList('sk-their-list', 'sk-their-total', theirItems);

  // Price tags on trade items
  for (const items of [yourItems, theirItems]) {
    for (const item of items) {
      if (item.element.querySelector('.sk-price-tag') || !item.price) continue;
      item.element.style.position = 'relative';
      const tag = el('div', 'sk-price-tag');
      tag.textContent = fmtPrice(item.price);
      item.element.appendChild(tag);
    }
  }

  // P/L
  const yourTotal = yourItems.reduce((s, i) => s + i.price, 0);
  const theirTotal = theirItems.reduce((s, i) => s + i.price, 0);
  const diff = theirTotal - yourTotal;
  const pct = yourTotal > 0 ? (diff / yourTotal) * 100 : 0;
  const profit = diff >= 0;

  const plEl = document.getElementById('sk-trade-pl');
  if (plEl) {
    plEl.innerHTML = '';

    if (yourItems.length > 0 || theirItems.length > 0) {
      const row = el('div', 'sk-pl-row');
      const label = el('span', 'sk-pl-label');
      label.textContent = 'P/L:';
      const value = el('span', profit ? 'sk-pl-profit' : 'sk-pl-loss');
      value.textContent = `${profit ? '+' : ''}${fmtPrice(diff)} (${profit ? '+' : ''}${pct.toFixed(1)}%)`;
      row.append(label, value);
      plEl.appendChild(row);
    }

    if (yourItems.length > 0 && theirItems.length === 0) {
      const warn = el('div', 'sk-pl-warn');
      warn.textContent = '\u26a0 One-sided trade \u2014 giving items for nothing!';
      plEl.appendChild(warn);
    } else if (!profit && Math.abs(pct) > 10) {
      const warn = el('div', 'sk-pl-warn');
      warn.textContent = `\u26a0 Losing ${Math.abs(pct).toFixed(1)}% value!`;
      plEl.appendChild(warn);
    }
  }
}

function collectTradeItems(selector: string): TradeItem[] {
  const items: TradeItem[] = [];
  document.querySelectorAll(selector).forEach(item => {
    const name = itemName(item as HTMLElement);
    if (name) {
      items.push({ name, price: itemPrice(name), element: item as HTMLElement });
    }
  });
  return items;
}

function renderItemList(listId: string, totalId: string, items: TradeItem[]) {
  const list = document.getElementById(listId);
  const totalEl = document.getElementById(totalId);
  if (!list) return;

  list.innerHTML = '';
  let total = 0;

  for (const item of items) {
    const row = el('div', 'sk-sidebar-item');
    const nameEl = el('span', 'sk-sidebar-item-name');
    nameEl.textContent = item.name;
    nameEl.title = item.name;
    const priceEl = el('span', 'sk-sidebar-item-price');
    priceEl.textContent = item.price ? fmtPrice(item.price) : '\u2014';
    row.append(nameEl, priceEl);
    list.appendChild(row);
    total += item.price;
  }

  if (totalEl) {
    totalEl.textContent = items.length > 0
      ? `${items.length} items \u00b7 ${fmtPrice(total)}`
      : 'No items';
  }
}

// ═══════════════════════════════════════════════════════════════════
//  INVENTORY PRICE TAGS
// ═══════════════════════════════════════════════════════════════════

function tagInventoryPrices() {
  document.querySelectorAll('#inventories .item, .trade_area .item').forEach(item => {
    const e = item as HTMLElement;
    if (e.querySelector('.sk-price-tag')) return;

    const name = itemName(e);
    if (!name) return;
    const price = itemPrice(name);
    if (!price) return;

    e.style.position = 'relative';
    const tag = el('div', 'sk-price-tag');
    tag.textContent = fmtPrice(price);
    e.appendChild(tag);
  });
}

// ═══════════════════════════════════════════════════════════════════
//  INVENTORY CONTROLS
// ═══════════════════════════════════════════════════════════════════

function addInventoryControls() {
  const target = document.getElementById('inventory_displaycontrols')
    || document.querySelector('.filter_ctn')
    || document.querySelector('.trade_area');
  if (!target || target.querySelector('.sk-inv-controls')) return;

  const bar = el('div', 'sk-inv-controls');

  // Search
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Search items...';
  search.className = 'sk-market-input sk-inv-search';
  search.addEventListener('input', () => {
    const q = search.value.toLowerCase();
    document.querySelectorAll('#inventories .item').forEach(item => {
      const e = item as HTMLElement;
      const n = itemName(e).toLowerCase();
      e.style.display = !q || n.includes(q) ? '' : 'none';
    });
  });

  // Count
  const count = el('span', 'sk-inv-count');
  const updateCount = () => {
    const n = document.querySelectorAll(
      '#inventories .inventory_page:not([style*="display: none"]) .item'
    ).length;
    count.textContent = `${n} items`;
  };
  updateCount();
  setInterval(updateCount, 3000);

  bar.append(search, count);
  target.insertAdjacentElement('afterbegin', bar);
}

// ═══════════════════════════════════════════════════════════════════
//  BULK ACTIONS
// ═══════════════════════════════════════════════════════════════════

function clickAll(selector: string | null, elements?: HTMLElement[]) {
  const items = elements || (selector
    ? Array.from(document.querySelectorAll(selector)) as HTMLElement[]
    : []);
  items.forEach((item, i) => {
    setTimeout(() => item.click(), i * 100);
  });
}

function sortInventoryByPrice() {
  document.querySelectorAll('#inventories .inventory_page').forEach(page => {
    const items = Array.from(page.querySelectorAll('.item')) as HTMLElement[];
    items.sort((a, b) => {
      return itemPrice(itemName(b)) - itemPrice(itemName(a));
    });
    items.forEach(item => page.appendChild(item));
  });
}

function addByPrice(threshold: number, dir: 'above' | 'below') {
  const items = document.querySelectorAll(
    '#inventories .inventory_page .item:not(.in_trade)'
  );
  let delay = 0;
  items.forEach(item => {
    const e = item as HTMLElement;
    const p = itemPrice(itemName(e));
    if (!p) return;
    const match = dir === 'above' ? p >= threshold : p <= threshold;
    if (match) {
      setTimeout(() => e.click(), delay);
      delay += 150;
    }
  });
}

function removeByPrice(threshold: number, dir: 'above' | 'below') {
  const items = document.querySelectorAll('#your_slots .item');
  let delay = 0;
  items.forEach(item => {
    const e = item as HTMLElement;
    const p = itemPrice(itemName(e));
    if (!p) return;
    const match = dir === 'above' ? p >= threshold : p <= threshold;
    if (match) {
      setTimeout(() => e.click(), delay);
      delay += 150;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
//  OBSERVE CHANGES
// ═══════════════════════════════════════════════════════════════════

function observeChanges() {
  let timer: ReturnType<typeof setTimeout>;
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(updateSidebar, 300);
  };

  // Watch trade slots
  const slots = [
    document.getElementById('your_slots'),
    document.getElementById('their_slots'),
    document.querySelector('.tradeoffer_items.primary'),
    document.querySelector('.tradeoffer_items.secondary'),
  ].filter(Boolean) as HTMLElement[];

  for (const slot of slots) {
    new MutationObserver(debounced).observe(slot, { childList: true, subtree: true });
  }

  // Watch inventory for new items loading
  const inv = document.getElementById('inventories');
  if (inv) {
    new MutationObserver(() => tagInventoryPrices()).observe(inv, {
      childList: true, subtree: true,
    });
  }
}

init();
