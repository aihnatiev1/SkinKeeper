import type { SellValidation } from '../types';

/**
 * Validate sell price against reference prices.
 * @param minUnit - Minimum currency step (1 for USD, 100 for UAH/RUB). Defaults to 1.
 */
export function validateSellPrice(priceCents: number, buffPrice: number, steamPrice: number, itemName: string, minUnit = 1): SellValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (priceCents <= 0) errors.push('Price must be greater than 0');
  if (priceCents < minUnit * 3) errors.push(`Price is below the minimum listing price`);
  if (buffPrice > 0 && priceCents < buffPrice * 0.5) {
    errors.push(`Price is less than 50% of Buff price — this may be a mistake`);
  }
  if (steamPrice > 0 && priceCents < steamPrice * 0.8) {
    warnings.push(`Price is 20%+ below current Steam listing`);
  }

  return { valid: errors.length === 0, warnings, errors };
}

/**
 * Suggest a sell price based on strategy.
 * @param buffPrice - Buff price in smallest currency unit (cents)
 * @param steamPrice - Steam price in smallest currency unit (cents)
 * @param strategy - Pricing strategy
 * @param minUnit - Minimum undercut step (1 for USD/EUR, 100 for UAH/RUB/KZT). Defaults to 1.
 */
export function suggestSellPrice(buffPrice: number, steamPrice: number, strategy: string, minUnit = 1): number {
  switch (strategy) {
    case 'match_buff': return buffPrice;
    case 'buff_plus_5': return Math.round(buffPrice * 1.05);
    case 'undercut_steam': return steamPrice > minUnit * 3 ? steamPrice - minUnit : steamPrice;
    case 'steam_minus_1': {
      // "-$1" means minus one full unit (100 cents for USD, 100*100=10000 kopecks for UAH)
      const fullUnit = minUnit * 100;
      return steamPrice > fullUnit ? steamPrice - fullUnit : Math.max(minUnit * 3, steamPrice - minUnit);
    }
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
