/**
 * SkinKeeper Mini Card — floating widget on all Steam pages.
 * Shows portfolio stats, quick links, and ecosystem CTA.
 */
import { sendMessage } from './dom';
import { loadExchangeRates, getWalletCurrency, getWalletCurrencyCode } from './steam';

let mcCurrencySign = '$';
let mcExchangeRate = 1;
let mcNoDecimals = false;

const MC_CURRENCY_MAP: Record<number, [string, string]> = {
  1: ['USD', '$'], 2: ['GBP', '\u00a3'], 3: ['EUR', '\u20ac'], 5: ['RUB', '\u20bd'],
  18: ['UAH', '\u20b4'], 17: ['TRY', '\u20ba'], 23: ['CNY', '\u00a5'], 7: ['BRL', 'R$'],
  20: ['CAD', 'CA$'], 21: ['AUD', 'A$'], 37: ['KZT', '\u20b8'],
};
const MC_NO_DECIMALS = new Set(['RUB', 'UAH', 'TRY', 'KZT']);

function mcFmt(usd: number): string {
  const val = usd * mcExchangeRate;
  const abs = Math.abs(val);
  if (mcNoDecimals || abs >= 100) return `${mcCurrencySign}${Math.round(abs).toLocaleString()}`;
  return `${mcCurrencySign}${abs.toFixed(2)}`;
}

function mcFmtSigned(usd: number): string {
  const sign = usd >= 0 ? '+' : '-';
  return `${sign}${mcFmt(Math.abs(usd))}`;
}

export interface InventoryInfo {
  itemCount: number;
  uniqueCount: number;
  totalValue: string; // pre-formatted
}

let pendingInventoryInfo: InventoryInfo | null = null;

/**
 * Update the mini card with current inventory data (called from inventory.ts after items load).
 */
export function updateMiniCardInventory(info: InventoryInfo) {
  pendingInventoryInfo = info;
  const el = document.getElementById('sk-mini-inv');
  if (el) {
    el.innerHTML = buildInventoryBlock(info);
    el.style.display = '';
  }
}

function buildInventoryBlock(info: InventoryInfo): string {
  return `
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
      <span style="color:#8b949e">Items</span>
      <span style="font-weight:700">${info.itemCount} <span style="color:#8b949e;font-weight:400;font-size:10px">(${info.uniqueCount} unique)</span></span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
      <span style="color:#8b949e">Value</span>
      <span style="font-weight:700;color:#4ade80">${info.totalValue}</span>
    </div>
  `;
}

