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

export interface InspectFailure {
  failed: true;
  reason: "no_link" | "rate_limited" | "api_error";
}

/**
 * Fetch item details (float, stickers, charms) via CSFloat inspect API.
 * Uses the public endpoint: https://api.csfloat.com/?url=<inspect_link>
 */
export async function fetchInspectData(
  inspectLink: string
): Promise<InspectResult | InspectFailure> {
  try {
    const { data } = await axios.get("https://api.csfloat.com/", {
      params: { url: inspectLink },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SkinKeeper/1.0)",
        Accept: "application/json",
      },
      timeout: 15000,
    });

    const info = data.iteminfo;
    if (!info) {
      console.warn("[Inspect] CSFloat returned no iteminfo:", JSON.stringify(data).slice(0, 200));
      return { failed: true, reason: "api_error" };
    }

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
    const status = err.response?.status;
    const body = JSON.stringify(err.response?.data ?? {}).slice(0, 200);
    if (status === 429) {
      console.warn(`[Inspect] CSFloat rate limited (429)`);
      return { failed: true, reason: "rate_limited" };
    }
    console.warn(`[Inspect] CSFloat failed: status=${status ?? "no-response"} msg=${err.message} body=${body}`);
    return { failed: true, reason: "api_error" };
  }
}

/**
 * Inspect an item and update DB with float/stickers/charms.
 * Returns cached data if inspected within the last 24 hours.
 */
const INSPECT_CACHE_MS = 24 * 60 * 60 * 1000; // 24h for success
const INSPECT_FAIL_CACHE_MS = 60 * 60 * 1000;  // 1h for failure (avoid hammering CSFloat)

export async function inspectItem(
  userId: number,
  assetId: string,
  force = false
): Promise<InspectResult | InspectFailure> {
  // Get item with inspect link, verify ownership
  const { rows } = await pool.query(
    `SELECT i.id, i.inspect_link, i.float_value, i.paint_seed, i.paint_index, i.stickers, i.charms, i.inspected_at
     FROM inventory_items i
     JOIN steam_accounts sa ON i.steam_account_id = sa.id
     WHERE sa.user_id = $1 AND i.asset_id = $2`,
    [userId, assetId]
  );

  if (rows.length === 0) return { failed: true, reason: "no_link" };

  const item = rows[0];

  if (!item.inspect_link) return { failed: true, reason: "no_link" };

  if (!force && item.inspected_at) {
    const age = Date.now() - new Date(item.inspected_at).getTime();

    const parseJSON = (val: any) => {
      if (!val) return [];
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch (_) {
          return [];
        }
      }
      return val;
    };

    // Return cached success
    if (age < INSPECT_CACHE_MS && item.float_value != null) {
      return {
        floatValue: parseFloat(item.float_value),
        paintSeed: item.paint_seed ?? 0,
        paintIndex: item.paint_index ?? 0,
        stickers: parseJSON(item.stickers),
        charms: parseJSON(item.charms),
      };
    }
    // Throttle failures in background context: don't re-hit CSFloat within 1h
    if (age < INSPECT_FAIL_CACHE_MS && item.float_value == null) {
      return { failed: true, reason: "rate_limited" };
    }
  }

  const result = await fetchInspectData(item.inspect_link);

  if ("failed" in result) {
    // Cache the failure timestamp so we don't hammer CSFloat
    await pool.query(
      `UPDATE inventory_items SET inspected_at = NOW() WHERE id = $1`,
      [item.id]
    );
    return result;
  }

  // Update DB with success
  await pool.query(
    `UPDATE inventory_items
     SET float_value = $1, paint_seed = $2, paint_index = $3,
         stickers = $4, charms = $5, inspected_at = NOW()
     WHERE id = $6`,
    [
      result.floatValue,
      result.paintSeed,
      result.paintIndex,
      result.stickers,
      result.charms,
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
      if (!("failed" in result)) results.set(assetId, result);
    });
    await Promise.all(promises);
    // Small delay between batches to stay under rate limit
    if (i + concurrency < assetIds.length) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return results;
}
