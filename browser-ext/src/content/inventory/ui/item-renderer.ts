/**
 * SkinKeeper Item Renderer (UI) - Verified Elite Edition
 */

import { DataStore } from '../core/store';

export interface ItemDisplayData {
  float?: number;
  price?: number;
  profit?: number;
  profitPct?: number;
  isBlueGem?: boolean;
  phase?: string;
  rarityColor?: string;
  isRare?: boolean;
}

export class ItemRenderer {
  static render(el: HTMLElement, data: ItemDisplayData) {
    this.clear(el);
    el.dataset.skRendered = 'true';

    const overlay = document.createElement('div');
    overlay.className = 'sk-item-overlay';
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 10;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 5px;
      overflow: hidden;
      border-radius: 4px;
      font-family: 'Inter', sans-serif;
    `;

    // 1. Rare Glow
    if (data.isRare && data.rarityColor) {
      el.style.boxShadow = `inset 0 0 15px ${data.rarityColor}44, 0 0 5px ${data.rarityColor}33`;
    }

    // 2. Top Row (Phase/BlueGem + Price)
    const topRow = document.createElement('div');
    topRow.style.cssText = `display: flex; justify-content: space-between; align-items: flex-start; width: 100%;`;

    if (data.phase) {
      const ph = document.createElement('div');
      ph.style.cssText = `background: rgba(0,0,0,0.7); color: #f472b6; font-size: 9px; font-weight: 900; padding: 1px 3px; border-radius: 2px; border: 1px solid #f472b644;`;
      ph.textContent = data.phase.replace('Phase ', 'P');
      topRow.appendChild(ph);
    } else if (data.isBlueGem) {
      const bg = document.createElement('div');
      bg.style.cssText = `background: #1e40af; color: white; font-size: 8px; font-weight: 900; padding: 1px 3px; border-radius: 2px;`;
      bg.textContent = 'BLUE';
      topRow.appendChild(bg);
    } else {
      topRow.appendChild(document.createElement('div'));
    }

    if (data.price) {
      const pr = document.createElement('div');
      pr.style.cssText = `color: #fff; font-size: 10px; font-weight: 800; text-shadow: 0 1px 2px #000;`;
      pr.textContent = `$${data.price.toFixed(2)}`;
      topRow.appendChild(pr);
    }
    overlay.appendChild(topRow);

    // 3. Profit
    if (data.profitPct !== undefined) {
      const pft = document.createElement('div');
      const isPos = data.profitPct >= 0;
      pft.style.cssText = `align-self: center; font-size: 11px; font-weight: 900; color: ${isPos ? '#4ade80' : '#f87171'}; text-shadow: 0 0 5px #000;`;
      pft.textContent = `${isPos ? '▲' : '▼'} ${Math.abs(data.profitPct).toFixed(1)}%`;
      overlay.appendChild(pft);
    } else {
      overlay.appendChild(document.createElement('div'));
    }

    // 4. Float Bar
    if (data.float !== undefined) {
      const bot = document.createElement('div');
      bot.style.width = '100%';

      const fBar = document.createElement('div');
      fBar.style.cssText = `width: 100%; height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;`;
      
      const prog = document.createElement('div');
      let color = '#4ade80'; 
      if (data.float > 0.07) color = '#818cf8'; 
      if (data.float > 0.15) color = '#fbbf24'; 
      if (data.float > 0.38) color = '#fb923c'; 
      if (data.float > 0.45) color = '#f87171'; 

      prog.style.cssText = `width: ${((1 - data.float) * 100).toFixed(0)}%; height: 100%; background: ${color}; box-shadow: 0 0 3px ${color};`;
      fBar.appendChild(prog);
      bot.appendChild(fBar);
      overlay.appendChild(bot);
    }

    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(overlay);
  }

  private static clear(el: HTMLElement) {
    const existing = el.querySelector('.sk-item-overlay');
    if (existing) existing.remove();
  }
}