export function injectMiniCard() {
  if (document.getElementById('sk-mini-card')) return;

  const card = document.createElement('div');
  card.id = 'sk-mini-card';
  card.style.cssText = `
    position:fixed;top:10px;right:10px;z-index:9999;
    background:rgba(13,17,23,0.95);backdrop-filter:blur(12px);
    border:1px solid rgba(99,102,241,0.25);border-radius:10px;
    padding:12px 14px;width:220px;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;
    color:#e2e8f0;box-shadow:0 4px 20px rgba(0,0,0,0.5);
    pointer-events:auto;transition:opacity 0.2s;
  `;

  // Header
  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:6px">
        <img src="${chrome.runtime.getURL('icons/icon16.png')}" style="width:16px;height:16px" alt="">
        <span style="font-size:12px;font-weight:700;color:#6366f1">SkinKeeper</span>
      </div>
      <span id="sk-mini-toggle" style="cursor:pointer;font-size:14px;color:#8b949e;line-height:1" title="Collapse">&#x2212;</span>
    </div>
    <div id="sk-mini-body">
      <div id="sk-mini-inv" style="display:none;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06)"></div>
      <div id="sk-mini-stats" style="font-size:12px;color:#8b949e">Loading...</div>
    </div>
  `;

  document.body.appendChild(card);

  // Show inventory data if it was set before card was injected
  if (pendingInventoryInfo) {
    const invEl = card.querySelector('#sk-mini-inv') as HTMLElement;
    if (invEl) {
      invEl.innerHTML = buildInventoryBlock(pendingInventoryInfo);
      invEl.style.display = '';
    }
  }

  // Toggle collapse
  const toggle = card.querySelector('#sk-mini-toggle') as HTMLElement;
  const body = card.querySelector('#sk-mini-body') as HTMLElement;
  toggle.addEventListener('click', () => {
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    toggle.innerHTML = collapsed ? '&#x2212;' : '&#x2b;';
  });

  // Load user data
  loadMiniCardData();
}

async function loadMiniCardData() {
  const statsEl = document.getElementById('sk-mini-stats');
  if (!statsEl) return;

  // Read saved currency from storage (set by inventory.ts when it detects Steam wallet currency)
  try {
    const stored = await chrome.storage.local.get(['sk_user_currency', 'sk_exchange_rate']);
    let cc = stored.sk_user_currency || 'USD';
    mcExchangeRate = stored.sk_exchange_rate || 1;

    // If no saved currency, try detecting from page
    if (!stored.sk_user_currency) {
      try {
        const rates = await loadExchangeRates();
        const wc = getWalletCurrency();
        const steamCC = getWalletCurrencyCode();
        if (steamCC && rates?.[steamCC]) {
          cc = steamCC;
          mcExchangeRate = rates[steamCC] || 1;
          chrome.storage.local.set({ sk_user_currency: cc, sk_exchange_rate: mcExchangeRate });
        } else if (wc > 1) {
          const entry = MC_CURRENCY_MAP[wc];
          if (entry) cc = entry[0];
          mcExchangeRate = rates?.[cc] || 1;
          chrome.storage.local.set({ sk_user_currency: cc, sk_exchange_rate: mcExchangeRate });
        }
      } catch { /* use defaults */ }
    }

    // Set symbol from code
    for (const key of Object.keys(MC_CURRENCY_MAP)) {
      const [c, s] = MC_CURRENCY_MAP[Number(key)];
      if (c === cc) { mcCurrencySign = s; break; }
    }
    // Also check _currencySymbols-style lookup
    const symbolMap: Record<string, string> = {
      'USD': '$', 'EUR': '\u20ac', 'GBP': '\u00a3', 'UAH': '\u20b4',
      'RUB': '\u20bd', 'TRY': '\u20ba', 'CNY': '\u00a5', 'BRL': 'R$',
      'CAD': 'C$', 'AUD': 'A$', 'KZT': '\u20b8', 'PLN': 'z\u0142',
    };
    if (symbolMap[cc]) mcCurrencySign = symbolMap[cc];
    mcNoDecimals = MC_NO_DECIMALS.has(cc);
  } catch { /* use defaults */ }

  try {
    const user = await sendMessage({ type: 'GET_USER' });

    if (user) {
      // Logged in — show full stats
      const portfolio = await sendMessage({ type: 'GET_PORTFOLIO' });

      let html = '';

      // User row
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06)">
        ${user.avatar_url ? `<img src="${user.avatar_url}" style="width:28px;height:28px;border-radius:50%" />` : ''}
        <div>
          <div style="font-size:12px;font-weight:700">${user.display_name} ${user.is_premium ? '<span style="color:#fbbf24;font-size:9px">&#9733; PRO</span>' : ''}</div>
        </div>
      </div>`;

      if (portfolio) {
        const totalVal = portfolio.total_value || 0;
        const ch24 = portfolio.change_24h || 0;
        const ch24pct = portfolio.change_24h_pct || 0;
        const ch7d = portfolio.change_7d || 0;
        const items = portfolio.item_count || 0;

        html += `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
            <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:6px 8px">
              <div style="font-size:9px;color:#8b949e;text-transform:uppercase">Value</div>
              <div style="font-size:14px;font-weight:800;color:#fff">${mcFmt(totalVal)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:6px 8px">
              <div style="font-size:9px;color:#8b949e;text-transform:uppercase">24h</div>
              <div style="font-size:14px;font-weight:800;color:${ch24 >= 0 ? '#4ade80' : '#f87171'}">${mcFmtSigned(ch24)}</div>
              <div style="font-size:9px;color:${ch24 >= 0 ? '#4ade80' : '#f87171'}">${ch24 >= 0 ? '+' : ''}${ch24pct.toFixed(1)}%</div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:6px 8px">
              <div style="font-size:9px;color:#8b949e;text-transform:uppercase">Items</div>
              <div style="font-size:14px;font-weight:800;color:#fff">${items}</div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:6px 8px">
              <div style="font-size:9px;color:#8b949e;text-transform:uppercase">7d</div>
              <div style="font-size:14px;font-weight:800;color:${ch7d >= 0 ? '#4ade80' : '#f87171'}">${mcFmtSigned(ch7d)}</div>
            </div>
          </div>
        `;
      }

      // Quick links
      html += `
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
          <a href="https://app.skinkeeper.store/portfolio" target="_blank" style="flex:1;text-align:center;padding:4px;border-radius:4px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);color:#818cf8;font-size:10px;text-decoration:none;font-weight:600">Portfolio</a>
          <a href="https://app.skinkeeper.store/inventory" target="_blank" style="flex:1;text-align:center;padding:4px;border-radius:4px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);color:#818cf8;font-size:10px;text-decoration:none;font-weight:600">Inventory</a>
          <a href="https://app.skinkeeper.store/alerts" target="_blank" style="flex:1;text-align:center;padding:4px;border-radius:4px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);color:#818cf8;font-size:10px;text-decoration:none;font-weight:600">Alerts</a>
        </div>
      `;

      html += ecosystemCta();
      statsEl.innerHTML = html;
    } else {
      // Not logged in
      statsEl.innerHTML = `
        <div style="text-align:center;padding:6px 0">
          <div style="font-size:11px;color:#8b949e;margin-bottom:8px">Track your CS2 portfolio,<br>set price alerts, analyze P/L</div>
          <a href="https://app.skinkeeper.store?source=extension" target="_blank"
             style="display:block;padding:8px;border-radius:6px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;font-size:12px;font-weight:700;text-decoration:none;text-align:center;margin-bottom:8px">
            Get Started Free
          </a>
        </div>
        ${ecosystemCta()}
      `;
    }
  } catch {
    statsEl.innerHTML = '<div style="color:#8b949e;font-size:11px">Unable to load data</div>' + ecosystemCta();
  }
}

function ecosystemCta(): string {
  return `
    <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;margin-top:4px">
      <div style="font-size:10px;color:#8b949e;line-height:1.4;margin-bottom:6px">
        <span style="color:#6366f1;font-weight:700">SkinKeeper</span> \u2014 your all-in-one CS2 toolkit.<br>
        Web app \u00b7 Mobile \u00b7 Desktop \u00b7 Extension
      </div>
      <a href="https://skinkeeper.store?source=ext_widget" target="_blank"
         style="display:block;text-align:center;padding:5px;border-radius:5px;border:1px solid rgba(99,102,241,0.3);color:#6366f1;font-size:10px;font-weight:700;text-decoration:none;transition:background 0.15s"
         onmouseenter="this.style.background='rgba(99,102,241,0.1)'" onmouseleave="this.style.background=''">
        Explore the ecosystem \u2192
      </a>
    </div>
  `;
}
