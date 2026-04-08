import '../styles/skinkeeper.css';
import { waitForElement, el, skBadge, sendMessage } from '../shared/dom';
import { readMarketListings, loadBulkPrices, loadExchangeRates, getItemPrice, getItemPriceEntry, getWalletCurrency, parseSteamPriceString } from '../shared/steam';
import { trackEvent } from '../shared/analytics';
import { initCollector } from '../shared/collector';
import { getFloatColor, fetchFloat, formatFloat } from '../shared/float';

initCollector();

let exchangeRate = 1;
let currencySign = '$';

const CURRENCY_MAP: Record<number, [string, string]> = {
  1: ['USD', '$'], 2: ['GBP', '\u00a3'], 3: ['EUR', '\u20ac'], 5: ['RUB', '\u20bd'],
  18: ['UAH', '\u20b4'], 17: ['TRY', '\u20ba'], 23: ['CNY', '\u00a5'], 7: ['BRL', 'R$'],
  20: ['CAD', 'CA$'], 21: ['AUD', 'A$'], 37: ['KZT', '\u20b8'],
};

function fmtPrice(v: number): string {
  if (!v) return '';
  const abs = Math.abs(v);
  if (abs >= 100) return `${currencySign}${Math.round(abs).toLocaleString()}`;
  if (abs >= 10) return `${currencySign}${abs.toFixed(1)}`;
  return `${currencySign}${abs.toFixed(2)}`;
}

async function init() {
  await waitForElement('#searchResultsRows, .market_listing_table');

  const itemName = extractName();
  if (!itemName) return;

  const [, rates] = await Promise.all([loadBulkPrices('steam'), loadExchangeRates()]);
  const wc = getWalletCurrency();
  const [cc, s] = CURRENCY_MAP[wc] || ['USD', '$'];
  currencySign = s;
  exchangeRate = rates?.[cc] || 1;

  const { listings } = readMarketListings();
  const price = getItemPrice(itemName, exchangeRate);
  const priceEntry = getItemPriceEntry(itemName);

  // Extract market info from page
  const marketInfo = extractMarketInfo();

  injectPanel(itemName, listings.length, price, priceEntry, marketInfo);

  trackEvent('market_listing_viewed', { item_name: itemName, listing_count: listings.length });
  console.log(`[SkinKeeper] Market: ${itemName}, ${listings.length} listings`);

  // Load float values for all visible listings (if enabled)
  const { sk_settings } = await chrome.storage.local.get('sk_settings');
  if (sk_settings?.marketListingFloats !== false) {
    loadListingFloats();
    observeNewListings();
  }
}

