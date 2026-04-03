/**
 * Trade-Up Calculator
 *
 * CS2 Trade-Up Contract rules:
 * - 10 items of same rarity → 1 item of next rarity
 * - Output determined by collection: P(item) = (inputs_from_collection/10) * (1/items_in_next_tier)
 * - Output float = avg_input_float * (max_float - min_float) + min_float
 * - Classified→Covert: max 5 from same collection
 * - StatTrak: all must match
 */

import { sendMessage } from './dom';

// ─── Types ────────────────────────────────────────────────────────────

export interface TradeUpInput {
  name: string;
  market_hash_name: string;
  collection: string;
  rarity: string;
  float_value: number;
  price: number; // current value in user currency
  stattrak: boolean;
}

export interface TradeUpOutput {
  name: string;
  market_hash_name: string;
  collection: string;
  probability: number;
  predicted_float: number;
  predicted_wear: string;
  min_float: number;
  max_float: number;
}

export interface TradeUpResult {
  valid: boolean;
  error?: string;
  inputCost: number;
  avgFloat: number;
  outputs: TradeUpOutput[];
  expectedValue: number; // needs pricing
  profit: number;
  roi: number;
  collections: Map<string, number>; // collection → count
}

// ─── Rarity Tiers ─────────────────────────────────────────────────────

const RARITY_ORDER = [
  'Consumer Grade', 'Industrial Grade', 'Mil-Spec Grade',
  'Restricted', 'Classified', 'Covert',
];

const RARITY_INTERNAL: Record<string, string> = {
  'Consumer Grade': 'common',
  'Industrial Grade': 'uncommon',
  'Mil-Spec Grade': 'rare',
  'Restricted': 'mythical',
  'Classified': 'legendary',
  'Covert': 'ancient',
};

export function getNextRarity(rarity: string): string | null {
  const idx = RARITY_ORDER.indexOf(rarity);
  if (idx < 0 || idx >= RARITY_ORDER.length - 1) return null;
  return RARITY_ORDER[idx + 1];
}

export function normalizeRarity(rarity: string): string {
  // Handle various formats: "Mil-Spec Grade", "Mil-Spec", "Restricted", etc.
  for (const r of RARITY_ORDER) {
    if (rarity.includes(r) || r.includes(rarity)) return r;
  }
  // Try matching partial
  const lower = rarity.toLowerCase();
  if (lower.includes('consumer')) return 'Consumer Grade';
  if (lower.includes('industrial')) return 'Industrial Grade';
  if (lower.includes('mil-spec') || lower.includes('mil spec')) return 'Mil-Spec Grade';
  if (lower.includes('restricted')) return 'Restricted';
  if (lower.includes('classified')) return 'Classified';
  if (lower.includes('covert')) return 'Covert';
  return rarity;
}

// ─── Float Helpers ────────────────────────────────────────────────────

function predictOutputFloat(avgInputFloat: number, minFloat: number, maxFloat: number): number {
  return avgInputFloat * (maxFloat - minFloat) + minFloat;
}

function floatToWear(f: number): string {
  if (f < 0.07) return 'Factory New';
  if (f < 0.15) return 'Minimal Wear';
  if (f < 0.38) return 'Field-Tested';
  if (f < 0.45) return 'Well-Worn';
  return 'Battle-Scarred';
}

// ─── Collections Data (from bymykel CDN) ──────────────────────────────

interface CollectionSkin {
  name: string;
  market_hash_name: string;
  rarity: { name: string };
  min_float: number;
  max_float: number;
  stattrak: boolean;
}

interface CollectionData {
  name: string;
  skins: CollectionSkin[];
}

let collectionsCache: CollectionData[] | null = null;

export async function loadCollections(): Promise<CollectionData[]> {
  if (collectionsCache) return collectionsCache;

  try {
    const data = await sendMessage({
      type: 'FETCH_JSON',
      url: 'https://bymykel.github.io/CSGO-API/api/en/collections.json',
    });

    if (Array.isArray(data)) {
      collectionsCache = data.map((c: any) => ({
        name: c.name || '',
        skins: (c.contains || []).map((s: any) => ({
          name: s.name || '',
          market_hash_name: s.market_hash_name || s.name || '',
          rarity: { name: s.rarity?.name || '' },
          min_float: s.min_float ?? 0,
          max_float: s.max_float ?? 1,
          stattrak: s.stattrak ?? false,
        })),
      }));
      console.log(`[SkinKeeper] Collections loaded: ${collectionsCache.length}`);
      return collectionsCache;
    }
  } catch (err) {
    console.warn('[SkinKeeper] Failed to load collections:', err);
  }

  return [];
}

