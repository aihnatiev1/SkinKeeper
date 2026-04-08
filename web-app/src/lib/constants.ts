// Re-export shared constants — single source of truth
import { WEAR_SHORT, CURRENCY_MAP, RARITY_ORDER, DOPPLER_PHASES, MARKETPLACE_FEES } from '@skinkeeper/shared';
export { WEAR_SHORT, CURRENCY_MAP, RARITY_ORDER, DOPPLER_PHASES, MARKETPLACE_FEES };

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.skinkeeper.store';
export const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';

// Build currency symbols from shared CURRENCY_MAP
export const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  Object.values(CURRENCY_MAP).map(([code, sign]) => [code, sign])
);

// Wear labels — re-export from shared
export const WEAR_LABELS = WEAR_SHORT;

export const RARITY_COLORS: Record<string, string> = {
  'Consumer Grade': '#B0C3D9',
  'Industrial Grade': '#5E98D9',
  'Mil-Spec Grade': '#4B69FF',
  'Restricted': '#8847FF',
  'Classified': '#D32CE6',
  'Covert': '#EB4B4B',
  'Contraband': '#E4AE39',
  // Gloves, knives, agents — alternative rarity labels from Steam
  'Extraordinary': '#EB4B4B',
  'Remarkable': '#D32CE6',
  'Exotic': '#8847FF',
  'Distinguished': '#4B69FF',
  'Superior': '#D32CE6',
  'Master': '#EB4B4B',
  'High Grade': '#4B69FF',
  'Base Grade': '#B0C3D9',
};
