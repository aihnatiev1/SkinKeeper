import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { SteamClient } from './steam/client';
import { registerSteamIPC } from './steam/ipc';
import { registerAuthIPC } from './auth/ipc';
import { registerAutomationIPC } from './automation/ipc';
import { initAnalytics, trackEvent, shutdownAnalytics } from './analytics';

const isDev = !app.isPackaged;
const RENDERER_DEV_URL = 'http://localhost:3001';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let steamClient: SteamClient | null = null;

function getRendererURL(): string {
  if (isDev) {
    return RENDERER_DEV_URL;
  }
  // In production, Next.js standalone server runs on this port
  return 'http://localhost:3847';
}

async function startProductionServer() {
  if (isDev) return;

  const serverPath = path.join(process.resourcesPath, 'renderer', 'server.js');
  const { fork } = require('child_process');

  const server = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: '3847',
      HOSTNAME: 'localhost',
      NODE_ENV: 'production',
    },
    stdio: 'pipe',
  });

  // Wait for server to be ready
  await new Promise<void>((resolve) => {
    server.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes('Ready') || msg.includes('started')) {
        resolve();
      }
    });
    // Fallback: resolve after 3 seconds
    setTimeout(resolve, 3000);
  });

  // Clean up server on app quit
  app.on('before-quit', () => {
    server.kill();
  });
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

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    // Minimize to tray instead of closing on macOS/Windows
    if (process.platform !== 'linux') {
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
    registerAutomationIPC(steamClient);

    // Start production renderer server if needed
    await startProductionServer();

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
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });

  app.on('before-quit', async () => {
    steamClient?.logout();
    trackEvent('app_closed');
    await shutdownAnalytics();
  });
}
