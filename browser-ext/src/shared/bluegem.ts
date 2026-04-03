/**
 * Blue Gem data — local lookup from compressed JSON (ported from CSFloat extension)
 * Data: { [defindex]: { [paintindex]: { [paintseed]: { pb: playside_blue%, bb: backside_blue% } } } }
 * Ships as data/bluegem.json.gz (~800KB), decompressed on first use
 */

// Pako-free gzip decompression using browser's DecompressionStream API
async function decompressGzip(data: ArrayBuffer): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(data));
  writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((a, c) => a + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }
  return new TextDecoder().decode(merged);
}

export interface BlueGemEntry {
  pb: number;  // playside blue %
  bb: number;  // backside blue %
}

type BlueGemData = Record<string, Record<string, Record<string, BlueGemEntry>>>;

let cache: BlueGemData | null = null;
let loading: Promise<void> | null = null;

/** Load blue gem data from bundled gzip file */
async function ensureLoaded(): Promise<void> {
  if (cache) return;
  if (loading) return loading;

  loading = (async () => {
    try {
      // Content scripts can't fetch extension resources directly in MV3
      // Use chrome.runtime.getURL which works in content scripts for web_accessible_resources
      // Or fetch via background script
      let json: string;
      try {
        const url = chrome.runtime.getURL('data/bluegem.json.gz');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const compressed = await res.arrayBuffer();
        json = await decompressGzip(compressed);
      } catch {
        // Fallback: ask background to read and return the data
        const bgData = await chrome.runtime.sendMessage({ type: 'GET_BLUEGEM_DATA' });
        if (!bgData) throw new Error('Background returned no data');
        json = typeof bgData === 'string' ? bgData : JSON.stringify(bgData);
      }
      cache = JSON.parse(json);
      console.log(`[SkinKeeper] Blue gem data loaded: ${Object.keys(cache!).length} defindexes`);
    } catch (err) {
      console.warn('[SkinKeeper] Blue gem data failed to load:', err);
      cache = {};
    }
  })();
  return loading;
}

/**
 * Look up blue gem percentages for a Case Hardened / Heat Treated item.
 * Returns null if no data available.
 */
export async function getBlueGemPercent(
  defindex: number,
  paintIndex: number,
  paintSeed: number
): Promise<BlueGemEntry | null> {
  await ensureLoaded();
  if (!cache) return null;
  return cache[defindex]?.[paintIndex]?.[paintSeed] ?? null;
}

/** Synchronous lookup (only works after first async load) */
export function getBlueGemPercentSync(
  defindex: number,
  paintIndex: number,
  paintSeed: number
): BlueGemEntry | null {
  if (!cache) return null;
  return cache[defindex]?.[paintIndex]?.[paintSeed] ?? null;
}

/** Check if an item is eligible for blue gem lookup */
export function isBlueGemEligible(marketHashName: string): boolean {
  const lower = marketHashName.toLowerCase();
  return (lower.includes('case hardened') || lower.includes('heat treated'))
    && !lower.includes('glove');
}

/** Preload data (call early in init) */
export function preloadBlueGemData(): void {
  ensureLoaded();
}
