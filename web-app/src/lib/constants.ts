export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.skinkeeper.store';
export const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  UAH: '₴',
  RUB: '₽',
  CNY: '¥',
  PLN: 'zł',
  BRL: 'R$',
  TRY: '₺',
};

export const WEAR_LABELS: Record<string, string> = {
  'Factory New': 'FN',
  'Minimal Wear': 'MW',
  'Field-Tested': 'FT',
  'Well-Worn': 'WW',
  'Battle-Scarred': 'BS',
};

export const RARITY_COLORS: Record<string, string> = {
  'Consumer Grade': '#B0C3D9',
  'Industrial Grade': '#5E98D9',
  'Mil-Spec Grade': '#4B69FF',
  'Restricted': '#8847FF',
  'Classified': '#D32CE6',
  'Covert': '#EB4B4B',
  'Contraband': '#E4AE39',
};
