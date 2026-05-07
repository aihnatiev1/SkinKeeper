/**
 * Sticker + keychain catalog resolver.
 *
 * The cs2-inspect-serializer decodes inspect links into objects with
 * sticker_id (numeric def_index) but no human-readable name or image.
 * ByMykel/CSGO-API publishes the canonical mapping; we cache it in-memory
 * for O(1) lookups during the enrich path.
 *
 * Lives separately from csgoData.ts because that one indexes
 * skins/collections/crates and pulling 4× sources into one cache hurt
 * cold-start time of the API. Two parallel small caches are clearer.
 */
import axios from "axios";

const BASE_URL =
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en";

const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;

export interface CatalogEntry {
  name: string;
  image: string;
}

let stickerById = new Map<number, CatalogEntry>();
let keychainById = new Map<number, CatalogEntry>();
let lastRefresh = 0;
let loading: Promise<void> | null = null;

async function fetchAndIndex(): Promise<void> {
  const t0 = Date.now();
  const [stickersRes, keychainsRes] = await Promise.all([
    axios.get(`${BASE_URL}/stickers.json`, { timeout: 30_000 }),
    axios.get(`${BASE_URL}/keychains.json`, { timeout: 30_000 }),
  ]);

  const newStickers = new Map<number, CatalogEntry>();
  for (const s of stickersRes.data as any[]) {
    const id = parseInt(s.def_index, 10);
    if (!Number.isFinite(id) || !s.name) continue;
    newStickers.set(id, { name: s.name, image: s.image ?? "" });
  }

  const newKeychains = new Map<number, CatalogEntry>();
  for (const k of keychainsRes.data as any[]) {
    const id = parseInt(k.def_index, 10);
    if (!Number.isFinite(id) || !k.name) continue;
    newKeychains.set(id, { name: k.name, image: k.image ?? "" });
  }

  stickerById = newStickers;
  keychainById = newKeychains;
  lastRefresh = Date.now();
  console.log(
    `[CSGOCatalog] Indexed ${stickerById.size} stickers, ${keychainById.size} keychains in ${Date.now() - t0}ms`
  );
}

async function ensureLoaded(): Promise<void> {
  if (Date.now() - lastRefresh < REFRESH_TTL_MS && stickerById.size > 0) return;
  if (loading) return loading;
  loading = fetchAndIndex().finally(() => {
    loading = null;
  });
  return loading;
}

/** Resolve a sticker def_index → {name, image}; returns null if unknown. */
export async function resolveSticker(id: number): Promise<CatalogEntry | null> {
  await ensureLoaded();
  return stickerById.get(id) ?? null;
}

/** Resolve a keychain def_index → {name, image}; returns null if unknown. */
export async function resolveKeychain(
  id: number
): Promise<CatalogEntry | null> {
  await ensureLoaded();
  return keychainById.get(id) ?? null;
}

/**
 * Synchronous variant for tight loops in fetchInspectData — caller must
 * have awaited preloadCSGOCatalog() at least once. Returns null on miss
 * (which mirrors the async version) so the loop never blocks.
 */
export function resolveStickerSync(id: number): CatalogEntry | null {
  return stickerById.get(id) ?? null;
}

export function resolveKeychainSync(id: number): CatalogEntry | null {
  return keychainById.get(id) ?? null;
}

/** Eager preload — call from index.ts boot, like preloadCSGOData. */
export function preloadCSGOCatalog(): void {
  ensureLoaded().catch((err) => {
    console.error("[CSGOCatalog] Preload failed:", err.message ?? err);
  });
}

export function getCatalogStats() {
  return {
    stickers: stickerById.size,
    keychains: keychainById.size,
    lastRefresh: lastRefresh ? new Date(lastRefresh).toISOString() : null,
  };
}
