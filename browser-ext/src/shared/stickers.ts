/**
 * Sticker Premium (SP%) Calculator
 *
 * SP% = ((item_price - base_skin_price) / total_sticker_catalog_value) * 100
 *
 * Position multipliers (best to worst):
 *   Position 0 (best): 1.5x — most visible, above mag/grip
 *   Position 1: 1.2x
 *   Position 2: 1.0x (base)
 *   Position 3 (worst): 0.8x
 *
 * Wear multipliers:
 *   100% (perfect): 1.0x
 *   >80%: 0.85x
 *   >50%: 0.5x
 *   <50%: 0.15x (heavily scraped — near worthless)
 *
 * Tournament vs non-tournament:
 *   Non-tournament (holo/foil/gold): generally higher SP%
 *   Tournament stickers: standard multipliers
 *   Katowice 2014/2015 holos: special tier — can be 5-50% SP on expensive items
 */

export interface StickerInfo {
  name: string;
  slot: number;           // 0-3, position on weapon
  wear?: number;          // 0.0 - 1.0, sticker condition (1.0 = perfect)
  catalogPrice?: number;  // cents — sticker catalog/market value
  iconUrl?: string;
}

export interface StickerAnalysis {
  stickers: StickerInfo[];
  totalCatalogValue: number;     // cents — sum of all sticker catalog prices
  adjustedStickerValue: number;  // cents — after position + wear multipliers
  baseSkinPrice: number;         // cents — skin price without stickers
  itemPrice: number;             // cents — actual item listing price
  stickerPremium: number;        // cents — itemPrice - baseSkinPrice
  spPercent: number;             // SP% — (premium / totalCatalogValue) * 100
  isOverpay: boolean;            // true if itemPrice > baseSkinPrice (stickers add value)
}

const POSITION_MULTIPLIERS = [1.5, 1.2, 1.0, 0.8];

function getWearMultiplier(wear: number): number {
  if (wear >= 1.0) return 1.0;     // perfect
  if (wear >= 0.8) return 0.85;
  if (wear >= 0.5) return 0.5;
  if (wear >= 0.2) return 0.15;
  return 0.05;                      // near scraped off
}

export function calculateStickerSP(
  stickers: StickerInfo[],
  baseSkinPrice: number,
  itemPrice: number
): StickerAnalysis {
  let totalCatalog = 0;
  let adjustedValue = 0;

  for (const sticker of stickers) {
    const catalog = sticker.catalogPrice || 0;
    totalCatalog += catalog;

    const posMulti = POSITION_MULTIPLIERS[sticker.slot] ?? 1.0;
    const wearMulti = getWearMultiplier(sticker.wear ?? 1.0);
    adjustedValue += catalog * posMulti * wearMulti;
  }

  const premium = Math.max(0, itemPrice - baseSkinPrice);
  const spPercent = totalCatalog > 0 ? (premium / totalCatalog) * 100 : 0;

  return {
    stickers,
    totalCatalogValue: Math.round(totalCatalog),
    adjustedStickerValue: Math.round(adjustedValue),
    baseSkinPrice,
    itemPrice,
    stickerPremium: Math.round(premium),
    spPercent: Math.round(spPercent * 10) / 10,
    isOverpay: premium > 0,
  };
}

/**
 * Format SP% for display with color coding
 */
export function formatSP(sp: StickerAnalysis): { text: string; color: string; tooltip: string } {
  if (sp.totalCatalogValue === 0) {
    return { text: '', color: '', tooltip: '' };
  }

  let color: string;
  if (sp.spPercent >= 50) color = '#ef4444';       // very high SP — likely overpriced
  else if (sp.spPercent >= 20) color = '#f97316';   // moderate SP
  else if (sp.spPercent >= 5) color = '#4ade80';    // reasonable SP — good deal
  else color = '#94a3b8';                            // negligible SP

  const stickerList = sp.stickers
    .map(s => `${s.name}: $${((s.catalogPrice || 0) / 100).toFixed(2)}`)
    .join('\n');

  return {
    text: `SP: ${sp.spPercent}%`,
    color,
    tooltip: `Sticker Premium: ${sp.spPercent}%\n` +
             `Sticker catalog: $${(sp.totalCatalogValue / 100).toFixed(2)}\n` +
             `Adjusted value: $${(sp.adjustedStickerValue / 100).toFixed(2)}\n` +
             `Premium paid: $${(sp.stickerPremium / 100).toFixed(2)}\n\n` +
             stickerList,
  };
}

// ─── Charm Detection ──────────────────────────────────────────────────

export interface CharmInfo {
  name: string;
  patternId?: number;
  templateId?: number;
  iconUrl?: string;
}

/** Well-known rare charm patterns */
const RARE_CHARM_PATTERNS: Record<number, string> = {
  // These are placeholder IDs — real data would come from cs2charm.com or similar DB
  1: 'Gold',
  2: 'Holo',
  3: 'Glitter',
};

export function analyzeCharm(charm: CharmInfo): { isRare: boolean; label: string } {
  if (!charm.patternId) return { isRare: false, label: charm.name };
  const rareLabel = RARE_CHARM_PATTERNS[charm.patternId];
  if (rareLabel) {
    return { isRare: true, label: `${charm.name} (${rareLabel})` };
  }
  return { isRare: false, label: charm.name };
}
