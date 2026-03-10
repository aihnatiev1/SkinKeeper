import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock pool
const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}));

// Mock firebase
const mockSendPush = vi.fn();
const mockIsFirebaseReady = vi.fn();
vi.mock("../firebase.js", () => ({
  sendPush: (...args: any[]) => mockSendPush(...args),
  isFirebaseReady: () => mockIsFirebaseReady(),
}));

import { evaluateAlerts } from "../alertEngine.js";

const makeAlert = (overrides: Record<string, any> = {}) => ({
  id: 1,
  user_id: 42,
  market_hash_name: "AK-47 | Redline (Field-Tested)",
  condition: "above",
  threshold: 10.0,
  source: "any",
  cooldown_minutes: 60,
  last_triggered_at: null,
  ...overrides,
});

describe("evaluateAlerts", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockSendPush.mockReset();
    mockIsFirebaseReady.mockReset();
    mockIsFirebaseReady.mockReturnValue(true);
    mockSendPush.mockResolvedValue({ successCount: 1, failedTokens: [] });
  });

  it("does nothing when firebase is not ready", async () => {
    mockIsFirebaseReady.mockReturnValue(false);

    await evaluateAlerts(new Map([["AK-47", 15.0]]), "steam");

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("does nothing when prices map is empty", async () => {
    await evaluateAlerts(new Map(), "steam");

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("triggers 'above' alert when price >= threshold", async () => {
    const alert = makeAlert({ condition: "above", threshold: 10.0 });

    // Query 1: fetch matching alerts
    mockQuery.mockResolvedValueOnce({ rows: [alert] });
    // Query 2: fetch user devices
    mockQuery.mockResolvedValueOnce({ rows: [{ fcm_token: "token123" }] });
    // Query 3: insert alert_history
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Query 4: update last_triggered_at
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await evaluateAlerts(
      new Map([["AK-47 | Redline (Field-Tested)", 12.5]]),
      "steam"
    );

    expect(mockSendPush).toHaveBeenCalledWith(
      ["token123"],
      "Price Alert",
      expect.stringContaining("$12.50"),
      expect.objectContaining({ type: "price_alert", alertId: "1" })
    );
  });

  it("does NOT trigger 'above' alert when price < threshold", async () => {
    const alert = makeAlert({ condition: "above", threshold: 20.0 });

    mockQuery.mockResolvedValueOnce({ rows: [alert] });

    await evaluateAlerts(
      new Map([["AK-47 | Redline (Field-Tested)", 15.0]]),
      "steam"
    );

    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("triggers 'below' alert when price <= threshold", async () => {
    const alert = makeAlert({ condition: "below", threshold: 10.0 });

    mockQuery.mockResolvedValueOnce({ rows: [alert] });
    mockQuery.mockResolvedValueOnce({ rows: [{ fcm_token: "tok1" }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await evaluateAlerts(
      new Map([["AK-47 | Redline (Field-Tested)", 8.5]]),
      "skinport"
    );

    expect(mockSendPush).toHaveBeenCalledWith(
      ["tok1"],
      "Price Alert",
      expect.stringContaining("below"),
      expect.objectContaining({ type: "price_alert" })
    );
  });

  it("triggers 'changePct' alert when % change exceeds threshold", async () => {
    const alert = makeAlert({ condition: "changePct", threshold: 5.0 });

    // Fetch alerts
    mockQuery.mockResolvedValueOnce({ rows: [alert] });
    // Fetch previous price (for changePct check)
    mockQuery.mockResolvedValueOnce({ rows: [{ price: 10.0 }] });
    // Fetch devices
    mockQuery.mockResolvedValueOnce({ rows: [{ fcm_token: "tok1" }] });
    // Insert history
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Update last_triggered
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Current price = 11.0, prev = 10.0 → 10% change > 5% threshold
    await evaluateAlerts(
      new Map([["AK-47 | Redline (Field-Tested)", 11.0]]),
      "steam"
    );

    expect(mockSendPush).toHaveBeenCalledWith(
      ["tok1"],
      "Price Alert",
      expect.stringContaining("up"),
      expect.objectContaining({ type: "price_alert" })
    );
  });

  it("respects cooldown — does not re-trigger within cooldown period", async () => {
    const recentTrigger = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 min ago
    const alert = makeAlert({
      condition: "above",
      threshold: 5.0,
      cooldown_minutes: 60, // 60 min cooldown
      last_triggered_at: recentTrigger,
    });

    mockQuery.mockResolvedValueOnce({ rows: [alert] });

    await evaluateAlerts(
      new Map([["AK-47 | Redline (Field-Tested)", 15.0]]),
      "steam"
    );

    // Should NOT trigger because last_triggered was 30 min ago (within 60 min cooldown)
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("triggers after cooldown expires", async () => {
    const oldTrigger = new Date(Date.now() - 120 * 60_000).toISOString(); // 2 hours ago
    const alert = makeAlert({
      condition: "above",
      threshold: 5.0,
      cooldown_minutes: 60,
      last_triggered_at: oldTrigger,
    });

    mockQuery.mockResolvedValueOnce({ rows: [alert] });
    mockQuery.mockResolvedValueOnce({ rows: [{ fcm_token: "tok1" }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await evaluateAlerts(
      new Map([["AK-47 | Redline (Field-Tested)", 15.0]]),
      "steam"
    );

    expect(mockSendPush).toHaveBeenCalled();
  });

  it("skips push when user has no devices", async () => {
    const alert = makeAlert({ condition: "above", threshold: 5.0 });

    mockQuery.mockResolvedValueOnce({ rows: [alert] });
    // No devices
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await evaluateAlerts(
      new Map([["AK-47 | Redline (Field-Tested)", 15.0]]),
      "steam"
    );

    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("cleans up failed FCM tokens", async () => {
    const alert = makeAlert({ condition: "above", threshold: 5.0 });

    mockQuery.mockResolvedValueOnce({ rows: [alert] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ fcm_token: "good_token" }, { fcm_token: "bad_token" }],
    });

    mockSendPush.mockResolvedValue({
      successCount: 1,
      failedTokens: ["bad_token"],
    });

    // Insert history
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Update last_triggered
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Delete bad token
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await evaluateAlerts(
      new Map([["AK-47 | Redline (Field-Tested)", 15.0]]),
      "steam"
    );

    // Verify the bad token was cleaned up
    const deleteCalls = mockQuery.mock.calls.filter(
      (call: any[]) =>
        typeof call[0] === "string" && call[0].includes("DELETE FROM user_devices")
    );
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0][1]).toEqual([42, "bad_token"]);
  });

  it("handles multiple alerts for different items in one batch", async () => {
    const alert1 = makeAlert({
      id: 1,
      market_hash_name: "AK-47 | Redline (Field-Tested)",
      condition: "above",
      threshold: 10.0,
    });
    const alert2 = makeAlert({
      id: 2,
      market_hash_name: "AWP | Asiimov (Field-Tested)",
      condition: "below",
      threshold: 30.0,
    });

    mockQuery.mockResolvedValueOnce({ rows: [alert1, alert2] });
    // Devices (shared user)
    mockQuery.mockResolvedValueOnce({ rows: [{ fcm_token: "tok1" }] });
    // History + update for alert1
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // History + update for alert2
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await evaluateAlerts(
      new Map([
        ["AK-47 | Redline (Field-Tested)", 15.0],
        ["AWP | Asiimov (Field-Tested)", 25.0],
      ]),
      "steam"
    );

    expect(mockSendPush).toHaveBeenCalledTimes(2);
  });
});
