import { create } from 'zustand';
import type { User, SteamAccount } from './types';

interface AuthState {
  user: User | null;
  accounts: SteamAccount[];
  setUser: (user: User | null) => void;
  setAccounts: (accounts: SteamAccount[]) => void;
  switchAccount: (accountId: number) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accounts: [],
  setUser: (user) => set({ user }),
  setAccounts: (accounts) => set({ accounts }),
  switchAccount: (accountId) =>
    set((state) => ({
      user: state.user ? { ...state.user, active_account_id: accountId } : null,
    })),
}));

interface UIState {
  sidebarOpen: boolean;
  mobileOpen: boolean;
  currency: string;
  /** null = all accounts, number = specific steam_account id */
  accountScope: number | null;
  /** null = all portfolios, number = specific portfolio id */
  portfolioScope: number | null;
  toggleSidebar: () => void;
  setMobileOpen: (open: boolean) => void;
  setCurrency: (currency: string) => void;
  setAccountScope: (scope: number | null) => void;
  setPortfolioScope: (scope: number | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  mobileOpen: false,
  currency: 'USD',
  accountScope: null,
  portfolioScope: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setMobileOpen: (open) => set({ mobileOpen: open }),
  setCurrency: (currency) => set({ currency }),
  setAccountScope: (scope) => set({ accountScope: scope }),
  setPortfolioScope: (scope) => set({ portfolioScope: scope }),
}));
