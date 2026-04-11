import '../styles/skinkeeper.css';
import { initCollector } from '../shared/collector';
import {
  getWalletCurrency, formatCentsViaSteam, parseSteamPriceString,
  getLowestListingPrice, getHighestBuyOrder, getMarketPriceOverview,
  removeListing, cancelBuyOrder, getMarketHistory,
} from '../shared/steam';

import { injectMiniCard } from '../shared/miniCard';

// Market home — collect prices passively from Steam API responses
initCollector();
injectMiniCard();

/* ═══════════════════════════════════════════════════════════════════
   SkinKeeper — Market Page Enhancement
   Price checking, overpriced detection, bulk actions, CSV export
   ═══════════════════════════════════════════════════════════════════ */

const SK = 'data-sk';

// ─── Price Queue ─────────────────────────────────────────────────

class PriceQueue {
  private q: { name: string; row: HTMLElement; retries: number }[] = [];
  private running = false;
  delay = 300;
  private cache = new Map<string, number>();
  onPrice?: (row: HTMLElement, name: string, price: number) => void;

  constructor(private type: 'listing' | 'buyorder') {}

  enqueue(name: string, row: HTMLElement) {
    if (this.cache.has(name)) {
      this.onPrice?.(row, name, this.cache.get(name)!);
      return;
    }
    this.q.push({ name, row, retries: 0 });
    if (!this.running) this.run();
  }

  stop() { this.q = []; }

