import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { SteamClient } from './steam/client';
import { registerSteamIPC } from './steam/ipc';
import { registerAuthIPC, storeSteamToken, loadSteamToken, clearSteamToken } from './auth/ipc';
import { registerAutomationIPC } from './automation/ipc';
import { initAnalytics, trackEvent, shutdownAnalytics } from './analytics';

const isDev = !app.isPackaged;
const RENDERER_DEV_URL = 'http://localhost:3001';
const PRODUCTION_URL = 'https://skinkeeper.store';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let steamClient: SteamClient | null = null;
let isQuitting = false;

function getRendererURL(): string {
  if (isDev) {
    return RENDERER_DEV_URL;
  }
  // Production: load live web app — always up to date
  return PRODUCTION_URL;
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SkinKeeper',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.loadURL(getRendererURL());

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in default browser, keep skinkeeper.store & Steam in-app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow blank popups (used by Steam login flow)
    if (url === 'about:blank') {
      return { action: 'allow' };
    }
    if (url.startsWith('http')) {
      // Steam OpenID and our own domain stay in-app
      if (url.includes('steamcommunity.com') || url.includes('skinkeeper.store')) {
        return { action: 'allow' };
      }
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Handle Steam login popups — on /login/success: capture Steam cookies THEN close popup
  const captureSteamCookiesAndConnect = async () => {
    if (!steamClient) return;
    try {
      const allCookies = await session.defaultSession.cookies.get({});
      const slsCookie = allCookies.find(c => c.name === 'steamLoginSecure' && c.domain?.includes('steamcommunity.com'));
      const sessionCookie = allCookies.find(c => c.name === 'sessionid' && c.domain?.includes('steamcommunity.com'));

      console.log(`[Auth] Post-login cookie check — sls: ${!!slsCookie}`);

      if (slsCookie?.value) {
        // Apply web session — this is enough for trades/market via backend
        steamClient.setWebSession(slsCookie.value, sessionCookie?.value || null);
        // Notify renderer to sync these cookies to backend (POST /session/token)
        mainWindow?.webContents.send('steam:web-session-ready', {
          steamLoginSecure: slsCookie.value,
          sessionId: sessionCookie?.value || null,
        });
      }
    } catch (err) {
      console.warn('[Auth] Cookie capture failed:', err);
    }
  };

  mainWindow.webContents.on('did-create-window', (childWindow) => {
    let pendingOpenIdUrl: string | null = null;
    let cookiePollTimer: NodeJS.Timeout | null = null;

    const stopPolling = () => {
      if (cookiePollTimer) { clearInterval(cookiePollTimer); cookiePollTimer = null; }
    };

    childWindow.on('closed', stopPolling);

    // Intercept navigation to Steam OpenID — inject full login page if not yet logged in
    childWindow.webContents.on('will-navigate', async (event, url) => {
      if (!url.includes('steamcommunity.com/openid/login')) return;
      if (pendingOpenIdUrl) return; // already intercepted, let it proceed

      // Check steam-user connection OR defaultSession cookies
      const alreadyConnected = steamClient?.isLoggedIn;
      const slsCookies = alreadyConnected ? [] : await session.defaultSession.cookies.get({ name: 'steamLoginSecure' });
      const hasSession = alreadyConnected || slsCookies.some(c => c.domain?.includes('steamcommunity.com') && c.value);

      if (hasSession) {
        console.log('[Auth] Steam session exists — OpenID will auto-approve');
        return;
      }

      // Not logged in — stop OpenID navigation, show full Steam login first
      event.preventDefault();
      pendingOpenIdUrl = url;
      console.log('[Auth] No Steam session — redirecting to full Steam login');
      childWindow.loadURL('https://steamcommunity.com/login/home/');

      // Poll for steamLoginSecure — when found, proceed to OpenID
      cookiePollTimer = setInterval(async () => {
        try {
          // Check steam-user connection OR defaultSession cookies
          if (steamClient?.isLoggedIn && pendingOpenIdUrl) {
            const openIdUrl = pendingOpenIdUrl;
            pendingOpenIdUrl = null;
            stopPolling();
            console.log('[Auth] Steam connected — proceeding to OpenID');
            childWindow.loadURL(openIdUrl);
            return;
          }
          const cookies = await session.defaultSession.cookies.get({ name: 'steamLoginSecure' });
          const sls = cookies.find(c => c.domain?.includes('steamcommunity.com') && c.value);
          if (sls && pendingOpenIdUrl) {
            const openIdUrl = pendingOpenIdUrl;
            pendingOpenIdUrl = null;
            stopPolling();
            console.log('[Auth] Steam login detected — proceeding to OpenID');
            childWindow.loadURL(openIdUrl);
          }
        } catch {}
      }, 1500);
    });

    const checkAndClose = (url: string) => {
      if (url.includes('/login/success')) {
        stopPolling();
        // Destroy immediately — before /login/success page can redirect to /portfolio
        try { childWindow.destroy(); } catch {}
        // Capture cookies async after destroy
        captureSteamCookiesAndConnect();
      }
    };

    childWindow.webContents.on('did-navigate', (_event, url) => checkAndClose(url));
    childWindow.webContents.on('did-finish-load', () => {
      try { checkAndClose(childWindow.webContents.getURL()); } catch {}
    });
  });

  mainWindow.on('close', (event) => {
    // Allow actual quit (Cmd+Q, tray Quit), only hide on window close button
    if (!isQuitting && process.platform !== 'linux') {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createTray() {
  // Placeholder icon — replace with actual icon
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show SkinKeeper',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: steamClient?.isLoggedIn ? 'Steam: Connected' : 'Steam: Disconnected',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        steamClient?.logout();
        app.quit();
      },
    },
  ]);

  tray.setToolTip('SkinKeeper');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function setupAutoUpdater() {
  if (isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:update-available', info);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:update-downloaded', info);
  });

  autoUpdater.on('error', (error) => {
    mainWindow?.webContents.send('updater:error', error.message);
  });

  // Check for updates every 30 minutes
  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 30 * 60 * 1000);

  autoUpdater.checkForUpdates();
}

