/**
 * Trade Offers LIST page (/tradeoffers/) — show profit on each offer, sort by profit
 * Ported from CSGO Trader's tradeOffers.js approach
 */
import '../styles/skinkeeper.css';
import { waitForElement, el } from '../shared/dom';
import { loadBulkPrices, loadExchangeRates, getItemPrice, getWalletCurrency } from '../shared/steam';

let exchangeRate = 1;
let currencySign = '$';

const CURRENCY_MAP: Record<number, [string, string]> = {
  1: ['USD', '$'], 2: ['GBP', '£'], 3: ['EUR', '€'], 5: ['RUB', '₽'],
  18: ['UAH', '₴'], 17: ['TRY', '₺'], 23: ['CNY', '¥'], 7: ['BRL', 'R$'],
  20: ['CAD', 'CA$'], 21: ['AUD', 'A$'], 37: ['KZT', '₸'],
};

function fmtPrice(v: number): string {
  if (!v) return `${currencySign}0`;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 100) return `${sign}${currencySign}${Math.round(abs).toLocaleString()}`;
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

async function init() {
  await waitForElement('.tradeoffer');

  const [, rates] = await Promise.all([loadBulkPrices('steam'), loadExchangeRates()]);
  const wc = getWalletCurrency();
  const [cc, s] = CURRENCY_MAP[wc] || ['USD', '$'];
  currencySign = s;
  exchangeRate = rates?.[cc] || 1;

  const offers = processOffers();
  if (offers.length === 0) return;

  // Add sort controls
  const heading = document.querySelector('.profile_trade_offers_header_text, h1');
  if (heading) {
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

  console.log(`[SkinKeeper] Trade offers: ${offers.length} processed`);
}

function processOffers(): OfferData[] {
  const offers: OfferData[] = [];

  document.querySelectorAll('.tradeoffer').forEach((offerEl) => {
    const htmlEl = offerEl as HTMLElement;

    // Get items from both sides
    const primaryItems = htmlEl.querySelectorAll('.tradeoffer_items.primary .trade_item, .tradeoffer_item_list:first-child .trade_item');
    const secondaryItems = htmlEl.querySelectorAll('.tradeoffer_items.secondary .trade_item, .tradeoffer_item_list:last-child .trade_item');

    let yourValue = 0;
    let theirValue = 0;

    primaryItems.forEach((item) => {
      const name = item.querySelector('.trade_item_name')?.textContent?.trim()
        || (item.querySelector('img') as HTMLImageElement)?.alt || '';
      if (name) yourValue += getItemPrice(name, exchangeRate);
    });

    secondaryItems.forEach((item) => {
      const name = item.querySelector('.trade_item_name')?.textContent?.trim()
        || (item.querySelector('img') as HTMLImageElement)?.alt || '';
      if (name) theirValue += getItemPrice(name, exchangeRate);
    });

    const profit = theirValue - yourValue;
    const profitPct = yourValue > 0 ? (profit / yourValue) * 100 : 0;

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
        <span style="color:var(--sk-text-dim)">→</span>
        <span>Receive: ${fmtPrice(theirValue)}</span>
        <span style="font-weight:800">${sign}${fmtPrice(profit)} (${sign}${profitPct.toFixed(1)}%)</span>
      `;

      // Insert before the trade offer buttons
      const footer = htmlEl.querySelector('.tradeoffer_footer');
      if (footer) footer.insertBefore(profitLabel, footer.firstChild);
      else htmlEl.appendChild(profitLabel);
    }

    // Quick Accept / Decline buttons (for incoming offers)
    const isIncoming = htmlEl.querySelector('.tradeoffer_items_ctn .tradeoffer_items.primary');
    const offerIdMatch = htmlEl.id?.match(/tradeofferid_(\d+)/) || htmlEl.querySelector('[id*="tradeofferid_"]')?.id?.match(/tradeofferid_(\d+)/);
    if (isIncoming && offerIdMatch) {
      const offerId = offerIdMatch[1];
      const existingBtns = htmlEl.querySelector('.sk-offer-btns');
      if (!existingBtns) {
        const btnRow = el('div', 'sk-offer-btns');
        btnRow.style.cssText = 'display:flex;gap:6px;margin:4px 0';

        const acceptBtn = el('button', 'sk-ext-link') as HTMLButtonElement;
        acceptBtn.textContent = '✅ Accept';
        acceptBtn.style.cssText += 'cursor:pointer;color:#4ade80;border-color:rgba(74,222,128,0.3);font-weight:700';
        acceptBtn.addEventListener('click', async () => {
          if (!confirm(`Accept trade offer #${offerId}?`)) return;
          acceptBtn.textContent = '⏳...';
          try {
            const resp = await fetch(`https://steamcommunity.com/tradeoffer/${offerId}/accept`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `sessionid=${getCookie('sessionid')}&serverid=1&tradeofferid=${offerId}&partner=0&captcha=`,
            });
            const data = await resp.json();
            acceptBtn.textContent = data.tradeid ? '✅ Accepted!' : '❌ Failed';
          } catch { acceptBtn.textContent = '❌ Error'; }
        });
        btnRow.appendChild(acceptBtn);

        const declineBtn = el('button', 'sk-ext-link') as HTMLButtonElement;
        declineBtn.textContent = '❌ Decline';
        declineBtn.style.cssText += 'cursor:pointer;color:#f87171;border-color:rgba(248,113,113,0.3);font-weight:700';
        declineBtn.addEventListener('click', async () => {
          if (!confirm(`Decline trade offer #${offerId}?`)) return;
          declineBtn.textContent = '⏳...';
          try {
            await fetch(`https://steamcommunity.com/tradeoffer/${offerId}/decline`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `sessionid=${getCookie('sessionid')}`,
            });
            declineBtn.textContent = '❌ Declined';
            htmlEl.style.opacity = '0.4';
          } catch { declineBtn.textContent = '❌ Error'; }
        });
        btnRow.appendChild(declineBtn);

        const footerEl = htmlEl.querySelector('.tradeoffer_footer');
        if (footerEl) footerEl.appendChild(btnRow);
      }
    }

    offers.push({ element: htmlEl, yourValue, theirValue, profit, profitPct });
  });

  return offers;
}

function sortOffers(offers: OfferData[], mode: string) {
  if (mode === 'default') return; // Steam's default order

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