  private async run() {
    this.running = true;
    while (this.q.length) {
      const job = this.q.shift()!;
      try {
        const cid = getWalletCurrency();
        const price = this.type === 'listing'
          ? await getLowestListingPrice(job.name, cid)
          : await getHighestBuyOrder(job.name, cid);
        if (price !== null) {
          this.cache.set(job.name, price);
          this.onPrice?.(job.row, job.name, price);
        } else if (job.retries < 3) {
          job.retries++;
          this.q.push(job);
        }
      } catch {
        if (job.retries < 3) { job.retries++; this.q.push(job); }
      }
      if (this.q.length) await new Promise(r => setTimeout(r, this.delay));
    }
    this.running = false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function nameFromRow(row: HTMLElement): string | null {
  const link = row.querySelector('.market_listing_item_name_link') as HTMLAnchorElement | null;
  if (link?.href) {
    const m = link.href.match(/\/listings\/\d+\/(.+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return row.querySelector('.market_listing_item_name')?.textContent?.trim() || null;
}

function myPriceCents(row: HTMLElement): number {
  const el = row.querySelector('.market_listing_price');
  if (!el) return 0;
  const spans = el.querySelectorAll('span');
  return parseSteamPriceString(spans[0]?.textContent || el.textContent || '');
}

// ─── Init ────────────────────────────────────────────────────────

const waitTimer = setInterval(() => {
  if (document.querySelector('.my_listing_section')) {
    clearInterval(waitTimer);
    initMarketPage();
  }
}, 500);
setTimeout(() => clearInterval(waitTimer), 20000);

function initMarketPage() {
  // Active listings (awaiting confirmation)
  enhanceListings('tabContentsMyActiveMarketListingsRows');
  // Sell listings (confirmed)
  enhanceListings('tabContentsMyListingsRows');
  // Buy orders
  enhanceBuyOrders();
  // Market history
  enhanceHistory();
}

// ═══════════════════════════════════════════════════════════════════
//  MY LISTINGS — Price checking, overpriced detection, bulk actions
// ═══════════════════════════════════════════════════════════════════

function enhanceListings(containerId: string) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const section = container.closest('.my_listing_section') as HTMLElement | null;
  if (!section) return;

  const queue = new PriceQueue('listing');
  let overpricedCount = 0;
  let totalChecked = 0;

  const badge = document.createElement('span');
  badge.className = 'sk-overpriced-badge';
  badge.textContent = 'Overpriced (0/0)';

  queue.onPrice = (row, _name, minPrice) => {
    const myPrice = myPriceCents(row);
    const overpriced = myPrice > minPrice;

    // Show min market price below the listed price
    const priceEl = row.querySelector('.market_listing_price');
    if (priceEl && !priceEl.querySelector('.sk-ref-price')) {
      const formatted = formatCentsViaSteam(minPrice) || `${(minPrice / 100).toFixed(2)}`;
      const ref = document.createElement('div');
      ref.className = `sk-ref-price ${overpriced ? 'sk-ref-bad' : 'sk-ref-ok'}`;
      ref.textContent = formatted;
      priceEl.appendChild(ref);
    }

    if (overpriced) {
      row.classList.add('sk-overpriced');
      const mainSpan = priceEl?.querySelector('span');
      if (mainSpan) mainSpan.classList.add('sk-price-strike');
      overpricedCount++;
    }
    totalChecked++;
    badge.textContent = `Overpriced (${overpricedCount}/${totalChecked})`;
    badge.classList.toggle('sk-has-overpriced', overpricedCount > 0);
  };

  // Build toolbar
  const toolbar = createToolbar(queue, container, badge);
  const tableHeader = section.querySelector('.market_listing_table_header');
  if (tableHeader) tableHeader.insertAdjacentElement('afterend', toolbar);

  // Section header buttons
  addSectionButtons(section, container, queue, badge, 'listing',
    () => { overpricedCount = 0; totalChecked = 0; });

  // Process existing rows + watch for pagination
  processRows(container);
  new MutationObserver(() => processRows(container)).observe(container, { childList: true });

  // Show total in section header
  updateTotal(section, container);
}

// ═══════════════════════════════════════════════════════════════════
//  BUY ORDERS — Highest order detection, cancel selected
// ═══════════════════════════════════════════════════════════════════

function enhanceBuyOrders() {
  const container = document.getElementById('tabContentsMyMarketBuyOrdersRows');
  if (!container) return;
  const section = container.closest('.my_listing_section') as HTMLElement | null;
  if (!section) return;

  const queue = new PriceQueue('buyorder');
  let overpricedCount = 0;
  let totalChecked = 0;

  const badge = document.createElement('span');
  badge.className = 'sk-overpriced-badge';
  badge.textContent = 'Overpriced (0/0)';

  queue.onPrice = (row, _name, highestOrder) => {
    const myPrice = myPriceCents(row);
    const notHighest = myPrice < highestOrder;

    const priceEl = row.querySelector('.market_listing_price');
    if (priceEl && !priceEl.querySelector('.sk-ref-price')) {
      const formatted = formatCentsViaSteam(highestOrder) || `${(highestOrder / 100).toFixed(2)}`;
      const ref = document.createElement('div');
      ref.className = `sk-ref-price ${notHighest ? 'sk-ref-bad' : 'sk-ref-ok'}`;
      ref.textContent = formatted;
      priceEl.appendChild(ref);
    }

    if (notHighest) {
      row.classList.add('sk-overpriced');
      overpricedCount++;
    }
    totalChecked++;
    badge.textContent = `Overpriced (${overpricedCount}/${totalChecked})`;
    badge.classList.toggle('sk-has-overpriced', overpricedCount > 0);
  };

  const toolbar = createToolbar(queue, container, badge);
  const tableHeader = section.querySelector('.market_listing_table_header');
  if (tableHeader) tableHeader.insertAdjacentElement('afterend', toolbar);

  addSectionButtons(section, container, queue, badge, 'buyorder',
    () => { overpricedCount = 0; totalChecked = 0; });

  processRows(container);
  new MutationObserver(() => processRows(container)).observe(container, { childList: true });

  updateTotal(section, container);
}

// ═══════════════════════════════════════════════════════════════════
//  SHARED — Toolbar, buttons, row processing
// ═══════════════════════════════════════════════════════════════════

function createToolbar(
  queue: PriceQueue, container: HTMLElement, badge: HTMLElement,
): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'sk-market-toolbar';

  // Search input
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Start typing an item name here to filter items';
  search.className = 'sk-market-input sk-market-search';
  search.addEventListener('input', () => {
    const q = search.value.toLowerCase();
    container.querySelectorAll('.market_listing_row').forEach(r => {
      const row = r as HTMLElement;
      const name = (row.querySelector('.market_listing_item_name')?.textContent || '').toLowerCase();
      row.style.display = !q || name.includes(q) ? '' : 'none';
    });
  });

  // Delay group
  const delayGroup = document.createElement('span');
  delayGroup.className = 'sk-delay-group';
  const delayIcon = document.createElement('span');
  delayIcon.className = 'sk-delay-icon';
  delayIcon.textContent = '⏱';
  const delayLabel1 = document.createTextNode(' Delay ');
  const delayInput = document.createElement('input');
  delayInput.type = 'number';
  delayInput.value = '300';
  delayInput.min = '100';
  delayInput.className = 'sk-market-input sk-delay-num';
  delayInput.addEventListener('change', () => {
    queue.delay = Math.max(100, parseInt(delayInput.value) || 300);
  });
  const delayLabel2 = document.createTextNode(' ms');
  delayGroup.append(delayIcon, delayLabel1, delayInput, delayLabel2);

  // Overpriced badge (click to filter)
  let filterOn = false;
  badge.style.cursor = 'pointer';
  badge.addEventListener('click', () => {
    filterOn = !filterOn;
    badge.classList.toggle('sk-filter-active', filterOn);
    container.querySelectorAll('.market_listing_row').forEach(r => {
      const row = r as HTMLElement;
      row.style.display = filterOn && !row.classList.contains('sk-overpriced') ? 'none' : '';
    });
  });

  // Select all
  const selectAll = document.createElement('a');
  selectAll.className = 'sk-select-all';
  selectAll.textContent = 'Select all';
  selectAll.href = '#';
  selectAll.addEventListener('click', e => {
    e.preventDefault();
    const cbs = container.querySelectorAll<HTMLInputElement>('.sk-row-cb');
    const allChecked = Array.from(cbs).every(c => c.checked);
    cbs.forEach(c => { c.checked = !allChecked; });
    selectAll.textContent = allChecked ? 'Select all' : 'Deselect all';
  });

  toolbar.append(search, delayGroup, badge, selectAll);
  return toolbar;
}

function addSectionButtons(
  section: HTMLElement, container: HTMLElement,
  queue: PriceQueue, badge: HTMLElement,
  type: 'listing' | 'buyorder', resetCounts: () => void,
) {
  const wrap = document.createElement('div');
  wrap.className = 'sk-section-btns';

  // Request prices
  const reqBtn = document.createElement('button');
  reqBtn.className = 'sk-banner-cta sk-cta-sell';
  reqBtn.innerHTML = '&#8635; Request prices';
  reqBtn.addEventListener('click', () => {
    resetCounts();
    container.querySelectorAll('.sk-ref-price').forEach(el => el.remove());
    container.querySelectorAll('.sk-overpriced').forEach(el => el.classList.remove('sk-overpriced'));
    container.querySelectorAll('.sk-price-strike').forEach(el => el.classList.remove('sk-price-strike'));
    badge.textContent = 'Overpriced (0/0)';
    badge.classList.remove('sk-has-overpriced');

    queue.stop();
    container.querySelectorAll('.market_listing_row').forEach(r => {
      const row = r as HTMLElement;
      const name = nameFromRow(row);
      if (name) queue.enqueue(name, row);
    });
  });

  // Remove / Cancel selected
  const actionBtn = document.createElement('button');
  actionBtn.className = 'sk-banner-cta sk-cta-cancel';
  actionBtn.textContent = type === 'listing' ? 'Remove selected' : 'Cancel selected';
  actionBtn.addEventListener('click', async () => {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('.market_listing_row'));
    for (const row of rows) {
      const cb = row.querySelector<HTMLInputElement>('.sk-row-cb');
      if (!cb?.checked) continue;

      const id = type === 'listing'
        ? row.id.replace('mylisting_', '')
        : row.id.replace('mybuyorder_', '');
      if (!id) continue;

      const ok = type === 'listing'
        ? await removeListing(id)
        : await cancelBuyOrder(id);

      if (ok) {
        row.style.transition = 'opacity 0.3s';
        row.style.opacity = '0.2';
        setTimeout(() => row.remove(), 400);
      }
      await new Promise(r => setTimeout(r, 500));
    }
    updateTotal(section, container);
  });

  wrap.append(actionBtn, reqBtn);

  // Position in section header
  const header = section.querySelector('.market_listing_header')
    || section.querySelector('.my_market_header_active')?.parentElement
    || section.firstElementChild;
  if (header) {
    (header as HTMLElement).style.position = 'relative';
    wrap.style.cssText = 'position:absolute;right:0;top:50%;transform:translateY(-50%);display:flex;gap:8px;z-index:5;';
    header.appendChild(wrap);
  }
}

function processRows(container: HTMLElement) {
  container.querySelectorAll('.market_listing_row').forEach(r => {
    const row = r as HTMLElement;
    if (row.hasAttribute(SK)) return;
    row.setAttribute(SK, '1');

    // Add checkbox to each row
    const editCell = row.querySelector('.market_listing_edit_buttons');
    if (editCell && !row.querySelector('.sk-row-cb')) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'sk-row-cb';
      cb.addEventListener('click', e => e.stopPropagation());
      editCell.insertAdjacentElement('afterbegin', cb);
    }
  });
}

function updateTotal(section: HTMLElement, container: HTMLElement) {
  let total = 0;
  container.querySelectorAll('.market_listing_row').forEach(r => {
    total += myPriceCents(r as HTMLElement);
  });
  if (total <= 0) return;

  const formatted = formatCentsViaSteam(total) || `${(total / 100).toFixed(2)}`;
  const headerText = section.querySelector('.my_market_header_active')
    || section.querySelector('[class*="my_market_header"]')
    || section.querySelector('span:first-child');
  if (!headerText) return;

  let totalBadge = headerText.querySelector('.sk-total-badge') as HTMLElement;
  if (!totalBadge) {
    totalBadge = document.createElement('span');
    totalBadge.className = 'sk-total-badge';
    headerText.appendChild(totalBadge);
  }
  totalBadge.textContent = ` · ${formatted}`;
}

// ═══════════════════════════════════════════════════════════════════
//  MARKET HISTORY — CSV export, batch loading, filters
// ═══════════════════════════════════════════════════════════════════

function enhanceHistory() {
  const trySetup = () => {
    const el = document.getElementById('tabContentsMyMarketHistory');
    if (!el) return false;
    // Wait for actual rows to load, not just the empty container
    const rows = el.querySelectorAll('.market_listing_row');
    if (rows.length === 0 && !el.querySelector('.market_listing_table_header')) return false;
    // Re-setup if Steam replaced the DOM (our attribute is gone)
    if (!el.hasAttribute(SK)) setupHistory(el);
    return true;
  };

  if (trySetup()) return;

  // Watch for lazy-loaded tab content AND re-renders
  const obs = new MutationObserver(() => {
    trySetup();
  });
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 60000);
}