// ─── Find Next Tier Items ─────────────────────────────────────────────

function findNextTierItems(collectionName: string, nextRarity: string, collections: CollectionData[]): CollectionSkin[] {
  const collection = collections.find(c =>
    c.name === collectionName ||
    c.name.replace('The ', '') === collectionName.replace('The ', '')
  );
  if (!collection) return [];

  return collection.skins.filter(s => {
    const skinRarity = normalizeRarity(s.rarity.name);
    return skinRarity === nextRarity;
  });
}

// ─── Calculate Trade-Up ───────────────────────────────────────────────

export function validateInputs(inputs: TradeUpInput[]): { valid: boolean; error?: string } {
  if (inputs.length === 0) return { valid: false, error: 'Select items for trade-up' };
  if (inputs.length > 10) return { valid: false, error: 'Maximum 10 items' };

  // All same rarity
  const rarities = new Set(inputs.map(i => normalizeRarity(i.rarity)));
  if (rarities.size > 1) return { valid: false, error: `Mixed rarities: ${[...rarities].join(', ')}` };

  const rarity = [...rarities][0];
  if (rarity === 'Covert') return { valid: false, error: 'Covert items cannot be traded up' };

  // StatTrak must all match
  const stTypes = new Set(inputs.map(i => i.stattrak));
  if (stTypes.size > 1) return { valid: false, error: 'Cannot mix StatTrak and non-StatTrak' };

  // 5-per-collection rule for Classified→Covert
  if (rarity === 'Classified') {
    const colCounts = new Map<string, number>();
    for (const i of inputs) {
      colCounts.set(i.collection, (colCounts.get(i.collection) || 0) + 1);
    }
    for (const [col, count] of colCounts) {
      if (count > 5) return { valid: false, error: `Max 5 from "${col}" for Classified→Covert trade-ups` };
    }
  }

  return { valid: true };
}

export async function calculateTradeUp(inputs: TradeUpInput[]): Promise<TradeUpResult> {
  const validation = validateInputs(inputs);
  if (!validation.valid) {
    return {
      valid: false,
      error: validation.error,
      inputCost: 0, avgFloat: 0, outputs: [],
      expectedValue: 0, profit: 0, roi: 0,
      collections: new Map(),
    };
  }

  const rarity = normalizeRarity(inputs[0].rarity);
  const nextRarity = getNextRarity(rarity);
  if (!nextRarity) {
    return {
      valid: false, error: 'No higher tier exists',
      inputCost: 0, avgFloat: 0, outputs: [],
      expectedValue: 0, profit: 0, roi: 0,
      collections: new Map(),
    };
  }

  const inputCost = inputs.reduce((s, i) => s + i.price, 0);
  const avgFloat = inputs.reduce((s, i) => s + i.float_value, 0) / inputs.length;

  // Group by collection
  const colCounts = new Map<string, number>();
  for (const i of inputs) {
    colCounts.set(i.collection, (colCounts.get(i.collection) || 0) + 1);
  }

  // Load collections data
  const collections = await loadCollections();

  // Calculate outputs
  const outputs: TradeUpOutput[] = [];

  for (const [collectionName, count] of colCounts) {
    const colWeight = count / inputs.length;
    const nextItems = findNextTierItems(collectionName, nextRarity, collections);

    if (nextItems.length === 0) continue;

    const perItemProb = colWeight / nextItems.length;

    for (const skin of nextItems) {
      const pFloat = predictOutputFloat(avgFloat, skin.min_float, skin.max_float);
      outputs.push({
        name: skin.name,
        market_hash_name: skin.market_hash_name,
        collection: collectionName,
        probability: perItemProb,
        predicted_float: pFloat,
        predicted_wear: floatToWear(pFloat),
        min_float: skin.min_float,
        max_float: skin.max_float,
      });
    }
  }

  // Sort by probability desc
  outputs.sort((a, b) => b.probability - a.probability);

  return {
    valid: true,
    inputCost,
    avgFloat,
    outputs,
    expectedValue: 0, // Needs price data — filled by caller
    profit: 0,
    roi: 0,
    collections: colCounts,
  };
}
