/**
 * Regression tests for the /api/ext/items/enrich endpoint after the
 * "extension delivers nothing" investigation.
 *
 * Two related bugs were fixed:
 *
 * 1. The endpoint accepted `stickers: []` / `charms: []` as a valid
 *    "update" — sets.length > 0 — and refreshed inspected_at every call.
 *    That made inspected_at look populated (1288 rows over 30 days) even
 *    though no real data ever landed: paint_index = 0/5978, real
 *    stickers = 8/5978, charms = 0. Now empty arrays are treated as null,
 *    and rows with no enrichable signal are skipped without writing
 *    inspected_at.
 *
 * 2. ~47% of inspect_links in DB were unresolved Steam templates
 *    (`+csgo_econ_action_preview %propid:6%`). The extension now resolves
 *    %propid:N% from m_rgAssetProperties and ships the link in the enrich
 *    payload; the endpoint decodes it locally via cs2-inspect-serializer
 *    so a single sync recovers float/seed/paintIndex/stickers/charms
 *    without any further round-trips.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

const { mockPoolQuery, mockPoolConnect, mockClientQuery, mockFetchInspectData } =
  vi.hoisted(() => ({
    mockPoolQuery: vi.fn(),
    mockPoolConnect: vi.fn(),
    mockClientQuery: vi.fn(),
    mockFetchInspectData: vi.fn(),
  }));

vi.mock("../../db/pool.js", () => ({
  pool: {
    query: mockPoolQuery,
    connect: mockPoolConnect,
  },
}));

vi.mock("../../services/inspect.js", () => ({
  fetchInspectData: mockFetchInspectData,
}));

import extensionRouter from "../../routes/extension.js";

const USER_ID = 42;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/ext", extensionRouter);
  return app;
}

function authToken() {
  return jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

function setupAuthHappyPath() {
  // First call: authMiddleware demo-check → return non-demo steam_id
  // Second call: endpoint reads steam_accounts.id list
  // Then enrich loops through items via the connected client.
  mockPoolQuery
    .mockResolvedValueOnce({ rows: [{ steam_id: "76561198000000123" }] }) // demo check
    .mockResolvedValueOnce({ rows: [{ id: 100 }, { id: 101 }] });          // accountIds
  mockClientQuery.mockResolvedValue({ rows: [] });
  mockPoolConnect.mockResolvedValue({
    query: mockClientQuery,
    release: vi.fn(),
  });
}

describe("POST /api/ext/items/enrich", () => {
  beforeEach(() => {
    mockPoolQuery.mockReset();
    mockPoolConnect.mockReset();
    mockClientQuery.mockReset();
    mockFetchInspectData.mockReset();
  });

  it("does NOT update inspected_at when payload has only empty arrays (no signal)", async () => {
    setupAuthHappyPath();

    const app = makeApp();
    const res = await request(app)
      .post("/api/ext/items/enrich")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        items: [
          { asset_id: "a1", stickers: [], charms: [] },
          { asset_id: "a2", stickers: [], charms: [], float_value: null },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(0);
    expect(res.body.skipped).toBe(2);

    // Critically: no UPDATE was emitted. Old behaviour would have run two
    // UPDATEs that touched only inspected_at.
    const updateCalls = mockClientQuery.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("UPDATE inventory_items")
    );
    expect(updateCalls.length).toBe(0);
  });

  it("decodes a resolved inspect_link and updates float/paint/stickers", async () => {
    setupAuthHappyPath();
    mockFetchInspectData.mockResolvedValueOnce({
      floatValue: 0.0123,
      paintSeed: 661,
      paintIndex: 38,
      stickers: [{ slot: 0, sticker_id: 4, name: "", wear: null, image: "" }],
      charms: [],
    });

    const RESOLVED_LINK =
      "steam://run/730//+csgo_econ_action_preview ABC123DEADBEEF";

    const app = makeApp();
    const res = await request(app)
      .post("/api/ext/items/enrich")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        items: [{ asset_id: "a1", inspect_link: RESOLVED_LINK }],
      });

    expect(res.status).toBe(200);
    expect(res.body.decoded).toBe(1);
    expect(res.body.updated).toBe(1);

    expect(mockFetchInspectData).toHaveBeenCalledWith(RESOLVED_LINK);

    // The single UPDATE must carry float, paint_seed, paint_index, stickers,
    // inspect_link, AND inspected_at.
    const updateCall = mockClientQuery.mock.calls.find((c) =>
      typeof c[0] === "string" && c[0].includes("UPDATE inventory_items")
    );
    expect(updateCall).toBeTruthy();
    const sql = updateCall![0] as string;
    expect(sql).toContain("float_value");
    expect(sql).toContain("paint_seed");
    expect(sql).toContain("paint_index");
    expect(sql).toContain("stickers");
    expect(sql).toContain("inspect_link");
    expect(sql).toContain("inspected_at = NOW()");
  });

  it("does NOT call decoder for an unresolved %propid template link", async () => {
    setupAuthHappyPath();

    const TEMPLATE_LINK =
      "steam://run/730//+csgo_econ_action_preview %propid:6%";

    const app = makeApp();
    const res = await request(app)
      .post("/api/ext/items/enrich")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        items: [{ asset_id: "a1", inspect_link: TEMPLATE_LINK }],
      });

    expect(res.status).toBe(200);
    // No decode attempted (the cs2-inspect-serializer would have thrown
    // on the placeholder anyway, but skipping it saves a CPU-spin).
    expect(mockFetchInspectData).not.toHaveBeenCalled();
    // No real fields to write → row skipped (no inspected_at refresh).
    expect(res.body.updated).toBe(0);
    expect(res.body.skipped).toBe(1);
  });

  it("falls back to extension-supplied fields if local decode fails", async () => {
    setupAuthHappyPath();
    // Decoder unavailable / link malformed past the cheap pre-check.
    mockFetchInspectData.mockResolvedValueOnce({
      failed: true,
      reason: "api_error",
    });

    const app = makeApp();
    const res = await request(app)
      .post("/api/ext/items/enrich")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        items: [
          {
            asset_id: "a1",
            float_value: 0.05,
            paint_seed: 100,
            inspect_link:
              "steam://run/730//+csgo_econ_action_preview NOTREALHEX",
          },
        ],
      });

    expect(res.status).toBe(200);
    // Decoder was tried (because link looked resolved) — and failed.
    expect(mockFetchInspectData).toHaveBeenCalledTimes(1);
    expect(res.body.decoded).toBe(0);
    // But the extension still gave us float+seed, so the row updates.
    expect(res.body.updated).toBe(1);
  });

  it("accepts trade_lock_date and writes parsed ISO to trade_ban_until", async () => {
    setupAuthHappyPath();

    // Future-dated lock the parser must accept (within ±2y).
    const future = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
    const month = future.toLocaleString("en-US", { month: "short" });
    const lockRaw = `${month} ${future.getDate()}, ${future.getFullYear()} (06:00:00) GMT`;

    const app = makeApp();
    const res = await request(app)
      .post("/api/ext/items/enrich")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        items: [{ asset_id: "a1", trade_lock_date: lockRaw }],
      });

    expect(res.status).toBe(200);
    expect(res.body.lock).toBe(1);
    expect(res.body.updated).toBe(1);

    const updateCall = mockClientQuery.mock.calls.find((c) =>
      typeof c[0] === "string" && c[0].includes("UPDATE inventory_items")
    );
    const sql = updateCall![0] as string;
    expect(sql).toContain("trade_ban_until");
    const params = updateCall![1] as any[];
    // Find the ISO timestamp in params — it should be a parsed Date string.
    const iso = params.find(
      (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)
    );
    expect(iso).toBeTruthy();
    // Same day as the input lock.
    expect(iso!.startsWith(future.toISOString().slice(0, 10))).toBe(true);
  });

  it("rejects trade_lock_date that's already past or implausibly far future", async () => {
    setupAuthHappyPath();

    const app = makeApp();
    const res = await request(app)
      .post("/api/ext/items/enrich")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        items: [
          { asset_id: "a1", trade_lock_date: "Jan 1, 2010 (06:00:00) GMT" }, // past
          { asset_id: "a2", trade_lock_date: "Jan 1, 2099 (06:00:00) GMT" }, // far future
          { asset_id: "a3", trade_lock_date: "garbage" },                    // unparseable
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.lock).toBe(0);
    expect(res.body.skipped).toBe(3);
  });

  it("preserves existing UPDATE param ordering (inspect_link goes after array fields)", async () => {
    setupAuthHappyPath();
    mockFetchInspectData.mockResolvedValueOnce({
      floatValue: 0.01,
      paintSeed: 1,
      paintIndex: 1,
      stickers: [],
      charms: [],
    });

    const RESOLVED_LINK =
      "steam://run/730//+csgo_econ_action_preview DEADBEEF";

    const app = makeApp();
    await request(app)
      .post("/api/ext/items/enrich")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({ items: [{ asset_id: "a1", inspect_link: RESOLVED_LINK }] });

    const updateCall = mockClientQuery.mock.calls.find((c) =>
      typeof c[0] === "string" && c[0].includes("UPDATE inventory_items")
    );
    expect(updateCall).toBeTruthy();
    const params = updateCall![1] as any[];
    // The last two params are always (asset_id, accountIds[]) — this
    // ordering is what makes `WHERE asset_id = $N AND steam_account_id =
    // ANY($N+1)` work. If a refactor changes it, that WHERE breaks
    // silently and items get updated for the wrong user.
    expect(params[params.length - 2]).toBe("a1");
    expect(params[params.length - 1]).toEqual([100, 101]);
  });
});
