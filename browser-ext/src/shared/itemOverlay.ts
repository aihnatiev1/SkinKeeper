/**
 * Shared item overlay renderer — used by inventory and trade offer pages.
 * Renders price tags, float, exterior, doppler, fade, stickers, seed, etc.
 */
import { el } from './dom';
import { formatFloat, getWearShort, getWearFromName } from './float';
import { getDopplerPhase, isDoppler, isFade, isMarbleFade, calculateFadePercent, analyzeMarbleFade } from './phases';
import { isBlueGemEligible, getBlueGemPercentSync } from './bluegem';
import { formatTradeLock } from './sell';

export interface ItemOverlayData {
  market_hash_name: string;
  name?: string;
  type?: string;
  // Pricing
  price?: number;           // already in user currency
  priceFormatted?: string;  // pre-formatted price string
  // Wear & float
  floatValue?: number | null;
  paintSeed?: number | null;
  paintIndex?: number | null;
  defindex?: number | null;
  // Flags
  isStatTrak?: boolean;
  isSouvenir?: boolean;
  tradable?: boolean;
  marketable?: boolean;
  // Enriched data
  tradeLockDate?: string | null;
  tradeBanUntil?: string | null;
  stickerValueFormatted?: string | null;
  dupCount?: number;
  // Optional P/L
  plPct?: number | null;
  plProfit?: boolean;
  // Rarity
  rarityColor?: string;
}

/**
 * Render all SkinKeeper overlays on an item element.
 * Skips already-tagged elements. Call after ensuring elem.style.position = 'relative'.
 */
