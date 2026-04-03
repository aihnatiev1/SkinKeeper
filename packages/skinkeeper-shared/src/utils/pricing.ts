import { MARKETPLACE_FEES } from '../constants';
import type { MultiPrice, PriceAnalysis, ArbitrageInfo, PriceVelocity } from '../types';

export function analyzePrice(prices: MultiPrice): PriceAnalysis {
  const sources: [string, number][] = [];
  if (prices.steam) sources.push(['steam', prices.steam]);
  if (prices.buff) sources.push(['buff', prices.buff]);
  if (prices.csfloat) sources.push(['csfloat', prices.csfloat]);
  if (prices.skinport) sources.push(['skinport', prices.skinport]);
  if (prices.dmarket) sources.push(['dmarket', prices.dmarket]);
  if (prices.bitskins) sources.push(['bitskins', prices.bitskins]);

  sources.sort((a, b) => a[1] - b[1]);
  const cheapest = sources[0] || null;
  const highest = sources[sources.length - 1] || null;

  const buffSteamRatio = (prices.buff && prices.steam && prices.steam > 0)
    ? Math.round((prices.buff / prices.steam) * 100) : null;

  const spread = (cheapest && highest) ? highest[1] - cheapest[1] : 0;

  let arbitrage: ArbitrageInfo | null = null;
  if (sources.length >= 2) {
    for (const [buySource, buyPrice] of sources) {
      for (const [sellSource, sellPrice] of [...sources].reverse()) {
        if (buySource === sellSource) continue;
        const buyFee = MARKETPLACE_FEES[buySource] || 0;
        const sellFee = MARKETPLACE_FEES[sellSource] || 0;
        const netBuy = buyPrice;
        const netSell = sellPrice * (1 - sellFee);
        const profit = netSell - netBuy;
        const profitPct = netBuy > 0 ? (profit / netBuy) * 100 : 0;
        if (profit > 0 && profitPct > 2) {
          arbitrage = { viable: true, buySource, sellSource, buyPrice: netBuy, sellPrice, profit, profitPct };
          break;
        }
      }
      if (arbitrage) break;
    }
  }

  return {
    buffSteamRatio,
    cheapestSource: cheapest?.[0] || null,
    cheapestPrice: cheapest?.[1] || 0,
    spread,
    arbitrage,
  };
}

export function calculateVelocity(currentPrice: number, price7dAgo?: number, price30dAgo?: number): PriceVelocity {
  const change7d = price7dAgo ? currentPrice - price7dAgo : 0;
  const change7dPct = price7dAgo && price7dAgo > 0 ? ((currentPrice - price7dAgo) / price7dAgo) * 100 : 0;
  const change30d = price30dAgo ? currentPrice - price30dAgo : 0;
  const change30dPct = price30dAgo && price30dAgo > 0 ? ((currentPrice - price30dAgo) / price30dAgo) * 100 : 0;

  let trend: 'rising' | 'falling' | 'stable' = 'stable';
  if (Math.abs(change7dPct) > 3) trend = change7dPct > 0 ? 'rising' : 'falling';

  return { change7d, change7dPct, change30d, change30dPct, trend };
}

/** Calculate what seller receives after Steam fees */
export function calcSellerReceives(buyerPriceCents: number): number {
  const steamFee = Math.max(1, Math.floor(buyerPriceCents * 0.05));
  const gameFee = Math.max(1, Math.floor(buyerPriceCents * 0.10));
  return buyerPriceCents - steamFee - gameFee;
}

/** Calculate what buyer pays for seller to receive target amount */
export function calcBuyerPrice(sellerReceivesCents: number): number {
  let buyerPrice = Math.round(sellerReceivesCents / 0.85);
  for (let i = 0; i < 5; i++) {
    const steamFee = Math.max(1, Math.floor(buyerPrice * 0.05));
    const gameFee = Math.max(1, Math.floor(buyerPrice * 0.10));
    if (buyerPrice - steamFee - gameFee >= sellerReceivesCents) return buyerPrice;
    buyerPrice++;
  }
  return buyerPrice;
}
