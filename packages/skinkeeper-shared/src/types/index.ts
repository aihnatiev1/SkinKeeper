// ─── Price Data ──────────────────────────────────────────────────────
export interface MultiPrice {
  steam?: number;       // cents
  buff?: number;
  csfloat?: number;
  skinport?: number;
  dmarket?: number;
  bitskins?: number;
  steam_buyorder?: number;
}

export interface PriceAnalysis {
  buffSteamRatio: number | null;
  cheapestSource: string | null;
  cheapestPrice: number;
  spread: number;
  arbitrage: ArbitrageInfo | null;
}

export interface ArbitrageInfo {
  viable: boolean;
  buySource: string;
  sellSource: string;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  profitPct: number;
}

export interface PriceVelocity {
  change7d: number;
  change7dPct: number;
  change30d: number;
  change30dPct: number;
  trend: 'rising' | 'falling' | 'stable';
}

// ─── Float Data ──────────────────────────────────────────────────────
export interface FloatData {
  floatValue: number;
  paintSeed: number;
  paintIndex: number;
  wear: string;
  minFloat: number;
  maxFloat: number;
  rank?: number;
  totalItems?: number;
}

// ─── Sticker Data ────────────────────────────────────────────────────
export interface StickerInfo {
  name: string;
  slot: number;
  wear?: number;
  catalogPrice?: number;
}

export interface StickerAnalysis {
  totalCatalogValue: number;
  adjustedValue: number;
  stickerPremium: number;
  spPercent: number;
}

// ─── Phase / Pattern ─────────────────────────────────────────────────
export interface FadeInfo {
  percentage: number;
  tier: string;
  color: string;
}

export interface MarbleFadeInfo {
  pattern: 'Fire & Ice' | 'Fake Fire & Ice' | 'Tricolor' | 'Blue Dominant' | 'Red Dominant' | 'Gold';
  tier: number;
  color: string;
  priceMultiplier: number;
}

export interface BlueGemInfo {
  tier: number;
  bluePercent: number;
  label: string;
}

export interface BlueGemEntry {
  pb: number;  // playside blue %
  bb: number;  // backside blue %
}

// ─── Trade-Up ────────────────────────────────────────────────────────
export interface TradeUpInput {
  market_hash_name: string;
  float_value: number;
  rarity: string;
  price: number;
  collection?: string;
  isStatTrak?: boolean;
}

export interface TradeUpOutput {
  market_hash_name: string;
  probability: number;
  estimatedFloat: number;
  price: number;
  profit: number;
}

export interface TradeUpResult {
  valid: boolean;
  error?: string;
  outputs: TradeUpOutput[];
  expectedValue: number;
  totalCost: number;
  profit: number;
  roi: number;
}

// ─── Sell ────────────────────────────────────────────────────────────
export interface SellValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

// ─── User / Portfolio ────────────────────────────────────────────────
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

export interface ItemPL {
  market_hash_name: string;
  avg_buy_price_cents: number;
  current_price_cents: number;
  profit_cents: number;
  profit_pct: number;
  holding: number;
}
