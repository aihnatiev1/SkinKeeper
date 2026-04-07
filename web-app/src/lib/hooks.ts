import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  User,
  SteamAccount,
  InventoryItem,
  PortfolioSummary,
  ProfitLoss,
  PLItem,
  PLHistory,
  TradeOffer,
  Transaction,
  TransactionStats,
  Alert,
  WalletInfo,
  SteamCurrency,
  MarketListing,
  SellVolume,
  SellOperation,
  Deal,
  WatchlistItem,
  PriceHistoryPoint,
  FeeCalcResult,
  Portfolio,
  QuickPrice,
  RefreshPricesResult,
} from './types';
import { useAuthStore, useUIStore } from './store';

/** Build `?accountId=X` param string if account scope is set, empty string otherwise */
function scopeParam(scope: number | null, prefix: '?' | '&' = '?'): string {
  return scope != null ? `${prefix}accountId=${scope}` : '';
}

// ─── Auth ──────────────────────────────────────────────────────────────

export function useMe() {
  const setUser = useAuthStore((s) => s.setUser);
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const data = await api.get<User>('/auth/me');
      setUser(data);
      return data;
    },
    retry: false,
  });
}

export function useAccounts() {
  const setAccounts = useAuthStore((s) => s.setAccounts);
  return useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const data = await api.get<{ accounts: SteamAccount[] }>('/auth/accounts');
      setAccounts(data.accounts);
      return data.accounts;
    },
  });
}

export function useSwitchAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: number) =>
      api.put(`/auth/accounts/${accountId}/active`),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

// ─── Portfolios (named) ───────────────────────────────────────────────

export function usePortfolios() {
  return useQuery({
    queryKey: ['portfolios'],
    queryFn: () => api.get<{ portfolios: Portfolio[] }>('/portfolios'),
    select: (data) => data.portfolios,
  });
}

export function useCreatePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color?: string }) =>
      api.post<Portfolio>('/portfolios', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }),
  });
}

