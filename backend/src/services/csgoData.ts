import axios from "axios";

// ─── CSGO-API static data cache (ByMykel/CSGO-API) ──────────────────────────
// Fetches skins, collections, and crates data from GitHub.
// Builds in-memory index by market_hash_name for O(1) lookups.

const BASE_URL =
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkinCollection {
  id: string;
  name: string;
  image?: string;
}

export interface SkinCrate {
  id: string;
  name: string;
  image?: string;
}

export interface SkinInfo {
  minFloat: number;
  maxFloat: number;
  collection: SkinCollection | null;
  crates: SkinCrate[];
  paintIndex: string | null;
  stattrak: boolean;
  souvenir: boolean;
  image: string | null;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

/** market_hash_name → SkinInfo  (multiple wear variants share the same base) */
let skinIndex = new Map<string, SkinInfo>();

/** collection id → collection details */
let collectionMap = new Map<string, { name: string; image?: string }>();

/** crate id → crate details */
let crateMap = new Map<string, { name: string; image?: string }>();

let lastRefresh = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
let loading: Promise<void> | null = null;

// ─── Fetch & Index ───────────────────────────────────────────────────────────

async function fetchAndIndex(): Promise<void> {
  console.log("[CSGOData] Fetching CSGO-API static data...");
  const t0 = Date.now();

  const [skinsRes, collectionsRes, cratesRes] = await Promise.all([
    axios.get(`${BASE_URL}/skins_not_grouped.json`, { timeout: 30000 }),
    axios.get(`${BASE_URL}/collections.json`, { timeout: 30000 }),
    axios.get(`${BASE_URL}/crates.json`, { timeout: 30000 }),
  ]);

  // Index collections
  const newCollectionMap = new Map<string, { name: string; image?: string }>();
  const collectionContains = new Map<string, string>(); // skin_id → collection_id

  for (const col of collectionsRes.data as any[]) {
    newCollectionMap.set(col.id, {
      name: col.name,
      image: col.image ?? undefined,
    });
    for (const item of col.contains ?? []) {
      collectionContains.set(item.id, col.id);
    }
  }

  // Index crates
  const newCrateMap = new Map<string, { name: string; image?: string }>();
  const crateContains = new Map<string, string[]>(); // skin_id → crate_ids[]

  for (const crate of cratesRes.data as any[]) {
    newCrateMap.set(crate.id, {
      name: crate.name,
      image: crate.image ?? undefined,
    });
    for (const item of [...(crate.contains ?? []), ...(crate.contains_rare ?? [])]) {
      const existing = crateContains.get(item.id) ?? [];
      existing.push(crate.id);
      crateContains.set(item.id, existing);
    }
  }

  // Index skins by market_hash_name
  const newSkinIndex = new Map<string, SkinInfo>();

  for (const skin of skinsRes.data as any[]) {
    const mhn = skin.market_hash_name as string;
    if (!mhn) continue;

    // Find collection for this skin
    const skinId = skin.id as string;
    const baseSkinId = skin.skin_id as string;
    const colId = collectionContains.get(skinId) ?? collectionContains.get(baseSkinId);
    let collection: SkinCollection | null = null;
    if (colId) {
      const col = newCollectionMap.get(colId);
      if (col) {
        collection = { id: colId, name: col.name, image: col.image };
      }
    }

    // Find crates for this skin
    const crateIds = crateContains.get(skinId) ?? crateContains.get(baseSkinId) ?? [];
    const crates: SkinCrate[] = [];
    for (const crateId of crateIds) {
      const c = newCrateMap.get(crateId);
      if (c) crates.push({ id: crateId, name: c.name, image: c.image });
    }

    newSkinIndex.set(mhn, {
      minFloat: skin.min_float ?? 0,
      maxFloat: skin.max_float ?? 1,
      collection,
      crates,
      paintIndex: skin.paint_index ?? null,
      stattrak: skin.stattrak ?? false,
      souvenir: skin.souvenir ?? false,
      image: skin.image ?? null,
    });
  }

  // Swap caches atomically
  skinIndex = newSkinIndex;
  collectionMap = newCollectionMap;
  crateMap = newCrateMap;
  lastRefresh = Date.now();

  console.log(
    `[CSGOData] Indexed ${newSkinIndex.size} skins, ${newCollectionMap.size} collections, ${newCrateMap.size} crates in ${Date.now() - t0}ms`
  );
}

async function ensureLoaded(): Promise<void> {
  if (skinIndex.size > 0 && Date.now() - lastRefresh < CACHE_TTL_MS) return;
  if (loading) return loading;
  loading = fetchAndIndex()
    .catch((err) => {
      console.error("[CSGOData] Failed to fetch:", err.message);
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Look up static skin data by market_hash_name.
 * Returns null if not found (e.g. stickers, agents, keys).
 */
export async function getSkinInfo(
  marketHashName: string
): Promise<SkinInfo | null> {
  await ensureLoaded();
  return skinIndex.get(marketHashName) ?? null;
}

/**
 * Batch lookup — returns a Map of market_hash_name → SkinInfo.
 * Only entries that exist in the CSGO-API are included.
 */
export async function getSkinInfoBatch(
  names: string[]
): Promise<Map<string, SkinInfo>> {
  await ensureLoaded();
  const result = new Map<string, SkinInfo>();
  for (const name of names) {
    const info = skinIndex.get(name);
    if (info) result.set(name, info);
  }
  return result;
}

/**
 * Pre-warm the cache on server startup (fire-and-forget).
 */
export function preloadCSGOData(): void {
  ensureLoaded();
}

/**
 * Cache stats for admin/diagnostics.
 */
export function getCSGODataStats() {
  return {
    skinCount: skinIndex.size,
    collectionCount: collectionMap.size,
    crateCount: crateMap.size,
    lastRefresh: lastRefresh > 0 ? new Date(lastRefresh).toISOString() : null,
    stale: Date.now() - lastRefresh > CACHE_TTL_MS,
  };
}
