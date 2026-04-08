// ─── Auth ──────────────────────────────────────────────────────────────
// GET /api/auth/me — flat object, snake_case
export interface User {
  steam_id: string;
  display_name: string;
  avatar_url: string;
  is_premium: boolean;
  premium_until: string | null;
  active_account_id: number | null;
  account_count: number;
}

// GET /api/auth/accounts — camelCase
export interface SteamAccount {
  id: number;
  steamId: string;
  displayName: string;
  avatarUrl: string;
  isActive: boolean;
  sessionStatus: 'valid' | 'expiring' | 'expired' | 'none';
  addedAt: string;
}

// ─── Portfolio ─────────────────────────────────────────────────────────
// GET /api/portfolio/summary — snake_case
export interface PortfolioSummary {
  total_value: number;
  change_24h: number;
  change_24h_pct: number;
  change_7d: number;
  change_7d_pct: number;
  item_count: number;
  history: { date: string; value: number }[];
}

// GET /api/portfolio/pl — camelCase, cents
export interface ProfitLoss {
  totalInvestedCents: number;
  totalEarnedCents: number;
  realizedProfitCents: number;
  unrealizedProfitCents: number;
  totalProfitCents: number;
  totalProfitPct: number;
  holdingCount: number;
  totalCurrentValueCents: number;
}

// GET /api/portfolio/pl/items — camelCase, cents
export interface PLItem {
  marketHashName: string;
  avgBuyPriceCents: number;
  totalQuantityBought: number;
  totalSpentCents: number;
  totalQuantitySold: number;
  totalEarnedCents: number;
  currentHolding: number;
  realizedProfitCents: number;
  unrealizedProfitCents: number;
  currentPriceCents: number;
  totalProfitCents: number;
  profitPct: number;
  updatedAt: string;
  iconUrl: string | null;
}

// GET /api/portfolio/pl/history
export interface PLHistory {
  date: string;
  totalInvestedCents: number;
  totalCurrentValueCents: number;
  cumulativeProfitCents: number;
  realizedProfitCents: number;
  unrealizedProfitCents: number;
}

// ─── Inventory ─────────────────────────────────────────────────────────
// GET /api/inventory — snake_case
export interface InventoryItem {
  asset_id: string;
  market_hash_name: string;
  icon_url: string;
  wear: string | null;
  float_value: number | null;
  rarity: string | null;
  rarity_color: string | null;
  tradable: boolean;
  trade_ban_until: string | null;
  inspect_link: string | null;
  paint_seed: number | null;
  paint_index: number | null;
  stickers: Array<{ name?: string; icon_url?: string; wear?: number }> | null;
  charms: unknown | null;
  account_steam_id: string;
  account_id: number;
  account_name: string;
  account_avatar_url: string;
  prices: Record<string, number>;
  sticker_value: number | null;
  fade_percentage: number | null;
  collection: string | null;
  min_float: number | null;
  max_float: number | null;
}

// ─── Trades ────────────────────────────────────────────────────────────
// GET /api/trades — camelCase
export interface TradeOffer {
  id: string;
  direction: 'incoming' | 'outgoing';
  steamOfferId: string | null;
  partnerSteamId: string;
  partnerName: string | null;
  message: string | null;
  status: string;
  isQuickTransfer: boolean;
  isInternal: boolean;
  accountIdFrom: number | null;
  accountIdTo: number | null;
  accountFromName: string | null;
  accountToName: string | null;
  valueGiveCents: number;
  valueRecvCents: number;
  createdAt: string;
  updatedAt: string;
  items: TradeItem[];
}

export interface TradeItem {
  id: number;
  side: 'give' | 'receive';
  assetId: string;
  marketHashName: string | null;
  iconUrl: string | null;
  floatValue: number | null;
  priceCents: number;
}

// GET /api/trades/friends — camelCase, mapped by backend
export interface SteamFriend {
  steamId: string;
  personaName: string;
  avatarUrl: string;
  profileUrl: string;
  onlineStatus: string; // "offline" | "online" | "busy" | "away" | "snooze" | "looking_to_trade" | "looking_to_play"
}

// GET /api/trades/accounts — snake_case
export interface TradeAccount {
  id: number;
  steam_id: string;
  display_name: string;
  avatar_url: string;
  has_trade_token: boolean;
}

