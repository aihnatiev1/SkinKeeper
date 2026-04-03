import type { SellValidation } from '../types';

export function validateSellPrice(priceCents: number, buffPrice: number, steamPrice: number, itemName: string): SellValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (priceCents <= 0) errors.push('Price must be greater than 0');
  if (priceCents < 3) errors.push('Minimum Steam listing price is $0.03');
  if (buffPrice > 0 && priceCents < buffPrice * 0.5) {
    errors.push(`Price ($${(priceCents / 100).toFixed(2)}) is less than 50% of Buff price ($${(buffPrice / 100).toFixed(2)})`);
  }
  if (steamPrice > 0 && priceCents < steamPrice * 0.8) {
    warnings.push(`Price is 20%+ below current Steam listing ($${(steamPrice / 100).toFixed(2)})`);
  }

  return { valid: errors.length === 0, warnings, errors };
}

export function suggestSellPrice(buffPrice: number, steamPrice: number, strategy: string): number {
  switch (strategy) {
    case 'match_buff': return buffPrice;
    case 'buff_plus_5': return Math.round(buffPrice * 1.05);
    case 'undercut_steam': return steamPrice > 3 ? steamPrice - 1 : steamPrice;
    case 'steam_minus_1': return steamPrice > 100 ? steamPrice - 100 : Math.max(3, steamPrice - 1);
    default: return buffPrice || steamPrice;
  }
}

export function formatTradeLock(tradeBanUntil: string | null): string | null {
  if (!tradeBanUntil) return null;
  const diff = new Date(tradeBanUntil).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return '<1h';
}
