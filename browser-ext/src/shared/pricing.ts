/**
 * Pricing utilities — Buff/Steam ratio, arbitrage, price velocity
 */

export interface MultiPrice {
  steam?: number;       // cents
  buff?: number;
  csfloat?: number;
  skinport?: number;
  steam_buyorder?: number;
}

export interface PriceAnalysis {
  buffSteamRatio: number | null;     // e.g. 0.78 = Buff is 78% of Steam
  cheapestSource: string | null;
  cheapestPrice: number;
  mostExpensiveSource: string | null;
  mostExpensivePrice: number;
  spread: number;                    // cents — difference between cheapest and most expensive
  spreadPercent: number;             // percent spread
  arbitrage: ArbitrageInfo | null;
}

export interface ArbitrageInfo {
  buySource: string;
  buyPrice: number;       // cents
  sellSource: string;
  sellPrice: number;       // cents
  feePercent: number;      // seller fee %
  profit: number;          // cents after fees
  profitPercent: number;
  viable: boolean;         // profit > 0
}

export interface PriceVelocity {
  change7d: number;       // cents
  change7dPct: number;
  change30d: number;
  change30dPct: number;
  trend: 'rising' | 'falling' | 'stable';
  trendEmoji: string;
}

// ─── Buff/Steam Ratio ─────────────────────────────────────────────────

export function analyzePrice(prices: MultiPrice): PriceAnalysis {
  const sources: [string, number][] = [];
  if (prices.steam) sources.push(['Steam', prices.steam]);
  if (prices.buff) sources.push(['Buff', prices.buff]);
  if (prices.csfloat) sources.push(['CSFloat', prices.csfloat]);
  if (prices.skinport) sources.push(['Skinport', prices.skinport]);

  if (sources.length === 0) {
    return {
      buffSteamRatio: null,
      cheapestSource: null, cheapestPrice: 0,
      mostExpensiveSource: null, mostExpensivePrice: 0,
      spread: 0, spreadPercent: 0,
      arbitrage: null,
    };
  }

  sources.sort((a, b) => a[1] - b[1]);

  const cheapest = sources[0];
  const mostExpensive = sources[sources.length - 1];
  const spread = mostExpensive[1] - cheapest[1];
  const spreadPct = mostExpensive[1] > 0 ? (spread / mostExpensive[1]) * 100 : 0;

  const buffSteamRatio = prices.buff && prices.steam
    ? prices.buff / prices.steam
    : null;

  // Arbitrage calculation
  const arbitrage = calculateArbitrage(prices);

  return {
    buffSteamRatio,
    cheapestSource: cheapest[0],
    cheapestPrice: cheapest[1],
    mostExpensiveSource: mostExpensive[0],
    mostExpensivePrice: mostExpensive[1],
    spread,
    spreadPercent: Math.round(spreadPct * 10) / 10,
    arbitrage,
  };
}

// ─── Arbitrage Scanner ────────────────────────────────────────────────

// Fee structures (approximate)
const FEES: Record<string, number> = {
  'Steam': 0.1304,    // 13.04% (Steam 5% + CS2 10% → net ~13%)
  'Buff': 0.025,      // 2.5% seller fee
  'CSFloat': 0.02,    // 2% seller fee
  'Skinport': 0.06,   // 6% seller fee
};

function calculateArbitrage(prices: MultiPrice): ArbitrageInfo | null {
  // Best arbitrage: buy cheapest, sell most expensive (after fees)
  const buyOptions: [string, number][] = [];
  const sellOptions: [string, number][] = [];

  if (prices.steam) {
    buyOptions.push(['Steam', prices.steam]);
    sellOptions.push(['Steam', prices.steam * (1 - FEES.Steam)]);
  }
  if (prices.buff) {
    buyOptions.push(['Buff', prices.buff]);
    sellOptions.push(['Buff', prices.buff * (1 - FEES.Buff)]);
  }
  if (prices.csfloat) {
    buyOptions.push(['CSFloat', prices.csfloat]);
    sellOptions.push(['CSFloat', prices.csfloat * (1 - FEES.CSFloat)]);
  }
  if (prices.skinport) {
    buyOptions.push(['Skinport', prices.skinport]);
    sellOptions.push(['Skinport', prices.skinport * (1 - FEES.Skinport)]);
  }

  if (buyOptions.length < 2) return null;

  // Find best pair: min buy, max sell (after fees) — different sources
  buyOptions.sort((a, b) => a[1] - b[1]);
  sellOptions.sort((a, b) => b[1] - a[1]);

  const buy = buyOptions[0];
  // Find best sell that isn't the same source as buy
  const sell = sellOptions.find(s => s[0] !== buy[0]);
  if (!sell) return null;

  const profit = Math.round(sell[1] - buy[1]);
  const profitPct = buy[1] > 0 ? (profit / buy[1]) * 100 : 0;
  const feeKey = sell[0] as keyof typeof FEES;

  return {
    buySource: buy[0],
    buyPrice: Math.round(buy[1]),
    sellSource: sell[0],
    sellPrice: Math.round(sell[1]),
    feePercent: (FEES[feeKey] || 0) * 100,
    profit,
    profitPercent: Math.round(profitPct * 10) / 10,
    viable: profit > 0,
  };
}

