'use client';

import { Header } from '@/components/header';
import { useAuthStore, useUIStore } from '@/lib/store';
import { useAccounts, useSwitchAccount } from '@/lib/hooks';
import { authApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Crown, LogOut, Globe, CreditCard, Link2, Check } from 'lucide-react';
import { CURRENCY_SYMBOLS } from '@/lib/constants';

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { currency, setCurrency } = useUIStore();
  const { data: accounts } = useAccounts();
  const switchAccount = useSwitchAccount();

  const handleLogout = async () => {
    await authApi.clearSession();
    router.push('/login');
  };

  return (
    <div>
      <Header title="Settings" />
      <div className="p-6 max-w-2xl space-y-6">
        {/* Profile */}
        {user && (
          <div className="bg-surface rounded-xl border border-border p-6">
            <div className="flex items-center gap-4">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.display_name} className="w-16 h-16 rounded-full" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary">
                  {user.display_name?.[0] || '?'}
                </div>
              )}
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  {user.display_name}
                  {user.is_premium && (
                    <span className="inline-flex items-center gap-1 text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full">
                      <Crown size={10} /> PRO
                    </span>
                  )}
                </h2>
                <p className="text-sm text-muted">Steam ID: {user.steam_id}</p>
              </div>
            </div>
          </div>
        )}

        {/* Linked Accounts — camelCase from /auth/accounts */}
        <div className="bg-surface rounded-xl border border-border">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Link2 size={18} className="text-muted" />
            <h3 className="font-semibold">Linked Accounts</h3>
          </div>
          <div className="divide-y divide-border">
            {accounts?.map((acc) => (
              <div key={acc.id} className="px-6 py-3 flex items-center gap-3">
                {acc.avatarUrl ? (
                  <img src={acc.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-surface-light" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{acc.displayName}</p>
                  <p className="text-xs text-muted">{acc.steamId}</p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    acc.sessionStatus === 'valid'
                      ? 'bg-profit/10 text-profit'
                      : acc.sessionStatus === 'expired'
                      ? 'bg-loss/10 text-loss'
                      : 'bg-muted/10 text-muted'
                  }`}
                >
                  {acc.sessionStatus}
                </span>
                {acc.isActive ? (
                  <span className="text-xs text-profit flex items-center gap-1">
                    <Check size={12} /> Active
                  </span>
                ) : (
                  <button
                    onClick={() => switchAccount.mutate(acc.id)}
                    className="text-xs text-primary hover:text-primary-hover transition-colors"
                  >
                    Switch
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Display Currency */}
        <div className="bg-surface rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={18} className="text-muted" />
            <h3 className="font-semibold">Display Currency</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CURRENCY_SYMBOLS).map(([code, symbol]) => (
              <button
                key={code}
                onClick={() => setCurrency(code)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  currency === code
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-border text-muted hover:text-foreground'
                }`}
              >
                {symbol} {code}
              </button>
            ))}
          </div>
        </div>

        {/* Subscription */}
        {user && !user.is_premium && (
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl border border-primary/20 p-6">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard size={18} className="text-primary" />
              <h3 className="font-semibold">Upgrade to PRO</h3>
            </div>
            <p className="text-sm text-muted mb-4">
              Unlock P&L analytics, bulk sell, 20 alerts, CSV export, and more.
            </p>
            <div className="flex gap-3">
              <button className="px-6 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors">
                $4.99/month
              </button>
              <button className="px-6 py-2 bg-surface border border-border hover:border-primary text-foreground rounded-lg text-sm font-medium transition-colors">
                $34.99/year (-50%)
              </button>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2.5 text-loss hover:bg-loss/10 rounded-lg transition-colors text-sm font-medium"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
