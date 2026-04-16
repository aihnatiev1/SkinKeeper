import { decodeLink } from "@csfloat/cs2-inspect-serializer";
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
  reason: "no_link" | "rate_limited" | "api_error" | "unresolved_template";
}

export function getInspectCircuitState() {
  return {
    consecutive429s: 0,
    isOpen: false,
    openUntil: null,
  };
}

/**
 * Decode item details (float, stickers, charms) directly from the inspect link.
 * Since March 2026, CS2 inspect links self-encode all item data as protobuf hex.
 * No external API needed — decoding is instant and local.
 */
export async function fetchInspectData(
  inspectLink: string
): Promise<InspectResult | InspectFailure> {
  // Links with %propid:6% are unresolved templates — can't decode locally
  if (inspectLink.includes("%propid")) {
    return { failed: true, reason: "unresolved_template" };
  }

  try {
    const decoded = decodeLink(inspectLink);

    const stickers: StickerInfo[] = (decoded.stickers ?? []).map((s) => ({
      slot: s.slot ?? 0,
      sticker_id: s.stickerId ?? 0,
      name: "",
      wear: s.wear ?? null,
      image: "",
    }));

    const charms: CharmInfo[] = (decoded.keychains ?? []).map((k) => ({
      slot: k.slot ?? 0,
      pattern: k.pattern ?? 0,
      name: "",
      image: "",
    }));

    return {
      floatValue: decoded.paintwear ?? 0,
      paintSeed: decoded.paintseed ?? 0,
      paintIndex: decoded.paintindex ?? 0,
      stickers,
      charms,
    };
  } catch (err: any) {
    console.warn(`[Inspect] Failed to decode inspect link locally: ${err.message}`);
    return { failed: true, reason: "api_error" };
  }
}

/**
 * Inspect an item and update DB with float/stickers/charms.
 */
const INSPECT_CACHE_MS = 24 * 60 * 60 * 1000;
const INSPECT_FAIL_CACHE_MS = 2 * 60 * 60 * 1000;

export async function inspectItem(
  userId: number,
  assetId: string,
  force = false
): Promise<InspectResult | InspectFailure> {
  const { rows } = await pool.query(
    `SELECT i.id, i.inspect_link, i.float_value, i.paint_seed, i.paint_index, i.stickers, i.charms, i.inspected_at
     FROM inventory_items i
     JOIN active_steam_accounts sa ON i.steam_account_id = sa.id
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
        try { return JSON.parse(val); } catch { return []; }
      }
      return val;
    };

    if (age < INSPECT_CACHE_MS && item.float_value != null) {
      return {
        floatValue: parseFloat(item.float_value),
        paintSeed: item.paint_seed ?? 0,
        paintIndex: item.paint_index ?? 0,
        stickers: parseJSON(item.stickers),
        charms: parseJSON(item.charms),
      };
    }
  }

  const result = await fetchInspectData(item.inspect_link);

  if ("failed" in result) {
    return result;
  }

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
 * Batch inspect items. Decoding is local (no API), so we can process all at once.
 */
export async function batchInspect(
  userId: number,
  assetIds: string[],
  concurrency = 10
): Promise<Map<string, InspectResult>> {
  const results = new Map<string, InspectResult>();
  let errors = 0;
  let success = 0;
  let unresolved = 0;

  for (let i = 0; i < assetIds.length; i += concurrency) {
    const batch = assetIds.slice(i, i + concurrency);
    const promises = batch.map(async (assetId) => {
      const result = await inspectItem(userId, assetId);
      if ("failed" in result) {
        if (result.reason === "unresolved_template") unresolved++;
        else errors++;
      } else {
        success++;
        results.set(assetId, result);
      }
    });
    await Promise.all(promises);
  }

  console.log(`[BatchInspect] Done for user ${userId}: ${success} ok, ${unresolved} unresolved, ${errors} errors (of ${assetIds.length} total)`);
  return results;
}
