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
  currency: string;
  toggleSidebar: () => void;
  setCurrency: (currency: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  currency: 'USD',
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setCurrency: (currency) => set({ currency }),
}));
