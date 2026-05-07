/**
 * SkinKeeper Data Store (Core)
 */

import { sendMessage } from '../../../shared/dom';
import { loadBulkPrices, loadExchangeRates, getItemPrice, getItemPriceEntry } from '../../../shared/steam';

export interface ItemData {
  assetId?: string;
  name: string;
  float?: number;
  price?: number;
  profit?: number;
  profitPct?: number;
  isBlueGem?: boolean;
  phase?: string;
  rarityColor?: string;
  isRare?: boolean;
}

export class DataStore {
  private static instance: DataStore;
  private items: Map<string, ItemData> = new Map();
  private exchangeRate: number = 1;
  private pricesLoaded: boolean = false;

  private constructor() {}

  static getInstance(): DataStore {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore();
    }
    return DataStore.instance;
  }

  async init() {
    if (this.pricesLoaded) return;
    try {
      const [, rates] = await Promise.all([loadBulkPrices('steam'), loadExchangeRates()]);
      this.exchangeRate = rates?.['USD'] || 1;
      this.pricesLoaded = true;
    } catch (e) { console.warn('[SkinKeeper Store] Price init failed', e); }
  }

  updateFromSteam(items: any[]) {
    // Collect items with inspect data to sync to backend
    const toSync: any[] = [];

    items.forEach(item => {
      const price = getItemPrice(item.name, this.exchangeRate);
      const existing = this.items.get(item.assetid) || { assetId: item.assetid, name: item.name };

      const updated: ItemData = {
        ...existing,
        price: price > 0 ? price : (existing as ItemData).price,
        rarityColor: item.rarity_color || (existing as ItemData).rarityColor,
        isRare: item.type?.toLowerCase().includes('knife') || item.type?.toLowerCase().includes('gloves')
      };

      this.items.set(item.assetid, updated);

      // Queue items that have float/seed/paint/sticker/charm data for backend
      // sync, OR a fully resolved inspect_link (no %propid placeholders) — the
      // backend can decode that locally to recover all fields.
      const hasStickers = item.stickers && item.stickers.length > 0;
      const hasCharms = item.charms && item.charms.length > 0;
      const link = item.inspectLink;
      const hasResolvedLink = typeof link === 'string'
        && link.includes('csgo_econ_action_preview')
        && !link.includes('%propid');
      // Trade lock: ship the raw Steam string ("Apr 30, 2026 (06:00:00) GMT")
      // and let the backend do the actual ISO conversion. Two reasons:
      //   1) the same parser in steam.ts:tradeBanUntil already handles all
      //      the format quirks; duplicating it here just creates drift.
      //   2) Steam intermittently localizes the month name, which Date.parse
      //      tolerates for English but not always for non-English locales —
      //      the backend probe is locked to English.
      const lockRaw = typeof item.tradeLockDate === 'string' ? item.tradeLockDate : null;
      if (
        item.float != null
        || item.paintSeed != null
        || item.paintIndex != null
        || hasStickers
        || hasCharms
        || hasResolvedLink
        || lockRaw
      ) {
        toSync.push({
          asset_id: item.assetid,
          float_value: item.float,
          paint_seed: item.paintSeed,
          paint_index: item.paintIndex,
          stickers: hasStickers ? item.stickers : null,
          charms: hasCharms ? item.charms : null,
          inspect_link: hasResolvedLink ? link : null,
          trade_lock_date: lockRaw,
        });
      }
    });

    // Push to backend via background script (fire & forget)
    if (toSync.length > 0) {
      // Telemetry: at a glance from a Steam tab DevTools, see whether the
      // page state actually carries the data we need. If "links=0" stays
      // zero across many syncs, Steam stopped exposing property #6 and
      // we'll need a different fallback.
      const withFloat = toSync.filter(t => t.float_value != null).length;
      const withSeed = toSync.filter(t => t.paint_seed != null).length;
      const withPaintIdx = toSync.filter(t => t.paint_index != null).length;
      const withStickers = toSync.filter(t => t.stickers != null).length;
      const withCharms = toSync.filter(t => t.charms != null).length;
      const withLinks = toSync.filter(t => t.inspect_link != null).length;
      const withLock = toSync.filter(t => t.trade_lock_date != null).length;
      console.log(
        `[SkinKeeper Sync] ${toSync.length} items: ` +
        `float=${withFloat} seed=${withSeed} paintIdx=${withPaintIdx} ` +
        `stickers=${withStickers} charms=${withCharms} ` +
        `links=${withLinks} lock=${withLock}`
      );
      sendMessage({ type: 'SYNC_ITEMS', items: toSync }).catch(() => {});
    }
  }

  async fetchEnrichedData() {
    try {
      const data = await sendMessage({ type: 'GET_INVENTORY' });
      if (data?.items) {
        data.items.forEach((item: any) => {
          const existing = this.items.get(item.asset_id) || { assetId: item.asset_id, name: item.market_hash_name || item.name };
          const updated: ItemData = {
            ...existing,
            float: item.float_value,
            profit: item.profit_cents ? item.profit_cents / 100 : undefined,
            profitPct: item.profit_pct,
            isBlueGem: item.is_blue_gem,
            phase: item.phase
          };
          this.items.set(item.asset_id, updated);
        });
      }
    } catch (e) { console.error('[SkinKeeper Store] Enrich fail', e); }
  }

  getById(assetId: string): ItemData | undefined {
    return this.items.get(assetId);
  }

  getItem(name: string): ItemData {
    const price = getItemPrice(name, this.exchangeRate);
    return { name, price: price > 0 ? price : undefined };
  }

  getTotalValue(): number {
    return Array.from(this.items.values()).reduce((sum, item) => sum + (item.price || 0), 0);
  }
}