function setupHistory(histSection: HTMLElement) {
  if (histSection.hasAttribute(SK)) return;
  histSection.setAttribute(SK, '1');

  const container = document.getElementById('tabContentsMyMarketHistoryRows') || histSection;

  // ── Top bar: export controls ──────────────────────────────
  const exportBar = document.createElement('div');
  exportBar.className = 'sk-market-toolbar sk-history-export';

  const exportLabel = document.createElement('span');
  exportLabel.className = 'sk-toolbar-label';
  exportLabel.textContent = 'Export market history:';

  const rangeSelect = document.createElement('select');
  rangeSelect.className = 'sk-market-input';
  for (const max of [100, 500, 1000, 5000, 10000, 50000]) {
    const opt = document.createElement('option');
    opt.value = `0-${max}`;
    opt.textContent = `Number of items: 0 - ${max.toLocaleString()}`;
    rangeSelect.appendChild(opt);
  }

  const excludeLabel = document.createElement('label');
  excludeLabel.className = 'sk-check-label';
  const excludeCb = document.createElement('input');
  excludeCb.type = 'checkbox';
  excludeLabel.append(excludeCb, document.createTextNode(' Exclude non-transaction'));

  const exportBtn = document.createElement('button');
  exportBtn.className = 'sk-banner-cta sk-export-csv';
  exportBtn.textContent = 'EXPORT .CSV FILE';

  const progress = document.createElement('span');
  progress.className = 'sk-export-progress';
  progress.style.display = 'none';

  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    progress.style.display = 'inline';
    await exportCSV(rangeSelect.value, excludeCb.checked, progress);
    exportBtn.disabled = false;
    progress.style.display = 'none';
  });

  exportBar.append(exportLabel, rangeSelect, excludeLabel, exportBtn, progress);

  // ── Filter row: lot bought / lot sold ──────────────────────
  const filterBar = document.createElement('div');
  filterBar.className = 'sk-market-toolbar sk-history-filters';

  const filterIcon = document.createElement('span');
  filterIcon.className = 'sk-toolbar-label';
  filterIcon.textContent = '⊙ Filters';

  const boughtCk = makeCheckbox('Lot bought', true);
  const soldCk = makeCheckbox('Lot sold', true);

  const applyFilter = () => {
    container.querySelectorAll('.market_listing_row').forEach(r => {
      const row = r as HTMLElement;
      if (row.classList.contains('sk-hist-buy'))
        row.style.display = boughtCk.cb.checked ? '' : 'none';
      else if (row.classList.contains('sk-hist-sell'))
        row.style.display = soldCk.cb.checked ? '' : 'none';
    });
  };
  boughtCk.cb.addEventListener('change', applyFilter);
  soldCk.cb.addEventListener('change', applyFilter);

  filterBar.append(filterIcon, boughtCk.wrap, soldCk.wrap);

  // Insert toolbars
  const tableHeader = histSection.querySelector('.market_listing_table_header');
  const insertPt = tableHeader || histSection.firstElementChild;
  if (insertPt) {
    insertPt.insertAdjacentElement('beforebegin', exportBar);
    insertPt.insertAdjacentElement('beforebegin', filterBar);
  }

  // ── Bottom bar: counter + upload buttons ───────────────────
  const bottomBar = document.createElement('div');
  bottomBar.className = 'sk-history-bottom';

  const counter = document.createElement('span');
  counter.className = 'sk-history-counter';

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'sk-banner-cta sk-cta-secondary';
  collapseBtn.textContent = 'COLLAPSE ADDITIONAL LINES';
  collapseBtn.addEventListener('click', () => collapseRows(container));

  bottomBar.append(counter, collapseBtn);

  for (const n of [10, 25, 50, 100]) {
    const btn = document.createElement('button');
    btn.className = 'sk-banner-cta sk-upload-btn';
    btn.textContent = `UPLOAD ${n}`;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Loading...';
      await uploadHistory(container, n);
      btn.textContent = `UPLOAD ${n}`;
      btn.disabled = false;
      tagHistoryRows(container);
      applyFilter();
      counter.textContent = `Total: ${container.querySelectorAll('.market_listing_row').length}`;
    });
    bottomBar.append(btn);
  }

  histSection.appendChild(bottomBar);

  // Process existing rows
  tagHistoryRows(container);
  counter.textContent = `Total: ${container.querySelectorAll('.market_listing_row').length}`;

  // Watch for Steam's own pagination updates
  new MutationObserver(() => {
    tagHistoryRows(container);
    counter.textContent = `Total: ${container.querySelectorAll('.market_listing_row').length}`;
  }).observe(container, { childList: true });
}

