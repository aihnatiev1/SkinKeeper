'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { useAutoConnectExtension } from '@/lib/use-auto-connect-extension';

/**
 * Slim top banner shown when the extension is installed but the user is
 * signed out of Steam in the browser. We send them to steamcommunity.com
 * with a `sk_connect` marker — the extension's loginBanner content script
 * picks that up and shows a branded "Sign in to connect SkinKeeper" banner
 * on the Steam page itself. The cookie watcher in the background will then
 * auto-save the session as soon as Steam sets `steamLoginSecure`, and
 * broadcast back to this tab so the UI flips to connected without a click.
 */
export function AutoConnectBanner() {
  const { status } = useAutoConnectExtension();
  const [origin, setOrigin] = useState('https://skinkeeper.store');

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  if (status !== 'no_steam_login') return null;

  const steamUrl = `https://steamcommunity.com/login/home/?sk_connect=${encodeURIComponent(origin)}`;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-warning/10 border-b border-warning/30 text-xs">
      <AlertTriangle size={14} className="text-warning shrink-0" />
      <span className="text-warning font-semibold shrink-0">Steam not connected</span>
      <span className="text-muted flex-1 truncate">
        Sign in to Steam in this browser to enable trading and live inventory sync.
      </span>
      <a
        href={steamUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-warning/20 text-warning font-semibold hover:bg-warning/30 transition-colors shrink-0"
      >
        Open Steam
        <ExternalLink size={11} />
      </a>
    </div>
  );
}
