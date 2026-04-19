/**
 * ProxyPool — centralized proxy rotation for bypassing 429 rate limits.
 *
 * 3 slots: direct (server IP) + 2 proxies.
 * Each slot has independent per-domain cooldown tracking.
 * When a slot gets 429 for a domain, it's marked with cooldown and
 * the next available slot is used automatically.
 */

import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ProxySlot {
  index: number;
  name: string;
  agent: HttpsProxyAgent<string> | null; // null = direct
  /** domain -> cooldown-until timestamp */
  cooldowns: Map<string, number>;
  /** domain -> consecutive 429 count */
  consecutive429s: Map<string, number>;
  /** domain -> last request timestamp (for rate limiting) */
  lastRequestAt: Map<string, number>;
  /** domain -> current adaptive gap (ms). Undefined = use base rate limit. AIMD: ×2 on 429, −500ms per 20 successes down to base. */
  adaptiveGap: Map<string, number>;
  /** domain -> consecutive success count since last 429 (for additive decrease). */
  successStreak: Map<string, number>;
  totalRequests: number;
  total429s: number;
  totalSuccesses: number;
}

export interface PoolStats {
  slots: Array<{
    name: string;
    totalRequests: number;
    total429s: number;
    totalSuccesses: number;
    cooldowns: Record<string, string>;
    adaptiveGaps: Record<string, string>;
  }>;
}

// ─── Singleton Pool ──────────────────────────────────────────────────────

const slots: ProxySlot[] = [];
let initialized = false;

export function initProxyPool(): void {
  if (initialized) return;
  initialized = true;

  // Slot 0: direct (no proxy)
  slots.push(makeSlot(0, "direct", null));

  // Slot 1: primary proxy
  const proxy1 = process.env.CSFLOAT_PROXY_URL || process.env.PROXY_URL_1;
  if (proxy1) {
    slots.push(makeSlot(1, "proxy-1", new HttpsProxyAgent(proxy1)));
  }

  // Slot 2: fallback proxy
  const proxy2 = process.env.CSFLOAT_PROXY_FALLBACK || process.env.PROXY_URL_2;
  if (proxy2) {
    slots.push(makeSlot(2, "proxy-2", new HttpsProxyAgent(proxy2)));
  }

  console.log(`[ProxyPool] Initialized with ${slots.length} slots: ${slots.map(s => s.name).join(", ")}`);
}

function makeSlot(index: number, name: string, agent: HttpsProxyAgent<string> | null): ProxySlot {
  return {
    index,
    name,
    agent,
    cooldowns: new Map(),
    consecutive429s: new Map(),
    lastRequestAt: new Map(),
    adaptiveGap: new Map(),
    successStreak: new Map(),
    totalRequests: 0,
    total429s: 0,
    totalSuccesses: 0,
  };
}

// ─── AIMD tuning ────────────────────────────────────────────────────────
// Per-slot, per-domain gap auto-adjusts between base rate limit and cap.
//   429 → multiplicative increase: gap × 2
//   N successes in a row → additive decrease: gap − ADDITIVE_DECREASE_MS
const ADAPTIVE_GAP_CAP_MS = 60_000;
const ADAPTIVE_SUCCESS_STREAK_FOR_DECREASE = 20;
const ADAPTIVE_DECREASE_MS = 500;

// ─── Per-Domain Rate Limits (play rate) ─────────────────────────────────
//
// Proactive rate limiting: enforce minimum gap between requests per slot
// per domain. Prevents 429s instead of reacting to them.
//
// Key: domain, Value: minimum ms between requests PER SLOT.
// With 3 slots, effective rate = 3 × (1000/limitMs) req/s.

const domainRateLimits = new Map<string, number>([
  ["csfloat.com",         120_000],  // 1 req/2min per slot → ~1.5 req/min total
  ["api.dmarket.com",         500],  // 200ms was too tight; 500ms per slot
  ["skinport",            120_000],  // 1 req/2min per slot (bulk endpoint)
  ["steamcommunity.com",    6_000],  // 6s per slot (steam batch already uses 5s gap)
]);

/**
 * Set or update a per-domain rate limit.
 */
export function setDomainRateLimit(domain: string, minIntervalMs: number): void {
  domainRateLimits.set(domain, minIntervalMs);
}

/**
 * Effective gap for a slot+domain: adaptive gap if set, otherwise base rate limit.
 */
function effectiveGap(slot: ProxySlot, domain: string): number {
  const base = domainRateLimits.get(domain) ?? 0;
  const adapted = slot.adaptiveGap.get(domain);
  return adapted !== undefined ? adapted : base;
}

/**
 * Wait until it's safe to send a request to `domain` from `slot`.
 * Returns immediately if enough time has passed; otherwise sleeps.
 */
