/**
 * Trade Offers LIST page (/tradeoffers/) — show profit on each offer, sort by profit
 * Ported from CSGO Trader's tradeOffers.js approach
 */
import '../styles/skinkeeper.css';
import { waitForElement, el } from '../shared/dom';
import { injectMiniCard } from '../shared/miniCard';
import { loadBulkPrices, loadExchangeRates, getItemPrice, getWalletCurrency } from '../shared/steam';

let exchangeRate = 1;
let currencySign = '$';
let currencyCode = 'USD';

const CURRENCY_MAP: Record<number, [string, string]> = {
  1: ['USD', '$'], 2: ['GBP', '£'], 3: ['EUR', '€'], 5: ['RUB', '₽'],
  18: ['UAH', '₴'], 17: ['TRY', '₺'], 23: ['CNY', '¥'], 7: ['BRL', 'R$'],
  20: ['CAD', 'CA$'], 21: ['AUD', 'A$'], 37: ['KZT', '₸'],
};

const NO_DECIMAL_CODES = new Set(['RUB', 'UAH', 'TRY', 'KZT', 'CLP', 'PEN', 'COP', 'PHP', 'CRC', 'UYU', 'NOK']);

function fmtPrice(v: number): string {
  if (!v) return `${currencySign}0`;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const noDecimals = NO_DECIMAL_CODES.has(currencyCode);
  if (noDecimals || abs >= 100) return `${sign}${currencySign}${Math.round(abs).toLocaleString()}`;
  if (abs >= 10) return `${sign}${currencySign}${abs.toFixed(1)}`;
  return `${sign}${currencySign}${abs.toFixed(2)}`;
}

interface OfferData {
  element: HTMLElement;
  yourValue: number;
  theirValue: number;
  profit: number;
  profitPct: number;
}

function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

// ── Extract item names from Steam's internal description cache ──

function extractItemNamesFromPage(): Map<string, string> {
  // Inject script into page world to read Steam's economy description cache
  const div = document.createElement('div');
  div.setAttribute('onreset', `
    try {
      var result = {};
      // g_rgDescriptions is Steam's global description cache on trade offer pages
      // Format: { "classid_instanceid": { market_hash_name, name, type, ... } }
      var descs = typeof g_rgDescriptions !== 'undefined' ? g_rgDescriptions : {};
      for (var key in descs) {
        var d = descs[key];
        if (d && (d.market_hash_name || d.name)) {
          result[key] = d.market_hash_name || d.name;
        }
      }
      document.body.setAttribute('sk_desc_cache', JSON.stringify(result));
    } catch(e) {
      document.body.setAttribute('sk_desc_cache', '{}');
    }
  `);
  div.dispatchEvent(new CustomEvent('reset'));
  div.removeAttribute('onreset');
  div.remove();

  const raw = document.body.getAttribute('sk_desc_cache');
  if (raw) document.body.removeAttribute('sk_desc_cache');

  const nameMap = new Map<string, string>();
  try {
    const parsed = JSON.parse(raw || '{}');
    for (const [key, name] of Object.entries(parsed)) {
      nameMap.set(key, name as string);
    }
  } catch { /* ignore */ }
  return nameMap;
}

function getItemNameFromElement(item: Element, descMap: Map<string, string>): string {
  // Method 1: data-economy-item → description cache
  const eco = item.getAttribute('data-economy-item');
  if (eco) {
    // Format: "classinfo/730/classid/instanceid"
    const parts = eco.split('/');
    if (parts.length >= 3) {
      const classid = parts[2];
      const instanceid = parts[3] || '0';
      const key = `${classid}_${instanceid}`;
      const name = descMap.get(key);
      if (name) return name;
    }
  }

  // Method 2: title attribute or aria-label
  const title = item.getAttribute('title') || item.getAttribute('aria-label');
  if (title) return title;

  // Method 3: img alt
  const img = item.querySelector('img') as HTMLImageElement;
  if (img?.alt) return img.alt;

  // Method 4: nested text
  const nameEl = item.querySelector('.trade_item_name');
  if (nameEl?.textContent?.trim()) return nameEl.textContent.trim();

  return '';
}

// ── Check if offer is active (not canceled/expired/declined) ──

