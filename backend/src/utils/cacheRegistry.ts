import { TTLCache } from "./TTLCache.js";

interface CacheEntry {
  name: string;
  cache: TTLCache<unknown, unknown>;
}

const registry: CacheEntry[] = [];

export function registerCache(name: string, cache: TTLCache<unknown, unknown>): void {
  registry.push({ name, cache });
}

export function getCacheStats(): Record<string, { size: number; hits: number; misses: number; hitRate: string }> {
  const stats: Record<string, { size: number; hits: number; misses: number; hitRate: string }> = {};
  for (const entry of registry) {
    stats[entry.name] = entry.cache.stats;
  }
  return stats;
}
