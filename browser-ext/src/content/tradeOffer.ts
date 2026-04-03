import '../styles/skinkeeper.css';
import { waitForElement, el } from '../shared/dom';
import { loadBulkPrices, loadExchangeRates, getItemPrice, getWalletCurrency } from '../shared/steam';

let exchangeRate = 1;
let currencySign = '$';
let yourItems: TradeItem[] = [];
let theirItems: TradeItem[] = [];

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
  if (abs >= 1000) return `${sign}${currencySign}${Math.round(abs).toLocaleString()}`;
  if (abs >= 100) return `${sign}${currencySign}${Math.round(abs).toLocaleString()}`;
  if (abs >= 10) return `${sign}${currencySign}${abs.toFixed(1)}`;
  return `${sign}${currencySign}${abs.toFixed(2)}`;
}

async function init() {
  const tradeBox = await waitForElement('.trade_area, .tradeoffer');
  if (!tradeBox) return;

  const [, rates] = await Promise.all([loadBulkPrices('steam'), loadExchangeRates()]);
  const wc = getWalletCurrency();
  const [cc, s] = CURRENCY_MAP[wc] || ['USD', '$'];
  currencySign = s;
  exchangeRate = rates?.[cc] || 1;

  await new Promise(r => setTimeout(r, 3000));

  yourItems = collectItems('.tradeoffer_items.primary .trade_item, #your_slots .item');
  theirItems = collectItems('.tradeoffer_items.secondary .trade_item, #their_slots .item');
  if (yourItems.length === 0 && theirItems.length === 0) return;

  injectSummary();
  injectSortControls();
  addPriceTags();

  console.log(`[SkinKeeper] Trade: give ${yourItems.length} / receive ${theirItems.length}`);
}

function collectItems(selector: string): TradeItem[] {
  const items: TradeItem[] = [];
  document.querySelectorAll(selector).forEach((item) => {
    const name = item.querySelector('.trade_item_name')?.textContent?.trim()
      || (item.querySelector('img') as HTMLImageElement)?.alt || '';
    if (name) {
      items.push({
        name,
        price: getItemPrice(name, exchangeRate),
        element: item as HTMLElement,
      });
    }
  });
  return items;
}

// ─── Summary Banner ───────────────────────────────────────────────────

