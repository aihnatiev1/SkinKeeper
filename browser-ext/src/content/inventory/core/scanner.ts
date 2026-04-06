/**
 * SkinKeeper Inventory Scanner (Core)
 */

export interface SteamInventoryState {
  isLoaded: boolean;
  itemCount: number;
  totalValue: number;
  currency: string;
  items: any[];
}

export class InventoryScanner {
  private static instance: InventoryScanner;
  
  private constructor() {}

  static getInstance(): InventoryScanner {
    if (!InventoryScanner.instance) {
      InventoryScanner.instance = new InventoryScanner();
    }
    return InventoryScanner.instance;
  }

  async watch(callback: (state: SteamInventoryState) => void) {
    window.addEventListener('sk_inventory_ready', (e: any) => {
      callback({
        isLoaded: true,
        itemCount: e.detail.count,
        currency: e.detail.currency,
        totalValue: 0,
        items: e.detail.items || []
      });
    });

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
}
