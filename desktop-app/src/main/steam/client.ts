import SteamUser from 'steam-user';
import { LoginSession, EAuthTokenPlatformType, EAuthSessionGuardType } from 'steam-session';
import SteamTotp from 'steam-totp';
import SteamCommunity from 'steamcommunity';
import TradeOfferManager from 'steam-tradeoffer-manager';
import GlobalOffensive from 'globaloffensive';
import { EventEmitter } from 'events';

export interface SteamStatus {
  loggedIn: boolean;
  steamId?: string;
  personaName?: string;
  wallet?: {
    currency: string;
    balance: number;
  };
}

export interface InventoryItem {
  id: string;
  classid: string;
  instanceid: string;
  name: string;
  market_hash_name: string;
  icon_url: string;
  tradable: boolean;
  marketable: boolean;
  type: string;
  rarity?: string;
  quality?: string;
  paintwear?: number;
  paintseed?: number;
  stickers?: any[];
  casket_id?: string;
}

export class SteamClient extends EventEmitter {
  private user: any;
  private community: any;
  private tradeManager: any;
  private csgo: any;
  private _isLoggedIn = false;
  private _steamId: string | null = null;
  private _personaName: string | null = null;
  private _wallet: { currency: string; balance: number } | null = null;
  private _inventory: InventoryItem[] = [];
  private _refreshToken: string | null = null;
  private gcReady = false;
  private gcReadyPromise: Promise<void> | null = null;
  private gcReadyResolve: (() => void) | null = null;

  constructor() {
    super();
    this.user = new SteamUser({
      dataDirectory: null, // Don't write sentry files
    });
    this.community = new SteamCommunity();
    this.tradeManager = new TradeOfferManager({
      steam: this.user,
      community: this.community,
      language: 'en',
    });
    this.csgo = new GlobalOffensive(this.user);
    this.setupListeners();
  }

  get isLoggedIn(): boolean {
    return this._isLoggedIn;
  }

  get status(): SteamStatus {
    return {
      loggedIn: this._isLoggedIn,
      steamId: this._steamId ?? undefined,
      personaName: this._personaName ?? undefined,
      wallet: this._wallet ?? undefined,
    };
  }

  private setupListeners() {
    this.user.on('loggedOn', () => {
      this._isLoggedIn = true;
      this._steamId = this.user.steamID?.getSteamID64() ?? null;
      this.emit('status-changed', this.status);

      // Set persona online and launch CS2
      this.user.setPersona(SteamUser.EPersonaState.Online);
      this.user.gamesPlayed([730], true);
    });

    this.user.on('accountInfo', (name: string) => {
      this._personaName = name;
      this.emit('status-changed', this.status);
    });

    this.user.on('wallet', (hasWallet: boolean, currency: number, balance: number) => {
      if (hasWallet) {
        this._wallet = {
          currency: this.getCurrencyCode(currency),
          balance: balance / 100,
        };
        this.emit('status-changed', this.status);
      }
    });

    this.user.on('webSession', (_sessionId: string, cookies: string[]) => {
      this.community.setCookies(cookies);
      this.tradeManager.setCookies(cookies);
    });

    // Trade offer events
    this.tradeManager.on('newOffer', (offer: any) => {
      this.emit('trade-offer-received', {
        id: offer.id,
        partner: offer.partner?.getSteamID64(),
        message: offer.message,
        itemsToGive: offer.itemsToGive?.length || 0,
        itemsToReceive: offer.itemsToReceive?.length || 0,
      });
    });

    this.user.on('disconnected', (_eresult: number, msg: string) => {
      this._isLoggedIn = false;
      this.gcReady = false;
      this.emit('status-changed', this.status);
      this.emit('error', `Disconnected: ${msg}`);
    });

    this.user.on('error', (err: Error) => {
      this._isLoggedIn = false;
      this.gcReady = false;
      this.emit('error', err.message);
      this.emit('status-changed', this.status);
    });

    // CS2 Game Coordinator events
    this.csgo.on('connectedToGC', () => {
      this.gcReady = true;
      if (this.gcReadyResolve) {
        this.gcReadyResolve();
        this.gcReadyResolve = null;
      }
      this.emit('gc-ready');
    });

    this.csgo.on('disconnectedFromGC', (_reason: number) => {
      this.gcReady = false;
    });

    this.csgo.on('itemAcquired', (item: any) => {
      this.emit('item-acquired', item);
      this.emit('inventory-updated');
    });

    this.csgo.on('itemRemoved', (item: any) => {
      this.emit('item-removed', item);
      this.emit('inventory-updated');
    });

    this.csgo.on('itemChanged', (oldItem: any, newItem: any) => {
      this.emit('item-changed', oldItem, newItem);
      this.emit('inventory-updated');
    });
  }

