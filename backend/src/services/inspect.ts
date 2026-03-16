import axios from "axios";
import { pool } from "../db/pool.js";
import { getCSFloatProxyAgent } from "./csfloat.js";

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
  reason: "no_link" | "rate_limited" | "api_error" | "circuit_open" | "not_listed";
}

// ─── Circuit Breaker ────────────────────────────────────────────────────
const CIRCUIT_BREAKER = {
  consecutive429s: 0,
  threshold: 5,
  cooldownMs: 30 * 60_000,
  openUntil: 0,
};

function isCircuitOpen(): boolean {
  if (CIRCUIT_BREAKER.openUntil > Date.now()) return true;
  if (CIRCUIT_BREAKER.openUntil > 0 && Date.now() >= CIRCUIT_BREAKER.openUntil) {
    console.log("[Inspect] Circuit breaker closed, resuming requests");
    CIRCUIT_BREAKER.openUntil = 0;
    CIRCUIT_BREAKER.consecutive429s = 0;
  }
  return false;
}

function recordInspect429(): void {
  CIRCUIT_BREAKER.consecutive429s++;
  if (CIRCUIT_BREAKER.consecutive429s >= CIRCUIT_BREAKER.threshold) {
    CIRCUIT_BREAKER.openUntil = Date.now() + CIRCUIT_BREAKER.cooldownMs;
    console.warn(`[Inspect] Circuit breaker OPEN — ${CIRCUIT_BREAKER.consecutive429s} consecutive 429s. Pausing ${CIRCUIT_BREAKER.cooldownMs / 60_000}min`);
  }
}

function recordInspectSuccess(): void {
  CIRCUIT_BREAKER.consecutive429s = 0;
}

export function getInspectCircuitState() {
  return {
    consecutive429s: CIRCUIT_BREAKER.consecutive429s,
    isOpen: isCircuitOpen(),
    openUntil: CIRCUIT_BREAKER.openUntil > 0 ? new Date(CIRCUIT_BREAKER.openUntil).toISOString() : null,
  };
}

/**
 * Fetch float/stickers/charms via CSFloat Listings API (through proxy).
 * The old api.csfloat.com inspect endpoint blocks bots globally,
 * so we use the listings API which returns full item data including float.
 *
 * Note: this returns data from a listing of the same skin type, not the user's exact item.
 * Float value from listing is representative for price reference but not the user's exact float.
 * For user's exact float, we'd need the inspect API to be unblocked.
 */
export async function fetchInspectData(
  inspectLink: string,
  marketHashName?: string
): Promise<InspectResult | InspectFailure> {
  if (isCircuitOpen()) {
    return { failed: true, reason: "circuit_open" };
  }

  const apiKey = process.env.CSFLOAT_API_KEY;
  if (!apiKey || !marketHashName) {
    return { failed: true, reason: "not_listed" };
  }

  const agent = getCSFloatProxyAgent();

  try {
    const config: any = {
      params: {
        market_hash_name: marketHashName,
        sort_by: "lowest_price",
        limit: 5,
      },
      headers: { Authorization: apiKey },
      timeout: 15000,
    };
    if (agent) {
      config.httpsAgent = agent;
      config.proxy = false;
    }

    const { data } = await axios.get("https://csfloat.com/api/v1/listings", config);

    const listings = data?.data;
    if (!listings || listings.length === 0) {
      return { failed: true, reason: "not_listed" };
    }

    // Try to match by asset_id from inspect link
    const assetMatch = inspectLink.match(/A(\d+)D/);
    const targetAssetId = assetMatch?.[1];

    let item = listings[0]?.item;
    if (targetAssetId) {
      const exactMatch = listings.find((l: any) => l.item?.asset_id === targetAssetId);
      if (exactMatch) item = exactMatch.item;
    }

    if (!item || item.float_value == null) {
      return { failed: true, reason: "not_listed" };
    }

    const stickers: StickerInfo[] = (item.stickers ?? []).map((s: any) => ({
      slot: s.slot,
      sticker_id: s.stickerId ?? s.sticker_id,
      name: s.name ?? "",
      wear: s.wear ?? null,
      image: s.icon_url ?? s.image ?? "",
    }));

    const charms: CharmInfo[] = (item.keychains ?? []).map((k: any) => ({
      slot: k.slot ?? 0,
      pattern: k.pattern ?? 0,
      name: k.name ?? "",
      image: k.icon_url ?? k.image ?? "",
    }));

    recordInspectSuccess();

    return {
      floatValue: item.float_value,
      paintSeed: item.paint_seed ?? 0,
      paintIndex: item.paint_index ?? 0,
      stickers,
      charms,
    };
  } catch (err: any) {
    const status = err.response?.status;
    if (status === 429) {
      recordInspect429();
      if (!isCircuitOpen()) {
        console.warn(`[Inspect] CSFloat listings 429 (${CIRCUIT_BREAKER.consecutive429s}/${CIRCUIT_BREAKER.threshold})`);
      }
      return { failed: true, reason: "rate_limited" };
    }
    console.warn(`[Inspect] CSFloat listings failed: status=${status ?? "no-response"} msg=${err.message}`);
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
  if (isCircuitOpen() && !force) {
    return { failed: true, reason: "circuit_open" };
  }

  const { rows } = await pool.query(
    `SELECT i.id, i.inspect_link, i.market_hash_name, i.float_value, i.paint_seed, i.paint_index, i.stickers, i.charms, i.inspected_at
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
    if (age < INSPECT_FAIL_CACHE_MS && item.float_value == null) {
      return { failed: true, reason: "rate_limited" };
    }
  }

  const result = await fetchInspectData(item.inspect_link, item.market_hash_name);

  if ("failed" in result) {
    await pool.query(
      `UPDATE inventory_items SET inspected_at = NOW() WHERE id = $1`,
      [item.id]
    );
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
 * Batch inspect items. Respects circuit breaker, concurrency=1, gentle delays.
 */
export async function batchInspect(
  userId: number,
  assetIds: string[],
  concurrency = 1
): Promise<Map<string, InspectResult>> {
  const results = new Map<string, InspectResult>();
  let rateLimited = 0;
  let errors = 0;
  let success = 0;

  if (isCircuitOpen()) {
    console.log(`[BatchInspect] Skipped: circuit breaker open`);
    return results;
  }

  for (let i = 0; i < assetIds.length; i += concurrency) {
    if (isCircuitOpen()) {
      console.warn(`[BatchInspect] Circuit opened mid-batch. ${success} ok, ${rateLimited} rate-limited.`);
      break;
    }

    const batch = assetIds.slice(i, i + concurrency);
    const promises = batch.map(async (assetId) => {
      const result = await inspectItem(userId, assetId);
      if ("failed" in result) {
        if (result.reason === "rate_limited" || result.reason === "circuit_open") rateLimited++;
        else errors++;
      } else {
        success++;
        results.set(assetId, result);
      }
    });
    await Promise.all(promises);

    if (rateLimited > 2) {
      console.warn(`[BatchInspect] Stopping early: ${rateLimited} rate limits. ${success} ok, ${errors} errors.`);
      break;
    }

    // 5s delay — listings API is shared with price crawler
    if (i + concurrency < assetIds.length) {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  console.log(`[BatchInspect] Done for user ${userId}: ${success} ok, ${rateLimited} rate-limited, ${errors} errors (of ${assetIds.length} total)`);
  return results;
}
