import { useState, useEffect, useCallback } from 'react';
import { isDesktop, getDesktopAPI, type SteamDesktopStatus } from './desktop';

/**
 * Hook to check if running in desktop mode.
 */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    setDesktop(isDesktop());
  }, []);
  return desktop;
}

/**
 * Hook for Steam connection status (desktop only).
 */
export function useSteamStatus() {
  const [status, setStatus] = useState<SteamDesktopStatus>({ loggedIn: false });
  const [loading, setLoading] = useState(true);
  const api = getDesktopAPI();

  useEffect(() => {
    if (!api) {
      setLoading(false);
      return;
    }

    // Get initial status
    api.steam.getStatus().then((s) => {
      setStatus(s);
      setLoading(false);
    });

    // Listen for status changes
    const unsub = api.on('steam:status-changed', (newStatus: SteamDesktopStatus) => {
      setStatus(newStatus);
    });

    return unsub;
  }, []);

  return { status, loading, isDesktop: !!api };
}

/**
 * Hook for Steam login (desktop only).
 */
export function useSteamLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresGuard, setRequiresGuard] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const api = getDesktopAPI();

  useEffect(() => {
    if (!api) return;

    const unsubQR = api.on('steam:qr-code', (url: string) => {
      setQrUrl(url);
    });

    const unsubGuard = api.on('steam:guard-required', () => {
      setRequiresGuard(true);
      setLoading(false);
    });

    return () => {
      unsubQR();
      unsubGuard();
    };
  }, []);

  const loginWithCredentials = useCallback(async (username: string, password: string) => {
    if (!api) return;
    setLoading(true);
    setError(null);
    setRequiresGuard(false);

    const result = await api.steam.login(username, password);
    if (!result.success && !result.requiresGuard) {
      setError(result.error || 'Login failed');
    }
    if (result.requiresGuard) {
      setRequiresGuard(true);
    }
    setLoading(false);
  }, []);

  const loginWithQR = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    setQrUrl(null);

    const result = await api.steam.loginWithQR();
    if (!result.success) {
      setError(result.error || 'QR login failed');
    }
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    if (!api) return;
    await api.steam.logout();
  }, []);

  return {
    loginWithCredentials,
    loginWithQR,
    logout,
    loading,
    error,
    requiresGuard,
    qrUrl,
    isDesktop: !!api,
  };
}

/**
 * Hook for Steam inventory via desktop GC (desktop only).
 * Falls back gracefully — components should check isDesktop.
 */
export function useDesktopInventory() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const api = getDesktopAPI();

  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const inv = await api.steam.refreshInventory();
      setItems(inv);
    } catch (err) {
      // Silently fail — web-app has its own inventory source
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!api) return;

    const unsub = api.on('steam:inventory-updated', () => {
      refresh();
    });

    return unsub;
  }, [refresh]);

  return { items, loading, refresh, isDesktop: !!api };
}

/**
 * Hook for storage unit operations (desktop only).
 */
export function useStorageUnits() {
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const api = getDesktopAPI();

  const fetchUnits = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const u = await api.steam.getStorageUnits();
      setUnits(u);
    } catch (err) {
      // Ignore
    }
    setLoading(false);
  }, []);

  const getContents = useCallback(async (casketId: string) => {
    if (!api) return [];
    return api.steam.getStorageUnitContents(casketId);
  }, []);

  const moveToUnit = useCallback(async (itemIds: string[], casketId: string) => {
    if (!api) return { success: false, moved: 0 };
    return api.steam.moveToStorageUnit(itemIds, casketId);
  }, []);

  const moveFromUnit = useCallback(async (itemIds: string[], casketId: string) => {
    if (!api) return { success: false, moved: 0 };
    return api.steam.moveFromStorageUnit(itemIds, casketId);
  }, []);

  return { units, loading, fetchUnits, getContents, moveToUnit, moveFromUnit, isDesktop: !!api };
}
