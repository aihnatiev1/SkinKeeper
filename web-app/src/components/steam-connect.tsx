'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, LogOut, Wallet, AlertTriangle, RefreshCw } from 'lucide-react';
import { useSteamStatus } from '@/lib/use-desktop';
import { getDesktopAPI } from '@/lib/desktop';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';

export function SteamConnect() {
  const { status, loading: statusLoading } = useSteamStatus();
  const user = useAuthStore((s) => s.user);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const startQR = async () => {
    const api = getDesktopAPI();
    if (!api) return;
    setQrLoading(true);
    setQrUrl(null);
    try {
      await api.steam.loginWithQR();
      // QR URL arrives via steam:qr-code event
    } catch {
      toast.error('Failed to generate QR code');
      setQrLoading(false);
    }
  };

  useEffect(() => {
    const api = getDesktopAPI();
    if (!api || status.loggedIn) return;

    // Auto-start QR on mount
    startQR();

    const unsubQR = api.on('steam:qr-code', (url: string) => {
      setQrUrl(url);
      setQrLoading(false);
    });

    return unsubQR;
  }, [status.loggedIn]);

  const handleLogout = async () => {
    const api = getDesktopAPI();
    if (!api) return;
    await api.steam.logout();
    setQrUrl(null);
    toast.success('Disconnected from Steam');
  };

  if (statusLoading) {
    return (
      <div className="glass rounded-2xl border border-border/50 p-6 flex items-center gap-3">
        <Loader2 size={18} className="animate-spin text-muted" />
        <span className="text-sm text-muted">Checking Steam status...</span>
      </div>
    );
  }

  // Connected
  if (status.loggedIn) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-profit/20 p-6"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-profit/10 flex items-center justify-center">
              <CheckCircle2 size={20} className="text-profit" />
            </div>
            <div>
              <p className="font-bold flex items-center gap-2">
                {status.personaName || user?.display_name || 'Steam Connected'}
                <span className="text-xs bg-profit/10 text-profit px-2 py-0.5 rounded-full font-semibold">Online</span>
              </p>
              <p className="text-xs text-muted font-mono">{status.steamId}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {status.wallet && (
              <div className="flex items-center gap-1.5 text-sm text-muted">
                <Wallet size={14} />
                <span className="font-medium">{status.wallet.balance.toFixed(2)} {status.wallet.currency}</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-loss hover:bg-loss/10 rounded-lg transition-colors"
            >
              <LogOut size={14} /> Disconnect
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Disconnected — QR code
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-loss/20 overflow-hidden"
    >
      {/* Warning header */}
      <div className="px-6 py-4 border-b border-loss/10 flex items-center gap-3 bg-loss/5">
        <AlertTriangle size={16} className="text-loss shrink-0" />
        <div>
          <p className="text-sm font-bold text-loss">Steam not connected</p>
          <p className="text-xs text-muted">Storage units, GC features and trades require Steam connection</p>
        </div>
      </div>

      {/* QR */}
      <div className="p-6 flex flex-col items-center gap-4">
        <p className="text-sm text-muted text-center">
          Scan with the <strong className="text-foreground">Steam Mobile App</strong> → Steam Guard → QR Code
        </p>

        {qrLoading ? (
          <div className="w-48 h-48 flex items-center justify-center glass rounded-2xl">
            <Loader2 size={32} className="animate-spin text-muted" />
          </div>
        ) : qrUrl ? (
          <div className="p-3 bg-white rounded-2xl shadow-lg">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`}
              alt="Steam QR Code"
              className="w-44 h-44"
            />
          </div>
        ) : (
          <div className="w-48 h-48 flex items-center justify-center glass rounded-2xl">
            <span className="text-xs text-muted">No QR available</span>
          </div>
        )}

        <button
          onClick={startQR}
          disabled={qrLoading}
          className="flex items-center gap-2 text-xs text-primary hover:text-primary-hover font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={qrLoading ? 'animate-spin' : ''} />
          Refresh QR Code
        </button>

        <p className="text-[11px] text-muted/60 text-center">
          QR codes expire after ~30 seconds. Your credentials are never shared with SkinKeeper.
        </p>
      </div>
    </motion.div>
  );
}
