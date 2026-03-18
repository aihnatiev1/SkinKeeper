import { registerCache } from "../utils/cacheRegistry.js";

// ---------------------------------------------------------------------------
// Default TTLs (configurable via env)
// ---------------------------------------------------------------------------

export const CACHE_TTLS = {
  portfolio: parseInt(process.env.CACHE_TTL_PORTFOLIO || "60000", 10),
  inventory: parseInt(process.env.CACHE_TTL_INVENTORY || "30000", 10),
  prices: parseInt(process.env.CACHE_TTL_PRICES || "120000", 10),
};

// ---------------------------------------------------------------------------
// ResponseCache
// ---------------------------------------------------------------------------

interface CacheEntry<T = unknown> {
  data: T;
  expires: number;
}

export class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, { data, expires: Date.now() + ttlMs });
  }

  /**
   * Delete all keys whose key string contains `pattern`.
   * Returns the number of entries removed.
   */
  invalidate(pattern: string): number {
    let count = 0;
    this.cache.forEach((_val, key) => {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        count++;
      }
    });
    return count;
  }

  getStats(): { size: number; hits: number; misses: number; hitRate: string } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : "N/A",
    };
  }
}

// Module-level singleton
export const responseCache = new ResponseCache();

// Register with cache registry for admin monitoring.
// The registry expects TTLCache but we adapt via duck-typing the stats getter.
registerCache("responseCache", {
  get stats() {
    return responseCache.getStats();
  },
} as any);