// GET /api/trades/partner-inventory/:steamId — returns TradeItem[]
export interface PartnerInventoryItem {
  assetId: string;
  marketHashName?: string;
  iconUrl?: string;
  floatValue?: number;
  priceCents?: number;
}

// ─── Transactions ──────────────────────────────────────────────────────
// GET /api/transactions — snake_case
export interface Transaction {
  id: string;
  type: 'buy' | 'sell' | 'trade';
  market_hash_name: string;
  price: number;
  date: string;
  icon_url: string | null;
  partner_steam_id: string | null;
  trade_direction: 'incoming' | 'outgoing' | null;
  current_price_cents: number | null;
  is_internal: boolean;
}

// GET /api/transactions/stats — camelCase, cents
export interface TransactionStats {
  totalBought: number;
  totalSold: number;
  totalTraded: number;
  spentCents: number;
  earnedCents: number;
  profitCents: number;
}

// ─── Market / Wallet ──────────────────────────────────────────────────
export interface WalletInfo {
  detected: boolean;
  currencyId: number;
  code: string;
  symbol: string;
  rate: number | null;
  source: 'auto' | 'manual' | 'default';
}

export interface SteamCurrency {
  id: number;
  code: string;
  symbol: string;
}

// ─── Alerts ────────────────────────────────────────────────────────────
// GET /api/alerts — snake_case
export interface Alert {
  id: number;
  market_hash_name: string;
  condition: string;
  threshold: number;
  source: string;
  is_active: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  created_at: string;
}

// ─── Portfolios ───────────────────────────────────────────────────────
export interface Portfolio {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

// ─── Market Listings ──────────────────────────────────────────────────
// GET /api/market/listings
export interface MarketListing {
  listingId: string;
  assetId: string;
  accountId: number;
  accountName: string | null;
  state: 'active' | 'to_confirm' | 'on_hold';
  marketHashName: string | null;
  name: string | null;
  iconUrl: string | null;
  sellerPrice: number;
  buyerPrice: number;
  currencyId: number;
  timeCreated: number;
}

// GET /api/market/volume
export interface SellVolume {
  today: number;
  limit: number;
  warningAt: number;
  remaining: number;
}

// POST /api/market/sell-operation (create response)
// GET  /api/market/sell-operation/:id (poll response)
export interface SellOperation {
  operationId: string;  // from create
  id?: string;          // from poll
  status: string;
  totalItems: number;
  succeeded?: number;
  failed?: number;
  skippedAssetIds?: string[];
  createdAt?: string;
  completedAt?: string | null;
  items?: SellOperationItem[];
}

export interface SellOperationItem {
  id?: number;
  assetId: string;
  marketHashName: string;
  priceCents: number;
  accountId?: number | null;
  status: string;
  errorMessage?: string | null;
  requiresConfirmation?: boolean;
  updatedAt?: string;
}

// GET /api/market/quickprice/:marketHashName
export interface QuickPrice {
  sellerReceivesCents: number;
  stale: boolean;
  source: string;
  marketUrl: string;
  currencyId: number;
  currencyCode: string;
  currencySymbol: string;
}

// POST /api/market/refresh-prices
export interface RefreshPricesResult {
  prices: Record<string, {
    sellerReceivesCents: number;
    highestBuyOrder: number;
    lowestSellOrder: number;
    currencyId: number;
    fresh: boolean;
  }>;
  currencyId: number;
  currencyCode: string;
  currencySymbol: string;
}

// ─── Deals / Arbitrage ────────────────────────────────────────────────
// GET /api/market/deals
export interface Deal {
  marketHashName: string;
  buySource: string;
  buyPrice: number;
  sellPrice: number;
  profitUsd: number;
  profitPct: number;
  iconUrl: string | null;
  buyUrl: string | null;
  buffBidPrice: number | null;
}

// ─── Watchlist ────────────────────────────────────────────────────────
// GET /api/alerts/watchlist
export interface WatchlistItem {
  id: number;
  market_hash_name: string;
  condition: string;
  threshold: number;
  source: string;
  is_active: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  created_at: string;
  icon_url: string | null;
  is_watchlist: boolean;
  current_price: number | null;
}

// ─── Price History ────────────────────────────────────────────────────
export interface PriceHistoryPoint {
  date: string;
  price: number;
}

// ─── Fee Calculator ───────────────────────────────────────────────────
export interface FeeCalcResult {
  buyerPays: number;
  sellerReceives: number;
  steamFee: number;
  gameFee: number;
}
