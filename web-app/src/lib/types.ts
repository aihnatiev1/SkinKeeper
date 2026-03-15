export interface User {
  id: number;
  steam_id: string;
  display_name: string;
  avatar_url: string;
  is_premium: boolean;
  active_account_id: number | null;
  created_at: string;
}

export interface SteamAccount {
  id: number;
  steamId: string;
  displayName: string;
  avatarUrl: string;
  sessionStatus: 'valid' | 'expiring' | 'expired' | 'none';
  isActive: boolean;
}

export interface InventoryItem {
  id: number;
  asset_id: string;
  market_hash_name: string;
  icon_url: string;
  name_color: string;
  rarity: string;
  wear: string | null;
  float_value: number | null;
  tradable: boolean;
  trade_ban_until: string | null;
  prices: Record<string, number>;
  stickers: Sticker[];
  account_id: number;
  account_name?: string;
}

export interface Sticker {
  name: string;
  icon_url: string;
  wear?: number;
}

export interface PortfolioSummary {
  total_value: number;
  item_count: number;
  change_24h: number;
  change_24h_pct: number;
  change_7d: number;
  change_7d_pct: number;
  history: { date: string; value: number }[];
}

export interface ProfitLoss {
  total_invested: number;
  total_current: number;
  total_pl: number;
  total_pl_pct: number;
}

export interface PLItem {
  market_hash_name: string;
  icon_url: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  total_cost: number;
  total_current: number;
  pl: number;
  pl_pct: number;
}

export interface PLHistory {
  date: string;
  value: number;
  cost: number;
  pl: number;
}

export interface TradeOffer {
  id: number;
  steam_offer_id: string;
  partner_steam_id: string;
  partner_name: string;
  partner_avatar: string;
  status: string;
  message: string;
  items_to_give: TradeItem[];
  items_to_receive: TradeItem[];
  give_value: number;
  receive_value: number;
  created_at: string;
  updated_at: string;
}

export interface TradeItem {
  asset_id: string;
  market_hash_name: string;
  icon_url: string;
  price: number | null;
}

export interface Transaction {
  id: number;
  type: 'buy' | 'sell';
  market_hash_name: string;
  icon_url: string;
  price: number;
  quantity: number;
  date: string;
  source: string;
}

export interface TransactionStats {
  total_bought: number;
  total_sold: number;
  buy_count: number;
  sell_count: number;
}

export interface Alert {
  id: number;
  market_hash_name: string;
  icon_url: string;
  target_price: number;
  direction: 'above' | 'below';
  active: boolean;
  triggered_at: string | null;
  created_at: string;
}

export interface PriceData {
  source: string;
  price_usd: number;
  recorded_at: string;
}

export interface PriceHistory {
  date: string;
  price: number;
  source: string;
}
