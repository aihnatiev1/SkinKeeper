/**
 * Desktop (Electron) integration utilities.
 * These are only available when the web-app runs inside the Electron shell.
 */

export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).skinkeeper;
}

export function getDesktopAPI() {
  if (!isDesktop()) return null;
  return (window as any).skinkeeper as {
    app: {
      getVersion: () => Promise<string>;
      isDev: () => Promise<boolean>;
      platform: () => Promise<string>;
    };
    steam: {
      login: (username: string, password: string) => Promise<{ success: boolean; error?: string; requiresGuard?: boolean }>;
      loginWithQR: () => Promise<{ success: boolean; error?: string }>;
      loginWithToken: (refreshToken: string) => Promise<{ success: boolean; error?: string }>;
      logout: () => Promise<void>;
      getStatus: () => Promise<SteamDesktopStatus>;
      getSteamGuardCode: (sharedSecret: string) => Promise<string>;
      getInventory: () => Promise<any[]>;
      refreshInventory: () => Promise<any[]>;
      getStorageUnits: () => Promise<any[]>;
      getStorageUnitContents: (casketId: string) => Promise<any[]>;
      moveToStorageUnit: (itemIds: string[], casketId: string) => Promise<{ success: boolean; moved: number }>;
      moveFromStorageUnit: (itemIds: string[], casketId: string) => Promise<{ success: boolean; moved: number }>;
      moveBetweenStorageUnits: (itemIds: string[], sourceCasketId: string, targetCasketId: string) => Promise<{ success: boolean; moved: number }>;
      renameStorageUnit: (itemId: string, newName: string) => Promise<{ success: boolean }>;
      renameItem: (itemId: string, name: string) => Promise<{ success: boolean }>;
      equipItem: (itemId: string, classId: number, slot: number) => Promise<{ success: boolean }>;
      executeTradeUp: (itemIds: string[]) => Promise<{ success: boolean; result?: any }>;
      getTradeOffers: () => Promise<any[]>;
      sendTradeOffer: (partnerId: string, itemsToGive: string[], itemsToReceive: string[], message?: string) => Promise<{ success: boolean; offerId?: string }>;
      acceptTradeOffer: (offerId: string) => Promise<{ success: boolean }>;
      cancelTradeOffer: (offerId: string) => Promise<{ success: boolean }>;
    };
    automation: {
      getRules: () => Promise<any[]>;
      saveRule: (rule: any) => Promise<any>;
      deleteRule: (id: string) => Promise<boolean>;
      previewRule: (rule: any) => Promise<any[]>;
      runRule: (ruleId: string) => Promise<{ matched: number; moved: number }>;
      runAll: () => Promise<{ ruleId: string; ruleName: string; matched: number; moved: number }[]>;
    };
    updater: {
      check: () => Promise<void>;
      install: () => Promise<void>;
    };
    on: (channel: string, callback: (...args: any[]) => void) => () => void;
  };
}

export interface SteamDesktopStatus {
  loggedIn: boolean;
  steamId?: string;
  personaName?: string;
  wallet?: {
    currency: string;
    balance: number;
  };
}
