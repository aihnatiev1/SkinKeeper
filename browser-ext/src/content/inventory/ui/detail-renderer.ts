/**
 * SkinKeeper Item Detail Renderer (UI)
 */

import { DataStore, ItemData } from '../core/store';

export class ItemDetailRenderer {
  private static containerId = 'sk-detail-panel';

  static render(item: ItemData) {
    const steamDetail = document.querySelector('.inventory_iteminfo');
    if (!steamDetail) return;

    let skPanel = document.getElementById(this.containerId);
    if (!skPanel) {
      skPanel = document.createElement('div');
      skPanel.id = this.containerId;
      skPanel.style.cssText = `
        margin-top: 15px; padding: 15px; background: rgba(20, 24, 34, 0.95);
        border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 8px;
        font-family: 'Inter', sans-serif; color: #e6edf3;
      `;
      steamDetail.appendChild(skPanel);
    }

    const float = item.float || 0;

    skPanel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <span style="font-size: 11px; font-weight: 800; color: #6366f1; text-transform: uppercase;">SkinKeeper Intelligence</span>
        <button id="sk-copy-name" style="background: none; border: 1px solid #30363d; color: #8b949e; font-size: 10px; padding: 2px 6px; border-radius: 4px; cursor: pointer;">Copy Name</button>
      </div>

      <div style="margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span>Float Value</span>
          <span style="font-weight: 700; font-family: monospace;">${float.toFixed(10)}</span>
        </div>
        <div style="height: 6px; width: 100%; background: #21262d; border-radius: 3px; overflow: hidden; display: flex;">
          <div style="width: 7%; background: #4ade80; height: 100%;"></div>
          <div style="width: 8%; background: #818cf8; height: 100%;"></div>
          <div style="width: 23%; background: #fbbf24; height: 100%;"></div>
          <div style="width: 7%; background: #fb923c; height: 100%;"></div>
          <div style="width: 55%; background: #f87171; height: 100%;"></div>
        </div>
      </div>

      <a href="https://app.skinkeeper.store/inventory?search=${encodeURIComponent(item.name)}" target="_blank" style="display: block; text-align: center; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; padding: 10px; border-radius: 6px; font-size: 12px; font-weight: 700;">
        Analyze in Portfolio →
      </a>
    `;

    document.getElementById('sk-copy-name')?.addEventListener('click', (e) => {
      navigator.clipboard.writeText(item.name);
      const btn = e.target as HTMLButtonElement;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Name'; }, 2000);
    });
  }
}