// ─── Price Velocity ───────────────────────────────────────────────────

export function calculateVelocity(
  currentPrice: number,
  price7dAgo?: number,
  price30dAgo?: number
): PriceVelocity {
  const change7d = price7dAgo ? currentPrice - price7dAgo : 0;
  const change7dPct = price7dAgo && price7dAgo > 0 ? (change7d / price7dAgo) * 100 : 0;
  const change30d = price30dAgo ? currentPrice - price30dAgo : 0;
  const change30dPct = price30dAgo && price30dAgo > 0 ? (change30d / price30dAgo) * 100 : 0;

  let trend: 'rising' | 'falling' | 'stable';
  let trendEmoji: string;
  if (change7dPct > 5) { trend = 'rising'; trendEmoji = '📈'; }
  else if (change7dPct < -5) { trend = 'falling'; trendEmoji = '📉'; }
  else { trend = 'stable'; trendEmoji = '➡️'; }

  return {
    change7d: Math.round(change7d),
    change7dPct: Math.round(change7dPct * 10) / 10,
    change30d: Math.round(change30d),
    change30dPct: Math.round(change30dPct * 10) / 10,
    trend,
    trendEmoji,
  };
}

// ─── Display Helpers ──────────────────────────────────────────────────

export function formatRatio(ratio: number | null): string {
  if (!ratio) return '';
  return `${Math.round(ratio * 100)}%`;
}

export function createRatioBadge(ratio: number): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'sk-ratio-badge';

  let color: string;
  if (ratio < 0.70) color = '#4ade80';      // great deal on Steam
  else if (ratio < 0.80) color = '#86efac';  // good
  else if (ratio < 0.90) color = '#fbbf24';  // fair
  else color = '#f87171';                     // bad deal — Buff almost same as Steam

  badge.style.cssText = `
    display:inline-flex;align-items:center;gap:2px;
    padding:1px 5px;border-radius:4px;font-size:9px;
    font-weight:700;background:${color}22;color:${color};
    border:1px solid ${color}33;
  `;
  badge.textContent = `B/S ${Math.round(ratio * 100)}%`;
  badge.title = `Buff/Steam ratio: ${Math.round(ratio * 100)}%\n` +
    (ratio < 0.75 ? 'Great value on Steam market' :
     ratio < 0.85 ? 'Fair pricing' :
     'Buff price is close to Steam — consider buying on Buff');

  return badge;
}

export function createArbitrageBadge(arb: ArbitrageInfo): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'sk-arb-badge';
  const color = arb.viable ? '#4ade80' : '#64748b';

  badge.style.cssText = `
    display:inline-flex;align-items:center;gap:2px;
    padding:2px 6px;border-radius:4px;font-size:9px;
    font-weight:700;background:${color}15;color:${color};
    border:1px solid ${color}33;cursor:help;
  `;
  badge.textContent = arb.viable
    ? `💰 +$${(arb.profit / 100).toFixed(2)} (${arb.profitPercent}%)`
    : 'No arb';
  badge.title = arb.viable
    ? `Arbitrage: Buy on ${arb.buySource} at $${(arb.buyPrice / 100).toFixed(2)}\n` +
      `Sell on ${arb.sellSource} at $${(arb.sellPrice / 100).toFixed(2)} (after ${arb.feePercent}% fee)\n` +
      `Profit: $${(arb.profit / 100).toFixed(2)} (${arb.profitPercent}%)`
    : 'No profitable arbitrage opportunity';

  return badge;
}

export function createVelocityBadge(vel: PriceVelocity): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'sk-velocity-badge';

  const color = vel.trend === 'rising' ? '#4ade80' : vel.trend === 'falling' ? '#f87171' : '#94a3b8';
  badge.style.cssText = `
    display:inline-flex;align-items:center;gap:2px;
    padding:1px 5px;border-radius:4px;font-size:9px;
    font-weight:600;color:${color};
  `;

  const sign = vel.change7dPct >= 0 ? '+' : '';
  badge.textContent = `${vel.trendEmoji} ${sign}${vel.change7dPct}% 7d`;
  badge.title = `7-day: ${sign}${vel.change7dPct}% ($${(vel.change7d / 100).toFixed(2)})\n` +
    `30-day: ${vel.change30dPct >= 0 ? '+' : ''}${vel.change30dPct}% ($${(vel.change30d / 100).toFixed(2)})`;

  return badge;
}
