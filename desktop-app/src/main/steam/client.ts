import SteamUser from 'steam-user';
import { LoginSession, EAuthTokenPlatformType, EAuthSessionGuardType } from 'steam-session';
import SteamTotp from 'steam-totp';
import SteamCommunity from 'steamcommunity';
import TradeOfferManager from 'steam-tradeoffer-manager';
import GlobalOffensive from 'globaloffensive';
import { EventEmitter } from 'events';
import { loadItemData, resolveItemName, resolveItemIcon } from './itemNames';

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
  private _isConnecting = false;
  private _steamId: string | null = null;
  private _personaName: string | null = null;
  private _wallet: { currency: string; balance: number } | null = null;
  private _inventory: InventoryItem[] = [];
  private _gcInventory: any[] = []; // Raw GC items with def_index for storage unit ops
  private _descCache = new Map<string, any>(); // classid → Steam description (name, icon_url, etc.)
  private _apiKey: string | null = null;
  private _webLoginSecure: string | null = null;
  private _webSessionId: string | null = null;
  private _isMoving = false; // Suppress inventory-updated events during bulk move
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

  get refreshToken(): string | null {
    return this._refreshToken;
  }

  get webSession(): { steamLoginSecure: string | null; sessionId: string | null } {
    return { steamLoginSecure: this._webLoginSecure, sessionId: this._webSessionId };
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
      this._isConnecting = false;
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
      if ((this.user as any).webApiKey) {
        this._apiKey = (this.user as any).webApiKey;
      }
      // Parse and store for desktop auth endpoint
      const slsCookie = cookies.find(c => c.startsWith('steamLoginSecure='));
      const sidCookie = cookies.find(c => c.startsWith('sessionid='));
      if (slsCookie) {
        this._webLoginSecure = decodeURIComponent(slsCookie.split('=').slice(1).join('='));
      }
      if (sidCookie) {
        this._webSessionId = sidCookie.split('=')[1];
      }
      this.emit('web-session', {
        steamLoginSecure: this._webLoginSecure,
        sessionId: this._webSessionId,
      });
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
      this._isConnecting = false;
      this._isLoggedIn = false;
      this.gcReady = false;
      this.emit('status-changed', this.status);
      this.emit('error', `Disconnected: ${msg}`);
    });

    this.user.on('error', (err: Error) => {
      this._isConnecting = false;
      this._isLoggedIn = false;
      this.gcReady = false;
      this.emit('error', err.message);
      this.emit('status-changed', this.status);
    });

    // CS2 Game Coordinator events
    this.csgo.on('connectedToGC', async () => {
      // Load item name data FIRST, before mapping inventory
      await loadItemData();

      this.gcReady = true;

      // GC populates csgo.inventory automatically — cache it
      if (this.csgo.inventory && this.csgo.inventory.length > 0) {
        this._gcInventory = this.csgo.inventory;
        this._inventory = this.csgo.inventory.map((item: any) => ({
          id: String(item.id),
          classid: String(item.classid || ''),
          instanceid: String(item.instanceid || ''),
          name: resolveItemName(item.def_index, item.paint_index, item.custom_name),
          market_hash_name: item.market_hash_name || resolveItemName(item.def_index, item.paint_index),
          icon_url: item.icon_url || '',
          tradable: item.tradable !== false,
          marketable: item.marketable !== false,
          type: item.type || '',
          rarity: item.rarity?.name || '',
          quality: item.quality?.name || '',
          def_index: item.def_index,
          casket_id: item.casket_id || null,
          paint_wear: item.paint_wear,
          paint_seed: item.paint_seed,
          casket_contained_item_count: item.casket_contained_item_count,
        }));
        console.log(`[Inventory] GC loaded ${this._inventory.length} items`);
      }

      if (this.gcReadyResolve) {
        this.gcReadyResolve();
        this.gcReadyResolve = null;
      }
      this.emit('gc-ready');
      this.emit('inventory-updated');
    });

    this.csgo.on('disconnectedFromGC', (_reason: number) => {
      this.gcReady = false;
    });

    this.csgo.on('itemAcquired', (_item: any) => {
      if (!this._isMoving) {
        this._syncGCInventory();
        this.emit('inventory-updated');
      }
    });

    this.csgo.on('itemRemoved', (_item: any) => {
      if (!this._isMoving) {
        this._syncGCInventory();
        this.emit('inventory-updated');
      }
    });

    this.csgo.on('itemChanged', (_oldItem: any, _newItem: any) => {
      if (!this._isMoving) {
        this._syncGCInventory();
        this.emit('inventory-updated');
      }
    });
  }

  private _syncGCInventory() {
    if (!this.csgo.inventory) return;
    this._gcInventory = this.csgo.inventory;
    // Rebuild _inventory from GC, enriching with existing HTTP data
    // Exclude items inside caskets AND storage units themselves
    const httpMap = new Map<string, InventoryItem>();
    for (const item of this._inventory) {
      httpMap.set(item.id, item);
    }
    this._inventory = this.csgo.inventory
      .filter((item: any) => !item.casket_id && item.def_index !== 1201)
      .map((item: any) => {
        const http = httpMap.get(String(item.id));
        return http || {
          id: String(item.id),
          classid: String(item.classid || ''),
          instanceid: String(item.instanceid || ''),
          name: resolveItemName(item.def_index, item.paint_index, item.custom_name),
          market_hash_name: item.market_hash_name || '',
          icon_url: '',
          tradable: item.tradable !== false,
          marketable: item.marketable !== false,
          type: '',
          rarity: '',
          quality: '',
        };
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

  // --- Web Session (cookies from browser login) ---

  /**
   * Set Steam web session from captured browser cookies.
   * This is sufficient for all trade/market operations via backend.
   * Does NOT connect to Game Coordinator (storage unit moves need that separately).
   */
  setWebSession(steamLoginSecure: string, sessionId: string | null) {
    const cookies = [
      `steamLoginSecure=${steamLoginSecure}`,
      ...(sessionId ? [`sessionid=${sessionId}`] : []),
    ];
    this.community.setCookies(cookies);
    this.tradeManager.setCookies(cookies, (err: Error | null) => {
      if (err) console.warn('[SteamClient] tradeManager.setCookies error:', err.message);
    });
    this._isLoggedIn = true;
    // Extract steamId from the cookie (it's encoded in the JWT part)
    if (!this._steamId) {
      const steamId = this.extractSteamIdFromCookie(steamLoginSecure);
      if (steamId) this._steamId = steamId;
    }
    this.emit('status-changed', this.status);
    console.log('[SteamClient] Web session set — steam-user connected via cookies');
  }

  private extractSteamIdFromCookie(steamLoginSecure: string): string | null {
    try {
      const decoded = decodeURIComponent(steamLoginSecure);
      const parts = decoded.split('||');
      const steamId = parts[0];
      if (steamId && /^\d{17}$/.test(steamId)) return steamId;
    } catch {}
    return null;
  }

  // --- Authentication ---

  async login(username: string, password: string): Promise<{ success: boolean; error?: string; requiresGuard?: boolean; qrUrl?: string }> {
    try {
      const session = new LoginSession(EAuthTokenPlatformType.SteamClient);

      session.on('authenticated', async () => {
        if (this._isConnecting || this._isLoggedIn) {
          try { this.user.logOff(); } catch {}
          await new Promise(r => setTimeout(r, 800));
        }
        this._isConnecting = true;
        this._refreshToken = session.refreshToken;
        try {
          this.user.logOn({ refreshToken: session.refreshToken });
        } catch (err: any) {
          this._isConnecting = false;
          this.emit('error', err.message);
        }
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
        if (this._isConnecting || this._isLoggedIn) {
          try { this.user.logOff(); } catch {}
          await new Promise(r => setTimeout(r, 800));
        }
        this._isConnecting = true;
        this._refreshToken = session.refreshToken;
        try {
          this.user.logOn({ refreshToken: session.refreshToken });
        } catch (err: any) {
          this._isConnecting = false;
          this.emit('error', err.message);
        }
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
    if (this._isLoggedIn) return { success: true };
    if (this._isConnecting) return { success: false, error: 'Already connecting' };
    try {
      this._isConnecting = true;
      this._refreshToken = refreshToken;
      this.user.logOn({ refreshToken });
      return { success: true };
    } catch (err: any) {
      this._isConnecting = false;
      this._refreshToken = null;
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
    if (this._inventory.length > 0) return this._inventory;
    await this.waitForGC();
    return this._inventory;
  }

  async refreshInventory(): Promise<InventoryItem[]> {
    if (!this._isLoggedIn) throw new Error('Not logged in');

    // GC events keep _inventory in sync via _syncGCInventory
    // If we have items with icon_url, return as-is. Otherwise try HTTP once.
    if (this._inventory.length > 0 && this._inventory[0]?.icon_url) {
      return this._inventory;
    }

    try {
      const items = await this.fetchInventoryHTTP();
      return items;
    } catch {
      return this._inventory;
    }
  }

  private async fetchInventoryHTTP(): Promise<InventoryItem[]> {
    const steamId = this.user.steamID?.getSteamID64();
    if (!steamId) throw new Error('No Steam ID');

    const allItems: InventoryItem[] = [];
    let startAssetId: string | undefined;

    while (true) {
      const qs: any = { l: 'english', count: 2000 };
      if (startAssetId) qs.start_assetid = startAssetId;

      const data: any = await new Promise((resolve, reject) => {
        this.community.httpRequest({
          uri: `https://steamcommunity.com/inventory/${steamId}/730/2`,
          headers: { Referer: `https://steamcommunity.com/profiles/${steamId}/inventory` },
          qs,
          json: true,
        }, (err: Error | null, _res: any, body: any) => {
          if (err) return reject(err);
          resolve(body);
        });
      });

      if (!data?.assets || !data?.descriptions) break;

      const descMap = new Map<string, any>();
      for (const desc of data.descriptions) {
        descMap.set(`${desc.classid}_${desc.instanceid}`, desc);
        // Cache by classid for casket content enrichment
        this._descCache.set(String(desc.classid), desc);
      }

      for (const asset of data.assets) {
        const desc = descMap.get(`${asset.classid}_${asset.instanceid}`) || {};
        // Skip storage units
        if ((desc.type || '').includes('Storage Unit')) continue;
        allItems.push({
          id: asset.assetid,
          classid: asset.classid,
          instanceid: asset.instanceid,
          name: desc.name || '',
          market_hash_name: desc.market_hash_name || '',
          icon_url: desc.icon_url || '',
          tradable: !!desc.tradable,
          marketable: !!desc.marketable,
          type: desc.type || '',
          rarity: desc.tags?.find((t: any) => t.category === 'Rarity')?.localized_tag_name,
          quality: desc.tags?.find((t: any) => t.category === 'Quality')?.localized_tag_name,
        });
      }

      if (data.more_items && data.last_assetid) {
        startAssetId = data.last_assetid;
      } else {
        break;
      }
    }

    this._inventory = allItems;
    console.log(`[Inventory] Loaded ${allItems.length} items via HTTP`);
    return allItems;
  }


  // --- Storage Units (Caskets) ---

  async getStorageUnits(): Promise<any[]> {
    if (!this._isLoggedIn || !this.gcReady) throw new Error('Not connected to GC');

    // Storage units have def_index 1201 — use raw GC data
    const units = this._gcInventory
      .filter((item: any) => item.def_index === 1201)
      .map((item: any) => ({
        id: String(item.id),
        name: item.custom_name || '',
        item_count: item.casket_contained_item_count || 0,
        activated: !!item.custom_name,
      }));
    console.log(`[Storage] GC inventory: ${this._gcInventory.length} items, found ${units.length} storage units`);
    if (units.length === 0 && this._gcInventory.length > 0) {
      // Debug: show unique def_index values
      const defIndexes = [...new Set(this._gcInventory.map((i: any) => i.def_index))];
      console.log(`[Storage] def_index values in GC: ${defIndexes.slice(0, 20).join(', ')}`);
    }
    return units;
  }

  async getStorageUnitContents(casketId: string): Promise<any[]> {
    if (!this.gcReady) throw new Error('Not connected to GC');

    // Get GC items from casket
    const gcItems: any[] = await new Promise((resolve) => {
      this.csgo.getCasketContents(casketId, (err: Error | null, items: any[]) => {
        if (err) {
          console.error('[Storage] getCasketContents error:', err.message);
          resolve([]);
          return;
        }
        resolve(items || []);
      });
    });

    if (gcItems.length === 0) return [];

    // Find classids not yet in cache
    const missingClassIds = new Set<string>();
    for (const item of gcItems) {
      const cid = String(item.classid);
      if (cid && !this._descCache.has(cid)) missingClassIds.add(cid);
    }

    // Fetch missing descriptions via Steam Economy API
    if (missingClassIds.size > 0) {
      try {
        // Build query string: classinfo/730/classid1/classid2/...
        const classIdList = Array.from(missingClassIds).slice(0, 100); // API limit
        const qs: any = { appid: 730 };
        classIdList.forEach((cid, i) => { qs[`classid${i}`] = cid; });
        qs.class_count = classIdList.length;

        if (this._apiKey) qs.key = this._apiKey;

        const data: any = await new Promise((resolve, reject) => {
          this.community.httpRequest({
            uri: `https://api.steampowered.com/ISteamEconomy/GetAssetClassInfo/v1/`,
            qs,
            json: true,
          }, (err: Error | null, _res: any, body: any) => {
            if (err) return reject(err);
            resolve(body);
          });
        });

        if (data?.result?.success && data.result) {
          for (const [cid, info] of Object.entries(data.result)) {
            if (cid === 'success') continue;
            const desc = info as any;
            this._descCache.set(cid, {
              name: desc.name || desc.market_hash_name || '',
              market_hash_name: desc.market_hash_name || desc.name || '',
              icon_url: desc.icon_url || '',
              type: desc.type || '',
              tags: desc.tags ? Object.values(desc.tags) : [],
            });
          }
        }
      } catch (err) {
        console.log('[Storage] GetAssetClassInfo failed:', (err as any)?.message);
      }
    }

    // Log first GC item to understand structure
    if (gcItems.length > 0) {
      const sample = gcItems[0];
      const stickerAttr = (sample.attribute || []).find((a: any) => a.def_index === 166);
      const musicAttr = (sample.attribute || []).find((a: any) => a.def_index === 166);
      console.log(`[Storage] Sample GC item: def_index=${sample.def_index}, paint_index=${sample.paint_index}, classid=${sample.classid}`);
      console.log(`[Storage] Sample attributes: ${(sample.attribute || []).map((a: any) => `${a.def_index}=${a.value}`).join(', ')}`);
      console.log(`[Storage] Sample stickers: ${JSON.stringify(sample.stickers)}`);
      console.log(`[Storage] Sample origin=${sample.origin}, rarity=${sample.rarity}, quality=${sample.quality}`);
      console.log(`[Storage] Sample keys: ${Object.keys(sample).join(', ')}`);
    }

    // Map with enriched cache
    // Extract paint_index from top-level or attributes for stickers/music kits
    const mapped = gcItems.map((item: any) => {
      const attrs = item.attribute || [];
      const paintIndex = item.paint_index
        || item.paint_kit
        || attrs.find((a: any) => a.def_index === 6)?.value  // paint kit attribute
        || undefined;
      // For stickers, the sticker_id is in the stickers array
      const stickerId = (item.stickers && item.stickers[0]?.sticker_id) || undefined;

      // For stickers (def_index 1209), use sticker_id as the kit identifier
      const effectivePaintIndex = (item.def_index === 1209 || item.def_index === 1348) ? stickerId : paintIndex;

      const desc = this._descCache.get(String(item.classid));
      const name = desc?.name || resolveItemName(item.def_index, effectivePaintIndex, item.custom_name);
      return {
        id: String(item.id),
        classid: String(item.classid || effectivePaintIndex || item.def_index),
        name,
        market_hash_name: desc?.market_hash_name || name,
        icon_url: desc?.icon_url || '',
        icon_url_full: resolveItemIcon(item.def_index, effectivePaintIndex, stickerId) || '',
        tradable: true,
        type: desc?.type || '',
        rarity: desc?.tags?.find((t: any) => t.category === 'Rarity')?.localized_tag_name || '',
      };
    });

    const withIcons = mapped.filter((i: any) => i.icon_url_full).length;
    console.log(`[Storage] Casket ${casketId}: ${mapped.length} items, ${new Set(mapped.map((i: any) => i.classid)).size} unique classids, ${withIcons} with icons`);
    return mapped;
  }

  async moveToStorageUnit(itemIds: string[], casketId: string): Promise<{ success: boolean; moved: number }> {
    if (!this.gcReady) throw new Error('Not connected to GC');

    this._isMoving = true;
    let moved = 0;
    const total = itemIds.length;
    console.log(`[Move] Depositing ${total} items to casket ${casketId}`);

    for (const itemId of itemIds) {
      try {
        this.csgo.addToCasket(casketId, itemId);
        await new Promise(r => setTimeout(r, 1000));
        moved++;
        this.emit('transfer-progress', { current: moved, total, direction: 'to' });
      } catch (err) {
        console.error(`[Move] ✗ item ${itemId}:`, (err as any)?.message);
      }
    }

    // Settle, sync, notify
    await new Promise(r => setTimeout(r, 500));
    this._isMoving = false;
    this._syncGCInventory();
    this.emit('inventory-updated');
    console.log(`[Move] Done: ${moved}/${total}`);
    return { success: moved > 0, moved };
  }

  async moveFromStorageUnit(itemIds: string[], casketId: string): Promise<{ success: boolean; moved: number }> {
    if (!this.gcReady) throw new Error('Not connected to GC');

    this._isMoving = true;
    let moved = 0;
    const total = itemIds.length;
    console.log(`[Move] Withdrawing ${total} items from casket ${casketId}`);

    for (const itemId of itemIds) {
      try {
        this.csgo.removeFromCasket(casketId, itemId);
        await new Promise(r => setTimeout(r, 1000));
        moved++;
        this.emit('transfer-progress', { current: moved, total, direction: 'from' });
      } catch (err) {
        console.error(`[Move] ✗ item ${itemId}:`, (err as any)?.message);
      }
    }

    await new Promise(r => setTimeout(r, 500));
    this._isMoving = false;
    this._syncGCInventory();
    this.emit('inventory-updated');
    console.log(`[Move] Done: ${moved}/${total}`);
    return { success: moved > 0, moved };
  }

  async moveBetweenStorageUnits(
    itemIds: string[],
    sourceCasketId: string,
    targetCasketId: string
  ): Promise<{ success: boolean; moved: number }> {
    if (!this.gcReady) throw new Error('Not connected to GC');

    let moved = 0;
    const total = itemIds.length;
    for (const itemId of itemIds) {
      try {
        // Remove from source
        await new Promise<void>((resolve) => {
          this.csgo.removeFromCasket(sourceCasketId, itemId);
          setTimeout(resolve, 1000);
        });
        // Add to target
        await new Promise<void>((resolve) => {
          this.csgo.addToCasket(targetCasketId, itemId);
          setTimeout(resolve, 1000);
        });
        moved++;
        this.emit('item-moved', { itemId, casketId: targetCasketId, direction: 'between' });
        this.emit('transfer-progress', { current: moved, total, direction: 'between' });
      } catch (err) {
        // Continue with next item
      }
    }

    return { success: moved > 0, moved };
  }

  // --- Item Operations ---

  async renameStorageUnit(itemId: string, newName: string): Promise<{ success: boolean }> {
    if (!this.gcReady) throw new Error('Not connected to GC');

    try {
      // nameTagId = 0 for storage units (free rename)
      this.csgo.nameItem(0, itemId, newName);
      await new Promise(r => setTimeout(r, 1000));
      console.log(`[Storage] Renamed unit ${itemId} to "${newName}"`);
      this._syncGCInventory();
      return { success: true };
    } catch (err) {
      console.error('[Storage] Rename failed:', (err as any)?.message);
      return { success: false };
    }
  }

  async renameItem(itemId: string, name: string): Promise<{ success: boolean }> {
    if (!this.gcReady) throw new Error('Not connected to GC');

    try {
      this.csgo.nameItem(0, itemId, name);
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
