import { ipcMain, safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// Simple JSON store (electron-store v10 is ESM-only, not compatible with CJS main process)
class SimpleStore {
  private data: Record<string, any> = {};
  private filePath: string;

  constructor(name: string) {
    const userDataPath = app.getPath('userData');
    this.filePath = path.join(userDataPath, `${name}.json`);
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      }
    } catch {
      this.data = {};
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch {
      // Ignore write errors
    }
  }

  get(key: string): any {
    return this.data[key];
  }

  set(key: string, value: any) {
    this.data[key] = value;
    this.save();
  }

  clear() {
    this.data = {};
    this.save();
  }
}

let store: SimpleStore;

function getStore() {
  if (!store) store = new SimpleStore('skinkeeper-auth');
  return store;
}

/** Clear saved Steam token (e.g. when it turns out to be invalid). */
export function clearSteamToken() {
  getStore().set('refreshToken', null);
}

/** Save Steam refresh token to persistent store (callable from main process). */
export function storeSteamToken(token: string) {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token);
    getStore().set('refreshToken', encrypted.toString('base64'));
  } else {
    getStore().set('refreshToken', token);
  }
}

/** Read Steam refresh token from persistent store (callable from main process). */
export function loadSteamToken(): string | null {
  const stored = getStore().get('refreshToken');
  if (!stored) return null;
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = Buffer.from(stored, 'base64');
      return safeStorage.decryptString(buffer);
    } catch {
      return null;
    }
  }
  return stored;
}

export function registerAuthIPC() {
  // Save SkinKeeper API token (for web-app auth)
  ipcMain.handle('auth:save-sk-token', async (_event, token: string) => {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token);
      getStore().set('skToken', encrypted.toString('base64'));
    } else {
      getStore().set('skToken', token);
    }
    return { success: true };
  });

  // Get SkinKeeper API token
  ipcMain.handle('auth:get-sk-token', async () => {
    const stored = getStore().get('skToken');
    if (!stored) return null;

    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(stored, 'base64');
        return safeStorage.decryptString(buffer);
      } catch {
        return null;
      }
    }
    return stored;
  });

  // Save Steam refresh token
  ipcMain.handle('auth:save-steam-token', async (_event, token: string) => {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token);
      getStore().set('refreshToken', encrypted.toString('base64'));
    } else {
      getStore().set('refreshToken', token);
    }
    return { success: true };
  });

  // Get Steam refresh token
  ipcMain.handle('auth:get-steam-token', async () => {
    const stored = getStore().get('refreshToken');
    if (!stored) return null;

    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(stored, 'base64');
        return safeStorage.decryptString(buffer);
      } catch {
        return null;
      }
    }
    return stored;
  });

  // Save last known account info
  ipcMain.handle('auth:save-account-info', async (_event, steamId: string, personaName: string) => {
    getStore().set('lastSteamId', steamId);
    getStore().set('lastPersonaName', personaName);
    return { success: true };
  });

  // Get last known account info
  ipcMain.handle('auth:get-account-info', async () => {
    return {
      steamId: getStore().get('lastSteamId') || null,
      personaName: getStore().get('lastPersonaName') || null,
    };
  });

  // Clear all stored credentials
  ipcMain.handle('auth:clear', async () => {
    getStore().clear();
    return { success: true };
  });
}
