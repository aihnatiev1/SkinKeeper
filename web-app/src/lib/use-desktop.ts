import { useState, useEffect, useCallback } from 'react';
import { isDesktop, getDesktopAPI, type SteamDesktopStatus } from './desktop';
import { useTransferStore } from './transfer-store';

/**
 * Hook to check if running in desktop mode.
 */
export function useIsDesktop(): boolean | null {
  const [desktop, setDesktop] = useState<boolean | null>(null);
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
  const [error, setError] = useState<string | null>(null);
  const api = getDesktopAPI();

  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      const inv = await api.steam.refreshInventory();
      setItems(inv || []);
    } catch (err: any) {
      console.error('[Desktop Inventory]', err);
      setError(err?.message || 'Failed to load inventory');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!api) return;

    // Initial fetch
    refresh();

    // Don't auto-refresh during transfer — it clears the table
    const isTransferring = useTransferStore.getState().isTransferring;
    const unsub = api.on('steam:inventory-updated', () => {
      if (!useTransferStore.getState().isTransferring) {
        refresh();
      }
    });

    return unsub;
  }, [refresh]);

  return { items, loading, error, refresh, isDesktop: !!api };
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
      // GC not ready yet — will retry on gc-ready event
    }
    setLoading(false);
  }, []);

  // Auto-fetch when GC connects
  useEffect(() => {
    if (!api) return;
    const unsub = api.on('steam:gc-ready', () => {
      fetchUnits();
    });
    return unsub;
  }, [fetchUnits]);

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

  const renameUnit = useCallback(async (unitId: string, newName: string) => {
    if (!api) return { success: false };
    const result = await api.steam.renameStorageUnit(unitId, newName);
    if (result.success) fetchUnits(); // Refresh to show new name
    return result;
  }, [fetchUnits]);

  const moveBetweenUnits = useCallback(async (itemIds: string[], sourceCasketId: string, targetCasketId: string) => {
    if (!api) return { success: false, moved: 0 };
    return api.steam.moveBetweenStorageUnits(itemIds, sourceCasketId, targetCasketId);
  }, []);

  // Listen for transfer progress events from main process
  const updateProgress = useTransferStore((s) => s.updateProgress);
  useEffect(() => {
    if (!api) return;
    const unsub = api.on('steam:transfer-progress', (data: any) => {
      updateProgress({ current: data.current, total: data.total });
    });
    return unsub;
  }, [updateProgress]);

  return { units, loading, fetchUnits, getContents, moveToUnit, moveFromUnit, moveBetweenUnits, renameUnit, isDesktop: !!api };
}
