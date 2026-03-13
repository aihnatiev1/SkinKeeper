import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TTLCache } from "../TTLCache.js";

describe("TTLCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("set and get within TTL", () => {
    it("returns value set within TTL", () => {
      const cache = new TTLCache<string, number>(5000, 100);
      cache.set("key", 42);
      expect(cache.get("key")).toBe(42);
    });

    it("returns undefined for missing key", () => {
      const cache = new TTLCache<string, number>(5000, 100);
      expect(cache.get("missing")).toBeUndefined();
    });

    it("stores different types correctly", () => {
      const cache = new TTLCache<string, object>(5000, 100);
      const obj = { a: 1, b: "hello" };
      cache.set("obj", obj);
      expect(cache.get("obj")).toEqual({ a: 1, b: "hello" });
    });
  });

  describe("TTL expiry", () => {
    it("returns undefined after TTL expires", () => {
      const cache = new TTLCache<string, number>(1000, 100);
      cache.set("key", 99);

      // Advance time past TTL
      vi.advanceTimersByTime(1001);
      expect(cache.get("key")).toBeUndefined();
    });

    it("still returns value just before TTL expires", () => {
      const cache = new TTLCache<string, number>(1000, 100);
      cache.set("key", 99);

      // Advance time but stay within TTL
      vi.advanceTimersByTime(999);
      expect(cache.get("key")).toBe(99);
    });

    it("has() returns false for expired keys", () => {
      const cache = new TTLCache<string, number>(500, 100);
      cache.set("key", 42);

      vi.advanceTimersByTime(501);
      expect(cache.has("key")).toBe(false);
    });

    it("has() returns true for valid keys", () => {
      const cache = new TTLCache<string, number>(5000, 100);
      cache.set("key", 42);
      expect(cache.has("key")).toBe(true);
    });

    it("removes expired entry from size count", () => {
      const cache = new TTLCache<string, number>(500, 100);
      cache.set("key", 42);
      expect(cache.size).toBe(1);

      vi.advanceTimersByTime(501);
      cache.get("key"); // triggers deletion
      expect(cache.size).toBe(0);
    });
  });

  describe("maxSize eviction", () => {
    it("evicts oldest entry when at capacity", () => {
      const cache = new TTLCache<string, number>(60_000, 3);
      cache.set("first", 1);
      cache.set("second", 2);
      cache.set("third", 3);

      // Adding 4th entry should evict "first"
      cache.set("fourth", 4);

      expect(cache.get("first")).toBeUndefined();
      expect(cache.get("second")).toBe(2);
      expect(cache.get("third")).toBe(3);
      expect(cache.get("fourth")).toBe(4);
    });

    it("does not evict when updating existing key", () => {
      const cache = new TTLCache<string, number>(60_000, 3);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      // Updating "a" (existing) should not evict
      cache.set("a", 100);

      expect(cache.size).toBe(3);
      expect(cache.get("a")).toBe(100);
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
    });

    it("allows maxSize of 1", () => {
      const cache = new TTLCache<string, number>(60_000, 1);
      cache.set("a", 1);
      cache.set("b", 2);

      // Only "b" should remain
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      const cache = new TTLCache<string, number>(60_000, 100);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
    });

    it("allows setting after clear", () => {
      const cache = new TTLCache<string, number>(60_000, 100);
      cache.set("a", 1);
      cache.clear();
      cache.set("a", 99);

      expect(cache.get("a")).toBe(99);
    });
  });

  describe("delete", () => {
    it("removes a specific key", () => {
      const cache = new TTLCache<string, number>(60_000, 100);
      cache.set("a", 1);
      cache.set("b", 2);

      cache.delete("a");

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
    });

    it("silently ignores deletion of non-existent key", () => {
      const cache = new TTLCache<string, number>(60_000, 100);
      expect(() => cache.delete("missing")).not.toThrow();
    });
  });

  describe("stats", () => {
    it("tracks hit and miss counts", () => {
      const cache = new TTLCache<string, number>(60_000, 100);
      cache.set("key", 42);

      cache.get("key"); // hit
      cache.get("key"); // hit
      cache.get("missing"); // miss

      const stats = cache.stats;
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it("returns N/A hitRate when no requests", () => {
      const cache = new TTLCache<string, number>(60_000, 100);
      expect(cache.stats.hitRate).toBe("N/A");
    });

    it("calculates hit rate correctly", () => {
      const cache = new TTLCache<string, number>(60_000, 100);
      cache.set("key", 1);

      for (let i = 0; i < 3; i++) cache.get("key"); // 3 hits
      cache.get("missing"); // 1 miss

      // 3 / 4 = 75%
      expect(cache.stats.hitRate).toBe("75.0%");
    });
  });
});