function registerGlobalIPC() {
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:is-dev', () => isDev);
  ipcMain.handle('app:platform', () => process.platform);

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('updater:check', () => {
    autoUpdater.checkForUpdates();
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Initialize analytics
    initAnalytics();
    trackEvent('app_opened');

    // Initialize Steam client
    steamClient = new SteamClient();

    // Register IPC handlers
    registerGlobalIPC();
    registerSteamIPC(steamClient);
    registerAuthIPC();

    // Persist refresh token whenever Steam login succeeds
    steamClient.on('status-changed', (status) => {
      if (status.loggedIn && steamClient?.refreshToken) {
        storeSteamToken(steamClient.refreshToken);
      }
    });

    // Save SteamClient-type refresh token whenever QR login succeeds
    steamClient.on('status-changed', (status) => {
      if (status.loggedIn && steamClient?.refreshToken) {
        storeSteamToken(steamClient.refreshToken);
      }
    });

    // Auto-login with saved SteamClient token (from previous QR scan)
    const savedToken = loadSteamToken();
    if (savedToken) {
      console.log('[Auth] Auto-connecting with saved Steam token...');
      // Listen for error — if token is invalid, clear it so QR can proceed cleanly
      const onLoginError = (err: Error) => {
        if (err.message?.includes('not valid') || err.message?.includes('InvalidPassword')) {
          console.warn('[Auth] Saved token invalid — clearing');
          clearSteamToken();
        }
      };
      steamClient.once('error', onLoginError);
      steamClient.loginWithToken(savedToken).catch(err => {
        console.warn('[Auth] Auto-login failed:', err.message);
        clearSteamToken();
      });
    }
    registerAutomationIPC(steamClient);

    createWindow();
    createTray();
    setupAutoUpdater();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      steamClient?.logout();
      app.quit();
    }
  });

  app.on('activate', () => {
    if (!app.isReady()) return;
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });

  app.on('before-quit', async () => {
    isQuitting = true;
    steamClient?.logout();
    trackEvent('app_closed');
    await shutdownAnalytics();
  });
}
