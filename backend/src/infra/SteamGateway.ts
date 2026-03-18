import { steamRequest, getSteamClientMetrics } from "../utils/SteamClient.js";

// Re-export types from SteamClient for consumers
import type { SteamRequestOptions, SteamResponse } from "../utils/SteamClient.js";

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

const RATE_LIMIT = parseInt(process.env.STEAM_RATE_LIMIT || "10", 10);
const CIRCUIT_THRESHOLD = parseInt(process.env.STEAM_CIRCUIT_THRESHOLD || "5", 10);
const CIRCUIT_COOLDOWN_MS = parseInt(process.env.STEAM_CIRCUIT_COOLDOWN_MS || "60000", 10);
const DEDUP_WINDOW_MS = 5000;

// ---------------------------------------------------------------------------
// Token bucket rate limiter
// ---------------------------------------------------------------------------

let tokens = RATE_LIMIT;
let lastRefill = Date.now();
let rateLimitWaits = 0;

function refillTokens(): void {
  const now = Date.now();
  const elapsed = now - lastRefill;
  const refill = (elapsed / 1000) * RATE_LIMIT;
  tokens = Math.min(RATE_LIMIT, tokens + refill);
  lastRefill = now;
}

async function acquireToken(): Promise<void> {
  refillTokens();
  if (tokens >= 1) {
    tokens -= 1;
    return;
  }
  rateLimitWaits++;
  const waitMs = Math.ceil(1000 / RATE_LIMIT);
  await new Promise((r) => setTimeout(r, waitMs));
  refillTokens();
  tokens = Math.max(0, tokens - 1);
}

// ---------------------------------------------------------------------------
// Request dedup (GET only)
// ---------------------------------------------------------------------------

interface DedupEntry<T = unknown> {
  promise: Promise<SteamResponse<T>>;
  createdAt: number;
}

const dedupMap = new Map<string, DedupEntry>();
let dedupHits = 0;

function buildDedupKey(opts: SteamRequestOptions): string {
  const method = opts.method ?? "GET";
  const paramStr = opts.params
    ? Object.entries(opts.params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("&")
    : "";
  return `${method}:${opts.url}?${paramStr}`;
}

// ---------------------------------------------------------------------------
// Circuit breaker (per domain)
// ---------------------------------------------------------------------------

interface CircuitState {
  domain: string;
  state: "closed" | "open";
  failures: number;
  openUntil: number;
}

const circuits = new Map<string, CircuitState>();
let circuitBreaks = 0;

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

function getCircuit(domain: string): CircuitState {
  let cs = circuits.get(domain);
  if (!cs) {
    cs = { domain, state: "closed", failures: 0, openUntil: 0 };
    circuits.set(domain, cs);
  }
  return cs;
}

function checkCircuit(domain: string): void {
  const cs = getCircuit(domain);
  if (cs.state === "open") {
    if (Date.now() >= cs.openUntil) {
      // Half-open: allow one request through to probe
      cs.state = "closed";
      cs.failures = 0;
    } else {
      throw new CircuitOpenError(
        `Circuit open for ${domain} until ${new Date(cs.openUntil).toISOString()}`
      );
    }
  }
}

function recordSuccess(domain: string): void {
  const cs = getCircuit(domain);
  cs.failures = 0;
  cs.state = "closed";
}

function recordFailure(domain: string): void {
  const cs = getCircuit(domain);
  cs.failures++;
  if (cs.failures >= CIRCUIT_THRESHOLD) {
    cs.state = "open";
    cs.openUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    circuitBreaks++;
    console.warn(
      `[SteamGateway] Circuit OPEN for ${domain} (${cs.failures} consecutive failures, cooldown ${CIRCUIT_COOLDOWN_MS}ms)`
    );
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class CircuitOpenError extends Error {
  readonly code = "CIRCUIT_OPEN";
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

// ---------------------------------------------------------------------------
// Gateway metrics
// ---------------------------------------------------------------------------

export interface GatewayMetrics {
  dedupHits: number;
  circuitBreaks: number;
  rateLimitWaits: number;
  client: ReturnType<typeof getSteamClientMetrics>;
}

// ---------------------------------------------------------------------------
// Main Gateway
// ---------------------------------------------------------------------------

export const SteamGateway = {
  /**
   * Route a Steam request through rate limiter, dedup, and circuit breaker.
   */
  async request<T = unknown>(opts: SteamRequestOptions): Promise<SteamResponse<T>> {
    const domain = getDomain(opts.url);
    const method = opts.method ?? "GET";

    // 1. Check circuit
    checkCircuit(domain);

    // 2. Dedup check (GET only)
    if (method === "GET") {
      const key = buildDedupKey(opts);
      const existing = dedupMap.get(key);
      if (existing && Date.now() - existing.createdAt < DEDUP_WINDOW_MS) {
        dedupHits++;
        return existing.promise as Promise<SteamResponse<T>>;
      }

      // 3. Rate limit
      await acquireToken();

      // 4. Execute and store promise for dedup
      const promise = steamRequest<T>(opts).then(
        (res) => {
          recordSuccess(domain);
          // Schedule removal after dedup window
          setTimeout(() => dedupMap.delete(key), DEDUP_WINDOW_MS);
          return res;
        },
        (err) => {
          recordFailure(domain);
          setTimeout(() => dedupMap.delete(key), DEDUP_WINDOW_MS);
          throw err;
        }
      );

      dedupMap.set(key, { promise: promise as Promise<SteamResponse<unknown>>, createdAt: Date.now() });
      return promise;
    }

    // POST requests: no dedup, just rate limit + execute
    await acquireToken();

    try {
      const res = await steamRequest<T>(opts);
      recordSuccess(domain);
      return res;
    } catch (err) {
      recordFailure(domain);
      throw err;
    }
  },

  /** Get gateway + client metrics. */
  getMetrics(): GatewayMetrics {
    return {
      dedupHits,
      circuitBreaks,
      rateLimitWaits,
      client: getSteamClientMetrics(),
    };
  },

  /** Get circuit breaker state for all tracked domains. */
  getCircuitState(): CircuitState[] {
    return Array.from(circuits.values());
  },
};
