/**
 * Test helpers for creating mock data, generating JWTs, and building
 * authenticated supertest requests.
 *
 * All DB interactions are mocked — no real PostgreSQL connection required.
 */
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-unit-tests";

/** Generate a valid JWT for test requests. */
export function createTestJwt(
  userId: number = 1,
  opts?: { steamId?: string; expiresIn?: string }
): string {
  return jwt.sign(
    { userId, ...(opts?.steamId ? { steamId: opts.steamId } : {}) },
    JWT_SECRET,
    { expiresIn: opts?.expiresIn ?? "30d" }
  );
}

/** Generate an expired JWT for testing token expiry. */
export function createExpiredJwt(userId: number = 1): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "-1s" });
}

/** Build a mock pool.query function that returns rows in sequence. */
export function mockQuerySequence(responses: Array<{ rows: any[]; rowCount?: number }>) {
  let callIndex = 0;
  return (..._args: any[]) => {
    if (callIndex >= responses.length) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    const resp = responses[callIndex++];
    return Promise.resolve({ rows: resp.rows, rowCount: resp.rowCount ?? resp.rows.length });
  };
}

/** Create a mock user row as returned from DB. */
export function mockUser(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    steam_id: "76561198000000001",
    display_name: "TestUser",
    avatar_url: "https://avatars.steamstatic.com/test.jpg",
    is_premium: false,
    active_account_id: 1,
    ...overrides,
  };
}

/** Create a mock steam account row. */
export function mockSteamAccount(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    user_id: 1,
    steam_id: "76561198000000001",
    display_name: "TestAccount",
    avatar_url: "https://avatars.steamstatic.com/test.jpg",
    wallet_currency: 1,
    ...overrides,
  };
}

/** Create a mock inventory item. */
export function mockInventoryItem(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    steam_account_id: 1,
    asset_id: "12345678901",
    market_hash_name: "AK-47 | Redline (Field-Tested)",
    icon_url: "https://community.cloudflare.steamstatic.com/economy/image/test",
    tradable: true,
    marketable: true,
    name_color: "D2D2D2",
    rarity: "Classified",
    trade_ban_until: null,
    ...overrides,
  };
}

/** Create a mock transaction row. */
export function mockTransaction(overrides: Record<string, any> = {}) {
  return {
    tx_id: "listing_123_1700000000",
    user_id: 1,
    type: "buy" as const,
    market_hash_name: "AK-47 | Redline (Field-Tested)",
    price_cents: 1234,
    tx_date: "2025-12-01T00:00:00.000Z",
    partner_steam_id: null,
    icon_url: null,
    source: "steam",
    steam_account_id: 1,
    ...overrides,
  };
}