export async function waitForRate(slotIndex: number, domain: string): Promise<void> {
  const slot = slots[slotIndex];
  if (!slot) return;

  const minGap = effectiveGap(slot, domain);
  if (!minGap) return; // no rate limit configured for this domain

  const lastReq = slot.lastRequestAt.get(domain) ?? 0;
  const elapsed = Date.now() - lastReq;
  if (elapsed < minGap) {
    const waitMs = minGap - elapsed;
    await new Promise((r) => setTimeout(r, waitMs));
  }
  slot.lastRequestAt.set(domain, Date.now());
}

/**
 * Check if a slot is ready (not rate-limited) for a domain without waiting.
 */
export function isSlotReady(slotIndex: number, domain: string): boolean {
  const slot = slots[slotIndex];
  if (!slot) return false;
  const minGap = effectiveGap(slot, domain);
  if (!minGap) return true;
  const lastReq = slot.lastRequestAt.get(domain) ?? 0;
  return (Date.now() - lastReq) >= minGap;
}

// ─── Slot Selection ──────────────────────────────────────────────────────

/** Round-robin counter per domain to distribute evenly */
const domainRR = new Map<string, number>();

/**
 * Get the next available slot for a given domain.
 * Skips slots that are currently in cooldown for that domain.
 * Returns null if ALL slots are in cooldown.
 */
export function getAvailableSlot(domain: string): ProxySlot | null {
  const now = Date.now();
  const available = slots.filter(s => {
    const cd = s.cooldowns.get(domain) ?? 0;
    return cd <= now;
  });

  if (available.length === 0) return null;

  // Round-robin among available slots
  const rr = (domainRR.get(domain) ?? 0) % available.length;
  domainRR.set(domain, rr + 1);
  return available[rr];
}

/**
 * Get a specific slot by index. Useful for dedicated per-slot crawlers.
 */
export function getSlot(index: number): ProxySlot | undefined {
  return slots[index];
}

/**
 * Get all slot indices (for spawning per-slot crawlers).
 */
export function getSlotCount(): number {
  return slots.length;
}

/**
 * Check if a slot is available for a domain (not in cooldown).
 */
export function isSlotAvailable(slotIndex: number, domain: string): boolean {
  const slot = slots[slotIndex];
  if (!slot) return false;
  return (slot.cooldowns.get(domain) ?? 0) <= Date.now();
}

/**
 * Returns the earliest timestamp at which *some* slot will be available for this domain.
 * If any slot is available now (or no slots are configured), returns Date.now().
 * Used by schedulers to park the whole loop instead of busy-looping on 429s.
 */
export function getSoonestAvailableTime(domain: string): number {
  const now = Date.now();
  if (slots.length === 0) return now;
  let earliest = Infinity;
  for (const s of slots) {
    const cd = s.cooldowns.get(domain) ?? 0;
    if (cd <= now) return now;
    if (cd < earliest) earliest = cd;
  }
  return Number.isFinite(earliest) ? earliest : now;
}

// ─── 429 / Success Tracking ─────────────────────────────────────────────

/**
 * Record a 429 for a specific slot + domain.
 * Sets cooldown based on retry-after header or exponential backoff.
 */
export function recordSlot429(
  slotIndex: number,
  domain: string,
  retryAfterSec?: number
): void {
  const slot = slots[slotIndex];
  if (!slot) return;

  slot.total429s++;
  const prev429 = slot.consecutive429s.get(domain) ?? 0;
  const count = prev429 + 1;
  slot.consecutive429s.set(domain, count);

  // Cooldown: use retry-after if provided, otherwise exponential backoff
  // 30s -> 60s -> 120s -> 300s -> 600s (max 10 min per slot)
  let cooldownMs: number;
  if (retryAfterSec && retryAfterSec > 0) {
    // Cap retry-after at 10 minutes — we have other slots
    cooldownMs = Math.min(retryAfterSec * 1000, 10 * 60_000);
  } else {
    cooldownMs = Math.min(30_000 * Math.pow(2, count - 1), 600_000);
  }

  slot.cooldowns.set(domain, Date.now() + cooldownMs);

  // AIMD multiplicative-increase: double the adaptive gap. Cap at max(60s, base × 10)
  // so domains with a large base gap (e.g. skinport at 120s) can still escalate further
  // on repeated 429s instead of being clamped below their own base.
  const base = domainRateLimits.get(domain) ?? 0;
  if (base > 0) {
    const cap = Math.max(ADAPTIVE_GAP_CAP_MS, base * 10);
    const cur = slot.adaptiveGap.get(domain) ?? base;
    const next = Math.min(cap, Math.max(base, cur * 2));
    slot.adaptiveGap.set(domain, next);
  }
  slot.successStreak.set(domain, 0);

  console.log(
    `[ProxyPool] ${slot.name} got 429 for ${domain} (${count}x) — cooldown ${Math.ceil(cooldownMs / 1000)}s, gap→${Math.ceil((slot.adaptiveGap.get(domain) ?? 0) / 1000)}s`
  );
}

