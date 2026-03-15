import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
} from './types';
import { useAuthStore } from './store';

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

// ─── Portfolio ─────────────────────────────────────────────────────────

export function usePortfolioSummary() {
  return useQuery({
    queryKey: ['portfolio', 'summary'],
    queryFn: () => api.get<PortfolioSummary>('/portfolio/summary'),
  });
}

export function useProfitLoss() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['portfolio', 'pl'],
    queryFn: () => api.get<ProfitLoss>('/portfolio/pl'),
    enabled: !!user?.is_premium,
  });
}

export function usePLItems(page = 1, limit = 50) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['portfolio', 'pl', 'items', page],
    queryFn: () =>
      api.get<{ items: PLItem[]; total: number; offset: number; limit: number }>(
        `/portfolio/pl/items?offset=${(page - 1) * limit}&limit=${limit}`
      ),
    enabled: !!user?.is_premium,
  });
}

export function usePLHistory(days = 30) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['portfolio', 'pl', 'history', days],
    queryFn: () =>
      api.get<{ history: PLHistory[] }>(`/portfolio/pl/history?days=${days}`),
    enabled: !!user?.is_premium,
  });
}

// ─── Inventory ─────────────────────────────────────────────────────────

export function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get<{ items: InventoryItem[]; count: number }>('/inventory'),
    select: (data) => data.items,
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
  return useQuery({
    queryKey: ['trades', status, limit, offset],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      params.set('limit', String(limit));
      params.set('offset', String(offset));
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
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.type) params.set('type', filters.type);
      if (filters?.item) params.set('item', filters.item);
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
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

export function useSyncTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/transactions/sync'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
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

export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/alerts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}