export function useUpdatePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name: string; color?: string }) =>
      api.put<Portfolio>(`/portfolios/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }),
  });
}

export function useDeletePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/portfolios/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

// ─── Portfolio Summary & P/L ──────────────────────────────────────────

export function usePortfolioSummary() {
  const scope = useUIStore((s) => s.accountScope);
  return useQuery({
    queryKey: ['portfolio', 'summary', scope],
    queryFn: () => api.get<PortfolioSummary>(`/portfolio/summary${scopeParam(scope)}`),
  });
}

export function useProfitLoss() {
  const user = useAuthStore((s) => s.user);
  const scope = useUIStore((s) => s.accountScope);
  const pScope = useUIStore((s) => s.portfolioScope);
  return useQuery({
    queryKey: ['portfolio', 'pl', scope, pScope],
    queryFn: () => {
      const params = new URLSearchParams();
      if (scope != null) params.set('accountId', String(scope));
      if (pScope != null) params.set('portfolioId', String(pScope));
      const qs = params.toString();
      return api.get<ProfitLoss>(`/portfolio/pl${qs ? `?${qs}` : ''}`);
    },
    enabled: !!user?.is_premium,
  });
}

export function usePLItems(page = 1, limit = 50) {
  const user = useAuthStore((s) => s.user);
  const scope = useUIStore((s) => s.accountScope);
  const pScope = useUIStore((s) => s.portfolioScope);
  return useQuery({
    queryKey: ['portfolio', 'pl', 'items', page, scope, pScope],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('offset', String((page - 1) * limit));
      params.set('limit', String(limit));
      if (scope != null) params.set('accountId', String(scope));
      if (pScope != null) params.set('portfolioId', String(pScope));
      return api.get<{ items: PLItem[]; total: number; offset: number; limit: number }>(
        `/portfolio/pl/items?${params}`
      );
    },
    enabled: !!user?.is_premium,
  });
}

export function usePLHistory(days = 30) {
  const user = useAuthStore((s) => s.user);
  const scope = useUIStore((s) => s.accountScope);
  const pScope = useUIStore((s) => s.portfolioScope);
  return useQuery({
    queryKey: ['portfolio', 'pl', 'history', days, scope, pScope],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('days', String(days));
      if (scope != null) params.set('accountId', String(scope));
      if (pScope != null) params.set('portfolioId', String(pScope));
      return api.get<{ history: PLHistory[] }>(`/portfolio/pl/history?${params}`);
    },
    enabled: !!user?.is_premium,
  });
}

// ─── Inventory ─────────────────────────────────────────────────────────

interface InventoryPage {
  items: InventoryItem[];
  total: number;
  totalValue: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  hasSession: boolean;
  stale: boolean;
}

interface InventoryFilters {
  sort?: string;
  search?: string;
  tradableOnly?: boolean;
  accountId?: number;
}

const INVENTORY_PAGE_SIZE = 20;

export function useInventory(filters: InventoryFilters = {}) {
  const scope = useUIStore((s) => s.accountScope);
  const { sort = 'price-desc', search = '', tradableOnly = false, accountId } = filters;
  const effectiveAccountId = accountId ?? scope;

  return useInfiniteQuery<InventoryPage>({
    queryKey: ['inventory', sort, search, tradableOnly, effectiveAccountId],
    queryFn: ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set('limit', String(INVENTORY_PAGE_SIZE));
      params.set('offset', String(pageParam));
      params.set('sort', sort);
      if (search) params.set('search', search);
      if (tradableOnly) params.set('tradableOnly', 'true');
      if (effectiveAccountId) params.set('accountId', String(effectiveAccountId));
      return api.get<InventoryPage>(`/inventory?${params}`);
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    initialPageParam: 0,
  });
}

export function useRefreshInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/inventory/refresh'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

// ─── Trades ────────────────────────────────────────────────────────────

export function useTrades(status?: string, limit = 20, offset = 0) {
  const scope = useUIStore((s) => s.accountScope);
  return useQuery({
    queryKey: ['trades', status, limit, offset, scope],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (scope != null) params.set('accountId', String(scope));
      return api.get<{ offers: TradeOffer[]; total: number; hasMore: boolean }>(
        `/trades?${params}`
      );
    },
  });
}

export function useSyncTrades() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ synced: number }>('/trades/sync'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });
}

// ─── Transactions ──────────────────────────────────────────────────────

export function useTransactions(filters?: {
  type?: string;
  item?: string;
  from?: string;
  to?: string;
}) {
  const scope = useUIStore((s) => s.accountScope);
  return useQuery({
    queryKey: ['transactions', filters, scope],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.type) params.set('type', filters.type);
      if (filters?.item) params.set('item', filters.item);
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
      if (scope != null) params.set('accountId', String(scope));
      return api.get<{ transactions: Transaction[]; total: number }>(
        `/transactions?${params}`
      );
    },
    select: (data) => data.transactions,
  });
}

export function useTransactionStats() {
  return useQuery({
    queryKey: ['transactions', 'stats'],
    queryFn: () => api.get<TransactionStats>('/transactions/stats'),
  });
}

export function useImportTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: Array<{ name: string; type: string; qty?: number; price_usd: number; date?: string; portfolio_id?: number }>) =>
      api.post<{ imported: number }>('/transactions/import', { rows }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useSyncTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/transactions/sync'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
}

// ─── Market / Wallet ──────────────────────────────────────────────────

export function useWalletInfo() {
  return useQuery({
    queryKey: ['wallet-info'],
    queryFn: () => api.get<WalletInfo>('/market/wallet-info'),
  });
}

export function useSteamCurrencies() {
  return useQuery({
    queryKey: ['steam-currencies'],
    queryFn: () =>
      api.get<{ currencies: SteamCurrency[] }>('/market/currencies'),
    select: (data) => data.currencies,
    staleTime: Infinity,
  });
}

export function useSetWalletCurrency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (currencyId: number) =>
      api.put('/market/wallet-currency', { currencyId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet-info'] });
    },
  });
}

// ─── Alerts ────────────────────────────────────────────────────────────

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get<{ alerts: Alert[] }>('/alerts'),
    select: (data) => data.alerts,
  });
}

export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alert: { market_hash_name: string; threshold: number; condition: string; source: string }) =>
      api.post('/alerts', alert),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useToggleAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.patch(`/alerts/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/alerts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

// ─── Market Listings ──────────────────────────────────────────────────

export function useMarketListings() {
  const scope = useUIStore((s) => s.accountScope);
  return useQuery({
    queryKey: ['market', 'listings', scope],
    queryFn: () => {
      const params = new URLSearchParams();
      if (scope != null) params.set('accountId', String(scope));
      return api.get<{ listings: MarketListing[]; totalCount: number }>(`/market/listings?${params}`);
    },
  });
}

export function useSellVolume() {
  return useQuery({
    queryKey: ['market', 'volume'],
    queryFn: () => api.get<SellVolume>('/market/volume'),
  });
}

export function useCreateSellOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: Array<{ assetId: string; marketHashName: string; priceCents: number }>) =>
      api.post<SellOperation>('/market/sell-operation', { items }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['market'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useSellOperationStatus(operationId: string | null) {
  return useQuery({
    queryKey: ['market', 'sell-operation', operationId],
    queryFn: () => api.get<SellOperation>(`/market/sell-operation/${operationId}`),
    enabled: !!operationId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'in_progress' ? 2000 : false;
    },
  });
}

export function useQuickPrice(marketHashName: string | null, accountId?: number) {
  return useQuery({
    queryKey: ['market', 'quickprice', marketHashName, accountId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (accountId) params.set('accountId', String(accountId));
      const qs = params.toString();
      return api.get<QuickPrice>(
        `/market/quickprice/${encodeURIComponent(marketHashName!)}${qs ? `?${qs}` : ''}`
      );
    },
    enabled: !!marketHashName,
    staleTime: 60_000,
  });
}

export function useRefreshPrices() {
  return useMutation({
    mutationFn: (data: { names: string[]; accountId?: number }) =>
      api.post<RefreshPricesResult>('/market/refresh-prices', data),
  });
}

export function useCancelSellOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (operationId: string) =>
      api.post(`/market/sell-operation/${operationId}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['market'] });
    },
  });
}

// ─── Deals / Arbitrage ────────────────────────────────────────────────

export function useDeals(minProfit = 5, limit = 50) {
  return useQuery({
    queryKey: ['market', 'deals', minProfit, limit],
    queryFn: () =>
      api.get<{ deals: Deal[]; count: number }>(`/market/deals?minProfit=${minProfit}&limit=${limit}`),
  });
}

// ─── Watchlist ────────────────────────────────────────────────────────

export function useWatchlist() {
  return useQuery({
    queryKey: ['watchlist'],
    queryFn: () => api.get<{ items: WatchlistItem[] }>('/alerts/watchlist'),
    select: (data) => data.items,
  });
}

export function useAddToWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { marketHashName: string; targetPrice: number; source?: string; iconUrl?: string }) =>
      api.post('/alerts/watchlist', item),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  });
}

export function useRemoveFromWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/alerts/watchlist/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  });
}

// ─── Price History ────────────────────────────────────────────────────

export function usePriceHistory(marketHashName: string | null, days = 30) {
  return useQuery({
    queryKey: ['prices', 'history', marketHashName, days],
    queryFn: () =>
      api.get<{ market_hash_name: string; history: PriceHistoryPoint[]; partial?: boolean }>(
        `/prices/${encodeURIComponent(marketHashName!)}/history?days=${days}`
      ),
    enabled: !!marketHashName,
  });
}

export function useItemPrices(marketHashName: string | null) {
  return useQuery({
    queryKey: ['prices', 'current', marketHashName],
    queryFn: () =>
      api.get<{ market_hash_name: string; current_prices: Record<string, number> }>(
        `/prices/${encodeURIComponent(marketHashName!)}`
      ),
    enabled: !!marketHashName,
  });
}

// ─── Fee Calculator ───────────────────────────────────────────────────

export function useCalcFees() {
  return useMutation({
    mutationFn: (input: { buyerPrice?: number; sellerReceives?: number }) =>
      api.post<FeeCalcResult>('/data/calc-fees', input),
  });
}
