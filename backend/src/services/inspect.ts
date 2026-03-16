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
  reason: "no_link" | "rate_limited" | "api_error" | "circuit_open";
}

// ─── Circuit Breaker ────────────────────────────────────────────────────
// After N consecutive 429s, stop all inspect requests for a cooldown period.
const CIRCUIT_BREAKER = {
  consecutive429s: 0,
  threshold: 5,              // open circuit after 5 consecutive 429s
  cooldownMs: 30 * 60_000,  // 30 min cooldown
  openUntil: 0,
};

function isCircuitOpen(): boolean {
  if (CIRCUIT_BREAKER.openUntil > Date.now()) return true;
  if (CIRCUIT_BREAKER.openUntil > 0 && Date.now() >= CIRCUIT_BREAKER.openUntil) {
    // Circuit just closed — reset
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
    console.warn(`[Inspect] Circuit breaker OPEN — ${CIRCUIT_BREAKER.consecutive429s} consecutive 429s. Pausing for ${CIRCUIT_BREAKER.cooldownMs / 60_000}min until ${new Date(CIRCUIT_BREAKER.openUntil).toISOString()}`);
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
 * Fetch item details (float, stickers, charms) via CSFloat inspect API.
 * Uses API key from env for higher rate limits.
 */
export async function fetchInspectData(
  inspectLink: string
): Promise<InspectResult | InspectFailure> {
  if (isCircuitOpen()) {
    return { failed: true, reason: "circuit_open" };
  }

  try {
    const apiKey = process.env.CSFLOAT_API_KEY;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = apiKey;
    }

    const { data } = await axios.get("https://api.csfloat.com/", {
      params: { url: inspectLink },
      headers,
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

    recordInspectSuccess();

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
      recordInspect429();
      if (!isCircuitOpen()) {
        console.warn(`[Inspect] CSFloat 429 (${CIRCUIT_BREAKER.consecutive429s}/${CIRCUIT_BREAKER.threshold})`);
      }
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
const INSPECT_FAIL_CACHE_MS = 2 * 60 * 60 * 1000;  // 2h for failure

export async function inspectItem(
  userId: number,
  assetId: string,
  force = false
): Promise<InspectResult | InspectFailure> {
  // Circuit breaker check — don't even hit DB if circuit is open (unless cached)
  if (isCircuitOpen() && !force) {
    return { failed: true, reason: "circuit_open" };
  }

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
    // Throttle failures: don't re-hit CSFloat within 2h
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
 * Batch inspect items. Respects circuit breaker, concurrency=1 to be gentle.
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
    console.log(`[BatchInspect] Skipped for user ${userId}: circuit breaker open until ${new Date(CIRCUIT_BREAKER.openUntil).toISOString()}`);
    return results;
  }

  for (let i = 0; i < assetIds.length; i += concurrency) {
    // Re-check circuit breaker each batch
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

    // Stop early on rate limits
    if (rateLimited > 2) {
      console.warn(`[BatchInspect] Stopping early: ${rateLimited} rate limits. ${success} succeeded, ${errors} errors.`);
      break;
    }

    // 3s delay between requests to be gentle
    if (i + concurrency < assetIds.length) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log(`[BatchInspect] Done for user ${userId}: ${success} ok, ${rateLimited} rate-limited, ${errors} errors (of ${assetIds.length} total)`);
  return results;
}
