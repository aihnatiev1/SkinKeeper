import axios from "axios";
import { pool } from "../db/pool.js";

export interface StickerInfo {
  slot: number;
  sticker_id: number;
  name: string;
  wear: number | null;
  image: string;
}

export interface CharmInfo {
  slot: number;
  pattern: number;
  name: string;
  image: string;
}

export interface InspectResult {
  floatValue: number;
  paintSeed: number;
  paintIndex: number;
  stickers: StickerInfo[];
  charms: CharmInfo[];
}

/**
 * Fetch item details (float, stickers, charms) via CSFloat inspect API.
 * Uses the public endpoint: https://api.csfloat.com/?url=<inspect_link>
 */
export async function fetchInspectData(
  inspectLink: string
): Promise<InspectResult | null> {
  try {
    const { data } = await axios.get("https://api.csfloat.com/", {
      params: { url: inspectLink },
      headers: {
        Origin: "https://csfloat.com",
        Referer: "https://csfloat.com/",
      },
      timeout: 15000,
    });

    const info = data.iteminfo;
    if (!info) return null;

    const stickers: StickerInfo[] = (info.stickers ?? []).map((s: any) => ({
      slot: s.slot,
      sticker_id: s.stickerId ?? s.sticker_id,
      name: s.name ?? "",
      wear: s.wear ?? null,
      image: s.icon_url ?? s.image ?? "",
    }));

    const charms: CharmInfo[] = (info.keychains ?? []).map((k: any) => ({
      slot: k.slot ?? 0,
      pattern: k.pattern ?? 0,
      name: k.name ?? "",
      image: k.icon_url ?? k.image ?? "",
    }));

    return {
      floatValue: info.floatvalue,
      paintSeed: info.paintseed,
      paintIndex: info.paintindex,
      stickers,
      charms,
    };
  } catch (err: any) {
    if (err.response?.status === 429) {
      console.warn("[Inspect] CSFloat rate limited");
    } else {
      console.warn(`[Inspect] Failed: ${err.message}`);
    }
    return null;
  }
}

/**
 * Inspect an item and update DB with float/stickers/charms.
 * Returns cached data if inspected within the last 24 hours.
 */
export async function inspectItem(
  userId: number,
  assetId: string
): Promise<InspectResult | null> {
  // Get item with inspect link, verify ownership
  const { rows } = await pool.query(
    `SELECT i.id, i.inspect_link, i.float_value, i.paint_seed, i.paint_index, i.stickers, i.charms, i.inspected_at
     FROM inventory_items i
     JOIN steam_accounts sa ON i.steam_account_id = sa.id
     WHERE sa.user_id = $1 AND i.asset_id = $2`,
    [userId, assetId]
  );

  if (rows.length === 0) return null;

  const item = rows[0];

  // Return cached if inspected within 24h
  if (item.inspected_at) {
    const age = Date.now() - new Date(item.inspected_at).getTime();
    if (age < 24 * 60 * 60 * 1000 && item.float_value != null) {
      return {
        floatValue: parseFloat(item.float_value),
        paintSeed: item.paint_seed ?? 0,
        paintIndex: item.paint_index ?? 0,
        stickers: item.stickers ?? [],
        charms: item.charms ?? [],
      };
    }
  }

  if (!item.inspect_link) return null;

  const result = await fetchInspectData(item.inspect_link);
  if (!result) return null;

  // Update DB
  await pool.query(
    `UPDATE inventory_items
     SET float_value = $1, paint_seed = $2, paint_index = $3,
         stickers = $4, charms = $5, inspected_at = NOW()
     WHERE id = $6`,
    [
      result.floatValue,
      result.paintSeed,
      result.paintIndex,
      JSON.stringify(result.stickers),
      JSON.stringify(result.charms),
      item.id,
    ]
  );

  return result;
}

/**
 * Batch inspect items with concurrency. CSFloat tolerates ~3 parallel reqs.
 */
export async function batchInspect(
  userId: number,
  assetIds: string[],
  concurrency = 3
): Promise<Map<string, InspectResult>> {
  const results = new Map<string, InspectResult>();

  for (let i = 0; i < assetIds.length; i += concurrency) {
    const batch = assetIds.slice(i, i + concurrency);
    const promises = batch.map(async (assetId) => {
      const result = await inspectItem(userId, assetId);
      if (result) results.set(assetId, result);
    });
    await Promise.all(promises);
    // Small delay between batches to stay under rate limit
    if (i + concurrency < assetIds.length) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return results;
}
