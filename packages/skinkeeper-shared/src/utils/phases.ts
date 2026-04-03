import { DOPPLER_PHASES, FIRE_ICE_SEEDS, FAKE_FIRE_ICE_SEEDS, AK_BLUE_GEMS } from '../constants';
import type { PhaseInfo } from '../constants';
import type { FadeInfo, MarbleFadeInfo, BlueGemInfo } from '../types';

export function getDopplerPhase(paintIndex: number): PhaseInfo | null {
  return DOPPLER_PHASES[paintIndex] || null;
}

export function isDoppler(marketHashName: string): boolean {
  const lower = marketHashName.toLowerCase();
  return lower.includes('doppler') || lower.includes('gamma doppler');
}

export function isFade(marketHashName: string): boolean {
  return marketHashName.toLowerCase().includes('fade') && !marketHashName.toLowerCase().includes('marble');
}

export function isMarbleFade(marketHashName: string): boolean {
  return marketHashName.toLowerCase().includes('marble fade');
}

export function calculateFadePercent(paintSeed: number): FadeInfo {
  const raw = ((paintSeed % 1001) / 1000);
  const pct = Math.round(80 + raw * 20);

  let tier: string;
  let color: string;
  if (pct >= 99) { tier = 'Full Fade'; color = '#fbbf24'; }
  else if (pct >= 95) { tier = `${pct}% Fade`; color = '#f59e0b'; }
  else if (pct >= 90) { tier = `${pct}% Fade`; color = '#d97706'; }
  else if (pct >= 85) { tier = `${pct}% Fade`; color = '#92400e'; }
  else { tier = `${pct}% Fade`; color = '#78716c'; }

  return { percentage: pct, tier, color };
}

export function analyzeMarbleFade(paintSeed: number): MarbleFadeInfo {
  if (FIRE_ICE_SEEDS.has(paintSeed)) {
    return { pattern: 'Fire & Ice', tier: 1, color: '#ef4444', priceMultiplier: 3.0 };
  }
  if (FAKE_FIRE_ICE_SEEDS.has(paintSeed)) {
    return { pattern: 'Fake Fire & Ice', tier: 2, color: '#f97316', priceMultiplier: 1.8 };
  }
  const bucket = paintSeed % 10;
  if (bucket <= 2) return { pattern: 'Blue Dominant', tier: 3, color: '#3b82f6', priceMultiplier: 1.3 };
  if (bucket <= 4) return { pattern: 'Red Dominant', tier: 3, color: '#dc2626', priceMultiplier: 1.2 };
  if (bucket <= 6) return { pattern: 'Tricolor', tier: 4, color: '#a855f7', priceMultiplier: 1.0 };
  return { pattern: 'Gold', tier: 5, color: '#eab308', priceMultiplier: 0.9 };
}

export function analyzeBlueGem(marketHashName: string, paintSeed: number): BlueGemInfo | null {
  if (!marketHashName.toLowerCase().includes('case hardened')) return null;
  if (marketHashName.includes('AK-47')) {
    const known = AK_BLUE_GEMS[paintSeed];
    if (known) {
      return { tier: known.tier, bluePercent: known.blue, label: `Tier ${known.tier} Blue Gem (~${known.blue}% blue)` };
    }
  }
  return null;
}
