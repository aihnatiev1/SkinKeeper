/**
 * Tests for the sticker / keychain catalog resolver.
 *
 * The decoder gives us numeric `sticker_id` (def_index) but no name or
 * image. ByMykel/CSGO-API publishes the canonical mapping. The resolver
 * caches it for 24h and the inspect path looks up name+image during
 * each decode. Without this, the DB stored `name: ""` for every sticker
 * and the mobile UI rendered empty bubbles.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

import axios from "axios";

const STICKERS_FIXTURE = [
  { def_index: "4", name: "Sticker | Shooter Close (Foil)", image: "img/4.png" },
  { def_index: "1699", name: "Sticker | NiKo (Holo) | Antwerp 2022", image: "img/1699.png" },
  { def_index: "9999", name: "" /* malformed */, image: "img/9999.png" },
];
const KEYCHAINS_FIXTURE = [
  { def_index: "1", name: "Charm | Lil' Ava", image: "img/k1.png" },
  { def_index: "2", name: "Charm | That's Bananas", image: "img/k2.png" },
];

describe("csgoCatalog resolver", () => {
  beforeEach(() => {
    vi.resetModules(); // reload module so cache is fresh per test
    vi.clearAllMocks();
  });

  it("resolves a known sticker_id to {name, image}", async () => {
    (axios.get as any) = vi
      .fn()
      .mockResolvedValueOnce({ data: STICKERS_FIXTURE })
      .mockResolvedValueOnce({ data: KEYCHAINS_FIXTURE });

    const { resolveSticker } = await import("../csgoCatalog.js");
    const r = await resolveSticker(1699);
    expect(r).toEqual({
      name: "Sticker | NiKo (Holo) | Antwerp 2022",
      image: "img/1699.png",
    });
  });

  it("returns null for an unknown sticker_id", async () => {
    (axios.get as any) = vi
      .fn()
      .mockResolvedValueOnce({ data: STICKERS_FIXTURE })
      .mockResolvedValueOnce({ data: KEYCHAINS_FIXTURE });

    const { resolveSticker } = await import("../csgoCatalog.js");
    expect(await resolveSticker(123_456)).toBeNull();
  });

  it("skips entries with an empty name (malformed source)", async () => {
    (axios.get as any) = vi
      .fn()
      .mockResolvedValueOnce({ data: STICKERS_FIXTURE })
      .mockResolvedValueOnce({ data: KEYCHAINS_FIXTURE });

    const { resolveSticker } = await import("../csgoCatalog.js");
    // 9999 is in the fixture but has name: ""; we don't want to write
    // an empty name to the DB just because the source had a blank entry.
    expect(await resolveSticker(9999)).toBeNull();
  });

  it("resolves keychain by def_index (NOT pattern — that was the previous bug)", async () => {
    (axios.get as any) = vi
      .fn()
      .mockResolvedValueOnce({ data: STICKERS_FIXTURE })
      .mockResolvedValueOnce({ data: KEYCHAINS_FIXTURE });

    const { resolveKeychain } = await import("../csgoCatalog.js");
    expect((await resolveKeychain(2))?.name).toBe("Charm | That's Bananas");
  });

  it("only fetches each catalog once (in-memory cache)", async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ data: STICKERS_FIXTURE })
      .mockResolvedValueOnce({ data: KEYCHAINS_FIXTURE });
    (axios.get as any) = getMock;

    const { resolveSticker, resolveKeychain } = await import("../csgoCatalog.js");
    await resolveSticker(4);
    await resolveSticker(1699);
    await resolveKeychain(1);
    await resolveKeychain(2);

    // Two URLs (stickers.json + keychains.json), each fetched exactly once.
    expect(getMock).toHaveBeenCalledTimes(2);
  });
});
