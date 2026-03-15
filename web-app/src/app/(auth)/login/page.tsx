'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { API_BASE } from '@/lib/constants';
import { authApi } from '@/lib/api';

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

  const [status, setStatus] = useState<'idle' | 'waiting' | 'error'>('idle');
  const [nonce, setNonce] = useState<string | null>(null);

  const startLogin = useCallback(async () => {
    try {
      // Get nonce from backend — this starts the polling session
      const res = await fetch(`${API_BASE}/api/auth/qr/start`, { method: 'POST' });
      const data = await res.json();
      const loginNonce = data.nonce;
      setNonce(loginNonce);
      setStatus('waiting');

      // Build Steam OpenID URL
      const returnTo = `${API_BASE}/api/auth/steam/callback?nonce=${loginNonce}`;
      const params = new URLSearchParams({
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'checkid_setup',
        'openid.return_to': returnTo,
        'openid.realm': API_BASE,
        'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
      });

      // Open Steam login in new window
      const steamUrl = `https://steamcommunity.com/openid/login?${params}`;
      window.open(steamUrl, 'steam_login', 'width=800,height=600');
    } catch {
      setStatus('error');
    }
  }, []);

  // Poll for login result
  useEffect(() => {
    if (!nonce || status !== 'waiting') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/steam/poll/${nonce}`);
        const data = await res.json();

        if (data.token) {
          clearInterval(interval);
          // Store token in httpOnly cookie
          await authApi.setSession(data.token);
          router.push(redirect);
        }
      } catch {
        // Keep polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [nonce, status, redirect, router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-xl">
            SK
          </div>
          <span className="text-2xl font-bold">SkinKeeper</span>
        </div>

        <div className="bg-surface rounded-2xl p-8 border border-border text-center">
          <h2 className="text-xl font-semibold mb-2">Sign in</h2>
          <p className="text-sm text-muted mb-8">
            Log in with your Steam account to get started.
          </p>

          {status === 'idle' && (
            <button
              onClick={startLogin}
              className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-[#171A21] hover:bg-[#2A475E] text-white rounded-xl font-medium transition-colors"
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
                <span className="text-sm font-medium">Waiting for Steam login...</span>
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
                className="text-sm text-primary hover:text-primary-hover transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted text-center mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}
