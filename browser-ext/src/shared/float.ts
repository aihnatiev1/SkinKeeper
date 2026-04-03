/**
 * Float Value utilities — fetch, display, rank
 *
 * Float ranges:
 *   Factory New:     0.00 - 0.07
 *   Minimal Wear:    0.07 - 0.15
 *   Field-Tested:    0.15 - 0.38
 *   Well-Worn:       0.38 - 0.45
 *   Battle-Scarred:  0.45 - 1.00
 *
 * Many items have narrower float ranges (e.g. some only go 0.06-0.80).
 */

import { sendMessage } from './dom';

export interface FloatData {
  floatValue: number;
  paintSeed: number;
  paintIndex: number;
  wear: string;
  minFloat: number;
  maxFloat: number;
  rank?: number;       // Global float rank (#1 = lowest float)
  totalItems?: number; // Total items in float DB for ranking
}

const WEAR_RANGES: [string, number, number][] = [
  ['Factory New', 0.00, 0.07],
  ['Minimal Wear', 0.07, 0.15],
  ['Field-Tested', 0.15, 0.38],
  ['Well-Worn', 0.38, 0.45],
  ['Battle-Scarred', 0.45, 1.00],
];

export function getWearName(floatValue: number): string {
  for (const [name, min, max] of WEAR_RANGES) {
    if (floatValue >= min && floatValue < max) return name;
  }
  return 'Battle-Scarred';
}

const WEAR_SHORT: Record<string, string> = {
  'Factory New': 'FN', 'Minimal Wear': 'MW', 'Field-Tested': 'FT',
  'Well-Worn': 'WW', 'Battle-Scarred': 'BS',
};

/** Short wear label: "FN", "MW", etc. */
export function getWearShort(floatValue: number): string {
  return WEAR_SHORT[getWearName(floatValue)] || 'BS';
}

/** Extract wear from market_hash_name like "AK-47 | Redline (Field-Tested)" → "FT" */
export function getWearFromName(marketHashName: string): string | null {
  const m = marketHashName.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/);
  return m ? (WEAR_SHORT[m[1]] || null) : null;
}

/** Get float position as percentage (0-100) across the full 0-1 range */
export function getFloatPercent(floatValue: number): number {
  return Math.min(100, Math.max(0, floatValue * 100));
}

/** Get float position within the item's actual float range */
export function getFloatRangePercent(floatValue: number, minFloat: number, maxFloat: number): number {
  if (maxFloat <= minFloat) return 50;
  return ((floatValue - minFloat) / (maxFloat - minFloat)) * 100;
}

/** Determine float color — green for low, red for high */
export function getFloatColor(floatValue: number): string {
  if (floatValue < 0.01) return '#22c55e';  // exceptional
  if (floatValue < 0.07) return '#4ade80';  // FN
  if (floatValue < 0.15) return '#86efac';  // MW
  if (floatValue < 0.38) return '#fbbf24';  // FT
  if (floatValue < 0.45) return '#f97316';  // WW
  return '#ef4444';                           // BS
}

/** Format float for display: 0.0612345 → "0.0612" */
export function formatFloat(f: number): string {
  if (f < 0.01) return f.toFixed(6);
  if (f < 0.1) return f.toFixed(4);
  return f.toFixed(4);
}

/** Format float rank for display */
export function formatRank(rank: number, total?: number): string {
  if (total) return `#${rank.toLocaleString()} / ${total.toLocaleString()}`;
  return `#${rank.toLocaleString()}`;
}

/** Is this a notably low float? */
export function isLowFloat(floatValue: number, wear: string): boolean {
  switch (wear) {
    case 'Factory New': return floatValue < 0.005;
    case 'Minimal Wear': return floatValue < 0.08;
    case 'Field-Tested': return floatValue < 0.16;
    default: return false;
  }
}

/**
 * Fetch float data via SkinKeeper API (which proxies to inspect server)
 */
export async function fetchFloat(inspectLink: string): Promise<FloatData | null> {
  if (!inspectLink) return null;
  return sendMessage({ type: 'GET_FLOAT', inspectLink });
}

/**
 * Create a visual float bar HTML element
 */
export function createFloatBar(floatValue: number, minFloat = 0, maxFloat = 1): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'sk-float-bar';
  bar.title = `Float: ${formatFloat(floatValue)}`;

  // Marker position
  const percent = getFloatPercent(floatValue);
  const marker = document.createElement('div');
  marker.className = 'sk-float-marker';
  marker.style.left = `${percent}%`;

  bar.appendChild(marker);
  return bar;
}

/**
 * Create a compact float badge: "0.0123 FN #47"
 */
export function createFloatBadge(data: FloatData): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'sk-float-badge';
  badge.style.cssText = `
    display:inline-flex;align-items:center;gap:3px;
    padding:1px 5px;border-radius:4px;font-size:10px;
    font-family:monospace;font-weight:600;
    background:rgba(0,0,0,0.6);color:${getFloatColor(data.floatValue)};
  `;

  let text = formatFloat(data.floatValue);
  if (data.rank) {
    text += ` #${data.rank}`;
    if (data.rank <= 10) {
      badge.style.background = 'rgba(234,179,8,0.2)';
      badge.style.border = '1px solid rgba(234,179,8,0.3)';
    }
  }

  badge.textContent = text;
  badge.title = `Float: ${formatFloat(data.floatValue)}\n` +
    `Wear: ${data.wear}\n` +
    `Paint Seed: ${data.paintSeed}\n` +
    `Range: ${formatFloat(data.minFloat)} - ${formatFloat(data.maxFloat)}` +
    (data.rank ? `\nRank: ${formatRank(data.rank, data.totalItems)}` : '');

  return badge;
}
