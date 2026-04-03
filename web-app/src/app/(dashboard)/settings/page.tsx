'use client';

import { Header } from '@/components/header';
import { useAuthStore, useUIStore } from '@/lib/store';
import { useAccounts, useSwitchAccount } from '@/lib/hooks';
import { api, authApi } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { Crown, LogOut, Globe, CreditCard, Link2, Check, Sparkles, Shield, Zap, ExternalLink, Loader2 } from 'lucide-react';
import { CURRENCY_SYMBOLS } from '@/lib/constants';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useState, useEffect, Suspense } from 'react';
import { useIsDesktop } from '@/lib/use-desktop';
import { SteamConnect } from '@/components/steam-connect';

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
  const switchAccount = useSwitchAccount();
  const isDesktopApp = useIsDesktop();
  const [checkoutLoading, setCheckoutLoading] = useState<'monthly' | 'yearly' | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Handle Stripe redirect results
  useEffect(() => {
    const stripeResult = searchParams.get('stripe');
    if (stripeResult === 'success') {
      toast.success('Subscription activated! Welcome to PRO.');
      router.replace('/settings');
    } else if (stripeResult === 'cancelled') {
      toast('Checkout cancelled');
      router.replace('/settings');
    }
  }, [searchParams, router]);

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

  const handleStripeCheckout = async (plan: 'monthly' | 'yearly') => {
    setCheckoutLoading(plan);
    try {
      const { url } = await api.post<{ url: string; sessionId: string }>('/stripe/checkout', { plan });
      if (url) {
        window.location.href = url;
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to start checkout');
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { url } = await api.post<{ url: string }>('/stripe/portal');
      if (url) {
        window.location.href = url;
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to open portal');
    }
    setPortalLoading(false);
  };

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
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
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
                  <span className="text-xs text-profit flex items-center gap-1 font-semibold">
                    <Check size={12} /> Active
                  </span>
                ) : (
                  <button
                    onClick={() => handleSwitch(acc.id)}
                    className="text-xs text-primary hover:text-primary-hover font-semibold transition-colors"
                  >
                    Switch
                  </button>
                )}
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
                Unlock P&L analytics, bulk sell, 20 alerts, CSV export, push notifications, and more.
              </p>
              <ul className="grid grid-cols-2 gap-2 text-sm mb-6">
                {[
                  'P&L Analytics',
                  'Real Market Prices',
                  'Push Notifications',
                  'CSV Export',
                  '20 Price Alerts',
                  'Advanced Charts',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-1.5">
                    <Check size={14} className="text-primary shrink-0" />
                    <span className="text-muted">{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-3">
                <button
                  onClick={() => handleStripeCheckout('monthly')}
                  disabled={!!checkoutLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-bold transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] disabled:opacity-60"
                >
                  {checkoutLoading === 'monthly' && <Loader2 size={14} className="animate-spin" />}
                  $4.99/month
                </button>
                <button
                  onClick={() => handleStripeCheckout('yearly')}
                  disabled={!!checkoutLoading}
                  className="flex items-center gap-2 px-6 py-2.5 glass border border-primary/20 hover:border-primary text-foreground rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                >
                  {checkoutLoading === 'yearly' && <Loader2 size={14} className="animate-spin" />}
                  $29.99/year <span className="text-profit">(-50%)</span>
                </button>
              </div>
              <p className="text-xs text-muted mt-3 flex items-center gap-1">
                <Shield size={12} />
                Secure payment via Stripe. Cancel anytime.
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
            <div className="flex items-center justify-between mb-4">
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
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl glass hover:bg-surface-light transition-colors disabled:opacity-60"
              >
                {portalLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                Manage Subscription
              </button>
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
      </div>
    </div>
  );
}