/**
 * Record success for a slot + domain. Resets consecutive 429 counter.
 * After a streak of successes, additively decrease the adaptive gap (AIMD).
 */
export function recordSlotSuccess(slotIndex: number, domain: string): void {
  const slot = slots[slotIndex];
  if (!slot) return;
  slot.totalSuccesses++;
  slot.totalRequests++;
  slot.consecutive429s.set(domain, 0);

  const base = domainRateLimits.get(domain) ?? 0;
  if (base <= 0) return;

  const streak = (slot.successStreak.get(domain) ?? 0) + 1;
  slot.successStreak.set(domain, streak);

  if (streak >= ADAPTIVE_SUCCESS_STREAK_FOR_DECREASE) {
    const cur = slot.adaptiveGap.get(domain) ?? base;
    const next = Math.max(base, cur - ADAPTIVE_DECREASE_MS);
    if (next !== cur) {
      slot.adaptiveGap.set(domain, next);
      console.log(
        `[ProxyPool] ${slot.name} ${domain} gap→${Math.ceil(next / 1000)}s after ${streak} successes`
      );
    }
    slot.successStreak.set(domain, 0);
  }
}

// ─── High-Level Request Helper ───────────────────────────────────────────

/**
 * Make an HTTP request with automatic proxy rotation.
 * Tries all available slots for the domain until one succeeds.
 * On 429, marks the slot with cooldown and tries the next one.
 */
export async function proxyRequest<T = any>(
  config: AxiosRequestConfig,
  domain: string
): Promise<{ data: T; slotIndex: number }> {
  const tried = new Set<number>();
  let lastError: any = null;

  // Try each available slot
  for (let attempt = 0; attempt < slots.length; attempt++) {
    const slot = getAvailableSlot(domain);
    if (!slot || tried.has(slot.index)) {
      // All tried or all in cooldown
      break;
    }
    tried.add(slot.index);

    const reqConfig: AxiosRequestConfig = { ...config };
    if (slot.agent) {
      reqConfig.httpsAgent = slot.agent;
      reqConfig.proxy = false;
    }

    try {
      // Proactive rate limit: wait if too soon since last request
      await waitForRate(slot.index, domain);
      slot.totalRequests++;
      const response: AxiosResponse<T> = await axios(reqConfig);
      recordSlotSuccess(slot.index, domain);
      return { data: response.data, slotIndex: slot.index };
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429 || status === 403) {
        const retryAfter = parseInt(err.response?.headers?.["retry-after"] || "0", 10);
        recordSlot429(slot.index, domain, retryAfter);
        lastError = err;
        continue; // Try next slot
      }
      // Connection errors (dead proxy) — cooldown the slot and try next
      const code = err?.code;
      if (code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH" || code === "EPIPE") {
        const cooldownMs = 10 * 60_000; // 10 min cooldown for dead proxies
        const wasAlreadyCooling = (slot.cooldowns.get(domain) ?? 0) > Date.now();
        slot.cooldowns.set(domain, Date.now() + cooldownMs);
        // Only log first time to avoid spamming
        if (!wasAlreadyCooling) {
          console.log(`[ProxyPool] ${slot.name} dead for ${domain} (${code}) — cooldown ${cooldownMs / 1000}s`);
        }
        lastError = err;
        continue; // Try next slot
      }
      // Other non-429 error — don't rotate, just throw
      throw err;
    }
  }

  // All slots exhausted
  if (lastError) throw lastError;
  throw new Error(`[ProxyPool] All ${slots.length} slots in cooldown for ${domain}`);
}

/**
 * Get the axios config additions for a specific slot.
 * Useful for code that manages its own requests.
 */
export function getSlotConfig(slotIndex: number): { httpsAgent?: HttpsProxyAgent<string>; proxy?: false } {
  const slot = slots[slotIndex];
  if (!slot?.agent) return {};
  return { httpsAgent: slot.agent, proxy: false };
}

// ─── Monitoring ──────────────────────────────────────────────────────────

export function getPoolStats(): PoolStats {
  const now = Date.now();
  return {
    slots: slots.map(s => {
      const cooldowns: Record<string, string> = {};
      for (const [domain, until] of s.cooldowns) {
        if (until > now) {
          cooldowns[domain] = `${Math.ceil((until - now) / 1000)}s remaining`;
        }
      }
      const adaptiveGaps: Record<string, string> = {};
      for (const [domain, gap] of s.adaptiveGap) {
        const base = domainRateLimits.get(domain) ?? 0;
        adaptiveGaps[domain] = `${Math.ceil(gap / 1000)}s (base ${Math.ceil(base / 1000)}s)`;
      }
      return {
        name: s.name,
        totalRequests: s.totalRequests,
        total429s: s.total429s,
        totalSuccesses: s.totalSuccesses,
        cooldowns,
        adaptiveGaps,
      };
    }),
  };
}