  private waitForGC(): Promise<void> {
    if (this.gcReady) return Promise.resolve();
    if (!this.gcReadyPromise) {
      this.gcReadyPromise = new Promise((resolve) => {
        this.gcReadyResolve = resolve;
        // Timeout after 30 seconds
        setTimeout(() => {
          if (!this.gcReady) {
            this.gcReadyResolve = null;
            this.gcReadyPromise = null;
          }
          resolve();
        }, 30000);
      });
    }
    return this.gcReadyPromise;
  }

  // --- Authentication ---

  async login(username: string, password: string): Promise<{ success: boolean; error?: string; requiresGuard?: boolean; qrUrl?: string }> {
    try {
      const session = new LoginSession(EAuthTokenPlatformType.SteamClient);

      session.on('authenticated', async () => {
        this._refreshToken = session.refreshToken;
        this.user.logOn({ refreshToken: session.refreshToken });
      });

      const startResult = await session.startWithCredentials({
        accountName: username,
        password: password,
      });

      if (startResult.actionRequired) {
        const guardType = startResult.validActions?.[0]?.type;

        if (guardType === EAuthSessionGuardType.DeviceCode ||
            guardType === EAuthSessionGuardType.EmailCode) {
          // Need Steam Guard code — emit event so renderer can show input
          this.emit('guard-required', {
            type: guardType === EAuthSessionGuardType.DeviceCode ? 'device' : 'email',
            session,
          });
          return { success: false, requiresGuard: true };
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async submitGuardCode(session: LoginSession, code: string): Promise<{ success: boolean; error?: string }> {
    try {
      await session.submitSteamGuardCode(code);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async loginWithQR(): Promise<{ success: boolean; error?: string }> {
    try {
      const session = new LoginSession(EAuthTokenPlatformType.SteamClient);

      session.on('authenticated', async () => {
        this._refreshToken = session.refreshToken;
        this.user.logOn({ refreshToken: session.refreshToken });
      });

      const startResult = await session.startWithQR();
      this.emit('qr-code', startResult.qrChallengeUrl);

      session.on('steamGuardMachineToken', () => {
        // QR auth approved on phone
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async loginWithToken(refreshToken: string): Promise<{ success: boolean; error?: string }> {
    try {
      this._refreshToken = refreshToken;
      this.user.logOn({ refreshToken });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  logout() {
    try {
      if (this._isLoggedIn) {
        this.user.gamesPlayed([]);
        this.user.logOff();
      }
    } catch (_) {
      // Ignore errors during logout
    }
    this._isLoggedIn = false;
    this.gcReady = false;
    this._steamId = null;
    this._personaName = null;
    this._wallet = null;
    this._inventory = [];
    this.emit('status-changed', this.status);
  }

  getGuardCode(sharedSecret: string): string {
    return SteamTotp.generateAuthCode(sharedSecret);
  }

  // --- Inventory ---

  async getInventory(): Promise<InventoryItem[]> {
    if (!this._isLoggedIn) throw new Error('Not logged in');
    await this.waitForGC();

    return new Promise((resolve, reject) => {
      this.user.getUserOwnedApps(this.user.steamID!, (err: Error | null, apps: any) => {
        // Use the GC to get full inventory including storage units
        if (this.csgo.haveGCSession) {
          // We have GC, inventory items come via events
          // For now, return cached inventory
          resolve(this._inventory);
        } else {
          // Fallback: use Steam Web API
          this.getInventoryHTTP()
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }

  private async getInventoryHTTP(): Promise<InventoryItem[]> {
    return new Promise((resolve, reject) => {
      (this.user as any).getInventoryContents(730, 2, true, (err: Error | null, inventory: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const items: InventoryItem[] = (inventory || []).map((item: any) => ({
          id: item.assetid || item.id,
          classid: item.classid,
          instanceid: item.instanceid,
          name: item.name,
          market_hash_name: item.market_hash_name,
          icon_url: item.icon_url,
          tradable: item.tradable,
          marketable: item.marketable,
          type: item.type,
          rarity: item.tags?.find((t: any) => t.category === 'Rarity')?.localized_tag_name,
          quality: item.tags?.find((t: any) => t.category === 'Quality')?.localized_tag_name,
        }));

        this._inventory = items;
        resolve(items);
      });
    });
  }

  // --- Storage Units (Caskets) ---

  async getStorageUnits(): Promise<any[]> {
    if (!this._isLoggedIn || !this.gcReady) throw new Error('Not connected to GC');

    // Storage units have def_index 1201
    return this._inventory.filter((item: any) => item.def_index === 1201);
  }

  async getStorageUnitContents(casketId: string): Promise<any[]> {
    if (!this.gcReady) throw new Error('Not connected to GC');

    return new Promise((resolve) => {
      this.csgo.getCasketContents(casketId, (err: Error | null, items: any[]) => {
        if (err) {
          resolve([]);
          return;
        }
        resolve(items || []);
      });
    });
  }

  async moveToStorageUnit(itemIds: string[], casketId: string): Promise<{ success: boolean; moved: number }> {
    if (!this.gcReady) throw new Error('Not connected to GC');

    let moved = 0;
    for (const itemId of itemIds) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.csgo.addToCasket(casketId, itemId);
          // Wait a bit between operations to avoid rate limiting
          setTimeout(resolve, 1000);
        });
        moved++;
        this.emit('item-moved', { itemId, casketId, direction: 'to' });
      } catch (err) {
        // Continue with next item
      }
    }

    return { success: moved > 0, moved };
  }

  async moveFromStorageUnit(itemIds: string[], casketId: string): Promise<{ success: boolean; moved: number }> {
    if (!this.gcReady) throw new Error('Not connected to GC');

    let moved = 0;
    for (const itemId of itemIds) {
      try {
        await new Promise<void>((resolve) => {
          this.csgo.removeFromCasket(casketId, itemId);
          setTimeout(resolve, 1000);
        });
        moved++;
        this.emit('item-moved', { itemId, casketId, direction: 'from' });
      } catch (err) {
        // Continue with next item
      }
    }

    return { success: moved > 0, moved };
  }

  // --- Item Operations ---

  async renameItem(itemId: string, name: string): Promise<{ success: boolean }> {
    if (!this.gcReady) throw new Error('Not connected to GC');

    try {
      this.csgo.nameItem(itemId, name);
      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  async equipItem(itemId: string, classId: number, slot: number): Promise<{ success: boolean }> {
    if (!this.gcReady) throw new Error('Not connected to GC');

    try {
      // classId: 0=T, 1=CT, 2=Both
      // slot: equipment slot number
      (this.csgo as any).equipItem(itemId, classId, slot);
      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  async executeTradeUp(itemIds: string[]): Promise<{ success: boolean; result?: any }> {
    if (!this.gcReady) throw new Error('Not connected to GC');
    if (itemIds.length !== 10) throw new Error('Trade-up requires exactly 10 items');

    return new Promise((resolve) => {
      try {
        this.csgo.craft(itemIds, 10 /* recipe: trade up */);

        // Listen for the result
        const timeout = setTimeout(() => {
          resolve({ success: false });
        }, 15000);

        this.csgo.once('itemAcquired', (item: any) => {
          clearTimeout(timeout);
          resolve({ success: true, result: item });
        });
      } catch (err) {
        resolve({ success: false });
      }
    });
  }

  // --- Trade Offers ---

  async getTradeOffers(): Promise<any[]> {
    if (!this._isLoggedIn) throw new Error('Not logged in');

    return new Promise((resolve, reject) => {
      this.tradeManager.getOffers(
        TradeOfferManager.EOfferFilter.ActiveOnly,
        (err: Error | null, sent: any[], received: any[]) => {
          if (err) {
            reject(err);
            return;
          }

          const mapOffer = (offer: any, direction: 'sent' | 'received') => ({
            id: offer.id,
            direction,
            partner: offer.partner?.getSteamID64(),
            message: offer.message || null,
            state: offer.state,
            itemsToGive: (offer.itemsToGive || []).map((i: any) => ({
              assetId: i.assetid,
              name: i.name,
              marketHashName: i.market_hash_name,
              iconUrl: i.icon_url,
            })),
            itemsToReceive: (offer.itemsToReceive || []).map((i: any) => ({
              assetId: i.assetid,
              name: i.name,
              marketHashName: i.market_hash_name,
              iconUrl: i.icon_url,
            })),
            createdAt: offer.created?.toISOString(),
            expiresAt: offer.expires?.toISOString(),
          });

          const all = [
            ...(sent || []).map((o: any) => mapOffer(o, 'sent')),
            ...(received || []).map((o: any) => mapOffer(o, 'received')),
          ];
          resolve(all);
        }
      );
    });
  }

  async sendTradeOffer(
    partnerId: string,
    itemsToGive: string[],
    itemsToReceive: string[],
    message?: string
  ): Promise<{ success: boolean; offerId?: string }> {
    if (!this._isLoggedIn) throw new Error('Not logged in');

    return new Promise((resolve) => {
      const offer = this.tradeManager.createOffer(partnerId);
      if (message) offer.setMessage(message);

      // Add items to give (our items)
      for (const assetId of itemsToGive) {
        offer.addMyItem({
          appid: 730,
          contextid: '2',
          assetid: assetId,
        });
      }

      // Add items to receive (their items)
      for (const assetId of itemsToReceive) {
        offer.addTheirItem({
          appid: 730,
          contextid: '2',
          assetid: assetId,
        });
      }

      offer.send((err: Error | null, status: string) => {
        if (err) {
          resolve({ success: false });
          return;
        }
        resolve({ success: true, offerId: offer.id });
      });
    });
  }

  async acceptTradeOffer(offerId: string): Promise<{ success: boolean }> {
    if (!this._isLoggedIn) throw new Error('Not logged in');

    return new Promise((resolve) => {
      const offer = this.tradeManager.createOffer(offerId);
      this.tradeManager.getOffer(offerId, (err: Error | null, offer: any) => {
        if (err || !offer) {
          resolve({ success: false });
          return;
        }
        offer.accept(false, (err: Error | null) => {
          resolve({ success: !err });
        });
      });
    });
  }

  async cancelTradeOffer(offerId: string): Promise<{ success: boolean }> {
    if (!this._isLoggedIn) throw new Error('Not logged in');

    return new Promise((resolve) => {
      this.tradeManager.getOffer(offerId, (err: Error | null, offer: any) => {
        if (err || !offer) {
          resolve({ success: false });
          return;
        }
        offer.cancel((err: Error | null) => {
          resolve({ success: !err });
        });
      });
    });
  }

  // --- Helpers ---

  private getCurrencyCode(currencyId: number): string {
    const currencies: Record<number, string> = {
      1: 'USD', 2: 'GBP', 3: 'EUR', 5: 'RUB', 7: 'BRL',
      8: 'JPY', 9: 'NOK', 10: 'IDR', 11: 'MYR', 12: 'PHP',
      13: 'SGD', 14: 'THB', 15: 'VND', 16: 'KRW', 17: 'TRY',
      18: 'UAH', 19: 'MXN', 20: 'CAD', 21: 'AUD', 22: 'NZD',
      23: 'CNY', 24: 'INR', 25: 'CLP', 26: 'PEN', 27: 'COP',
      28: 'ZAR', 29: 'HKD', 30: 'TWD', 31: 'SAR', 32: 'AED',
      34: 'ARS', 35: 'ILS', 37: 'KZT', 38: 'KWD', 39: 'QAR',
      40: 'CRC', 41: 'UYU', 9000: 'RMB',
    };
    return currencies[currencyId] || 'USD';
  }
}
