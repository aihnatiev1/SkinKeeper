import type { StickerInfo, StickerAnalysis } from '../types';

const POSITION_MULTIPLIERS: Record<number, number> = { 0: 1.5, 1: 1.2, 2: 1.0, 3: 0.8 };

function wearMultiplier(wear?: number): number {
  if (wear == null || wear >= 1) return 1.0;
  const condition = Math.abs(1 - wear) * 100;
  if (condition >= 80) return 0.85;
  if (condition >= 50) return 0.5;
  if (condition >= 20) return 0.15;
  return 0.05;
}

export function calculateStickerSP(stickers: StickerInfo[], baseSkinPriceCents: number, itemPriceCents: number): StickerAnalysis {
  let totalCatalog = 0;
  let adjustedValue = 0;

  for (const s of stickers) {
    const price = s.catalogPrice || 0;
    totalCatalog += price;
    const posMulti = POSITION_MULTIPLIERS[s.slot] ?? 1.0;
    const wearMulti = wearMultiplier(s.wear);
    adjustedValue += price * posMulti * wearMulti;
  }

  const premium = itemPriceCents - baseSkinPriceCents;
  const spPercent = totalCatalog > 0 ? Math.round((premium / totalCatalog) * 1000) / 10 : 0;

  return { totalCatalogValue: totalCatalog, adjustedValue, stickerPremium: Math.max(0, premium), spPercent };
}

export function formatSP(spPercent: number): { text: string; color: string } {
  const color = spPercent >= 50 ? '#ef4444' : spPercent >= 20 ? '#f97316' : spPercent >= 5 ? '#4ade80' : '#94a3b8';
  return { text: `SP ${spPercent}%`, color };
}
