'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gamepad2,
  QrCode,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  LogOut,
  Wallet,
  ShieldCheck,
} from 'lucide-react';
import { useSteamStatus, useSteamLogin } from '@/lib/use-desktop';
import { getDesktopAPI } from '@/lib/desktop';
import { toast } from 'sonner';

type Tab = 'qr' | 'credentials';

export function SteamConnect() {
  const { status, loading: statusLoading } = useSteamStatus();
  const {
    loginWithCredentials,
    loginWithQR,
    logout,
    loading: loginLoading,
    error,
    requiresGuard,
    qrUrl,
  } = useSteamLogin();

  const [tab, setTab] = useState<Tab>('qr');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [guardCode, setGuardCode] = useState('');
  const [guardSubmitting, setGuardSubmitting] = useState(false);

  // Auto-start QR on mount
  useEffect(() => {
    if (!status.loggedIn && tab === 'qr' && !qrUrl && !loginLoading) {
      loginWithQR();
    }
  }, [tab]);

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    await loginWithCredentials(username, password);
  };

  const handleGuardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardCode || guardCode.length < 5) return;
    const api = getDesktopAPI();
    if (!api) return;

    setGuardSubmitting(true);
    try {
      // submit-guard is handled by steam IPC
      const result = await (window as any).skinkeeper.steam.submitGuard?.(guardCode);
      if (result && !result.success) {
        toast.error(result.error || 'Invalid code');
      }
    } catch {
      toast.error('Failed to submit guard code');
    }
    setGuardSubmitting(false);
    setGuardCode('');
  };

  const handleLogout = async () => {
    await logout();
    setUsername('');
    setPassword('');
    setGuardCode('');
    toast.success('Disconnected from Steam');
  };

  if (statusLoading) {
    return (
      <div className="glass rounded-2xl border border-border/50 p-6">
        <div className="flex items-center gap-3">
          <Loader2 size={20} className="animate-spin text-muted" />
          <span className="text-sm text-muted">Checking Steam status...</span>
        </div>
      </div>
    );
  }

  // Connected state
  if (status.loggedIn) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-profit/20 p-6"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-profit/10 flex items-center justify-center">
              <CheckCircle2 size={20} className="text-profit" />
            </div>
            <div>
              <h3 className="font-bold flex items-center gap-2">
                {status.personaName || 'Steam Connected'}
                <span className="text-xs bg-profit/10 text-profit px-2 py-0.5 rounded-full font-semibold">
                  Online
                </span>
              </h3>
              <p className="text-xs text-muted font-mono">{status.steamId}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {status.wallet && (
              <div className="flex items-center gap-1.5 text-sm text-muted">
                <Wallet size={14} />
                <span className="font-medium">
                  {status.wallet.balance.toFixed(2)} {status.wallet.currency}
                </span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-loss hover:bg-loss/10 rounded-lg transition-colors"
            >
              <LogOut size={14} />
              Disconnect
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Steam Guard code input
  if (requiresGuard) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-primary/20 p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-xl bg-primary/10">
            <ShieldCheck size={18} className="text-primary" />
          </div>
          <div>
            <h3 className="font-bold">Steam Guard</h3>
            <p className="text-xs text-muted">Enter the code from your authenticator or email</p>
          </div>
        </div>
        <form onSubmit={handleGuardSubmit} className="space-y-3">
          <input
            type="text"
            value={guardCode}
            onChange={(e) => setGuardCode(e.target.value.toUpperCase())}
            placeholder="XXXXX"
            maxLength={5}
            autoFocus
            className="w-full px-4 py-3 bg-surface-light rounded-xl text-center text-2xl font-mono tracking-[0.5em] border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={guardCode.length < 5 || guardSubmitting}
            className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-bold transition-all disabled:opacity-40"
          >
            {guardSubmitting ? (
              <Loader2 size={16} className="animate-spin mx-auto" />
            ) : (
              'Verify'
            )}
          </button>
        </form>
      </motion.div>
    );
  }

  // Login form
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border/50 overflow-hidden"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gamepad2 size={18} className="text-primary" />
          <h3 className="font-bold">Steam Connection</h3>
        </div>
        <span className="text-xs bg-loss/10 text-loss px-2 py-0.5 rounded-full font-semibold">
          Disconnected
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/30">
        <button
          onClick={() => setTab('qr')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            tab === 'qr'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted hover:text-foreground'
          }`}
        >
          <QrCode size={16} />
          QR Code
        </button>
        <button
          onClick={() => setTab('credentials')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            tab === 'credentials'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted hover:text-foreground'
          }`}
        >
          <KeyRound size={16} />
          Login
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {tab === 'qr' ? (
            <motion.div
              key="qr"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="text-center space-y-4"
            >
              {qrUrl ? (
                <>
                  <div className="inline-flex p-4 bg-white rounded-2xl">
                    {/* QR code rendered as image via Google Charts API */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
                      alt="Steam QR Code"
                      className="w-48 h-48"
                    />
                  </div>
                  <p className="text-sm text-muted">
                    Scan with the <strong>Steam Mobile App</strong> to sign in
                  </p>
                  <button
                    onClick={() => loginWithQR()}
                    className="text-xs text-primary hover:text-primary-hover font-medium transition-colors"
                  >
                    Refresh QR Code
                  </button>
                </>
              ) : loginLoading ? (
                <div className="py-12">
                  <Loader2 size={32} className="animate-spin text-muted mx-auto" />
                  <p className="text-sm text-muted mt-3">Generating QR code...</p>
                </div>
              ) : (
                <div className="py-8">
                  <QrCode size={48} className="mx-auto text-muted/30 mb-4" />
                  <button
                    onClick={() => loginWithQR()}
                    className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-bold transition-all"
                  >
                    Generate QR Code
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="credentials"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
            >
              <form onSubmit={handleCredentialLogin} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Steam username"
                    autoComplete="username"
                    className="w-full px-4 py-2.5 bg-surface-light rounded-xl text-sm border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Steam password"
                      autoComplete="current-password"
                      className="w-full px-4 py-2.5 pr-10 bg-surface-light rounded-xl text-sm border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-loss/10 border border-loss/20 rounded-xl text-sm text-loss">
                    <XCircle size={16} className="shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!username || !password || loginLoading}
                  className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {loginLoading && <Loader2 size={16} className="animate-spin" />}
                  Connect to Steam
                </button>
              </form>

              <p className="text-[11px] text-muted/60 mt-3 text-center">
                Credentials are stored securely in your system keychain. Never sent to SkinKeeper servers.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
