import { InventoryScanner } from './core/scanner';
import { InventoryOverlay } from './ui/overlay';
import { ItemRenderer } from './ui/item-renderer';
import { ItemDetailRenderer } from './ui/detail-renderer';
import { DataStore } from './core/store';

class InventoryApp {
  private scanner: InventoryScanner;
  private overlay: InventoryOverlay;
  private store: DataStore;
  private isTagging: boolean = false;

  constructor() {
    this.scanner = InventoryScanner.getInstance();
    this.overlay = new InventoryOverlay();
    this.store = DataStore.getInstance();
  }

  async run() {
    console.log('[SkinKeeper] Inventory Engine v2.4 starting (Safe Mode)...');
    
    try {
      await this.store.init();

      this.scanner.watch(async (state) => {
        if (state.items && state.items.length > 0) {
          this.store.updateFromSteam(state.items);
        }

        // Background enrichment
        this.store.fetchEnrichedData().then(() => {
           this.safeTagItems();
           this.updateUI(state);
        });

        this.safeTagItems();
        this.updateUI(state);
      });

      const invElement = document.getElementById('inventories');
      if (invElement) {
        let debounceTimer: any;
        const observer = new MutationObserver((mutations) => {
          // Ignore mutations that we caused ourselves
          const isOurMutation = mutations.some(m => 
            Array.from(m.addedNodes).some(n => (n as HTMLElement).classList?.contains('sk-item-overlay'))
          );
          if (isOurMutation) return;

          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => this.safeTagItems(), 300);
        });

        observer.observe(invElement, { childList: true, subtree: true });

        invElement.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          const holder = target.closest('.itemHolder');
          if (holder) this.handleItemSelection(holder as HTMLElement);
        });
      }
    } catch (e) {
      console.error('[SkinKeeper] Critical Init Error:', e);
    }
  }

  private updateUI(state: any) {
    this.overlay.update({
      itemCount: state.itemCount,
      totalValue: this.store.getTotalValue()
    });
  }

  private safeTagItems() {
    if (this.isTagging) return;
    this.isTagging = true;
    this.tagAllVisibleItems();
    this.isTagging = false;
  }

  private handleItemSelection(holder: HTMLElement) {
    const assetId = this.getAssetId(holder);
    if (assetId) {
      setTimeout(() => {
        const itemData = this.store.getById(assetId);
        ItemDetailRenderer.render(itemData || { assetId, name: 'Skin' });
      }, 50);
    }
  }

  private getAssetId(el: HTMLElement): string | null {
    const itemLink = el.querySelector('a[href*="#730_2_"]');
    const match = itemLink?.getAttribute('href')?.match(/730_2_(\d+)/);
    if (match) return match[1];
    const idMatch = el.id.match(/item730_2_(\d+)/);
    if (idMatch) return idMatch[1];
    return null;
  }

  private tagAllVisibleItems() {
    const holders = document.querySelectorAll('.itemHolder');
    holders.forEach((holder) => {
      const htmlEl = holder as HTMLElement;
      // Skip if already tagged to save CPU
      if (htmlEl.dataset.skRendered === 'true') return;

      const assetId = this.getAssetId(htmlEl);
      if (assetId) {
        const itemData = this.store.getById(assetId);
        if (itemData) {
          ItemRenderer.render(htmlEl, {
            float: itemData.float,
            price: itemData.price,
            profit: itemData.profit,
            profitPct: itemData.profitPct,
            isBlueGem: itemData.isBlueGem,
            phase: itemData.phase,
            rarityColor: itemData.rarityColor,
            isRare: itemData.isRare
          });
        }
      }
    });
  }
}

const app = new InventoryApp();
app.run();
