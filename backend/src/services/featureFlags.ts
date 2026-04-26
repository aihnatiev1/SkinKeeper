/**
 * Feature flags + controlled rollout (P9).
 *
 * Precedence (highest -> lowest):
 *   1. Kill switches (env vars KILL_<FLAG>=1)        — instantly disables for ALL users
 *   2. User feature_flags (admin override in DB)     — explicit per-user opt-in/out
 *   3. Canary rollout (env CANARY_<FLAG>_PCT=0..100) — deterministic % gate by userId hash
 *   4. Default (false)                               — safe default
 *
 * Flag names are lowercase snake_case. Established flags:
 *   - auto_sell      (P3 auto-sell rules feature)
 *   - smart_alerts   (P5-P7 smart alert types)
 *   - tour           (P8 onboarding tour)
 *
 * Adding a new flag = add it to FLAG_NAMES below + document in
 * backend/docs/feature-flags.md. Routes opt-in via requireFeatureFlag().
 */

import crypto from "crypto";
import { pool } from "../db/pool.js";
import { TTLCache } from "../utils/TTLCache.js";
import { registerCache } from "../utils/cacheRegistry.js";

export const FLAG_NAMES = ["auto_sell", "smart_alerts", "tour"] as const;
export type FlagName = (typeof FLAG_NAMES)[number];

// In-memory cache: 5 min TTL, 1000 entries (matches PREMIUM_CACHE_TTL semantics).
// LRU-ish eviction handled by TTLCache (oldest-first).
const FLAGS_CACHE_TTL = 5 * 60 * 1000;
const FLAGS_CACHE_MAX = 1000;
const flagsCache = new TTLCache<number, Record<string, boolean>>(FLAGS_CACHE_TTL, FLAGS_CACHE_MAX);
registerCache("featureFlags", flagsCache as unknown as TTLCache<unknown, unknown>);

/** Read kill-switch env var. KILL_AUTO_SELL=1 disables auto_sell globally. */
function isKilled(flag: string): boolean {
  const envName = `KILL_${flag.toUpperCase()}`;
  const v = process.env[envName];
  return v === "1" || v === "true";
}

/** Read canary percentage env var. CANARY_AUTO_SELL_PCT=10 = 10% rollout.
 *  Defaults to 100 (fully rolled out) so a new flag without env config still
 *  resolves false-by-default unless an admin opts a user in.
 *  NOTE: this is "max % of users that COULD see the flag if they have no
 *  explicit DB override" — combined with the default-false behavior, a user
 *  must EITHER have user.feature_flags[flag]=true OR fall in canary % AND
 *  have user.feature_flags[flag]=true to actually get it. See below.
 *
 *  Per spec: canary computation flips them ON for %% users. So:
 *    - default false
 *    - canary % rolls bucket ON
 *    - explicit user flag bypasses canary in either direction
 */
function getCanaryPct(flag: string): number {
  const envName = `CANARY_${flag.toUpperCase()}_PCT`;
  const raw = process.env[envName];
  if (raw === undefined) return 0; // no canary configured = 0% (default off)
  const n = parseInt(raw, 10);
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** Deterministic hash of userId into 0..99 bucket.
 *  SHA-256(userId) -> first 4 bytes uint32 -> mod 100.
 *  Same userId always lands in same bucket — sticky rollout. */
export function userBucket(userId: number): number {
  const hash = crypto.createHash("sha256").update(userId.toString()).digest();
  return hash.readUInt32BE(0) % 100;
}

/** Merge user-flags + env overrides + canary computation.
 *  Returns the FULLY RESOLVED flag map for FLAG_NAMES. */
export async function getFeatureFlagsForUser(userId: number): Promise<Record<string, boolean>> {
  const cached = flagsCache.get(userId);
  if (cached !== undefined) return cached;

  const { rows } = await pool.query(
    "SELECT feature_flags FROM users WHERE id = $1",
    [userId]
  );
  const userFlags: Record<string, unknown> = (rows[0]?.feature_flags ?? {}) as Record<string, unknown>;
  const bucket = userBucket(userId);

  const resolved: Record<string, boolean> = {};
  for (const flag of FLAG_NAMES) {
    // 1. Kill switch wins absolutely.
    if (isKilled(flag)) {
      resolved[flag] = false;
      continue;
    }
    // 2. Explicit user override (true OR false) bypasses canary.
    if (Object.prototype.hasOwnProperty.call(userFlags, flag)) {
      resolved[flag] = userFlags[flag] === true;
      continue;
    }
    // 3. Canary computation.
    const pct = getCanaryPct(flag);
    resolved[flag] = bucket < pct;
  }

  flagsCache.set(userId, resolved);
  return resolved;
}

/** Convenience: resolve a single flag. */
export async function isFeatureEnabled(
  userId: number,
  flag: string,
  defaultValue = false
): Promise<boolean> {
  const flags = await getFeatureFlagsForUser(userId);
  if (Object.prototype.hasOwnProperty.call(flags, flag)) {
    return flags[flag] === true;
  }
  return defaultValue;
}

/** Admin op: set/clear a per-user flag override. value=null removes the override
 *  (user falls back to canary/kill-switch resolution). */
export async function setFeatureFlag(
  userId: number,
  flag: string,
  value: boolean | null
): Promise<Record<string, boolean>> {
  if (value === null) {
    // Remove the key entirely.
    await pool.query(
      `UPDATE users SET feature_flags = feature_flags - $2 WHERE id = $1`,
      [userId, flag]
    );
  } else {
    // jsonb_set with create_missing=true (default).
    await pool.query(
      `UPDATE users
         SET feature_flags = jsonb_set(
           COALESCE(feature_flags, '{}'::jsonb),
           ARRAY[$2]::text[],
           to_jsonb($3::boolean),
           true
         )
       WHERE id = $1`,
      [userId, flag, value]
    );
  }
  invalidateFeatureFlagsCache(userId);
  return getFeatureFlagsForUser(userId);
}

/** Drop the cached resolution for a user. Call after admin ops. */
export function invalidateFeatureFlagsCache(userId: number): void {
  flagsCache.delete(userId);
}

/** For tests: reset cache fully. */
export function _resetFeatureFlagsCacheForTests(): void {
  flagsCache.clear();
}

/** For admin canary-stats endpoint. */
export function getCanaryConfig(): Array<{ flag: string; percentage: number; killed: boolean }> {
  return FLAG_NAMES.map(flag => ({
    flag,
    percentage: getCanaryPct(flag),
    killed: isKilled(flag),
  }));
}
