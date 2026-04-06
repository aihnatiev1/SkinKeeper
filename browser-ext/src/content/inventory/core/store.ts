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
    });
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
