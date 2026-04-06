/**
 * SkinKeeper Inventory Banner (UI)
 * Injected at the top of the inventory, similar to the reference UI.
 */

export class InventoryOverlay {
  private container: HTMLElement | null = null;

  constructor() {
    // We don't create it in constructor anymore, we wait for the right place in DOM
  }

  update(state: any) {
    const parent = document.querySelector('.inventory_header');
    if (!parent) return;

    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'sk-inventory-banner';
      this.container.style.cssText = `
        margin: 10px 0;
        padding: 15px;
        background: linear-gradient(90deg, rgba(20, 24, 34, 0.95) 0%, rgba(30, 35, 50, 0.9) 100%);
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-family: 'Inter', sans-serif;
        color: #e6edf3;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      `;
      parent.appendChild(this.container);
    }

    const isPos = state.totalValue > 0;

    this.container.innerHTML = `
      <div style="display: flex; align-items: center; gap: 15px;">
        <div style="background: #6366f1; color: white; padding: 4px 8px; border-radius: 6px; font-weight: 900; font-size: 14px; box-shadow: 0 0 10px rgba(99, 102, 241, 0.5);">SK</div>
        <div>
          <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #8b949e; font-weight: 700;">SkinKeeper Portfolio</div>
          <div style="font-size: 18px; font-weight: 800;">$${state.totalValue.toFixed(2)}</div>
        </div>
      </div>
      
      <div style="display: flex; gap: 20px;">
        <div style="text-align: right;">
          <div style="font-size: 10px; color: #8b949e;">Total Items</div>
          <div style="font-size: 14px; font-weight: 700;">${state.itemCount}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; color: #8b949e;">24h Change</div>
          <div style="font-size: 14px; font-weight: 700; color: #4ade80;">+$0.00</div>
        </div>
        <a href="https://app.skinkeeper.store/portfolio" target="_blank" style="align-self: center; background: rgba(99, 102, 241, 0.1); border: 1px solid #6366f1; color: #6366f1; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; transition: all 0.2s;">
          DASHBOARD
        </a>
      </div>
    `;
  }
}
