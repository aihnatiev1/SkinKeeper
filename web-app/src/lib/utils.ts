import { useCallback } from 'react';
import { clsx, type ClassValue } from 'clsx';
// Re-export shared utils so existing imports keep working
export {
  getWearName, getWearShort as getWearShortFromFloat, getFloatColor, formatFloat, isLowFloat,
  getDopplerPhase, isDoppler, isFade, isMarbleFade, calculateFadePercent, analyzeMarbleFade, analyzeBlueGem,
  analyzePrice, calculateVelocity, calcSellerReceives, calcBuyerPrice,
  calculateStickerSP, formatSP,
  validateSellPrice, suggestSellPrice, formatTradeLock,
  formatPLPercent,
} from '@skinkeeper/shared';
export type { MultiPrice, PriceAnalysis, ArbitrageInfo, PhaseInfo, FadeInfo, BlueGemInfo } from '@skinkeeper/shared';
import { WEAR_SHORT } from '@skinkeeper/shared';
import { CURRENCY_SYMBOLS } from './constants';
import { useUIStore } from './store';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatPrice(price: number, currency?: string): string {
  const state = useUIStore.getState();
  const cur = currency || state.currency || 'USD';
  // Convert from USD to target currency
  const rate = cur === 'USD' ? 1 : (state.exchangeRates[cur] || 1);
  const converted = price * rate;
  const num = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(converted);
  const sym = CURRENCY_SYMBOLS[cur] || cur;
  return `${sym}${num}`;
}

export function formatPriceChange(value: number, pct: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatPrice(value)} (${sign}${pct.toFixed(1)}%)`;
}

/** Reactive hook — re-renders component when currency or rates change */
export function useFormatPrice() {
  const currency = useUIStore((s) => s.currency);
  const exchangeRates = useUIStore((s) => s.exchangeRates);
  return useCallback((price: number, overrideCurrency?: string) => {
    const cur = overrideCurrency || currency;
    const rate = cur === 'USD' ? 1 : (exchangeRates[cur] || 1);
    const converted = price * rate;
    const num = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(converted);
    const sym = CURRENCY_SYMBOLS[cur] || cur;
    return `${sym}${num}`;
  }, [currency, exchangeRates]);
}

/** Reactive hook for price change formatting */
export function useFormatPriceChange() {
  const fp = useFormatPrice();
  return useCallback((value: number, pct: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${fp(value)} (${sign}${pct.toFixed(1)}%)`;
  }, [fp]);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatRelativeTime(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

export function getSteamAvatarUrl(hash: string): string {
  if (hash.startsWith('http')) return hash;
  return `https://avatars.steamstatic.com/${hash}_full.jpg`;
}

export function getItemIconUrl(iconUrl: string | null | undefined): string | undefined {
  if (!iconUrl) return undefined;
  if (iconUrl.startsWith('http')) return iconUrl;
  return `https://community.akamai.steamstatic.com/economy/image/${iconUrl}/330x192`;
}


/** Get wear short from full name string — wrapper around shared WEAR_SHORT */
export function getWearShort(wear: string | null): string | null {
  if (!wear) return null;
  return WEAR_SHORT[wear] || wear;
}
