import { contextBridge, ipcRenderer } from 'electron';

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld('skinkeeper', {
  // App info
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    isDev: () => ipcRenderer.invoke('app:is-dev'),
    platform: () => ipcRenderer.invoke('app:platform'),
  },

  // Steam client operations
  steam: {
    // Auth
    webLogin: () => ipcRenderer.invoke('steam:web-login'),
    login: (username: string, password: string) =>
      ipcRenderer.invoke('steam:login', username, password),
    loginWithQR: () => ipcRenderer.invoke('steam:login-qr'),
    loginWithToken: (refreshToken: string) =>
      ipcRenderer.invoke('steam:login-token', refreshToken),
    logout: () => ipcRenderer.invoke('steam:logout'),
    getStatus: () => ipcRenderer.invoke('steam:status'),
    getWebSession: () => ipcRenderer.invoke('steam:get-web-session'),
    getSteamGuardCode: (sharedSecret: string) =>
      ipcRenderer.invoke('steam:guard-code', sharedSecret),
    submitGuard: (code: string) =>
      ipcRenderer.invoke('steam:submit-guard', code),

    // Inventory
    getInventory: () => ipcRenderer.invoke('steam:inventory'),
    refreshInventory: () => ipcRenderer.invoke('steam:inventory-refresh'),

    // Storage units (caskets)
    getStorageUnits: () => ipcRenderer.invoke('steam:storage-units'),
    getStorageUnitContents: (casketId: string) =>
      ipcRenderer.invoke('steam:storage-unit-contents', casketId),
    moveToStorageUnit: (itemIds: string[], casketId: string) =>
      ipcRenderer.invoke('steam:move-to-storage', itemIds, casketId),
    moveFromStorageUnit: (itemIds: string[], casketId: string) =>
      ipcRenderer.invoke('steam:move-from-storage', itemIds, casketId),
    moveBetweenStorageUnits: (itemIds: string[], sourceCasketId: string, targetCasketId: string) =>
      ipcRenderer.invoke('steam:move-between-storage', itemIds, sourceCasketId, targetCasketId),
    renameStorageUnit: (itemId: string, newName: string) =>
      ipcRenderer.invoke('steam:rename-storage-unit', itemId, newName),

    // Item operations
    renameItem: (itemId: string, name: string) =>
      ipcRenderer.invoke('steam:rename-item', itemId, name),
    equipItem: (itemId: string, classId: number, slot: number) =>
      ipcRenderer.invoke('steam:equip-item', itemId, classId, slot),

    // Trade-ups
    executeTradeUp: (itemIds: string[]) =>
      ipcRenderer.invoke('steam:trade-up', itemIds),

    // Trade offers
    getTradeOffers: () => ipcRenderer.invoke('steam:trade-offers'),
    sendTradeOffer: (partnerId: string, itemsToGive: string[], itemsToReceive: string[], message?: string) =>
      ipcRenderer.invoke('steam:send-trade', partnerId, itemsToGive, itemsToReceive, message),
    acceptTradeOffer: (offerId: string) =>
      ipcRenderer.invoke('steam:accept-trade', offerId),
    cancelTradeOffer: (offerId: string) =>
      ipcRenderer.invoke('steam:cancel-trade', offerId),
  },

  // Automation rules
  automation: {
    getRules: () => ipcRenderer.invoke('automation:get-rules'),
    saveRule: (rule: any) => ipcRenderer.invoke('automation:save-rule', rule),
    deleteRule: (id: string) => ipcRenderer.invoke('automation:delete-rule', id),
    previewRule: (rule: any) => ipcRenderer.invoke('automation:preview-rule', rule),
    runRule: (ruleId: string) => ipcRenderer.invoke('automation:run-rule', ruleId),
    runAll: () => ipcRenderer.invoke('automation:run-all'),
  },

  // Auto-updater
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
  },

  // Event listeners (main -> renderer)
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'steam:status-changed',
      'steam:inventory-updated',
      'steam:item-moved',
      'steam:trade-offer-received',
      'steam:guard-required',
      'steam:qr-code',
      'steam:error',
      'steam:transfer-progress',
      'steam:gc-ready',
      'steam:web-session-ready',
      'steam:web-session',
      'updater:update-available',
      'updater:update-downloaded',
      'updater:error',
    ];

    if (validChannels.includes(channel)) {
      const listener = (_event: any, ...args: any[]) => callback(...args);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
    return () => {};
  },
});

// Type declaration for the renderer
export interface SkinKeeperAPI {
  app: {
    getVersion: () => Promise<string>;
    isDev: () => Promise<boolean>;
    platform: () => Promise<string>;
  };
  steam: {
    webLogin: () => Promise<{ success: boolean; error?: string; steamLoginSecure?: string; sessionId?: string | null; steamRefreshToken?: string | null }>;
    login: (username: string, password: string) => Promise<{ success: boolean; error?: string; requiresGuard?: boolean }>;
    loginWithQR: () => Promise<{ success: boolean; error?: string }>;
    loginWithToken: (refreshToken: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<void>;
    getStatus: () => Promise<{ loggedIn: boolean; steamId?: string; personaName?: string; wallet?: { currency: string; balance: number } }>;
    getSteamGuardCode: (sharedSecret: string) => Promise<string>;
    getInventory: () => Promise<any[]>;
    refreshInventory: () => Promise<any[]>;
    getStorageUnits: () => Promise<any[]>;
    getStorageUnitContents: (casketId: string) => Promise<any[]>;
    moveToStorageUnit: (itemIds: string[], casketId: string) => Promise<{ success: boolean; moved: number }>;
    moveFromStorageUnit: (itemIds: string[], casketId: string) => Promise<{ success: boolean; moved: number }>;
    renameItem: (itemId: string, name: string) => Promise<{ success: boolean }>;
    equipItem: (itemId: string, classId: number, slot: number) => Promise<{ success: boolean }>;
    executeTradeUp: (itemIds: string[]) => Promise<{ success: boolean; result?: any }>;
    getTradeOffers: () => Promise<any[]>;
    sendTradeOffer: (partnerId: string, itemsToGive: string[], itemsToReceive: string[], message?: string) => Promise<{ success: boolean; offerId?: string }>;
    acceptTradeOffer: (offerId: string) => Promise<{ success: boolean }>;
    cancelTradeOffer: (offerId: string) => Promise<{ success: boolean }>;
  };
  updater: {
    check: () => Promise<void>;
    install: () => Promise<void>;
  };
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
}

declare global {
  interface Window {
    skinkeeper: SkinKeeperAPI;
  }
}