function extractName(): string | null {
  const m = window.location.pathname.match(/\/market\/listings\/730\/(.+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

interface MarketInfo {
  lowestPrice: string | null;
  volume: string | null;
  medianPrice: string | null;
}

function extractMarketInfo(): MarketInfo {
  // Try to extract starting price and volume from page
  let lowestPrice: string | null = null;
  let volume: string | null = null;
  let medianPrice: string | null = null;

  // Lowest listing price
  const firstListing = document.querySelector('.market_listing_price.market_listing_price_with_fee');
  if (firstListing) {
    lowestPrice = firstListing.textContent?.trim() || null;
  }

  // Volume from "X sold in the last 24 hours"
  const sellInfo = document.querySelector('.market_commodity_orders_header_promote, #searchResults_total');
  if (sellInfo) {
    const match = sellInfo.textContent?.match(/(\d[\d,]*)\s+sold/i);
    if (match) volume = match[1];
  }

  return { lowestPrice, volume, medianPrice };
}

// ─── Build Exterior Links ─────────────────────────────────────────────

function buildExteriorLinks(itemName: string): HTMLElement {
  const container = el('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:11px';

  const label = el('div', 'sk-price-source');
  label.textContent = 'Other Exteriors:';
  label.style.marginBottom = '2px';
  container.appendChild(label);

  // Parse item name to build exterior variants
  const baseName = itemName
    .replace(/\s*\(Factory New\)/i, '')
    .replace(/\s*\(Minimal Wear\)/i, '')
    .replace(/\s*\(Field-Tested\)/i, '')
    .replace(/\s*\(Well-Worn\)/i, '')
    .replace(/\s*\(Battle-Scarred\)/i, '')
    .trim();

  const isStatTrak = baseName.includes('StatTrak');
  const baseWithoutST = baseName.replace('StatTrak\u2122 ', '');

  const exteriors = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
  const shortNames = ['FN', 'MW', 'FT', 'WW', 'BS'];

  const linksRow = el('div');
  linksRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';

  // Normal variants
  for (let i = 0; i < exteriors.length; i++) {
    const variant = `${baseWithoutST} (${exteriors[i]})`;
    const isCurrent = itemName.includes(exteriors[i]);
    const link = el('a', 'sk-ext-link') as HTMLAnchorElement;
    link.href = `/market/listings/730/${encodeURIComponent(variant)}`;
    link.textContent = shortNames[i];
    if (isCurrent) {
      link.style.cssText += 'color:var(--sk-primary-light);font-weight:800;border-color:var(--sk-primary)';
    }
    linksRow.appendChild(link);
  }

  // StatTrak divider + variants
  if (!isStatTrak) {
    const divider = el('span');
    divider.style.cssText = 'color:var(--sk-text-dim);font-size:10px;align-self:center;margin:0 2px';
    divider.textContent = '|';
    linksRow.appendChild(divider);

    const stLabel = el('span');
    stLabel.style.cssText = 'color:#cf6a32;font-size:9px;font-weight:700;align-self:center';
    stLabel.textContent = 'ST';
    linksRow.appendChild(stLabel);

    for (let i = 0; i < exteriors.length; i++) {
      const variant = `StatTrak\u2122 ${baseWithoutST} (${exteriors[i]})`;
      const link = el('a', 'sk-ext-link') as HTMLAnchorElement;
      link.href = `/market/listings/730/${encodeURIComponent(variant)}`;
      link.textContent = shortNames[i];
      link.style.cssText += 'color:#cf6a32;border-color:rgba(207,106,50,0.3)';
      linksRow.appendChild(link);
    }
  }

  container.appendChild(linksRow);
  return container;
}

// ─── Panel ────────────────────────────────────────────────────────────

function injectPanel(name: string, listingCount: number, price: number, priceEntry: any, marketInfo: MarketInfo) {
  const nav = document.querySelector('.market_listing_nav');
  if (!nav || document.querySelector('.sk-detail')) return;

  const panel = el('div', 'sk-detail');
  panel.style.margin = '10px 0';

  // Header
  const header = el('div', 'sk-detail-header');
  const logo = el('div', 'sk-detail-logo');
  logo.textContent = 'SK';
  const title = el('span', 'sk-detail-title');
  title.textContent = 'SKINKEEPER';
  header.append(logo, title);
  panel.appendChild(header);

  // Price
  if (price) {
    const row = el('div', 'sk-price-row');
    const src = el('span', 'sk-price-source');
    src.textContent = 'Reference Price';
    const val = el('span', 'sk-price-value');
    val.textContent = fmtPrice(price);
    if (priceEntry) {
      const cur = priceEntry.last_24h ?? priceEntry.last_7d;
      const prev = priceEntry.last_7d ?? priceEntry.last_30d;
      if (cur && prev && prev > 0) {
        const pct = ((cur - prev) / prev) * 100;
        if (Math.abs(pct) > 0.5) {
          const t = el('span', ['sk-price-trend', pct > 0 ? 'sk-up' : 'sk-down']);
          t.textContent = ` ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% 7d`;
          val.appendChild(t);
        }
      }
    }
    row.append(src, val);
    panel.appendChild(row);
  }

  // Listings count
  const listRow = el('div', 'sk-price-row');
  const listLabel = el('span', 'sk-price-source');
  listLabel.textContent = 'Listings';
  const listVal = el('span', 'sk-price-value');
  listVal.textContent = `${listingCount}`;
  listRow.append(listLabel, listVal);
  panel.appendChild(listRow);

  // Starting at
  if (marketInfo.lowestPrice) {
    const row = el('div', 'sk-price-row');
    const src = el('span', 'sk-price-source');
    src.textContent = 'Starting at';
    const val = el('span', 'sk-price-value');
    val.textContent = marketInfo.lowestPrice;
    row.append(src, val);
    panel.appendChild(row);
  }

  // Volume
  if (marketInfo.volume) {
    const row = el('div', 'sk-price-row');
    const src = el('span', 'sk-price-source');
    src.textContent = 'Sold (24h)';
    const val = el('span', 'sk-price-value');
    val.textContent = marketInfo.volume;
    row.append(src, val);
    panel.appendChild(row);
  }

  // ── Exterior links ──
  const hasExterior = /\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/.test(name);
  if (hasExterior) {
    panel.appendChild(buildExteriorLinks(name));
  }

  // ── Inspect links ──
  const inspectSection = el('div');
  inspectSection.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:4px';

  // Inspect in Game link (from first listing)
  const firstInspect = document.querySelector('.market_listing_inspect_btn a, a[href*="csgo_econ_action_preview"]') as HTMLAnchorElement | null;
  if (firstInspect?.href) {
    const inspectBtn = el('a', 'sk-ext-link') as HTMLAnchorElement;
    inspectBtn.href = firstInspect.href;
    inspectBtn.textContent = 'Inspect in Game';
    inspectBtn.style.cssText += 'padding:3px 8px;font-size:10px';
    inspectSection.appendChild(inspectBtn);
  }

  // View on external sites
  const encodedName = encodeURIComponent(name);
  const extLinks: [string, string][] = [
    [`https://buff.163.com/market/csgo#tab=selling&page_num=1&search=${encodedName}`, 'Buff163'],
    [`https://csfloat.com/search?market_hash_name=${encodedName}`, 'CSFloat'],
    [`https://skinport.com/market?search=${encodedName}&cat=any`, 'Skinport'],
  ];

  for (const [url, label] of extLinks) {
    const link = el('a', 'sk-ext-link') as HTMLAnchorElement;
    link.href = url;
    link.target = '_blank';
    link.textContent = label;
    link.style.cssText += 'padding:3px 8px;font-size:10px';
    inspectSection.appendChild(link);
  }

  panel.appendChild(inspectSection);

  // ── Market controls: Load more + Sort by float ──
  const ctrlRow = el('div', 'sk-detail-links');

  // Load more listings (Steam default is 10, we load up to 100)
  const loadMoreBtn = el('button', 'sk-ext-link') as HTMLButtonElement;
  loadMoreBtn.textContent = '📋 Load 100 listings';
  loadMoreBtn.style.cursor = 'pointer';
  loadMoreBtn.addEventListener('click', () => {
    loadMoreBtn.textContent = '⏳ Loading...';
    // Use Steam's own listing load function via URL manipulation
    const countParam = new URL(window.location.href);
    // Trigger Steam to load more by calling their render endpoint
    const renderUrl = `${window.location.href.split('#')[0]}/render/?query=&start=0&count=100&country=US&language=english&currency=${getWalletCurrency()}`;
    sendMessage({ type: 'FETCH_JSON', url: renderUrl }).then((data: any) => {
      if (!data?.results_html) { loadMoreBtn.textContent = '❌ Failed'; return; }
      const container = document.getElementById('searchResultsRows');
      if (container) {
        container.innerHTML = data.results_html;
        loadMoreBtn.textContent = `✅ ${data.total_count || '100'} listings loaded`;
      }
    }).catch(() => { loadMoreBtn.textContent = '❌ Error'; });
  });
  ctrlRow.appendChild(loadMoreBtn);

  // Sort by float (requires floats to be loaded on listings)
  const sortFloatBtn = el('button', 'sk-ext-link') as HTMLButtonElement;
  sortFloatBtn.textContent = '🔽 Sort by Float';
  sortFloatBtn.style.cursor = 'pointer';
  sortFloatBtn.addEventListener('click', () => {
    const rows = Array.from(document.querySelectorAll('.market_listing_row.market_recent_listing_row')) as HTMLElement[];
    if (rows.length === 0) return;

    // Try to extract float from our injected tags or from inspect data
    rows.sort((a, b) => {
      const aFloat = parseFloat(a.dataset.skFloat || '999');
      const bFloat = parseFloat(b.dataset.skFloat || '999');
      return aFloat - bFloat;
    });

    const container = rows[0].parentElement;
    if (container) rows.forEach(r => container.appendChild(r));
    sortFloatBtn.textContent = '✅ Sorted by Float';
  });
  ctrlRow.appendChild(sortFloatBtn);

  panel.appendChild(ctrlRow);

  // ── Actions ──
  const actions = el('div', 'sk-actions');

  actions.appendChild(skBadge('Track', () => {
    window.open(`https://app.skinkeeper.store/inventory?search=${encodeURIComponent(name)}`, '_blank');
  }));

  if (price) {
    const alertBtn = el('button', 'sk-alert-btn');
    alertBtn.textContent = 'Set Alert';
    alertBtn.addEventListener('click', () => {
      try {
        sendMessage({ type: 'CREATE_ALERT', market_hash_name: name, condition: 'below', threshold: Math.round(price * 100 * 0.9) });
        alertBtn.textContent = 'Alert Set!';
        alertBtn.style.color = '#4ade80';
      } catch { window.open('https://app.skinkeeper.store/alerts', '_blank'); }
    });
    actions.appendChild(alertBtn);
  }
  panel.appendChild(actions);

  const powered = el('div', 'sk-powered');
  powered.innerHTML = 'by <a href="https://skinkeeper.store" target="_blank">SkinKeeper</a>';
  panel.appendChild(powered);

  nav.parentElement?.insertBefore(panel, nav.nextSibling);
}

// ─── Float Values on Listings (CSFloat-style) ───────────────────────

async function loadListingFloats() {
  const rows = document.querySelectorAll('.market_listing_row.market_recent_listing_row');
  if (rows.length === 0) return;

  const CONCURRENCY = 3;
  const queue = Array.from(rows);

  async function processRow(row: Element) {
    const inspectLink = row.querySelector('a[href*="csgo_econ_action_preview"]') as HTMLAnchorElement;
    if (!inspectLink?.href) return;

    // Skip if already processed
    if ((row as HTMLElement).dataset.skFloat) return;

    try {
      const data = await fetchFloat(inspectLink.href);
      if (!data?.floatValue) return;

      const nameBlock = row.querySelector('.market_listing_item_name_block');
      if (!nameBlock) return;

      const floatEl = el('div', 'sk-listing-float');
      floatEl.style.cssText = 'font-size:11px;color:#94a3b8;font-family:monospace;margin-top:2px;display:flex;align-items:center;gap:4px';

      const floatColor = getFloatColor(data.floatValue);
      floatEl.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${floatColor}"></span> ${data.floatValue.toFixed(10)}`;

      // Show paint seed if available
      if (data.paintSeed) {
        floatEl.innerHTML += ` <span style="color:#6366f1;font-size:10px">Seed: ${data.paintSeed}</span>`;
      }

      nameBlock.appendChild(floatEl);

      // Store float on row for sorting
      (row as HTMLElement).dataset.skFloat = String(data.floatValue);
    } catch {
      // Silently fail for individual items
    }
  }

  // Process with concurrency limit
  async function next() {
    while (queue.length > 0) {
      const row = queue.shift()!;
      await processRow(row);
    }
  }

  const workers = Array(Math.min(CONCURRENCY, queue.length)).fill(null).map(() => next());
  await Promise.all(workers);
}

// Observe for new listings being loaded (pagination, "Load 100 listings", etc.)
function observeNewListings() {
  const container = document.getElementById('searchResultsRows');
  if (!container) return;

  const observer = new MutationObserver((mutations) => {
    let hasNewRows = false;
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof HTMLElement && (
          node.classList?.contains('market_recent_listing_row') ||
          node.querySelector?.('.market_recent_listing_row')
        )) {
          hasNewRows = true;
          break;
        }
      }
      if (hasNewRows) break;
    }
    if (hasNewRows) {
      // Debounce: wait a tick for all rows to be added
      setTimeout(() => loadListingFloats(), 100);
    }
  });

  observer.observe(container, { childList: true, subtree: true });
}

init();
