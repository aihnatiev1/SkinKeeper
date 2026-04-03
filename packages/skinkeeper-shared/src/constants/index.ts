// ─── Wear Ranges ─────────────────────────────────────────────────────
export const WEAR_RANGES: [string, string, number, number][] = [
  ['Factory New', 'FN', 0.00, 0.07],
  ['Minimal Wear', 'MW', 0.07, 0.15],
  ['Field-Tested', 'FT', 0.15, 0.38],
  ['Well-Worn', 'WW', 0.38, 0.45],
  ['Battle-Scarred', 'BS', 0.45, 1.00],
];

export const WEAR_SHORT: Record<string, string> = {
  'Factory New': 'FN', 'Minimal Wear': 'MW', 'Field-Tested': 'FT',
  'Well-Worn': 'WW', 'Battle-Scarred': 'BS',
};

// ─── Doppler Phases (paint_index → phase) ────────────────────────────
export interface PhaseInfo {
  phase: string;
  color: string;
  emoji: string;
  tier: number;
  priceMultiplier: number;
}

export const DOPPLER_PHASES: Record<number, PhaseInfo> = {
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

// ─── Marketplace Fees ────────────────────────────────────────────────
export const MARKETPLACE_FEES: Record<string, number> = {
  steam: 0.1304,    // 5% Steam + 10% CS2 game fee ≈ 13.04%
  buff: 0.025,      // 2.5%
  csfloat: 0.02,    // 2%
  skinport: 0.06,   // 6%
  dmarket: 0.05,    // 5%
  bitskins: 0.05,   // 5%
};

// ─── Steam Currency Map ──────────────────────────────────────────────
export const CURRENCY_MAP: Record<number, [string, string]> = {
  1: ['USD', '$'], 2: ['GBP', '£'], 3: ['EUR', '€'], 5: ['RUB', '₽'],
  7: ['BRL', 'R$'], 17: ['TRY', '₺'], 18: ['UAH', '₴'], 20: ['CAD', 'CA$'],
  21: ['AUD', 'A$'], 23: ['CNY', '¥'], 37: ['KZT', '₸'],
};

// ─── Rarity Order ────────────────────────────────────────────────────
export const RARITY_ORDER: Record<string, number> = {
  'Contraband': 7, 'Covert': 6, 'Classified': 5, 'Restricted': 4,
  'Mil-Spec Grade': 3, 'Industrial Grade': 2, 'Consumer Grade': 1, 'Base Grade': 0,
};

// ─── Known Fire & Ice seeds (Marble Fade) ────────────────────────────
export const FIRE_ICE_SEEDS = new Set([
  412, 695, 942, 413, 82, 159, 321, 393, 489, 617, 653, 691, 780, 825, 896, 922,
]);
export const FAKE_FIRE_ICE_SEEDS = new Set([
  2, 55, 96, 152, 203, 248, 312, 367, 445, 512, 578, 634, 712, 834,
]);

// ─── Known AK-47 Blue Gems ──────────────────────────────────────────
export const AK_BLUE_GEMS: Record<number, { tier: number; blue: number }> = {
  661: { tier: 1, blue: 95 }, 670: { tier: 1, blue: 92 }, 387: { tier: 1, blue: 90 },
  955: { tier: 2, blue: 85 }, 321: { tier: 2, blue: 82 }, 809: { tier: 2, blue: 80 },
  555: { tier: 3, blue: 75 }, 760: { tier: 3, blue: 72 }, 868: { tier: 3, blue: 70 },
};
