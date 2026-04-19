'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Loader2, Shield, ArrowLeft, RefreshCw, CheckCircle2 } from 'lucide-react';
import { authApi } from '@/lib/api';
import { isDesktop, getDesktopAPI } from '@/lib/desktop';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/portfolio';
  const isLogout = searchParams.get('logout') === '1';

  // Redirect if already logged in
  useEffect(() => {
    if (isLogout) return;
    authApi.getSession().then((s) => {
      if (s.authenticated) router.replace(redirect);
    });
  }, [isLogout, redirect, router]);

  const [status, setStatus] = useState<'idle' | 'waiting' | 'error'>('idle');
  const [nonce, setNonce] = useState<string | null>(null);

  // Desktop-only: Steam Guard QR for GC connection
  const [desktop, setDesktop] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [gcConnected, setGcConnected] = useState(false);

  // Desktop auth progress: null | 'connecting' | 'authenticating' | 'redirecting'
  type DesktopStep = null | 'connecting' | 'authenticating' | 'redirecting';
  const [desktopStep, setDesktopStep] = useState<DesktopStep>(null);

  const STEPS: { key: DesktopStep; label: string }[] = [
    { key: 'connecting',    label: 'Steam connected' },
    { key: 'authenticating', label: 'Authenticating' },
    { key: 'redirecting',   label: 'Entering SkinKeeper' },
  ];

  const startQR = useCallback(async () => {
    const api = getDesktopAPI();
    if (!api) return;
    setQrLoading(true);
    setQrUrl(null);
    await api.steam.loginWithQR();
  }, []);

  useEffect(() => {
    setDesktop(isDesktop());
  }, []);

  useEffect(() => {
    if (!desktop) return;
    const api = getDesktopAPI();
    if (!api) return;

    // Check if already connected — if web session exists, auth immediately
    // Skip if user explicitly signed out (?logout=1)
    api.steam.getStatus().then(async s => {
      if (!s.loggedIn || isLogout) return;
      setGcConnected(true);
      setDesktopStep('connecting');

      // Poll for web session — webSession event may fire slightly after loggedOn
      const getSession = async () => {
        for (let i = 0; i < 10; i++) {
          const ws = await api.steam.getWebSession();
          if (ws?.steamLoginSecure) return ws;
          await new Promise(r => setTimeout(r, 500));
        }
        return null;
      };

      try {
        const ws = await getSession();
        if (!ws?.steamLoginSecure) return; // will be handled by steam:web-session event
        setDesktopStep('authenticating');
        const res = await fetch('/api/proxy/auth/desktop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ steamLoginSecure: ws.steamLoginSecure, sessionId: ws.sessionId }),
        });
        const json = await res.json();
        if (json.token) {
          setDesktopStep('redirecting');
          await authApi.setSession(json.token);
          router.push(redirect);
        }
      } catch (err) {
        console.warn('[Login] Desktop auto-auth failed:', err);
        setDesktopStep(null);
      }
    });

    // Listen for QR code URL
    const unsubQR = api.on('steam:qr-code', (url: string) => {
      setQrUrl(url);
      setQrLoading(false);
    });

    // Listen for successful GC connection
    const unsubStatus = api.on('steam:status-changed', (s: { loggedIn: boolean }) => {
      if (s.loggedIn) {
        setGcConnected(true);
        setDesktopStep('connecting');
      }
    });

    // webSession fires after QR — use cookies to get JWT directly
    const unsubWebSession = api.on('steam:web-session', async (data: { steamLoginSecure: string; sessionId: string | null }) => {
      if (!data?.steamLoginSecure || isLogout) return;
      setDesktopStep('authenticating');
      try {
        const res = await fetch('/api/proxy/auth/desktop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ steamLoginSecure: data.steamLoginSecure, sessionId: data.sessionId }),
        });
        const json = await res.json();
        if (json.token) {
          setDesktopStep('redirecting');
          await authApi.setSession(json.token);
          router.push(redirect);
        }
      } catch (err) {
        console.error('[Login] Desktop auth failed:', err);
        setDesktopStep(null);
      }
    });

    // Auto-start QR
    startQR();

    return () => { unsubQR(); unsubStatus(); unsubWebSession(); };
  }, [desktop, startQR]);

  const startLogin = useCallback(async (existingPopup?: Window | null) => {
    // Open popup synchronously (in click handler) to avoid browser popup blockers
    const popup = existingPopup || window.open('about:blank', 'steam_login', 'width=800,height=600');

    try {
      // Use our proxy to avoid CORS/CloudFlare issues
      const res = await fetch('/api/proxy/auth/qr/start', { method: 'POST' });
      const data = await res.json();
      const loginNonce = data.nonce;
      setNonce(loginNonce);
      setStatus('waiting');

      // In dev, route Steam callback through Next.js proxy so it hits local backend
      const callbackBase = typeof window !== 'undefined' ? window.location.origin : 'https://api.skinkeeper.store';
      const isDev = callbackBase.includes('localhost');
      const returnTo = isDev
        ? `${callbackBase}/api/proxy/auth/steam/callback?nonce=${loginNonce}&popup=1`
        : `https://api.skinkeeper.store/api/auth/steam/callback?nonce=${loginNonce}&popup=1`;
      const realm = isDev ? callbackBase : 'https://api.skinkeeper.store';
      const params = new URLSearchParams({
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'checkid_setup',
        'openid.return_to': returnTo,
        'openid.realm': realm,
        'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
      });

      const steamUrl = `https://steamcommunity.com/openid/login?${params}`;
      if (popup && !popup.closed) {
        popup.location.href = steamUrl;
      } else {
        // Popup was blocked — fall back to redirect in same window
        window.location.href = steamUrl;
      }
    } catch {
      popup?.close();
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!nonce || status !== 'waiting') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/proxy/auth/steam/poll/${nonce}`);
        const data = await res.json();

        if (data.token) {
          clearInterval(interval);
          await authApi.setSession(data.token);
          router.push(redirect);
        } else if (data.status === 'error') {
          clearInterval(interval);
          setStatus('error');
          setNonce(null);
        }
      } catch {
        // Keep polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [nonce, status, redirect, router]);

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Nav bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-strong">
        <div className="flex items-center justify-between px-6 lg:px-16 h-16 max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
              SK
            </div>
            <span className="text-lg font-bold">SkinKeeper</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            Back to home
          </Link>
        </div>
      </nav>

      {/* Background */}
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute inset-0 dot-pattern opacity-20" />

      {/* Floating skin images */}
      <div className="absolute top-[15%] left-[8%] w-32 h-32 rounded-full bg-primary/10 blur-2xl animate-float pointer-events-none hidden md:block" />
      <div className="absolute bottom-[20%] right-[10%] w-28 h-28 rounded-full bg-accent/8 blur-3xl animate-float-delayed pointer-events-none hidden md:block" />

      <div className="flex-1 flex items-center justify-center px-4">

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Logo — link to home */}
        <a href="/" className="flex items-center justify-center gap-3 mb-10 group">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-2xl shadow-xl shadow-primary/30 group-hover:shadow-primary/50 transition-shadow">
            SK
          </div>
        </a>

        <div className="glass-strong rounded-2xl p-8 text-center glow-primary">
          <h2 className="text-xl font-bold mb-2">Welcome to SkinKeeper</h2>
          <p className="text-sm text-muted mb-8">
            Sign in with your Steam account to get started.
          </p>

          {status === 'idle' && (
            <button
              onClick={() => startLogin()}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-[#171A21] hover:bg-[#2A475E] text-white rounded-xl font-semibold transition-all hover:shadow-lg active:scale-[0.98]"
            >
              <svg width="20" height="20" viewBox="0 0 256 259" fill="currentColor">
                <path d="M127.779 0C57.865 0 .947 54.087.017 123.057l68.641 28.359a35.899 35.899 0 0 1 20.42-6.348l30.63-44.399v-.623c0-27.705 22.53-50.243 50.237-50.243 27.724 0 50.254 22.538 50.254 50.271 0 27.724-22.53 50.254-50.254 50.254h-1.16l-43.688 31.193c0 .402.017.804.017 1.188 0 20.793-16.89 37.7-37.7 37.7-18.419 0-33.868-13.27-37.134-30.773L1.932 163.86C17.28 218.24 67.826 258.384 127.779 258.384c70.693 0 128.034-57.333 128.034-128.026v-.166C255.813 57.35 198.472 0 127.779 0" />
              </svg>
              Sign in with Steam
            </button>
          )}

          {status === 'waiting' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-primary">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm font-semibold">Waiting for Steam login...</span>
              </div>
              <p className="text-xs text-muted">
                Complete the login in the Steam window. This page will update automatically.
              </p>
              <button
                onClick={() => {
                  setStatus('idle');
                  setNonce(null);
                }}
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <p className="text-sm text-loss">Something went wrong. Please try again.</p>
              <button
                onClick={() => setStatus('idle')}
                className="text-sm text-primary hover:text-primary-hover transition-colors font-semibold"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-muted">
          <Shield size={12} />
          <p>Secure Steam OpenID — we never see your password.</p>
        </div>

        {/* Desktop-only: Steam Guard QR for GC connection */}
        {desktop && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-4 glass-strong rounded-2xl p-6 text-center"
          >
            {desktopStep ? (
              /* Progress steps */
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-2">
                  {STEPS.map((step, i) => {
                    const stepIndex = STEPS.findIndex(s => s.key === desktopStep);
                    const done = i < stepIndex;
                    const active = i === stepIndex;
                    return (
                      <div key={step.key} className="flex items-center gap-2">
                        <div className="flex flex-col items-center gap-1.5">
                          <motion.div
                            initial={{ scale: 0.8, opacity: 0.4 }}
                            animate={active ? { scale: [1, 1.15, 1], opacity: 1 } : done ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0.3 }}
                            transition={active ? { duration: 1, repeat: Infinity } : { duration: 0.3 }}
                            className={`w-3 h-3 rounded-full ${done ? 'bg-profit' : active ? 'bg-profit' : 'bg-white/20'}`}
                          />
                          <span className={`text-[10px] font-medium whitespace-nowrap transition-colors ${active ? 'text-profit' : done ? 'text-profit/70' : 'text-white/30'}`}>
                            {step.label}
                          </span>
                        </div>
                        {i < STEPS.length - 1 && (
                          <motion.div
                            animate={{ opacity: done ? 1 : 0.2 }}
                            className="w-8 h-px bg-profit mb-4"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                {desktopStep === 'redirecting' && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-profit/80 flex items-center gap-1.5"
                  >
                    <Loader2 size={11} className="animate-spin" />
                    Opening SkinKeeper...
                  </motion.p>
                )}
              </div>
            ) : gcConnected ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 size={28} className="text-profit" />
                <p className="text-sm font-semibold text-profit">Steam connected!</p>
                <p className="text-xs text-muted">Authenticating...</p>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold mb-1">Connect Steam Guard</p>
                <p className="text-xs text-muted mb-4">
                  Scan with <strong className="text-foreground">Steam Mobile App → Steam Guard → QR</strong>
                </p>

                <div className="flex justify-center mb-3">
                  {qrLoading ? (
                    <div className="w-36 h-36 flex items-center justify-center glass rounded-xl">
                      <Loader2 size={24} className="animate-spin text-muted" />
                    </div>
                  ) : qrUrl ? (
                    <div className="p-2 bg-white rounded-xl shadow-md">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=144x144&data=${encodeURIComponent(qrUrl)}`}
                        alt="Steam Guard QR"
                        className="w-36 h-36"
                      />
                    </div>
                  ) : (
                    <div className="w-36 h-36 flex items-center justify-center glass rounded-xl">
                      <span className="text-xs text-muted">—</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={startQR}
                  disabled={qrLoading}
                  className="flex items-center gap-1.5 mx-auto text-xs text-muted hover:text-foreground transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={11} className={qrLoading ? 'animate-spin' : ''} />
                  Refresh QR
                </button>

                <p className="text-[10px] text-muted/50 mt-3">
                  Optional — enables storage unit transfers. Skip to sign in only.
                </p>
              </>
            )}
          </motion.div>
        )}
      </motion.div>
      </div>
    </div>
  );
}