export function renderItemOverlays(elem: HTMLElement, data: ItemOverlayData): void {
  // Don't double-tag
  if (elem.querySelector('.sk-price-tag') || elem.querySelector('.sk-item-ext')) return;
  elem.style.position = 'relative';

  const {
    market_hash_name, floatValue, paintSeed, paintIndex, defindex,
    isStatTrak, isSouvenir, price, priceFormatted,
    tradable, tradeLockDate, tradeBanUntil,
    stickerValueFormatted, dupCount, plPct, plProfit, rarityColor,
  } = data;

  // ── Top-right: ST/Souvenir + Exterior label ──
  const wearShort = floatValue != null ? getWearShort(floatValue) : getWearFromName(market_hash_name);
  if (wearShort || isStatTrak || isSouvenir) {
    const extTag = el('div', 'sk-item-ext');
    const parts: string[] = [];
    if (isStatTrak) parts.push('ST');
    if (isSouvenir) parts.push('SV');
    if (wearShort) parts.push(wearShort);
    extTag.textContent = parts.join(' ');
    const wearColors: Record<string, string> = { FN: '#4ade80', MW: '#22d3ee', FT: '#a78bfa', WW: '#f97316', BS: '#ef4444' };
    if (isStatTrak) extTag.style.color = '#cf6a32';
    else if (isSouvenir) extTag.style.color = '#ffd700';
    else if (wearShort && wearColors[wearShort]) extTag.style.color = wearColors[wearShort];
    elem.appendChild(extTag);
  }

  // ── Top-center: Doppler phase / Fade % / Marble Fade ──
  let hasSpecial = false;
  if (paintIndex) {
    const phase = getDopplerPhase(paintIndex);
    if (phase) {
      hasSpecial = true;
      const badge = el('div', 'sk-item-phase');
      if (phase.tier === 1) {
        badge.textContent = phase.phase;
        badge.style.cssText += `font-weight:800;font-size:10px;padding:2px 5px;line-height:1.4;background:linear-gradient(135deg,${phase.color}ee,${phase.color}99);text-shadow:0 0 8px ${phase.color};`;
      } else {
        badge.textContent = phase.emoji;
        badge.style.background = phase.color + 'cc';
      }
      badge.title = phase.phase;
      elem.appendChild(badge);
    }
  }
  if (!hasSpecial && paintSeed != null && isFade(market_hash_name)) {
    hasSpecial = true;
    const fade = calculateFadePercent(paintSeed);
    const badge = el('div', 'sk-item-phase');
    badge.textContent = `${fade.percentage}%`;
    badge.style.cssText += `font-weight:800;font-size:10px;padding:2px 5px;line-height:1.4;background:linear-gradient(135deg,#ff6b35,#f7c948,#6dd5ed);color:#000;text-shadow:0 0 3px rgba(255,255,255,0.4);`;
    badge.title = fade.tier;
    elem.appendChild(badge);
  }
  if (!hasSpecial && paintSeed != null && isMarbleFade(market_hash_name)) {
    hasSpecial = true;
    const mf = analyzeMarbleFade(paintSeed);
    const badge = el('div', 'sk-item-phase');
    badge.textContent = mf.pattern === 'Fire & Ice' ? '\ud83d\udd25\u2744\ufe0f' : mf.pattern.substring(0, 3);
    badge.style.background = mf.color + 'cc';
    badge.title = mf.pattern;
    elem.appendChild(badge);
  }

  // ── Top-left: Trade lock with countdown ──
  if (tradable === false) {
    const lock = el('div', 'sk-lock-badge');
    if (tradeBanUntil) {
      // Store unlock timestamp for live countdown
      const unlockTime = new Date(tradeBanUntil).getTime();
      if (!isNaN(unlockTime) && unlockTime > Date.now()) {
        lock.setAttribute('data-sk-unlock', String(unlockTime));
      }
      const remaining = formatTradeLock(tradeBanUntil);
      if (remaining) {
        lock.textContent = remaining;
        lock.title = `Tradable in ${remaining}`;
      } else {
        lock.textContent = '\ud83d\udd12';
        lock.title = 'Not tradable';
      }
    } else if (tradeLockDate) {
      lock.textContent = tradeLockDate.replace(/,?\s*\d{4}.*/, '').trim();
      lock.title = `Tradable After ${tradeLockDate}`;
    } else {
      lock.textContent = '\ud83d\udd12';
      lock.title = 'Not tradable';
    }
    elem.appendChild(lock);
  }

  // ── Bottom-left: Float value ──
  if (floatValue != null) {
    const floatTag = el('div', 'sk-item-float');
    floatTag.textContent = formatFloat(floatValue);
    floatTag.style.color = 'rgba(255,255,255,0.85)';
    elem.appendChild(floatTag);
  }

  // ── Bottom-right: Price ──
  const priceStr = priceFormatted || (price && price > 0 ? String(price) : '');
  if (priceStr) {
    const tag = el('div', 'sk-price-tag');
    tag.textContent = priceStr;
    elem.appendChild(tag);
  }

  // ── Paint seed + blue gem % ──
  if (paintSeed != null && (isDoppler(market_hash_name) || isFade(market_hash_name) || isMarbleFade(market_hash_name) || isBlueGemEligible(market_hash_name))) {
    const seedTag = el('div', 'sk-item-seed');
    const bgData = (paintIndex != null || defindex)
      ? getBlueGemPercentSync(defindex || 0, paintIndex || 44, paintSeed)
      : null;
    if (bgData && bgData.pb > 0) {
      seedTag.innerHTML = `${paintSeed} <span style="color:deepskyblue">(${bgData.pb}%)</span>`;
      seedTag.title = `Seed: ${paintSeed} | Playside: ${bgData.pb}% blue | Backside: ${bgData.bb}% blue`;
      if (bgData.pb >= 70) {
        seedTag.style.color = 'deepskyblue';
        seedTag.style.fontWeight = '800';
      }
    } else {
      seedTag.textContent = `${paintSeed}`;
      seedTag.title = `Pattern / Paint Seed: ${paintSeed}`;
    }
    elem.appendChild(seedTag);
  }

  // ── Sticker value ──
  if (stickerValueFormatted) {
    const sv = el('div', 'sk-item-sticker-val');
    sv.textContent = stickerValueFormatted;
    sv.title = `Sticker value: ${stickerValueFormatted}`;
    elem.appendChild(sv);
  }

  // ── Duplicate count ──
  if (dupCount && dupCount > 1) {
    const dup = el('div', 'sk-dup-badge');
    dup.textContent = `x${dupCount}`;
    dup.title = `You have ${dupCount} of this item`;
    elem.appendChild(dup);
  }

  // ── Float bar ──
  if (floatValue != null) {
    const bar = document.createElement('div');
    bar.className = 'sk-float-bar';
    const marker = document.createElement('div');
    marker.className = 'sk-float-marker';
    marker.style.left = `${floatValue * 100}%`;
    bar.appendChild(marker);
    elem.appendChild(bar);
  }

  // ── P/L overlay ──
  if (plPct != null && plPct !== 0) {
    const plTag = el('div', 'sk-item-pl');
    plTag.classList.add(plProfit ? 'sk-pl-profit' : 'sk-pl-loss');
    const sign = plProfit ? '+' : '';
    plTag.textContent = `${sign}${plPct.toFixed(1)}%`;
    elem.appendChild(plTag);
  }

  // ── Rarity border ──
  if (rarityColor) {
    elem.style.borderLeft = `3px solid #${rarityColor}`;
  }
}

/**
 * Remove all SkinKeeper overlay elements from an item.
 */
export function clearItemOverlays(elem: HTMLElement): void {
  elem.querySelectorAll(
    '.sk-price-tag, .sk-dup-badge, .sk-lock-badge, .sk-item-float, .sk-item-wear, ' +
    '.sk-item-ext, .sk-item-phase, .sk-item-seed, .sk-item-sticker-val, .sk-item-pl, .sk-float-bar'
  ).forEach(e => e.remove());
}
