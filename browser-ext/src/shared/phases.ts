/**
 * Doppler / Fade / Marble Fade phase detection from paint_index
 *
 * Paint Index → Phase mapping for Doppler knives:
 *   415 = Ruby
 *   416 = Sapphire
 *   417 = Black Pearl
 *   418 = Phase 1
 *   419 = Phase 2
 *   420 = Phase 3
 *   421 = Phase 4
 *   568 = Emerald (Gamma Doppler)
 *   569 = Gamma Phase 1
 *   570 = Gamma Phase 2
 *   571 = Gamma Phase 3
 *   572 = Gamma Phase 4
 *
 * Fade knives: paint_index = 38 (all Fade variants use same index)
 *   Fade % is calculated from paint_seed using a lookup table
 *
 * Marble Fade: paint_index = 413
 *   Pattern determined by paint_seed:
 *   - Fire & Ice (red + blue only, no yellow)
 *   - Tricolor (red + yellow + blue)
 *   - Blue dominant / Red dominant
 */

export type DopplerPhase =
  | 'Phase 1' | 'Phase 2' | 'Phase 3' | 'Phase 4'
  | 'Ruby' | 'Sapphire' | 'Black Pearl' | 'Emerald'
  | 'Gamma P1' | 'Gamma P2' | 'Gamma P3' | 'Gamma P4';

export interface PhaseInfo {
  phase: string;
  color: string;       // hex color for badge
  emoji: string;       // visual indicator
  tier: number;        // 1 = most valuable (Ruby/Sapphire), 4 = least
  priceMultiplier: number;  // approximate multiplier over base Doppler price
}

const DOPPLER_PHASES: Record<number, PhaseInfo> = {
  415: { phase: 'Ruby',         color: '#dc2626', emoji: '💎', tier: 1, priceMultiplier: 8.0 },
  416: { phase: 'Sapphire',     color: '#2563eb', emoji: '💎', tier: 1, priceMultiplier: 10.0 },
  417: { phase: 'Black Pearl',  color: '#7c3aed', emoji: '💎', tier: 1, priceMultiplier: 6.0 },
  418: { phase: 'Phase 1',      color: '#1e1b4b', emoji: 'P1', tier: 3, priceMultiplier: 1.0 },
  419: { phase: 'Phase 2',      color: '#ec4899', emoji: 'P2', tier: 2, priceMultiplier: 1.3 },
  420: { phase: 'Phase 3',      color: '#16a34a', emoji: 'P3', tier: 4, priceMultiplier: 0.9 },
  421: { phase: 'Phase 4',      color: '#0ea5e9', emoji: 'P4', tier: 2, priceMultiplier: 1.2 },
  568: { phase: 'Emerald',      color: '#059669', emoji: '💎', tier: 1, priceMultiplier: 12.0 },
  569: { phase: 'Gamma P1',     color: '#065f46', emoji: 'G1', tier: 3, priceMultiplier: 1.0 },
  570: { phase: 'Gamma P2',     color: '#10b981', emoji: 'G2', tier: 2, priceMultiplier: 1.3 },
  571: { phase: 'Gamma P3',     color: '#84cc16', emoji: 'G3', tier: 4, priceMultiplier: 0.9 },
  572: { phase: 'Gamma P4',     color: '#22d3ee', emoji: 'G4', tier: 3, priceMultiplier: 1.1 },
};

export function getDopplerPhase(paintIndex: number): PhaseInfo | null {
  return DOPPLER_PHASES[paintIndex] || null;
}

export function isDoppler(marketHashName: string): boolean {
  const lower = marketHashName.toLowerCase();
  return lower.includes('doppler') || lower.includes('gamma doppler');
}

// ─── Fade Detection ───────────────────────────────────────────────────

export interface FadeInfo {
  percentage: number;   // 80-100%
  tier: string;         // "Full Fade", "95%", "90%", etc.
  color: string;
}

/**
 * Approximate fade percentage from paint_seed.
 * Real calculation requires the full fade lookup table.
 * This is a simplified heuristic.
 */
export function calculateFadePercent(paintSeed: number): FadeInfo {
  // Simplified: paint_seed 0-1000 maps roughly to fade %
  // Real implementation needs per-weapon lookup tables from csfloat
  // This gives a reasonable approximation
  const raw = ((paintSeed % 1001) / 1000);
  const pct = Math.round(80 + raw * 20); // 80-100% range

  let tier: string;
  let color: string;
  if (pct >= 99) { tier = 'Full Fade'; color = '#fbbf24'; }
  else if (pct >= 95) { tier = `${pct}% Fade`; color = '#f59e0b'; }
  else if (pct >= 90) { tier = `${pct}% Fade`; color = '#d97706'; }
  else if (pct >= 85) { tier = `${pct}% Fade`; color = '#92400e'; }
  else { tier = `${pct}% Fade`; color = '#78716c'; }

  return { percentage: pct, tier, color };
}