function isOfferActive(offerEl: HTMLElement): boolean {
  // Steam marks inactive offers with banner text
  const banner = offerEl.querySelector('.tradeoffer_items_banner');
  if (banner) {
    const text = banner.textContent?.toLowerCase() || '';
    if (text.includes('cancel') || text.includes('decline') || text.includes('expire')
        || text.includes('counter') || text.includes('invalid')) {
      return false;
    }
  }
  // Also check for inactive class
  if (offerEl.classList.contains('inactive')) return false;
  return true;
}

// ── Override trade offer links: open in new tab instead of popup ──

function overrideTradeOfferLinks() {
  // Steam uses onclick="ShowTradeOffer()" which opens a popup window.
  // Replace all trade offer links to open in a new tab instead.
  document.querySelectorAll('.tradeoffer').forEach(offer => {
    const offerIdMatch = offer.id?.match(/tradeofferid_(\d+)/);
    if (!offerIdMatch) return;
    const offerId = offerIdMatch[1];
    const offerUrl = `https://steamcommunity.com/tradeoffer/${offerId}/`;

    // Find and replace clickable links/buttons that open this offer
    offer.querySelectorAll('a[href*="tradeoffer"], a[href*="ShowTradeOffer"], [onclick*="ShowTradeOffer"]').forEach(link => {
      const newLink = link.cloneNode(true) as HTMLElement;
      newLink.removeAttribute('onclick');
      if (newLink.tagName === 'A') {
        (newLink as HTMLAnchorElement).href = offerUrl;
        (newLink as HTMLAnchorElement).target = '_blank';
      } else {
        newLink.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(offerUrl, '_blank');
        });
      }
      link.replaceWith(newLink);
    });

    // Also make the whole offer header clickable → new tab
    const header = offer.querySelector('.tradeoffer_header');
    if (header && !(header as HTMLElement).dataset.skLinked) {
      (header as HTMLElement).dataset.skLinked = '1';
      (header as HTMLElement).style.cursor = 'pointer';
      header.addEventListener('click', (e) => {
        // Don't intercept clicks on buttons inside header
        if ((e.target as HTMLElement).closest('a, button')) return;
        window.open(offerUrl, '_blank');
      });
    }
  });

  // Override Steam's ShowTradeOffer global function to open in new tab
  const div = document.createElement('div');
  div.setAttribute('onreset', `
    try {
      if (typeof ShowTradeOffer !== 'undefined') {
        var origShow = ShowTradeOffer;
        ShowTradeOffer = function(offerID) {
          window.open('https://steamcommunity.com/tradeoffer/' + offerID + '/', '_blank');
        };
      }
    } catch(e) {}
  `);
  div.dispatchEvent(new CustomEvent('reset'));
  div.removeAttribute('onreset');
  div.remove();
}

async function init() {
  await waitForElement('.tradeoffer');

  // Override links immediately before anything else
  overrideTradeOfferLinks();

  const [, rates] = await Promise.all([loadBulkPrices('steam'), loadExchangeRates()]);
  const wc = getWalletCurrency();
  const [cc, s] = CURRENCY_MAP[wc] || ['USD', '$'];
  currencyCode = cc;
  currencySign = s;
  exchangeRate = rates?.[cc] || 1;

  // Wait for Steam to populate item descriptions
  await new Promise(r => setTimeout(r, 500));

  // Extract item names from Steam's JS context
  const descMap = extractItemNamesFromPage();
  console.log(`[SkinKeeper] Trade offers: ${descMap.size} item descriptions found`);

  const offers = processOffers(descMap);
  if (offers.length === 0) return;

  // ── Summary header (like CSGO Trader) ──
  const activeOffers = offers.filter(o => isOfferActive(o.element));
  const profitableOffers = activeOffers.filter(o => o.profit > 0);
  const totalPotentialProfit = profitableOffers.reduce((s, o) => s + o.profit, 0);
  const noDecimals = NO_DECIMAL_CODES.has(currencyCode);
  if (noDecimals) {
    // round for display
  }

  const heading = document.querySelector('.profile_trade_offers_header_text, h1');
  if (heading) {
    // Summary bar
    const summaryBar = el('div');
    summaryBar.style.cssText = `
      display:flex;gap:12px;align-items:center;margin:8px 0;padding:8px 12px;
      background:rgba(13,17,23,0.6);border:1px solid rgba(99,102,241,0.15);
      border-radius:6px;font-family:var(--sk-font);font-size:12px;color:#c9d1d9;
    `;
    summaryBar.innerHTML = `
      <span>${activeOffers.length} active</span>
      <span style="color:#8b949e">\u00b7</span>
      <span style="color:#4ade80">${profitableOffers.length} profitable</span>
      <span style="color:#8b949e">\u00b7</span>
      <span>Potential: <b style="color:${totalPotentialProfit >= 0 ? '#4ade80' : '#f87171'}">${totalPotentialProfit >= 0 ? '+' : ''}${fmtPrice(totalPotentialProfit)}</b></span>
    `;
    heading.insertAdjacentElement('afterend', summaryBar);

    // Sort controls
    const sortWrap = el('span');
    sortWrap.style.cssText = 'float:right;display:flex;gap:6px;align-items:center';

    const sortSelect = el('select', 'sk-sort-select') as HTMLSelectElement;
    for (const [val, label] of [['default', 'Default'], ['profit-desc', 'Most Profitable'], ['profit-asc', 'Least Profitable'], ['value-desc', 'Highest Value']]) {
      const opt = el('option') as HTMLOptionElement;
      opt.value = val;
      opt.textContent = label;
      sortSelect.appendChild(opt);
    }
    sortSelect.addEventListener('change', () => sortOffers(offers, sortSelect.value));
    sortWrap.appendChild(sortSelect);
    heading.appendChild(sortWrap);
  }

  injectMiniCard();
  console.log(`[SkinKeeper] Trade offers: ${offers.length} processed`);
}