function makeCheckbox(label: string, checked: boolean) {
  const wrap = document.createElement('label');
  wrap.className = 'sk-check-label';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  wrap.append(cb, document.createTextNode(` ${label}`));
  return { wrap, cb };
}

function tagHistoryRows(container: HTMLElement) {
  container.querySelectorAll('.market_listing_row').forEach(r => {
    const row = r as HTMLElement;
    if (row.hasAttribute(SK)) return;
    row.setAttribute(SK, '1');

    // Classify: + = purchase, - = sale, other
    const gl = row.querySelector('.market_listing_gainorloss')?.textContent?.trim();
    if (gl === '+') row.classList.add('sk-hist-buy');
    else if (gl === '-') row.classList.add('sk-hist-sell');
    else row.classList.add('sk-hist-other');

    // "Check price" link
    const priceEl = row.querySelector('.market_listing_price');
    if (priceEl && !priceEl.querySelector('.sk-check-price')) {
      const link = document.createElement('a');
      link.className = 'sk-check-price';
      link.textContent = 'Check price';
      link.href = '#';
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const name = nameFromRow(row);
        if (!name) { link.textContent = 'N/A'; return; }
        link.textContent = '...';
        try {
          // Use priceoverview (lightweight, less rate-limited) instead of render endpoint
          const overview = await getMarketPriceOverview(name, getWalletCurrency());
          if (overview?.lowestPrice) {
            link.textContent = overview.lowestPrice;
            link.classList.add('sk-check-loaded');
          } else {
            link.textContent = 'N/A';
          }
        } catch { link.textContent = 'Error'; }
      });
      priceEl.appendChild(link);
    }
  });
}

