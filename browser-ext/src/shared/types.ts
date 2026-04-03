// ─── Price data collected from Steam pages ────────────────────────────
export interface CollectedPrice {
  market_hash_name: string;
  price_cents: number;
  currency_id: number;
  source: 'steam_listing' | 'steam_buyorder' | 'steam_sale';
  volume?: number; // number of listings/sales
  timestamp: number;
}

export interface PriceBatch {
  items: CollectedPrice[];
  collector_id: string; // anonymous hash of steam ID
  page: string; // which Steam page collected from
}

// ─── SkinKeeper user data ─────────────────────────────────────────────
export interface SKUser {
  steam_id: string;
  display_name: string;
  avatar_url: string;
  is_premium: boolean;
}

export interface SKPortfolio {
  total_value: number;
  change_24h: number;
  change_24h_pct: number;
  item_count: number;
}

export interface SKItemPrice {
  market_hash_name: string;
  steam: number | null;
  buff: number | null;
  csfloat: number | null;
  skinport: number | null;
}

// ─── Messages between content scripts and background ──────────────────
export type MessageType =
  | { type: 'GET_PRICES'; names: string[] }
  | { type: 'GET_PRICES_FULL'; names: string[] }
  | { type: 'SUBMIT_PRICES'; batch: PriceBatch }
  | { type: 'GET_USER' }
  | { type: 'GET_PORTFOLIO' }
  | { type: 'GET_ITEM_PL'; market_hash_name: string }
  | { type: 'GET_FLOAT'; inspectLink: string }
  | { type: 'GET_STICKER_PRICES'; names: string[] }
  | { type: 'CREATE_ALERT'; market_hash_name: string; condition: string; threshold: number }
  | { type: 'OPEN_APP'; path: string }
  | { type: 'GET_SETTINGS' };

export interface ItemPL {
  market_hash_name: string;
  avg_buy_price_cents: number;
  current_price_cents: number;
  profit_cents: number;
  profit_pct: number;
  holding: number;
}

export interface ExtSettings {
  showPrices: boolean;
  priceSource: 'steam' | 'buff' | 'csfloat' | 'skinport';
  showRatio: boolean;
  showVelocity: boolean;
  currency: string;
  showFloats: boolean;
  showPhases: boolean;
  showStickerSP: boolean;
  showBlueGems: boolean;
  showPL: boolean;
  showArbitrage: boolean;
  showTradePL: boolean;
  stackDuplicates: boolean;
  showTradeLock: boolean;
  quickSell: boolean;
  collectPrices: boolean;
  conflictDetection: boolean;
}

export const DEFAULT_SETTINGS: ExtSettings = {
  showPrices: true,
  priceSource: 'buff',
  showRatio: true,
  showVelocity: true,
  currency: 'USD',
  showFloats: true,
  showPhases: true,
  showStickerSP: true,
  showBlueGems: true,
  showPL: true,
  showArbitrage: true,
  showTradePL: true,
  stackDuplicates: true,
  showTradeLock: true,
  quickSell: true,
  collectPrices: true,
  conflictDetection: true,
};
