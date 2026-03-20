/**
 * Steam Market Depth — order book + 24h volume from SteamTradingSiteTracker.
 *
 * Source: https://api.iflow.work/export/ (free, no auth, 12h dumps)
 * ~4000 priority CS2 items with Steam order book depth and 24h volume.
 *
 * All prices in the dump are CNY — we convert to USD using exchange rates.
 */

import axios from "axios";
import { createUnzip, createInflateRaw } from "zlib";
import { Readable } from "stream";

const LIST_URL = "https://api.iflow.work/export/list?dir_name=priority_archive";
const DOWNLOAD_URL = "https://api.iflow.work/export/download?dir_name=priority_archive&file_name=";

// ─── Data Types ──────────────────────────────────────────────────────

export interface SteamDepthData {
  /** 24h trade volume (number of sales) */
  volume24h: number;
  /** Median sale price in USD (24h) */
  medianPrice: number;
  /** Number of active buy orders */
  buyOrderCount: number;
  /** Highest buy order price in USD */
  highestBid: number;
  /** Number of active sell listings */
  sellListingCount: number;
  /** Lowest sell listing price in USD */
  lowestAsk: number;
}

// ─── In-Memory Cache ─────────────────────────────────────────────────

let depthCache = new Map<string, SteamDepthData>();
let lastFetchTime: Date | null = null;

export function getSteamDepth(marketHashName: string): SteamDepthData | null {
  return depthCache.get(marketHashName) ?? null;
}

export function getSteamDepthBatch(names: string[]): Map<string, SteamDepthData> {
  const result = new Map<string, SteamDepthData>();
  for (const name of names) {
    const data = depthCache.get(name);
    if (data) result.set(name, data);
  }
  return result;
}

export function getDepthLastFetch(): Date | null {
  return lastFetchTime;
}

// ─── Fetch + Parse ───────────────────────────────────────────────────

/**
 * Fetch the latest dump from iflow API, parse JSONL, extract steam depth data.
 * Converts CNY prices to USD using a fixed approximate rate.
 */
export async function refreshSteamDepthData(cnyToUsdRate?: number): Promise<void> {
  const rate = cnyToUsdRate || 0.137; // ~1 CNY = 0.137 USD (fallback)

  try {
    // 1. Get latest dump filename
    const { data: listData } = await axios.get(LIST_URL, { timeout: 10_000 });
    if (!listData?.files?.length) {
      console.warn("[SteamDepth] No dump files available");
      return;
    }

    // Files are sorted, last one is most recent
    const files: string[] = listData.files;
    const latestFile = files[files.length - 1];
    console.log(`[SteamDepth] Fetching ${latestFile}...`);

    // 2. Download ZIP (follow redirects)
    const { data: zipBuffer } = await axios.get(
      `${DOWNLOAD_URL}${latestFile}`,
      {
        responseType: "arraybuffer",
        timeout: 60_000,
        maxRedirects: 5,
      }
    );

    // 3. Decompress ZIP and parse JSONL
    const jsonlContent = await unzipFirstFile(Buffer.from(zipBuffer));
    if (!jsonlContent) {
      console.error("[SteamDepth] Failed to decompress ZIP");
      return;
    }

    // 4. Parse line by line
    const newCache = new Map<string, SteamDepthData>();
    const lines = jsonlContent.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if (item.appid !== 730) continue; // CS2 only

        const hashName = item.hash_name || item.en_name;
        if (!hashName) continue;

        const steamOrder = item.steam_order;
        const steamVolume = item.steam_volume;
        if (!steamOrder && !steamVolume) continue;

        const depth: SteamDepthData = {
          volume24h: steamVolume?.volume ?? 0,
          medianPrice: (steamVolume?.median_price ?? 0) * rate,
          buyOrderCount: steamOrder?.buy_order_count ?? 0,
          highestBid: (steamOrder?.buy_price ?? 0) * rate,
          sellListingCount: steamOrder?.sell_order_count ?? 0,
          lowestAsk: (steamOrder?.sell_price ?? 0) * rate,
        };

        // Only cache if we have meaningful data
        if (depth.volume24h > 0 || depth.buyOrderCount > 0) {
          newCache.set(hashName, depth);
        }
      } catch {
        // Skip malformed lines
      }
    }

    depthCache = newCache;
    lastFetchTime = new Date();
    console.log(`[SteamDepth] Cached ${newCache.size} items (from ${latestFile})`);
  } catch (err: any) {
    console.error(`[SteamDepth] Fetch failed: ${err.message || err}`);
  }
}

// ─── ZIP Decompression ───────────────────────────────────────────────

async function unzipFirstFile(zipBuffer: Buffer): Promise<string | null> {
  // Simple ZIP extraction — find the first file entry and decompress
  // ZIP local file header signature: 0x04034b50
  const sig = zipBuffer.readUInt32LE(0);
  if (sig !== 0x04034b50) return null;

  const compressedSize = zipBuffer.readUInt32LE(18);
  const uncompressedSize = zipBuffer.readUInt32LE(22);
  const fileNameLen = zipBuffer.readUInt16LE(26);
  const extraLen = zipBuffer.readUInt16LE(28);
  const compressionMethod = zipBuffer.readUInt16LE(8);
  const dataOffset = 30 + fileNameLen + extraLen;

  const compressedData = zipBuffer.subarray(dataOffset, dataOffset + compressedSize);

  if (compressionMethod === 0) {
    // Stored (no compression)
    return compressedData.toString("utf-8");
  } else if (compressionMethod === 8) {
    // Deflate
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const inflater = createUnzip();
      // Raw deflate needs a fake gzip header or use inflateRaw
      // Actually zlib.createInflateRaw is better for ZIP deflate
      const raw = createInflateRaw();
      raw.on("data", (chunk: Buffer) => chunks.push(chunk));
      raw.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      raw.on("error", (err: Error) => {
        console.error("[SteamDepth] Inflate error:", err.message);
        resolve(null);
      });
      raw.end(compressedData);
    });
  }

  return null;
}
