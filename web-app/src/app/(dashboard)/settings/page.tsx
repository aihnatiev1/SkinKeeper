'use client';

import { Header } from '@/components/header';
import { useAuthStore, useUIStore } from '@/lib/store';
import { useAccounts, useSwitchAccount } from '@/lib/hooks';
import { api, authApi } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { Crown, LogOut, Globe, Link2, Check, Sparkles, ExternalLink, Loader2, Trash2, Smartphone } from 'lucide-react';
import { CURRENCY_SYMBOLS } from '@/lib/constants';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useState, useEffect, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useIsDesktop } from '@/lib/use-desktop';
import { SteamConnect } from '@/components/steam-connect';
import { SteamSessionModal } from '@/components/steam-session-modal';

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const { currency, setCurrency } = useUIStore();
  const { data: accounts } = useAccounts();
  const qc = useQueryClient();
  const switchAccount = useSwitchAccount();
  const isDesktopApp = useIsDesktop();
  const [refreshingSession, setRefreshingSession] = useState<number | null>(null);
  const [unlinkingAccount, setUnlinkingAccount] = useState<number | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  // Handle extension connection — send JWT token to browser extension
  useEffect(() => {
    const source = searchParams.get('source');
    if (source !== 'extension') return;

    // Read extension ID from manifest (set after publishing to Chrome Web Store)
    // For dev: the extension must be in externally_connectable matches
    async function connectExtension() {
      try {
        // Get token from cookie via our session API
        const res = await fetch('/api/auth/session?include_token=1');
        const data = await res.json();
        if (!data.authenticated || !data.token) {
          toast.error('Please sign in first, then try connecting the extension again.');
          return;
        }

        // Try sending token to extension via chrome.runtime.sendMessage
        // This works because our domain is in externally_connectable
        const chromeRuntime = (window as any).chrome?.runtime;
        if (chromeRuntime?.sendMessage) {
          // Try known extension IDs (dev + production)
          const extensionIds = (window as any).__SK_EXTENSION_IDS || [];
          let sent = false;

          for (const extId of extensionIds) {
            try {
              await new Promise<void>((resolve, reject) => {
                chromeRuntime.sendMessage(extId, { type: 'SET_TOKEN', token: data.token }, (response: any) => {
                  if (chromeRuntime.lastError) { reject(chromeRuntime.lastError); return; }
                  if (response?.ok) { resolve(); } else { reject(new Error('Failed')); }
                });
              });
              sent = true;
              break;
            } catch {
              // Try next ID
            }
          }

          if (sent) {
            toast.success('Extension connected! SkinKeeper data is now available on Steam pages.');
          } else {
            toast('Extension not detected. Make sure SkinKeeper extension is installed.', { duration: 5000 });
          }
        } else {
          toast('Browser extension API not available. Are you using Chrome/Edge?');
        }
      } catch {
        toast.error('Failed to connect extension.');
      }
      router.replace('/settings');
    }

    connectExtension();
  }, [searchParams, router]);

  const handleLogout = async () => {
    await authApi.clearSession();
    toast.success('Signed out');
    router.push('/login');
  };

  const handleSwitch = (id: number) => {
    switchAccount.mutate(id, {
      onSuccess: () => toast.success('Account switched'),
    });
  };

  const handleRefreshSession = async (accountId: number) => {
    setRefreshingSession(accountId);
    try {
      await api.post(`/session/refresh?accountId=${accountId}`);
      toast.success('Session refreshed');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['session'] });
    } catch {
      toast.error('Failed to refresh session');
    } finally {
      setRefreshingSession(null);
    }
  };

  const handleUnlinkAccount = async (accountId: number, name: string) => {
    if (!confirm(`Remove "${name}"? This will delete its inventory, trades, and transaction data.`)) return;
    setUnlinkingAccount(accountId);
    try {
      await api.delete(`/auth/accounts/${accountId}`);
      toast.success('Account removed');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    } catch {
      toast.error('Failed to remove account');
    } finally {
      setUnlinkingAccount(null);
    }
  };

  const APP_STORE_URL = 'https://apps.apple.com/ua/app/skinkeeper/id6760600231?l=uk';

  return (
    <div>
      <Header title="Settings" />
      <div className="p-4 lg:p-6 max-w-2xl space-y-6">
        {/* Profile */}
        {user && (
          <motion.div
            initial="hidden" animate="show" variants={fadeUp}
            className="glass rounded-2xl border border-border/50 p-6"
          >
            <div className="flex items-center gap-4">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.display_name} className="w-16 h-16 rounded-2xl ring-2 ring-primary/20" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary">
                  {user.display_name?.[0] || '?'}
                </div>
              )}
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  {user.display_name}
                  {user.is_premium && (
                    <span className="inline-flex items-center gap-1 text-xs bg-gradient-to-r from-warning/20 to-warning/10 text-warning px-2.5 py-0.5 rounded-full font-bold">
                      <Crown size={10} /> PRO
                    </span>
                  )}
                </h2>
                <p className="text-sm text-muted font-mono">{user.steam_id}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Linked Accounts */}
        <motion.div
          initial="hidden" animate="show" variants={fadeUp}
          className="glass rounded-2xl border border-border/50"
        >
          <div className="px-6 py-4 border-b border-border/30 flex items-center gap-2">
            <Link2 size={18} className="text-primary" />
            <h3 className="font-bold">Linked Accounts</h3>
          </div>
          <div className="divide-y divide-border/20">
            {accounts?.map((acc) => (
              <div key={acc.id} className="px-6 py-3.5 flex items-center gap-3">
                {acc.avatarUrl ? (
                  <img src={acc.avatarUrl} alt="" className="w-9 h-9 rounded-xl" />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-surface-light" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{acc.displayName}</p>
                  <p className="text-xs text-muted font-mono">{acc.steamId}</p>
                </div>
                {acc.sessionStatus === 'expired' ? (
                  <button
                    onClick={() => setQrOpen(true)}
                    className="text-xs px-2.5 py-1 rounded-full font-semibold bg-loss/10 text-loss hover:bg-loss/20 transition-colors cursor-pointer"
                  >
                    expired
                  </button>
                ) : (
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      acc.sessionStatus === 'valid'
                        ? 'bg-profit/10 text-profit'
                        : 'bg-muted/10 text-muted'
                    }`}
                  >
                    {acc.sessionStatus}
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  {acc.sessionStatus === 'expired' && (
                    <button
                      onClick={() => setQrOpen(true)}
                      className="text-xs text-primary font-semibold hover:text-primary-hover transition-colors"
                    >
                      Reauth
                    </button>
                  )}
                  {acc.isActive ? (
                    <span className="text-xs text-profit flex items-center gap-1 font-semibold">
                      <Check size={12} /> Active
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => handleSwitch(acc.id)}
                        className="text-xs text-primary hover:text-primary-hover font-semibold transition-colors"
                      >
                        Switch
                      </button>
                      <button
                        onClick={() => handleUnlinkAccount(acc.id, acc.displayName)}
                        disabled={unlinkingAccount === acc.id}
                        className="p-1.5 rounded-lg text-muted hover:text-loss hover:bg-loss/10 transition-colors"
                        title="Remove account"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Steam Connection — desktop only */}
        {isDesktopApp && (
          <motion.div initial="hidden" animate="show" variants={fadeUp}>
            <SteamConnect />
          </motion.div>
        )}

        {/* Display Currency */}
        <motion.div
          initial="hidden" animate="show" variants={fadeUp}
          className="glass rounded-2xl border border-border/50 p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Globe size={18} className="text-primary" />
            <h3 className="font-bold">Display Currency</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CURRENCY_SYMBOLS).map(([code, symbol]) => (
              <button
                key={code}
                onClick={() => setCurrency(code)}
                className={`px-3 py-1.5 text-sm rounded-xl transition-all font-medium ${
                  currency === code
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'glass text-muted hover:text-foreground'
                }`}
              >
                {symbol} {code}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Subscription — Upgrade */}
        {user && !user.is_premium && (
          <motion.div
            initial="hidden" animate="show" variants={fadeUp}
            className="relative overflow-hidden rounded-2xl border border-primary/20 p-6 glow-primary"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-accent/10" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Sparkles size={18} className="text-primary" />
                </div>
                <h3 className="font-bold text-lg">Upgrade to PRO</h3>
              </div>
              <p className="text-sm text-muted mb-4">
                Unlock P&L analytics, 20 alerts, CSV export, push notifications, and more.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mb-6">
                {[
                  'P&L Analytics',
                  'Per-Item Profit & Loss',
                  'P&L History Charts',
                  'CSV Export',
                  '20 Price Alerts',
                  'Unlimited Accounts',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-1.5">
                    <Check size={14} className="text-primary shrink-0" />
                    <span className="text-muted">{feature}</span>
                  </li>
                ))}
              </ul>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-bold transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
              >
                <Smartphone size={16} />
                Subscribe via iOS App
                <ExternalLink size={12} className="opacity-60" />
              </a>
              <p className="text-xs text-muted mt-3 flex items-center gap-1.5">
                <Smartphone size={12} />
                PRO is available through the SkinKeeper iOS app. Your subscription works across all platforms.
              </p>
            </div>
          </motion.div>
        )}

        {/* Subscription — Active PRO */}
        {user?.is_premium && (
          <motion.div
            initial="hidden" animate="show" variants={fadeUp}
            className="glass rounded-2xl border border-warning/20 p-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-warning/10">
                  <Crown size={18} className="text-warning" />
                </div>
                <div>
                  <h3 className="font-bold">SkinKeeper PRO</h3>
                  {user.premium_until && (
                    <p className="text-xs text-muted">
                      Renews {new Date(user.premium_until).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl glass hover:bg-surface-light transition-colors"
              >
                <ExternalLink size={14} />
                Manage in App Store
              </a>
            </div>
          </motion.div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2.5 text-loss hover:bg-loss/10 rounded-xl transition-all text-sm font-semibold"
        >
          <LogOut size={16} />
          Sign Out
        </button>

        {/* Delete Account */}
        <div className="pt-6 mt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-semibold text-loss uppercase tracking-wider mb-2">Danger Zone</h3>
          <p className="text-xs text-muted mb-3">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <DeleteAccountButton />
        </div>
      </div>

      <SteamSessionModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onSuccess={() => {
          setQrOpen(false);
          toast.success('Steam session connected');
          qc.invalidateQueries({ queryKey: ['accounts'] });
          qc.invalidateQueries({ queryKey: ['session'] });
          qc.invalidateQueries({ queryKey: ['inventory'] });
        }}
      />
    </div>
  );
}

function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete('/auth/user');
      await authApi.clearSession();
      toast.success('Account deleted');
      router.push('/login');
    } catch {
      toast.error('Failed to delete account');
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all hover:bg-loss/10"
        style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
      >
        <Trash2 size={14} />
        Delete Account
      </button>
    );
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
      <p className="text-sm font-semibold text-loss mb-1">Are you sure?</p>
      <p className="text-xs text-muted mb-3">This will permanently delete your account, all linked Steam accounts, inventory data, portfolios, transactions, and alerts.</p>
      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-4 py-2 text-xs font-bold rounded-lg transition-all disabled:opacity-50"
          style={{ background: '#ef4444', color: '#fff' }}
        >
          {deleting ? 'Deleting...' : 'Yes, delete everything'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-4 py-2 text-xs font-medium rounded-lg transition-all glass hover:bg-surface-light"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