function processOffers(descMap: Map<string, string>): OfferData[] {
  const offers: OfferData[] = [];

  document.querySelectorAll('.tradeoffer').forEach((offerEl) => {
    const htmlEl = offerEl as HTMLElement;
    const active = isOfferActive(htmlEl);

    // Get items from both sides
    // Steam layout: "primary" = items THEY offer, "secondary" = items YOU give
    const theirItemEls = htmlEl.querySelectorAll('.tradeoffer_items.primary .trade_item');
    const yourItemEls = htmlEl.querySelectorAll('.tradeoffer_items.secondary .trade_item');

    let yourValue = 0;
    let theirValue = 0;
    let hasNames = false;

    yourItemEls.forEach((item) => {
      const name = getItemNameFromElement(item, descMap);
      if (name) { hasNames = true; yourValue += getItemPrice(name, exchangeRate); }
    });

    theirItemEls.forEach((item) => {
      const name = getItemNameFromElement(item, descMap);
      if (name) { hasNames = true; theirValue += getItemPrice(name, exchangeRate); }
    });

    // Don't show fake $0/$0 if we couldn't resolve any names
    if (!hasNames) return;

    const profit = theirValue - yourValue;
    const profitPct = yourValue > 0 ? (profit / yourValue) * 100 : 0;

    // Round for no-decimal currencies
    const noDecimals = NO_DECIMAL_CODES.has(currencyCode);
    if (noDecimals) {
      yourValue = Math.round(yourValue);
      theirValue = Math.round(theirValue);
    }

    // Inject profit label
    const existing = htmlEl.querySelector('.sk-offer-profit');
    if (!existing) {
      const profitLabel = el('div', 'sk-offer-profit');
      profitLabel.style.cssText = `
        padding:4px 10px;margin:4px 0;border-radius:4px;
        font-family:var(--sk-font);font-size:12px;font-weight:700;
        display:inline-flex;gap:8px;align-items:center;
      `;

      const isProfit = profit >= 0;
      profitLabel.style.background = isProfit ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)';
      profitLabel.style.color = isProfit ? '#4ade80' : '#f87171';
      profitLabel.style.border = `1px solid ${isProfit ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`;

      const sign = isProfit ? '+' : '';
      profitLabel.innerHTML = `
        <span>Give: ${fmtPrice(yourValue)}</span>
        <span style="color:var(--sk-text-dim)">\u2192</span>
        <span>Receive: ${fmtPrice(theirValue)}</span>
        <span style="font-weight:800">${sign}${fmtPrice(profit)} (${sign}${profitPct.toFixed(1)}%)</span>
      `;

      const footer = htmlEl.querySelector('.tradeoffer_footer');
      if (footer) footer.insertBefore(profitLabel, footer.firstChild);
      else htmlEl.appendChild(profitLabel);
    }

    // Quick Accept / Decline buttons — ONLY for active incoming offers
    if (active) {
      const isIncoming = htmlEl.querySelector('.tradeoffer_items_ctn .tradeoffer_items.primary');
      const offerIdMatch = htmlEl.id?.match(/tradeofferid_(\d+)/)
        || htmlEl.querySelector('[id*="tradeofferid_"]')?.id?.match(/tradeofferid_(\d+)/);

      if (isIncoming && offerIdMatch) {
        const offerId = offerIdMatch[1];
        const existingBtns = htmlEl.querySelector('.sk-offer-btns');
        if (!existingBtns) {
          const btnRow = el('div', 'sk-offer-btns');
          btnRow.style.cssText = 'display:flex;gap:6px;margin:4px 0';

          const acceptBtn = el('button', 'sk-ext-link') as HTMLButtonElement;
          acceptBtn.textContent = '\u2705 Accept';
          acceptBtn.style.cssText += 'cursor:pointer;color:#4ade80;border-color:rgba(74,222,128,0.3);font-weight:700';
          acceptBtn.addEventListener('click', async () => {
            if (!confirm(`Accept trade offer #${offerId}?`)) return;
            acceptBtn.textContent = '\u23f3...';
            try {
              const resp = await fetch(`https://steamcommunity.com/tradeoffer/${offerId}/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `sessionid=${getCookie('sessionid')}&serverid=1&tradeofferid=${offerId}&partner=0&captcha=`,
              });
              const data = await resp.json();
              acceptBtn.textContent = data.tradeid ? '\u2705 Accepted!' : '\u274c Failed';
            } catch { acceptBtn.textContent = '\u274c Error'; }
          });
          btnRow.appendChild(acceptBtn);

          const declineBtn = el('button', 'sk-ext-link') as HTMLButtonElement;
          declineBtn.textContent = '\u274c Decline';
          declineBtn.style.cssText += 'cursor:pointer;color:#f87171;border-color:rgba(248,113,113,0.3);font-weight:700';
          declineBtn.addEventListener('click', async () => {
            if (!confirm(`Decline trade offer #${offerId}?`)) return;
            declineBtn.textContent = '\u23f3...';
            try {
              await fetch(`https://steamcommunity.com/tradeoffer/${offerId}/decline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `sessionid=${getCookie('sessionid')}`,
              });
              declineBtn.textContent = '\u274c Declined';
              htmlEl.style.opacity = '0.4';
            } catch { declineBtn.textContent = '\u274c Error'; }
          });
          btnRow.appendChild(declineBtn);

          // Quick Decline (no confirmation — like CSGO Trader)
          const quickDeclineBtn = el('button', 'sk-ext-link') as HTMLButtonElement;
          quickDeclineBtn.textContent = 'Quick Decline';
          quickDeclineBtn.style.cssText += 'cursor:pointer;color:#8b949e;border-color:rgba(139,148,158,0.3);font-size:10px';
          quickDeclineBtn.addEventListener('click', async () => {
            quickDeclineBtn.textContent = '\u23f3...';
            try {
              await fetch(`https://steamcommunity.com/tradeoffer/${offerId}/decline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `sessionid=${getCookie('sessionid')}`,
              });
              quickDeclineBtn.textContent = 'Declined';
              htmlEl.style.opacity = '0.4';
            } catch { quickDeclineBtn.textContent = '\u274c Error'; }
          });
          btnRow.appendChild(quickDeclineBtn);

          const footerEl = htmlEl.querySelector('.tradeoffer_footer');
          if (footerEl) footerEl.appendChild(btnRow);
        }
      }
    }

    offers.push({ element: htmlEl, yourValue, theirValue, profit, profitPct });
  });

  return offers;
}

function sortOffers(offers: OfferData[], mode: string) {
  if (mode === 'default') return;

  offers.sort((a, b) => {
    switch (mode) {
      case 'profit-desc': return b.profit - a.profit;
      case 'profit-asc': return a.profit - b.profit;
      case 'value-desc': return b.theirValue - a.theirValue;
      default: return 0;
    }
  });

  const parent = offers[0]?.element.parentElement;
  if (!parent) return;
  for (const offer of offers) {
    parent.appendChild(offer.element);
  }
}

init();