function injectSummary() {
  document.querySelector('.sk-trade-summary')?.remove();

  const yourTotal = yourItems.reduce((s, i) => s + i.price, 0);
  const theirTotal = theirItems.reduce((s, i) => s + i.price, 0);
  const diff = theirTotal - yourTotal;
  const isProfit = diff >= 0;
  const pctChange = yourTotal > 0 ? (diff / yourTotal) * 100 : 0;

  const tradeArea = document.querySelector('.trade_area, .tradeoffer_items_ctn, .tradeoffer');
  if (!tradeArea) return;

  const summary = el('div', 'sk-trade-summary');
  summary.style.flexDirection = 'column';
  summary.style.gap = '8px';

  // ── Header row: Your total | P/L | Their total ──
  const row = el('div');
  row.style.cssText = 'display:flex;justify-content:space-between;align-items:center';

  // Your side
  const yourSide = el('div', 'sk-trade-side');
  const yourLabel = el('div', 'sk-trade-label');
  yourLabel.textContent = `You Give (${yourItems.length} items)`;
  const yourValue = el('div', 'sk-trade-value');
  yourValue.textContent = fmtPrice(yourTotal);
  yourSide.append(yourLabel, yourValue);

  // P/L delta with percentage
  const delta = el('div', 'sk-trade-delta');
  const deltaLabel = el('div', 'sk-trade-delta-label');
  deltaLabel.textContent = 'P/L';
  const deltaValue = el('div', 'sk-trade-delta-value');
  deltaValue.style.color = isProfit ? 'var(--sk-green)' : 'var(--sk-red)';
  deltaValue.textContent = `${isProfit ? '+' : ''}${fmtPrice(diff)}`;

  // Percentage
  if (yourTotal > 0) {
    const pctEl = el('div', 'sk-trade-delta-label');
    pctEl.style.color = isProfit ? 'var(--sk-green)' : 'var(--sk-red)';
    pctEl.textContent = `${isProfit ? '+' : ''}${pctChange.toFixed(1)}%`;
    delta.append(deltaLabel, deltaValue, pctEl);
  } else {
    delta.append(deltaLabel, deltaValue);
  }

  // Their side
  const theirSide = el('div', 'sk-trade-side');
  theirSide.style.textAlign = 'right';
  const theirLabel = el('div', 'sk-trade-label');
  theirLabel.textContent = `You Receive (${theirItems.length} items)`;
  const theirValue = el('div', 'sk-trade-value');
  theirValue.textContent = fmtPrice(theirTotal);
  theirSide.append(theirLabel, theirValue);

  row.append(yourSide, delta, theirSide);
  summary.appendChild(row);

  // ── Warnings ──
  if (yourItems.length > 0 && theirItems.length === 0) {
    const warn = el('div', 'sk-trade-warning');
    warn.textContent = 'One-sided trade \u2014 you give items and receive nothing!';
    summary.appendChild(warn);
  }

  if (!isProfit && Math.abs(pctChange) > 10) {
    const warn = el('div', 'sk-trade-warning');
    warn.textContent = `You are losing ${Math.abs(pctChange).toFixed(1)}% value in this trade!`;
    summary.appendChild(warn);
  }

  // Footer
  const footer = el('div', 'sk-powered');
  footer.style.textAlign = 'center';
  footer.innerHTML = 'Steam prices by <a href="https://skinkeeper.store" target="_blank">SkinKeeper</a>';
  summary.appendChild(footer);

  tradeArea.parentElement?.insertBefore(summary, tradeArea);
}

// ─── Sort Controls ────────────────────────────────────────────────────

function injectSortControls() {
  // Inject sort dropdown above the trade inventory panels
  const panels = document.querySelectorAll('.tradeoffer_items_header, .trade_box_header');
  if (panels.length === 0) return;

  panels.forEach((header) => {
    if (header.querySelector('.sk-sort-select')) return;

    const select = document.createElement('select');
    select.className = 'sk-sort-select';
    select.innerHTML = `
      <option value="default">Sort: Default</option>
      <option value="price-desc">Price: High to Low</option>
      <option value="price-asc">Price: Low to High</option>
      <option value="name-asc">Name: A-Z</option>
      <option value="name-desc">Name: Z-A</option>
    `;
    select.addEventListener('change', () => sortItems(select.value));
    header.appendChild(select);
  });
}

function sortItems(sortBy: string) {
  const sortFn = (a: TradeItem, b: TradeItem): number => {
    switch (sortBy) {
      case 'price-desc': return b.price - a.price;
      case 'price-asc': return a.price - b.price;
      case 'name-asc': return a.name.localeCompare(b.name);
      case 'name-desc': return b.name.localeCompare(a.name);
      default: return 0;
    }
  };

  // Sort and reorder DOM for both sides
  for (const items of [yourItems, theirItems]) {
    if (items.length === 0) continue;
    const sorted = [...items].sort(sortFn);
    const parent = items[0].element.parentElement;
    if (!parent) continue;
    for (const item of sorted) {
      parent.appendChild(item.element);
    }
  }
}

// ─── Price Tags ───────────────────────────────────────────────────────

function addPriceTags() {
  for (const items of [yourItems, theirItems]) {
    for (const item of items) {
      if (item.element.querySelector('.sk-price-tag')) continue;
      if (!item.price) continue;

      item.element.style.position = 'relative';
      const tag = el('div', 'sk-price-tag');
      tag.textContent = fmtPrice(item.price);
      item.element.appendChild(tag);
    }
  }
}

init();
