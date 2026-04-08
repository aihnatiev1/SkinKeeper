'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';

interface SteamQRModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const STEAM_ICON = (
  <svg width="32" height="32" viewBox="0 0 256 259" fill="#66c0f4">
    <path d="M127.779 0C57.865 0 .947 54.087.017 123.057l68.641 28.359a35.899 35.899 0 0 1 20.42-6.348l30.63-44.399v-.623c0-27.705 22.53-50.243 50.237-50.243 27.724 0 50.254 22.538 50.254 50.271 0 27.724-22.53 50.254-50.254 50.254h-1.16l-43.688 31.193c0 .402.017.804.017 1.188 0 20.793-16.89 37.7-37.7 37.7-18.419 0-33.868-13.27-37.134-30.773L1.932 163.86C17.28 218.24 67.826 258.384 127.779 258.384c70.693 0 128.034-57.333 128.034-128.026v-.166C255.813 57.35 198.472 0 127.779 0" />
  </svg>
);

export function SteamQRModal({ open, onClose, onSuccess }: SteamQRModalProps) {
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

      // Start polling
      pollRef.current = setInterval(async () => {
        if (!nonceRef.current) return;
        try {
          const pollRes = await fetch(`/api/proxy/session/qr/poll/${nonceRef.current}`);
          const pollData = await pollRes.json();
          if (pollData.status === 'authenticated') {
            cleanup();
            onSuccess();
          } else if (pollData.status === 'expired') {
            // Auto-refresh QR silently
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative glass-strong rounded-2xl border border-border/50 p-8 w-full max-w-sm text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col items-center gap-5">
          {STEAM_ICON}

          <div>
            <h3 className="text-lg font-bold">Connect Steam Session</h3>
            <p className="text-xs text-muted mt-1.5">
              Scan this QR code with the <span className="text-foreground font-medium">Steam Mobile App</span>
            </p>
          </div>

          {/* QR area */}
          <div className="relative w-[200px] h-[200px] rounded-xl overflow-hidden" style={{ background: '#1a1d25' }}>
            {qrImage && (
              <img src={qrImage} alt="Steam QR" className="w-full h-full" />
            )}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#1a1d25' }}>
                <Loader2 size={28} className="animate-spin text-primary" />
              </div>
            )}
          </div>

          {error ? (
            <div className="space-y-2">
              <p className="text-xs text-loss">{error}</p>
              <button
                onClick={startQR}
                className="text-xs text-primary font-semibold hover:underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-muted">
              QR refreshes automatically. Open Steam on your phone and scan.
            </p>
          )}

          {/* OpenID fallback */}
          <div className="w-full pt-3 border-t border-border/20 space-y-2">
            <p className="text-[11px] text-muted/60">
              No Steam app? Sign in via browser — limited functionality (no sell/trade)
            </p>
            <button
              onClick={() => {
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
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:brightness-125 active:scale-[0.98]"
              style={{ background: '#171A21', color: '#fff' }}
            >
              <svg width="14" height="14" viewBox="0 0 256 259" fill="currentColor">
                <path d="M127.779 0C57.865 0 .947 54.087.017 123.057l68.641 28.359a35.899 35.899 0 0 1 20.42-6.348l30.63-44.399v-.623c0-27.705 22.53-50.243 50.237-50.243 27.724 0 50.254 22.538 50.254 50.271 0 27.724-22.53 50.254-50.254 50.254h-1.16l-43.688 31.193c0 .402.017.804.017 1.188 0 20.793-16.89 37.7-37.7 37.7-18.419 0-33.868-13.27-37.134-30.773L1.932 163.86C17.28 218.24 67.826 258.384 127.779 258.384c70.693 0 128.034-57.333 128.034-128.026v-.166C255.813 57.35 198.472 0 127.779 0" />
              </svg>
              Sign in with Steam
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