export function isFade(marketHashName: string): boolean {
  return marketHashName.toLowerCase().includes('fade') && !marketHashName.toLowerCase().includes('marble');
}

// ─── Marble Fade Detection ────────────────────────────────────────────

export type MarbleFadePattern = 'Fire & Ice' | 'Fake Fire & Ice' | 'Tricolor' | 'Blue Dominant' | 'Red Dominant' | 'Gold';

export interface MarbleFadeInfo {
  pattern: MarbleFadePattern;
  tier: number;         // 1 = true fire/ice, 5 = gold
  color: string;
  priceMultiplier: number;
}

// Known Fire & Ice paint_seeds (partial list — top patterns)
const FIRE_ICE_SEEDS = new Set([
  412, 695, 942, 413, 82, 159, 321, 393, 489, 617, 653, 691, 780, 825, 896, 922,
]);
const FAKE_FIRE_ICE_SEEDS = new Set([
  2, 55, 96, 152, 203, 248, 312, 367, 445, 512, 578, 634, 712, 834,
]);

export function analyzeMarbleFade(paintSeed: number): MarbleFadeInfo {
  if (FIRE_ICE_SEEDS.has(paintSeed)) {
    return { pattern: 'Fire & Ice', tier: 1, color: '#ef4444', priceMultiplier: 3.0 };
  }
  if (FAKE_FIRE_ICE_SEEDS.has(paintSeed)) {
    return { pattern: 'Fake Fire & Ice', tier: 2, color: '#f97316', priceMultiplier: 1.8 };
  }

  // Heuristic based on seed ranges
  const bucket = paintSeed % 10;
  if (bucket <= 2) return { pattern: 'Blue Dominant', tier: 3, color: '#3b82f6', priceMultiplier: 1.3 };
  if (bucket <= 4) return { pattern: 'Red Dominant', tier: 3, color: '#dc2626', priceMultiplier: 1.2 };
  if (bucket <= 6) return { pattern: 'Tricolor', tier: 4, color: '#a855f7', priceMultiplier: 1.0 };
  return { pattern: 'Gold', tier: 5, color: '#eab308', priceMultiplier: 0.9 };
}

export function isMarbleFade(marketHashName: string): boolean {
  return marketHashName.toLowerCase().includes('marble fade');
}

// ─── Case Hardened Blue Gem Detection ─────────────────────────────────

export interface BlueGemInfo {
  tier: number;           // 1-5
  bluePercent: number;    // estimated blue %
  label: string;
}

// Top known blue gem seeds for AK-47 Case Hardened
const AK_BLUE_GEMS: Record<number, { tier: number; blue: number }> = {
  661: { tier: 1, blue: 95 },
  670: { tier: 1, blue: 92 },
  387: { tier: 1, blue: 90 },
  955: { tier: 2, blue: 85 },
  321: { tier: 2, blue: 82 },
  809: { tier: 2, blue: 80 },
  555: { tier: 3, blue: 75 },
  760: { tier: 3, blue: 72 },
  868: { tier: 3, blue: 70 },
};

export function analyzeBlueGem(marketHashName: string, paintSeed: number): BlueGemInfo | null {
  if (!marketHashName.toLowerCase().includes('case hardened')) return null;

  // AK-47 specific patterns
  if (marketHashName.includes('AK-47')) {
    const known = AK_BLUE_GEMS[paintSeed];
    if (known) {
      return {
        tier: known.tier,
        bluePercent: known.blue,
        label: `Tier ${known.tier} Blue Gem (~${known.blue}% blue)`,
      };
    }
  }

  return null;
}

// ─── Phase Badge Creator ──────────────────────────────────────────────

export function createPhaseBadge(info: PhaseInfo | FadeInfo | MarbleFadeInfo | BlueGemInfo): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'sk-phase-badge';

  const color = 'color' in info ? info.color : '#fbbf24';
  badge.style.cssText = `
    display:inline-flex;align-items:center;gap:2px;
    padding:1px 5px;border-radius:4px;font-size:9px;
    font-weight:700;white-space:nowrap;
    background:${color}22;color:${color};
    border:1px solid ${color}44;
  `;

  if ('phase' in info) {
    // Doppler
    badge.textContent = info.phase;
  } else if ('percentage' in info) {
    // Fade
    badge.textContent = (info as FadeInfo).tier;
  } else if ('pattern' in info) {
    // Marble Fade
    badge.textContent = (info as MarbleFadeInfo).pattern;
  } else if ('label' in info) {
    // Blue Gem
    badge.textContent = (info as BlueGemInfo).label;
    if ((info as BlueGemInfo).tier <= 2) {
      badge.style.background = 'rgba(59,130,246,0.2)';
      badge.style.color = '#60a5fa';
      badge.style.border = '1px solid rgba(59,130,246,0.4)';
    }
  }

  return badge;
}
