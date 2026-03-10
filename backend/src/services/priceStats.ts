/**
 * Centralized price-fetching stats for monitoring and diagnostics.
 * Tracks per-source: success/fail/429 counts, latency, items fetched, crawler state.
 */

export interface SourceStats {
  source: string;
  totalFetches: number;
  totalSuccesses: number;
  totalFailures: number;
  total429s: number;
  totalItemsFetched: number;
  lastFetchAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorMessage: string | null;
  last429At: string | null;
  avgLatencyMs: number;
  // Crawler-specific (Steam, CSFloat)
  crawlerIntervalMs: number | null;
  crawlerPausedUntil: string | null;
  crawlerConsecutiveSuccesses: number | null;
  // Uptime
  uptimeSinceReset: string;
}

interface InternalStats {
  totalFetches: number;
  totalSuccesses: number;
  totalFailures: number;
  total429s: number;
  totalItemsFetched: number;
  lastFetchAt: number;
  lastSuccessAt: number;
  lastFailureAt: number;
  lastErrorMessage: string | null;
  last429At: number;
  latencySum: number;
  latencyCount: number;
  // Crawler state (updated externally)
  crawlerIntervalMs: number | null;
  crawlerPausedUntil: number | null;
  crawlerConsecutiveSuccesses: number | null;
}

const stats = new Map<string, InternalStats>();
const startedAt = Date.now();

function getOrCreate(source: string): InternalStats {
  let s = stats.get(source);
  if (!s) {
    s = {
      totalFetches: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      total429s: 0,
      totalItemsFetched: 0,
      lastFetchAt: 0,
      lastSuccessAt: 0,
      lastFailureAt: 0,
      lastErrorMessage: null,
      last429At: 0,
      latencySum: 0,
      latencyCount: 0,
      crawlerIntervalMs: null,
      crawlerPausedUntil: null,
      crawlerConsecutiveSuccesses: null,
    };
    stats.set(source, s);
  }
  return s;
}

export function recordFetchStart(source: string): () => void {
  const s = getOrCreate(source);
  s.totalFetches++;
  s.lastFetchAt = Date.now();
  const start = Date.now();
  return () => {
    s.latencySum += Date.now() - start;
    s.latencyCount++;
  };
}

export function recordSuccess(source: string, itemCount: number): void {
  const s = getOrCreate(source);
  s.totalSuccesses++;
  s.totalItemsFetched += itemCount;
  s.lastSuccessAt = Date.now();
}

export function recordFailure(source: string, error: string): void {
  const s = getOrCreate(source);
  s.totalFailures++;
  s.lastFailureAt = Date.now();
  s.lastErrorMessage = error;
}

export function record429(source: string): void {
  const s = getOrCreate(source);
  s.total429s++;
  s.last429At = Date.now();
}

export function updateCrawlerState(
  source: string,
  intervalMs: number,
  pausedUntil: number,
  consecutiveSuccesses: number
): void {
  const s = getOrCreate(source);
  s.crawlerIntervalMs = intervalMs;
  s.crawlerPausedUntil = pausedUntil;
  s.crawlerConsecutiveSuccesses = consecutiveSuccesses;
}

function ts(epoch: number): string | null {
  return epoch > 0 ? new Date(epoch).toISOString() : null;
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

export function getSourceStats(source: string): SourceStats | null {
  const s = stats.get(source);
  if (!s) return null;
  return {
    source,
    totalFetches: s.totalFetches,
    totalSuccesses: s.totalSuccesses,
    totalFailures: s.totalFailures,
    total429s: s.total429s,
    totalItemsFetched: s.totalItemsFetched,
    lastFetchAt: ts(s.lastFetchAt),
    lastSuccessAt: ts(s.lastSuccessAt),
    lastFailureAt: ts(s.lastFailureAt),
    lastErrorMessage: s.lastErrorMessage,
    last429At: ts(s.last429At),
    avgLatencyMs: s.latencyCount > 0 ? Math.round(s.latencySum / s.latencyCount) : 0,
    crawlerIntervalMs: s.crawlerIntervalMs,
    crawlerPausedUntil: s.crawlerPausedUntil ? ts(s.crawlerPausedUntil) : null,
    crawlerConsecutiveSuccesses: s.crawlerConsecutiveSuccesses,
    uptimeSinceReset: formatDuration(Date.now() - startedAt),
  };
}

export function getAllStats(): { uptime: string; sources: SourceStats[] } {
  const sources: SourceStats[] = [];
  for (const source of ["skinport", "steam", "csfloat", "dmarket"]) {
    const s = getSourceStats(source);
    if (s) sources.push(s);
  }
  return {
    uptime: formatDuration(Date.now() - startedAt),
    sources,
  };
}
