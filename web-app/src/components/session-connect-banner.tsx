'use client';

import { useAccounts } from '@/lib/hooks';
import { useIsDesktop } from '@/lib/use-desktop';
import { AlertTriangle, Monitor, Puzzle, X, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

/**
 * Shows a prominent banner when user has no active Steam session.
 * Without a session, inventory/trades/market features don't work.
 * Guides user to connect via Desktop app or Browser extension.
 */
export function SessionConnectBanner() {
  const { data: accounts } = useAccounts();
  const isDesktop = useIsDesktop();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !accounts) return null;

  // Check if ANY account lacks a session
  const noSession = accounts.some((a) => a.sessionStatus === 'none');
  const allExpired = accounts.length > 0 && accounts.every((a) => a.sessionStatus === 'expired' || a.sessionStatus === 'none');

  if (!noSession && !allExpired) return null;

  return (
    <div className="relative glass-strong rounded-2xl border border-warning/30 p-5 mb-4 overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 bg-gradient-to-r from-warning/5 via-transparent to-orange-500/5" />

      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 p-1 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors z-10"
      >
        <X size={16} />
      </button>

      <div className="relative">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-warning" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Connect your Steam session</h3>
            <p className="text-xs text-muted mt-0.5">
              {noSession
                ? 'Your account is verified but Steam session is not connected. Without it, inventory sync, trades, and market features won\'t work.'
                : 'Your Steam session has expired. Reconnect to keep your data fresh.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Option 1: Desktop app */}
          <div className="glass rounded-xl p-4 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Monitor size={16} className="text-primary" />
              <span className="text-sm font-semibold">Desktop App</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-profit/10 text-profit font-medium">Recommended</span>
            </div>
            <p className="text-xs text-muted mb-3">
              Connects directly to Steam client. Auto-refreshes session. Enables transfers and trade-ups.
            </p>
            {isDesktop ? (
              <Link
                href="/settings"
                className="flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-semibold transition-all"
              >
                Connect in Settings
              </Link>
            ) : (
              <a
                href="https://skinkeeper.store"
                target="_blank"
                rel="noopener"
                className="flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-semibold transition-all"
              >
                Download Desktop App <ExternalLink size={10} />
              </a>
            )}
          </div>

          {/* Option 2: Browser extension */}
          <div className="glass rounded-xl p-4 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Puzzle size={16} className="text-accent" />
              <span className="text-sm font-semibold">Browser Extension</span>
            </div>
            <p className="text-xs text-muted mb-3">
              Syncs your Steam session automatically when you browse Steam. Also adds price overlays and Quick Sell.
            </p>
            <a
              href="https://chromewebstore.google.com/detail/skinkeeper/lbihgifhfhpeahokiegleeknffkihbpd"
              target="_blank"
              rel="noopener"
              className="flex items-center justify-center gap-1.5 w-full px-3 py-2 glass hover:bg-surface-light rounded-lg text-xs font-semibold transition-all"
            >
              Install Extension <ExternalLink size={10} />
            </a>
          </div>
        </div>

        <p className="text-[10px] text-muted mt-3 text-center">
          Both methods are secure — we never see your Steam password. Session is used only for API calls on your behalf.
        </p>
      </div>
    </div>
  );
}
