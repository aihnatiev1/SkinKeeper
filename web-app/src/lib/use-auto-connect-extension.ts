'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useHasSession } from './hooks';

const PROD_EXTENSION_ID = 'lbihgifhfhpeahokiegleeknffkihbpd';
const FLAG_KEY = 'sk_auto_connect_attempted';

export type AutoConnectStatus =
  | 'idle'
  | 'attempting'
  | 'connected'
  | 'no_steam_login'
  | 'no_extension'
  | 'error';

function pingExtension(extId: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const cr = (window as { chrome?: { runtime?: { sendMessage?: unknown; lastError?: unknown } } }).chrome?.runtime as
        | { sendMessage?: (id: string, msg: unknown, cb: (res: unknown) => void) => void; lastError?: unknown }
        | undefined;
      if (!cr?.sendMessage) {
        resolve(false);
        return;
      }
      cr.sendMessage(extId, { type: 'PING' }, (res: unknown) => {
        if (cr.lastError) {
          resolve(false);
          return;
        }
        resolve(!!(res as { ok?: boolean })?.ok);
      });
    } catch {
      resolve(false);
    }
  });
}

async function detectExtensionId(): Promise<string | null> {
  const w = window as unknown as { __SK_EXT?: boolean; __SK_EXT_ID?: string };
  if (w.__SK_EXT_ID && w.__SK_EXT) return w.__SK_EXT_ID;
  if (w.__SK_EXT_ID) {
    if (await pingExtension(w.__SK_EXT_ID)) return w.__SK_EXT_ID;
  }
  if (await pingExtension(PROD_EXTENSION_ID)) return PROD_EXTENSION_ID;
  return null;
}

function callConnect(extId: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      const cr = (window as { chrome?: { runtime?: { sendMessage?: unknown; lastError?: { message?: string } } } }).chrome?.runtime as
        | { sendMessage?: (id: string, msg: unknown, cb: (res: unknown) => void) => void; lastError?: { message?: string } }
        | undefined;
      if (!cr?.sendMessage) {
        resolve({ ok: false, error: 'Browser API unavailable' });
        return;
      }
      cr.sendMessage(extId, { type: 'CONNECT_STEAM_SESSION' }, (res: unknown) => {
        if (cr.lastError) {
          resolve({ ok: false, error: cr.lastError.message || 'Extension error' });
          return;
        }
        resolve((res as { ok: boolean; error?: string }) || { ok: false, error: 'Empty response' });
      });
    } catch (e) {
      resolve({ ok: false, error: (e as Error)?.message || 'Unknown error' });
    }
  });
}

/**
 * On mount: if the user has no valid Steam session and the extension is
 * detected, transparently try to read the Steam cookie via the extension and
 * save the session server-side. Avoids forcing the user through the modal /
 * "Connect" click when the extension already has everything it needs.
 *
 * Result statuses guide the visible UI:
 *   - `connected` / `attempting` / `idle` — render nothing
 *   - `no_steam_login`               — render top banner with "Open Steam"
 *   - `no_extension` / `error`       — keep the existing modal flow as fallback
 *
 * Listens to `postMessage` from the extension's `auth.ts` content script —
 * when the cookie watcher in the background auto-saves the session after a
 * Steam login completes in another tab, we can flip status to `connected`
 * and refresh queries without a hard reload.
 */
export function useAutoConnectExtension() {
  const hasSession = useHasSession();
  const qc = useQueryClient();
  const [status, setStatus] = useState<AutoConnectStatus>('idle');
  const ranRef = useRef(false);

  useEffect(() => {
    // Wait for the accounts query to settle. If the user already has a valid
    // session, never run.
    if (hasSession === undefined || hasSession === true) return;
    if (ranRef.current) return;

    // Re-use the previous result for this tab so navigations don't ping the
    // extension on every page change.
    const cached = sessionStorage.getItem(FLAG_KEY) as AutoConnectStatus | null;
    if (cached === 'connected' || cached === 'no_steam_login' || cached === 'no_extension') {
      setStatus(cached);
      ranRef.current = true;
      return;
    }

    let cancelled = false;
    setStatus('attempting');
    ranRef.current = true;

    (async () => {
      const extId = await detectExtensionId();
      if (cancelled) return;
      if (!extId) {
        setStatus('no_extension');
        sessionStorage.setItem(FLAG_KEY, 'no_extension');
        return;
      }
      const res = await callConnect(extId);
      if (cancelled) return;
      if (res.ok) {
        setStatus('connected');
        sessionStorage.setItem(FLAG_KEY, 'connected');
        await qc.invalidateQueries({ queryKey: ['accounts'] });
        await qc.invalidateQueries({ queryKey: ['session'] });
        return;
      }
      // The extension surfaces "Not logged in to Steam..." before it even
      // calls the API — that's the case where redirecting the user to
      // steamcommunity.com is the right next step. Other failures
      // (auth issue, server 500, mismatch) collapse to `error`, where the
      // existing connect-modal stays as the user's manual escape hatch.
      const noSteamLogin = /not logged in to steam|steamLoginSecure/i.test(res.error || '');
      const next: AutoConnectStatus = noSteamLogin ? 'no_steam_login' : 'error';
      setStatus(next);
      sessionStorage.setItem(FLAG_KEY, next);
    })();

    return () => {
      cancelled = true;
    };
  }, [hasSession, qc]);

  // Listen for the extension's "session connected" broadcast (auth.ts
  // content script forwards background's SK_SESSION_CONNECTED via
  // window.postMessage). Fired when the cookie watcher auto-saves after a
  // successful Steam login in any tab — gives us a near-instant "you're in"
  // without a hard reload.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { source?: string; type?: string } | null;
      if (data?.source !== 'skinkeeper-ext') return;
      if (data.type !== 'session-connected') return;
      sessionStorage.setItem(FLAG_KEY, 'connected');
      setStatus('connected');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['session'] });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [qc]);

  // When the user comes back to the SkinKeeper tab from Steam, retry once.
  // Cookie watcher in the extension will normally beat us to it, but this
  // is a belt-and-braces for the case where the broadcast was missed
  // (e.g. tab discarded / sleeping).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      if (status !== 'no_steam_login') return;
      sessionStorage.removeItem(FLAG_KEY);
      ranRef.current = false;
      setStatus('idle');
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status]);

  return { status };
}
