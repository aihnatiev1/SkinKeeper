import { ipcMain, BrowserWindow, session } from 'electron';
import { SteamClient } from './client';
import { storeSteamToken } from '../auth/ipc';

export function registerSteamIPC(steam: SteamClient) {
  // Forward Steam events to all renderer windows
  const broadcast = (channel: string, ...args: any[]) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send(channel, ...args);
    }
  };

  steam.on('status-changed', (status) => broadcast('steam:status-changed', status));
  steam.on('inventory-updated', () => broadcast('steam:inventory-updated'));
  steam.on('item-moved', (data) => broadcast('steam:item-moved', data));
  steam.on('guard-required', (data) => broadcast('steam:guard-required', { type: data.type }));
  steam.on('qr-code', (url) => broadcast('steam:qr-code', url));
  steam.on('error', (error) => broadcast('steam:error', error));
  steam.on('transfer-progress', (data) => broadcast('steam:transfer-progress', data));
  steam.on('gc-ready', () => broadcast('steam:gc-ready'));
  steam.on('web-session', (data) => broadcast('steam:web-session', data));

  // Keep reference to pending guard session
  let pendingGuardSession: any = null;

  steam.on('guard-required', (data) => {
    pendingGuardSession = data.session;
  });

  // --- Auth handlers ---

  /**
   * Open a Steam web login popup using the DEFAULT session (same as main window).
   * Poll for steamLoginSecure cookie — works with Steam's SPA login flow.
   */
  ipcMain.handle('steam:web-login', async () => {
    type WebLoginResult = { success: boolean; error?: string; steamLoginSecure?: string; sessionId?: string | null; steamRefreshToken?: string | null };

    return new Promise<WebLoginResult>((resolve) => {
      const ses = session.defaultSession;

      const popup = new BrowserWindow({
        width: 520,
        height: 680,
        title: 'Sign in to Steam',
        backgroundColor: '#1b2838',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          // No partition — uses defaultSession, same as main window
        },
      });

      let resolved = false;
      let pollTimer: NodeJS.Timeout | null = null;

      const done = (result: WebLoginResult) => {
        if (resolved) return;
        resolved = true;
        if (pollTimer) clearInterval(pollTimer);
        try { popup.destroy(); } catch {}
        resolve(result);
      };

      popup.on('closed', () => {
        done({ success: false, error: 'Login cancelled' });
      });

      // Clear old Steam login cookies so user always gets a fresh login form
      Promise.all([
        ses.cookies.remove('https://steamcommunity.com', 'steamLoginSecure'),
        ses.cookies.remove('https://steamcommunity.com', 'sessionid'),
        ses.cookies.remove('https://login.steampowered.com', 'steamRefresh_steam'),
      ]).then(() => {
        popup.loadURL('https://steamcommunity.com/login/home/');
      });

      // Poll every 1.5s for steamLoginSecure — handles Steam SPA navigation reliably
      const checkCookies = async () => {
        if (resolved) return;
        try {
          const allCookies = await ses.cookies.get({});
          const slsCookie = allCookies.find(c => c.name === 'steamLoginSecure' && c.domain?.includes('steamcommunity.com'));
          if (!slsCookie?.value) return; // not logged in yet

          const refreshCookie = allCookies.find(c => c.name === 'steamRefresh_steam' && c.domain?.includes('steampowered.com'));
          const sessionCookie = allCookies.find(c => c.name === 'sessionid' && c.domain?.includes('steamcommunity.com'));

          console.log(`[WebLogin] Cookies detected — sls: ${slsCookie.value.length}, sessionid: ${!!sessionCookie}, refresh: ${!!refreshCookie}`);

          // steamRefresh_steam is WebBrowser-type — cannot be used with steam-user (needs SteamClient-type)
          // We return cookies for backend sync; GC connect is separate (QR code flow)
          console.log('[WebLogin] Web session captured — returning for backend sync');
          done({
            success: true,
            steamLoginSecure: slsCookie.value,
            sessionId: sessionCookie?.value || null,
            steamRefreshToken: refreshCookie?.value || null,
          });
        } catch (err: any) {
          console.error('[WebLogin] Poll error:', err.message);
        }
      };

      // Start polling after 2s (give time for popup to load)
      setTimeout(() => {
        pollTimer = setInterval(checkCookies, 1500);
        // Stop polling after 3 minutes (timeout)
        setTimeout(() => done({ success: false, error: 'Login timed out' }), 3 * 60 * 1000);
      }, 2000);
    });
  });

  ipcMain.handle('steam:login', async (_event, username: string, password: string) => {
    return steam.login(username, password);
  });

  ipcMain.handle('steam:login-qr', async () => {
    return steam.loginWithQR();
  });

  ipcMain.handle('steam:login-token', async (_event, refreshToken: string) => {
    return steam.loginWithToken(refreshToken);
  });

  ipcMain.handle('steam:submit-guard', async (_event, code: string) => {
    if (!pendingGuardSession) {
      return { success: false, error: 'No pending guard session' };
    }
    const result = await steam.submitGuardCode(pendingGuardSession, code);
    if (result.success) {
      pendingGuardSession = null;
    }
    return result;
  });

  ipcMain.handle('steam:logout', async () => {
    steam.logout();
  });

  ipcMain.handle('steam:status', async () => {
    return steam.status;
  });

  ipcMain.handle('steam:get-web-session', async () => {
    return steam.webSession;
  });

  ipcMain.handle('steam:guard-code', async (_event, sharedSecret: string) => {
    return steam.getGuardCode(sharedSecret);
  });

  // --- Inventory handlers ---

  ipcMain.handle('steam:inventory', async () => {
    return steam.getInventory();
  });

  ipcMain.handle('steam:inventory-refresh', async () => {
    return steam.refreshInventory();
  });

  // --- Storage unit handlers ---

  ipcMain.handle('steam:storage-units', async () => {
    return steam.getStorageUnits();
  });

  ipcMain.handle('steam:storage-unit-contents', async (_event, casketId: string) => {
    return steam.getStorageUnitContents(casketId);
  });

  ipcMain.handle('steam:move-to-storage', async (_event, itemIds: string[], casketId: string) => {
    return steam.moveToStorageUnit(itemIds, casketId);
  });

  ipcMain.handle('steam:move-from-storage', async (_event, itemIds: string[], casketId: string) => {
    return steam.moveFromStorageUnit(itemIds, casketId);
  });

  ipcMain.handle('steam:rename-storage-unit', async (_event, itemId: string, newName: string) => {
    return steam.renameStorageUnit(itemId, newName);
  });

  ipcMain.handle('steam:move-between-storage', async (_event, itemIds: string[], sourceCasketId: string, targetCasketId: string) => {
    return steam.moveBetweenStorageUnits(itemIds, sourceCasketId, targetCasketId);
  });

  // --- Item operation handlers ---

  ipcMain.handle('steam:rename-item', async (_event, itemId: string, name: string) => {
    return steam.renameItem(itemId, name);
  });

  ipcMain.handle('steam:equip-item', async (_event, itemId: string, classId: number, slot: number) => {
    return steam.equipItem(itemId, classId, slot);
  });

  ipcMain.handle('steam:trade-up', async (_event, itemIds: string[]) => {
    return steam.executeTradeUp(itemIds);
  });

  // --- Trade offer handlers ---

  ipcMain.handle('steam:trade-offers', async () => {
    return steam.getTradeOffers();
  });

  ipcMain.handle('steam:send-trade', async (_event, partnerId: string, itemsToGive: string[], itemsToReceive: string[], message?: string) => {
    return steam.sendTradeOffer(partnerId, itemsToGive, itemsToReceive, message);
  });

  ipcMain.handle('steam:accept-trade', async (_event, offerId: string) => {
    return steam.acceptTradeOffer(offerId);
  });

  ipcMain.handle('steam:cancel-trade', async (_event, offerId: string) => {
    return steam.cancelTradeOffer(offerId);
  });
}
