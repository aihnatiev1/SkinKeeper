'use client';

import { useAccounts } from '@/lib/hooks';
import { AlertTriangle, X, RefreshCw, Puzzle, Monitor } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SteamSessionModal } from './steam-session-modal';

const DISMISS_KEY = 'sk_session_banner_dismissed';

export function SessionConnectBanner() {
  const { data: accounts } = useAccounts();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  const handleSuccess = () => {
    setModalOpen(false);
    toast.success('Steam session connected');
    window.location.reload();
  };

  if (!accounts) return null;

  const noSession = accounts.some((a) => a.sessionStatus === 'none');
  const allExpired = accounts.length > 0 && accounts.every((a) => a.sessionStatus === 'expired' || a.sessionStatus === 'none');
  const someExpired = !noSession && accounts.some((a) => a.sessionStatus === 'expired');

  // Expired session — compact banner
  if (someExpired && !noSession) {
    return (
      <>
        <div className="flex items-center gap-3 glass rounded-xl border border-warning/20 p-3 mb-4">
          <RefreshCw size={16} className="text-warning shrink-0" />
          <p className="text-xs text-muted flex-1">
            Session expired for {accounts.filter(a => a.sessionStatus === 'expired').map((a, i, arr) => <><span key={a.id} className="text-foreground font-semibold">{a.displayName}</span>{i < arr.length - 1 ? ', ' : ''}</>)}.
            Use the <span className="text-foreground font-medium">Extension</span> or <span className="text-foreground font-medium">Desktop App</span> to reconnect.
          </p>
          <button onClick={() => setModalOpen(true)} className="text-xs text-primary font-semibold hover:underline shrink-0">
            Reconnect
          </button>
        </div>
        <SteamSessionModal open={modalOpen} onClose={() => setModalOpen(false)} onSuccess={handleSuccess} />
      </>
    );
  }

  if ((!noSession && !allExpired) || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  return (
    <>
      <div className="relative glass-strong rounded-2xl border border-primary/20 p-5 mb-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5" />

        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors z-10"
        >
          <X size={16} />
        </button>

        <div className="relative">
          <h3 className="font-bold text-sm mb-1.5">Connect your Steam session</h3>
          <p className="text-xs text-muted mb-4">
            To enable trading, market selling, and real-time sync — connect via Extension or Desktop App.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Extension */}
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-3 p-3 glass rounded-xl text-left hover:bg-surface-light/50 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <Puzzle size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold">Browser Extension</p>
                <p className="text-[10px] text-muted">Instant connect, no warnings</p>
              </div>
            </button>

            {/* Desktop App */}
            <a
              href="/download"
              className="flex items-center gap-3 p-3 glass rounded-xl text-left hover:bg-surface-light/50 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
                <Monitor size={18} className="text-accent" />
              </div>
              <div>
                <p className="text-xs font-semibold">Desktop App</p>
                <p className="text-[10px] text-muted">Full access + storage unit transfers</p>
              </div>
            </a>
          </div>
        </div>
      </div>
      <SteamSessionModal open={modalOpen} onClose={() => setModalOpen(false)} onSuccess={handleSuccess} />
    </>
  );
}
