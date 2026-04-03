import { WEAR_RANGES, WEAR_SHORT } from '../constants';

export function getWearName(floatValue: number): string {
  for (const [name, , min, max] of WEAR_RANGES) {
    if (floatValue >= min && floatValue < max) return name;
  }
  return 'Battle-Scarred';
}

export function getWearShort(floatValue: number): string {
  return WEAR_SHORT[getWearName(floatValue)] || 'BS';
}

export function getWearFromName(marketHashName: string): string | null {
  const m = marketHashName.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/);
  return m ? (WEAR_SHORT[m[1]] || null) : null;
}

export function getFloatPercent(floatValue: number): number {
  return Math.min(100, Math.max(0, floatValue * 100));
}

export function getFloatColor(floatValue: number): string {
  if (floatValue < 0.01) return '#22c55e';
  if (floatValue < 0.07) return '#4ade80';
  if (floatValue < 0.15) return '#86efac';
  if (floatValue < 0.38) return '#fbbf24';
  if (floatValue < 0.45) return '#f97316';
  return '#ef4444';
}

export function formatFloat(f: number): string {
  if (f < 0.01) return f.toFixed(6);
  return f.toFixed(4);
}

export function isLowFloat(floatValue: number, wear: string): boolean {
  switch (wear) {
    case 'Factory New': return floatValue < 0.005;
    case 'Minimal Wear': return floatValue < 0.08;
    case 'Field-Tested': return floatValue < 0.16;
    default: return false;
  }
}