async function uploadHistory(container: HTMLElement, count: number) {
  const offset = container.querySelectorAll('.market_listing_row').length;
  const data = await getMarketHistory(offset, count);
  if (!data?.success || !data.results_html) return;

  const temp = document.createElement('div');
  temp.innerHTML = data.results_html;
  temp.querySelectorAll('.market_listing_row').forEach(row => {
    container.appendChild(row);
  });
}

function collapseRows(container: HTMLElement) {
  const rows = Array.from(container.querySelectorAll<HTMLElement>('.market_listing_row'));
  const anyCollapsed = rows.some(r => r.classList.contains('sk-collapsed'));

  let prevName = '';
  for (const row of rows) {
    if (anyCollapsed) {
      row.classList.remove('sk-collapsed');
      row.style.display = '';
      continue;
    }
    const name = row.querySelector('.market_listing_item_name')?.textContent?.trim() || '';
    if (name && name === prevName) {
      row.classList.add('sk-collapsed');
      row.style.display = 'none';
    }
    prevName = name;
  }
}

async function exportCSV(range: string, excludeNonTx: boolean, progress: HTMLElement) {
  const [startStr, endStr] = range.split('-');
  const start = parseInt(startStr);
  const end = parseInt(endStr);
  const batch = 50;
  const lines: string[] = ['Item Name,Game,Listed On,Acted On,Price,Type'];

  for (let offset = start; offset < end; offset += batch) {
    progress.textContent = ` Loading ${offset}/${end}...`;
    const count = Math.min(batch, end - offset);
    const data = await getMarketHistory(offset, count);
    if (!data?.success || !data.results_html) break;

    const temp = document.createElement('div');
    temp.innerHTML = data.results_html;
    const pageRows = temp.querySelectorAll('.market_listing_row');
    if (!pageRows.length) break;

    pageRows.forEach(r => {
      const row = r as HTMLElement;
      const gl = row.querySelector('.market_listing_gainorloss')?.textContent?.trim() || '';
      const type = gl === '+' ? 'purchase' : gl === '-' ? 'sale' : 'other';
      if (excludeNonTx && type === 'other') return;

      const esc = (s: string) => (s || '').replace(/"/g, '""').trim();
      const name = esc(row.querySelector('.market_listing_item_name')?.textContent || '');
      const game = esc(row.querySelector('.market_listing_game_name')?.textContent || '');
      const dates = row.querySelectorAll('.market_listing_listed_date');
      const actedOn = esc(dates[0]?.textContent || '');
      const listedOn = esc(dates[1]?.textContent || '');
      const price = esc(row.querySelector('.market_listing_price')?.textContent || '');

      lines.push(`"${name}","${game}","${listedOn}","${actedOn}","${price}","${type}"`);
    });

    // Rate limit: 5s between batches to avoid Steam throttling
    await new Promise(r => setTimeout(r, 5000));
  }

  progress.textContent = ' Generating file...';

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'market_history.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
