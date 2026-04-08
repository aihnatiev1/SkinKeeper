'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2, Puzzle, Monitor, ArrowLeftRight, Store, RefreshCw, Check, Download, AlertCircle, QrCode } from 'lucide-react';

interface SteamSessionModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const STEAM_ICON = (
  <svg width="28" height="28" viewBox="0 0 256 259" fill="#66c0f4">
    <path d="M127.779 0C57.865 0 .947 54.087.017 123.057l68.641 28.359a35.899 35.899 0 0 1 20.42-6.348l30.63-44.399v-.623c0-27.705 22.53-50.243 50.237-50.243 27.724 0 50.254 22.538 50.254 50.271 0 27.724-22.53 50.254-50.254 50.254h-1.16l-43.688 31.193c0 .402.017.804.017 1.188 0 20.793-16.89 37.7-37.7 37.7-18.419 0-33.868-13.27-37.134-30.773L1.932 163.86C17.28 218.24 67.826 258.384 127.779 258.384c70.693 0 128.034-57.333 128.034-128.026v-.166C255.813 57.35 198.472 0 127.779 0" />
  </svg>
);

type Tab = 'extension' | 'desktop' | 'qr';

export function SteamSessionModal({ open, onClose, onSuccess }: SteamSessionModalProps) {
  const [tab, setTab] = useState<Tab>('extension');

  useEffect(() => {
    if (open) setTab('extension');
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative glass-strong rounded-2xl border border-border/50 w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors z-10"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="p-6 pb-4 text-center">
          <div className="flex justify-center mb-3">{STEAM_ICON}</div>
          <h3 className="text-lg font-bold">Connect Steam Session</h3>
          <p className="text-xs text-muted mt-1.5">Enable trading, market access, and live inventory sync</p>

          <div className="flex items-center justify-center gap-3 mt-3">
            {[
              { icon: <ArrowLeftRight size={11} />, label: 'Trading' },
              { icon: <Store size={11} />, label: 'Market' },
              { icon: <RefreshCw size={11} />, label: 'Live Sync' },
            ].map((f) => (
              <span
                key={f.label}
                className="flex items-center gap-1 text-[10px] text-muted px-2 py-1 rounded-full bg-surface-light/50"
              >
                {f.icon} {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/30 px-6">
          {([
            { key: 'extension' as Tab, icon: <Puzzle size={13} />, label: 'Extension' },
            { key: 'desktop' as Tab, icon: <Monitor size={13} />, label: 'Desktop App' },
            { key: 'qr' as Tab, icon: <QrCode size={13} />, label: 'QR Code' },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'text-primary border-primary'
                  : 'text-muted border-transparent hover:text-foreground'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          {tab === 'extension' ? (
            <ExtensionTab onSuccess={onSuccess} />
          ) : tab === 'desktop' ? (
            <DesktopTab />
          ) : (
            <QRTab onSuccess={onSuccess} open={open && tab === 'qr'} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Extension Tab ───────────────────────────────────────────────────

/** Try to PING extension via chrome.runtime.sendMessage */
function pingExtension(extId: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const cr = (window as any).chrome?.runtime;
      if (!cr?.sendMessage) { resolve(false); return; }
      cr.sendMessage(extId, { type: 'PING' }, (res: any) => {
        if (cr.lastError) { resolve(false); return; }
        resolve(!!res?.ok);
      });
    } catch { resolve(false); }
  });
}

function ExtensionTab({ onSuccess }: { onSuccess: () => void }) {
  // 'checking' → 'not_installed' → 'installed' → 'connecting' → 'success'
  const [state, setState] = useState<'checking' | 'not_installed' | 'installed' | 'connecting' | 'success'>('checking');
  const [extId, setExtId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll for extension: check window flag + try PING
  useEffect(() => {
    let active = true;

    const detect = async () => {
      // Method 1: content script flag
      const w = window as any;
      if (w.__SK_EXT && w.__SK_EXT_ID) {
        if (active) { setExtId(w.__SK_EXT_ID); setState('installed'); }
        return true;
      }
      // Method 2: try PING with known ID from content script
      if (w.__SK_EXT_ID) {
        const ok = await pingExtension(w.__SK_EXT_ID);
        if (ok && active) { setExtId(w.__SK_EXT_ID); setState('installed'); return true; }
      }
      return false;
    };

    // Initial check
    detect().then((found) => {
      if (!found && active) setState('not_installed');
    });

    // Keep polling every 2s (catches: extension installed mid-modal, slow content script)
    const interval = setInterval(async () => {
      const found = await detect();
      if (found) clearInterval(interval);
    }, 2000);

    return () => { active = false; clearInterval(interval); };
  }, []);

  const handleConnect = async () => {
    if (!extId) return;
    setState('connecting');
    setError(null);

    try {
      const cr = (window as any).chrome?.runtime;
      if (!cr?.sendMessage) throw new Error('Chrome runtime not available');

      const response = await new Promise<any>((resolve, reject) => {
        cr.sendMessage(extId, { type: 'CONNECT_STEAM_SESSION' }, (res: any) => {
          if (cr.lastError) { reject(new Error(cr.lastError.message)); return; }
          resolve(res);
        });
      });

      if (response?.ok) {
        setState('success');
        setTimeout(() => onSuccess(), 800);
      } else {
        throw new Error(response?.error || 'Connection failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
      setState('installed');
    }
  };

  // ─── Success ────────────────────────────────────────
  if (state === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-12 h-12 rounded-full bg-profit/15 flex items-center justify-center">
          <Check size={24} className="text-profit" />
        </div>
        <p className="text-sm font-semibold text-profit">Steam session connected!</p>
      </div>
    );
  }

  // ─── Checking ───────────────────────────────────────
  if (state === 'checking') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <Loader2 size={20} className="animate-spin text-muted" />
        <p className="text-xs text-muted">Detecting extension...</p>
      </div>
    );
  }

  // ─── Not installed ──────────────────────────────────
  if (state === 'not_installed') {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Puzzle size={24} className="text-primary" />
            </div>
          </div>
          <p className="text-sm font-medium">Install the Browser Extension</p>
          <p className="text-xs text-muted leading-relaxed">
            The extension connects your Steam session automatically.
            Install it, log in to Steam, and you are ready to trade.
          </p>
        </div>

        <a
          href="https://chromewebstore.google.com/detail/skinkeeper-%E2%80%94-cs2-inventor/lbihgifhfhpeahokiegleeknffkihbpd"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-125 active:scale-[0.98]"
          style={{ background: '#2a475e' }}
        >
          <Download size={16} />
          Install Extension
        </a>

        <div className="text-center space-y-1.5">
          <p className="text-[10px] text-muted/50">
            Already installed? The page will detect it automatically.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-[10px] text-primary hover:underline"
          >
            Or refresh the page
          </button>
        </div>

        <SteamOpenIDButton />
      </div>
    );
  }

  // ─── Installed — ready to connect ───────────────────
  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-loss/10 border border-loss/20">
          <AlertCircle size={14} className="text-loss shrink-0 mt-0.5" />
          <p className="text-xs text-loss">{error}</p>
        </div>
      )}

      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl bg-profit/10 flex items-center justify-center">
            <Puzzle size={24} className="text-profit" />
          </div>
        </div>
        <p className="text-sm font-medium">Extension detected</p>
        <p className="text-xs text-muted leading-relaxed">
          Make sure you are <span className="text-foreground font-medium">logged in to Steam</span> in this browser,
          then click Connect.
        </p>
      </div>

      <button
        onClick={handleConnect}
        disabled={state === 'connecting'}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] disabled:opacity-50"
      >
        {state === 'connecting' ? <Loader2 size={16} className="animate-spin" /> : 'Connect Steam Session'}
      </button>

      <p className="text-[10px] text-muted/50 text-center leading-relaxed">
        Reads your Steam cookie securely. Password is never accessed.
      </p>

      <SteamOpenIDButton />
    </div>
  );
}

// ─── Desktop App Tab ─────────────────────────────────────────────────

function DesktopTab() {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
            <Monitor size={24} className="text-accent" />
          </div>
        </div>
        <p className="text-sm font-medium">Get the Desktop App</p>
        <p className="text-xs text-muted leading-relaxed">
          Full Steam session with no browser warnings. Plus exclusive features:
        </p>
      </div>

      <div className="space-y-1.5">
        {[
          'Trade & sell on Steam Market',
          'Transfer items between storage units',
          'Real-time inventory tracking',
          'Background price monitoring',
        ].map((f) => (
          <div key={f} className="flex items-center gap-2 text-xs text-muted">
            <Check size={12} className="text-profit shrink-0" />
            <span>{f}</span>
          </div>
        ))}
      </div>

      <a
        href="/download"
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
      >
        <Download size={16} />
        Download for Free
      </a>

      <p className="text-[10px] text-muted/50 text-center">
        Available for Windows, macOS, and Linux
      </p>
    </div>
  );
}

// ─── Steam OpenID Button (limited functionality fallback) ────────────

function SteamOpenIDButton() {
  const handleOpenID = () => {
    const callbackBase = window.location.origin;
    const isDev = callbackBase.includes('localhost');
    const returnTo = isDev
      ? `${callbackBase}/api/proxy/auth/steam/callback?popup=1`
      : `https://api.skinkeeper.store/api/auth/steam/callback?popup=1`;
    const realm = isDev ? callbackBase : 'https://api.skinkeeper.store';
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': realm,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });
    window.open(
      `https://steamcommunity.com/openid/login?${params}`,
      'steam_login',
      'width=800,height=600'
    );
  };

  return (
    <div className="pt-3 border-t border-border/20 space-y-2">
      <button
        onClick={handleOpenID}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all hover:brightness-125 active:scale-[0.98]"
        style={{ background: '#171A21', color: '#fff' }}
      >
        <svg width="14" height="14" viewBox="0 0 256 259" fill="currentColor">
          <path d="M127.779 0C57.865 0 .947 54.087.017 123.057l68.641 28.359a35.899 35.899 0 0 1 20.42-6.348l30.63-44.399v-.623c0-27.705 22.53-50.243 50.237-50.243 27.724 0 50.254 22.538 50.254 50.271 0 27.724-22.53 50.254-50.254 50.254h-1.16l-43.688 31.193c0 .402.017.804.017 1.188 0 20.793-16.89 37.7-37.7 37.7-18.419 0-33.868-13.27-37.134-30.773L1.932 163.86C17.28 218.24 67.826 258.384 127.779 258.384c70.693 0 128.034-57.333 128.034-128.026v-.166C255.813 57.35 198.472 0 127.779 0" />
        </svg>
        Sign in with Steam
      </button>
      <p className="text-[10px] text-muted/40 text-center">
        Read-only access — trading and market features require the extension
      </p>
    </div>
  );
}

// ─── QR Tab ──────────────────────────────────────────────────────────

function QRTab({ onSuccess, open }: { onSuccess: () => void; open: boolean }) {
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nonceRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    nonceRef.current = null;
  }, []);

  const startQR = useCallback(async () => {
    cleanup();
    setLoading(true);
    setError(null);
    setQrImage(null);

    try {
      const res = await fetch('/api/proxy/session/qr/start', { method: 'POST' });
      const data = await res.json();
      if (!mountedRef.current) return;

      if (!data.nonce || !data.qrImage) {
        setError('Failed to generate QR. Try again.');
        setLoading(false);
        return;
      }

      nonceRef.current = data.nonce;
      setQrImage(data.qrImage);
      setLoading(false);

      pollRef.current = setInterval(async () => {
        if (!nonceRef.current) return;
        try {
          const pollRes = await fetch(`/api/proxy/session/qr/poll/${nonceRef.current}`);
          const pollData = await pollRes.json();
          if (pollData.status === 'authenticated') {
            cleanup();
            onSuccess();
          } else if (pollData.status === 'expired') {
            if (mountedRef.current) startQR();
          }
        } catch {}
      }, 2000);
    } catch {
      if (mountedRef.current) {
        setError('Connection error. Try again.');
        setLoading(false);
      }
    }
  }, [cleanup, onSuccess]);

  useEffect(() => {
    mountedRef.current = true;
    if (open) startQR();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [open, startQR, cleanup]);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs text-muted text-center">
        Scan with the <span className="text-foreground font-medium">Steam Mobile App</span>
      </p>

      <div className="relative w-[180px] h-[180px] rounded-xl overflow-hidden" style={{ background: '#1a1d25' }}>
        {qrImage && <img src={qrImage} alt="Steam QR" className="w-full h-full" />}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#1a1d25' }}>
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}
      </div>

      {error ? (
        <div className="space-y-2 text-center">
          <p className="text-xs text-loss">{error}</p>
          <button onClick={startQR} className="text-xs text-primary font-semibold hover:underline">
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-2 text-center">
          <p className="text-[11px] text-muted">
            QR refreshes automatically. Open Steam on your phone and scan.
          </p>
          <p className="text-[10px] text-warning/70">
            Steam may show an "unusual sign-in" notice — this is normal and safe to confirm.
          </p>
        </div>
      )}
    </div>
  );
}
