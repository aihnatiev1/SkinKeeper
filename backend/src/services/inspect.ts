import axios from "axios";
import { pool } from "../db/pool.js";
import {
  initProxyPool,
  getAvailableSlot,
  getSlotConfig,
  recordSlot429,
  recordSlotSuccess,
  getSlotCount,
} from "./proxyPool.js";

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

// ─── Circuit Breaker (per-slot aware) ────────────────────────────────────
// Now tracks per-slot state. Circuit opens only when ALL slots are exhausted.

const CIRCUIT_BREAKER = {
  globalConsecutive429s: 0,
  /** Total 429s across all slots before global circuit opens */
  threshold: 3 * Math.max(1, 3), // 3 per slot * 3 slots = 9
  cooldownMs: 15 * 60_000,  // 15 min (reduced from 1h — proxy pool handles rotation)
  openUntil: 0,
};

function isCircuitOpen(): boolean {
  if (CIRCUIT_BREAKER.openUntil > Date.now()) return true;
  if (CIRCUIT_BREAKER.openUntil > 0 && Date.now() >= CIRCUIT_BREAKER.openUntil) {
    console.log("[Inspect] Circuit breaker closed, resuming requests");
    CIRCUIT_BREAKER.openUntil = 0;
    CIRCUIT_BREAKER.globalConsecutive429s = 0;
  }
  return false;
}

function recordInspect429(): void {
  CIRCUIT_BREAKER.globalConsecutive429s++;
  if (CIRCUIT_BREAKER.globalConsecutive429s >= CIRCUIT_BREAKER.threshold) {
    CIRCUIT_BREAKER.openUntil = Date.now() + CIRCUIT_BREAKER.cooldownMs;
    console.warn(`[Inspect] Circuit breaker OPEN — ${CIRCUIT_BREAKER.globalConsecutive429s} total 429s across all slots. Pausing ${CIRCUIT_BREAKER.cooldownMs / 60_000}min`);
  }
}

function recordInspectSuccess(): void {
  CIRCUIT_BREAKER.globalConsecutive429s = 0;
}

export function getInspectCircuitState() {
  return {
    consecutive429s: CIRCUIT_BREAKER.globalConsecutive429s,
    isOpen: isCircuitOpen(),
    openUntil: CIRCUIT_BREAKER.openUntil > 0 ? new Date(CIRCUIT_BREAKER.openUntil).toISOString() : null,
  };
}

const INSPECT_DOMAIN = "api.csfloat.com";

/**
 * Fetch item details (float, stickers, charms) via CSFloat inspect API.
 * Routes through proxy pool — tries all available slots on 429.
 */
export async function fetchInspectData(
  inspectLink: string
): Promise<InspectResult | InspectFailure> {
  if (isCircuitOpen()) {
    return { failed: true, reason: "circuit_open" };
  }

  initProxyPool();
  const triedSlots = new Set<number>();

  // Try all available slots
  for (let attempt = 0; attempt < getSlotCount(); attempt++) {
    const slot = getAvailableSlot(INSPECT_DOMAIN);
    if (!slot || triedSlots.has(slot.index)) {
      break;
    }
    triedSlots.add(slot.index);

    try {
      const apiKey = process.env.CSFLOAT_API_KEY;
      const config: any = {
        params: { url: inspectLink },
        headers: {
          Accept: "application/json",
          ...(apiKey ? { Authorization: apiKey } : {}),
        },
        timeout: 15000,
        ...getSlotConfig(slot.index),
      };

      const { data } = await axios.get("https://api.csfloat.com/", config);

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
      recordSlotSuccess(slot.index, INSPECT_DOMAIN);

      return {
        floatValue: info.floatvalue,
        paintSeed: info.paintseed,
        paintIndex: info.paintindex,
        stickers,
        charms,
      };
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 429) {
        const retryAfter = parseInt(err.response?.headers?.["retry-after"] || "0", 10);
        recordSlot429(slot.index, INSPECT_DOMAIN, retryAfter);
        recordInspect429();
        console.warn(`[Inspect] CSFloat 429 via ${slot.name} (${CIRCUIT_BREAKER.globalConsecutive429s}/${CIRCUIT_BREAKER.threshold})`);
        continue; // Try next slot
      }
      const body = JSON.stringify(err.response?.data ?? {}).slice(0, 200);
      console.warn(`[Inspect] CSFloat failed via ${slot.name}: status=${status ?? "no-response"} body=${body}`);
      return { failed: true, reason: "api_error" };
    }
  }

  // All slots exhausted
  return { failed: true, reason: "rate_limited" };
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

  const result = await fetchInspectData(item.inspect_link);

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
 * Batch inspect items. Uses proxy pool for rotation, increased concurrency.
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

  // With proxy pool we can handle more rate limits before stopping
  const maxRateLimits = getSlotCount() * 2;

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

    if (rateLimited > maxRateLimits) {
      console.warn(`[BatchInspect] Stopping early: ${rateLimited} rate limits. ${success} ok, ${errors} errors.`);
      break;
    }

    if (i + concurrency < assetIds.length) {
      await new Promise((r) => setTimeout(r, 2000)); // 2s between batches (was 3s)
    }
  }

  console.log(`[BatchInspect] Done for user ${userId}: ${success} ok, ${rateLimited} rate-limited, ${errors} errors (of ${assetIds.length} total)`);
  return results;
}
