/**
 * Bulk sell utilities — price validation, queue management
 */

import { sendMessage } from './dom';

export interface SellItem {
  assetId: string;
  name: string;
  suggestedPrice: number;   // cents — Buff reference
  steamPrice: number;        // cents — current Steam listing
  iconUrl: string;
}

export interface SellValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validate sell price against reference prices.
 * @param minUnit - Minimum currency step (1 for USD, 100 for UAH/RUB). Defaults to 1.
 */
export function validateSellPrice(
  priceCents: number,
  buffPrice: number,
  steamPrice: number,
  itemName: string,
  minUnit = 1
): SellValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (priceCents <= 0) {
    errors.push('Price must be greater than 0');
  }

  if (priceCents < minUnit * 3) {
    errors.push('Price is below the minimum listing price');
  }

  // Warn if significantly below Buff price (possible mistake)
  if (buffPrice > 0 && priceCents < buffPrice * 0.5) {
    errors.push(`Price is less than 50% of Buff price. This may be a mistake.`);
  }

  // Warn if below Steam lowest listing
  if (steamPrice > 0 && priceCents < steamPrice * 0.8) {
    warnings.push(`Price is 20%+ below current Steam listing`);
  }

  // Warn if price seems like wrong currency (e.g. cents instead of dollars)
  if (buffPrice > minUnit * 100 && priceCents < minUnit * 10) {
    errors.push(`Price looks suspiciously low for "${itemName}". Did you enter cents instead of the full amount?`);
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Calculate suggested sell price based on reference.
 * @param minUnit - Minimum undercut step (1 for USD/EUR, 100 for UAH/RUB/KZT). Defaults to 1.
 */
export function suggestSellPrice(
  buffPrice: number,
  steamPrice: number,
  strategy: 'match_buff' | 'undercut_steam' | 'buff_plus_5' | 'steam_minus_1',
  minUnit = 1
): number {
  switch (strategy) {
    case 'match_buff':
      return buffPrice;
    case 'buff_plus_5':
      return Math.round(buffPrice * 1.05);
    case 'undercut_steam':
      return steamPrice > minUnit * 3 ? steamPrice - minUnit : steamPrice;
    case 'steam_minus_1': {
      const fullUnit = minUnit * 100;
      return steamPrice > fullUnit ? steamPrice - fullUnit : Math.max(minUnit * 3, steamPrice - minUnit);
    }
    default:
      return buffPrice || steamPrice;
  }
}

/**
 * Format trade lock remaining time
 */
export function formatTradeLock(tradeBanUntil: string | null): string | null {
  if (!tradeBanUntil) return null;

  const banDate = new Date(tradeBanUntil);
  const now = new Date();
  const diff = banDate.getTime() - now.getTime();

  if (diff <= 0) return null; // already tradeable

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return '<1h';
}

/**
 * Create trade lock overlay element
 */
export function createTradeLockBadge(remaining: string): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'sk-tradelock-badge';
  badge.style.cssText = `
    position:absolute;top:2px;left:2px;
    padding:1px 4px;border-radius:3px;font-size:8px;
    font-weight:700;background:rgba(239,68,68,0.8);color:#fff;
    z-index:10;pointer-events:none;
  `;
  badge.textContent = `🔒 ${remaining}`;
  badge.title = `Trade locked for ${remaining}`;
  return badge;
}
