import axios from "axios";
import crypto from "crypto";
import * as cheerio from "cheerio";
import { pool } from "../db/pool.js";
import { getLatestPrices } from "./prices.js";
import { SteamSessionService, type SteamSession } from "./steamSession.js";
import { sendPush, isFirebaseReady } from "./firebase.js";
import { TTLCache } from "../utils/TTLCache.js";
import { registerCache } from "../utils/cacheRegistry.js";
import { SessionExpiredError } from "../utils/errors.js";
import { SteamSessionError } from "../utils/SteamClient.js";

// ─── Trade Push Notifications ───────────────────────────────────────────

/** Map trade status to push_prefs key */
function tradePrefKey(status: string, direction: string): string | null {
  if (status === "pending" && direction === "incoming") return "tradeIncoming";
  if (status === "accepted") return "tradeAccepted";
  if (status === "declined") return "tradeDeclined";
  if (status === "cancelled") return "tradeCancelled";
  return null;
}

async function notifyTradeStatusChange(
  userId: number,
  partnerName: string | null,
  status: string,
  direction: "incoming" | "outgoing",
  itemCount?: number,
): Promise<void> {
  if (!isFirebaseReady()) return;

  const prefKey = tradePrefKey(status, direction);
  if (!prefKey) return;

  const { rows: devices } = await pool.query(
    `SELECT fcm_token, push_prefs FROM user_devices WHERE user_id = $1`,
    [userId]
  );
  // Filter devices that have this notification enabled (default: true for incoming/accepted)
  const defaultOn = ["tradeIncoming", "tradeAccepted", "priceAlerts"];
  const tokens = devices
    .filter((d: any) => {
      const prefs = d.push_prefs || {};
      return prefs[prefKey] ?? defaultOn.includes(prefKey);
    })
    .map((d: any) => d.fcm_token as string);
  if (tokens.length === 0) return;

  const partner = partnerName || "Someone";
  const items = itemCount ? ` (${itemCount} items)` : "";
  let title = "Trade Update";
  let body = "";

  switch (status) {
    case "accepted":
      title = "Trade Accepted";
      body = direction === "incoming"
        ? `You accepted a trade from ${partner}${items}`
        : `${partner} accepted your trade${items}`;
      break;
    case "declined":
      title = "Trade Declined";
      body = direction === "incoming"
        ? `You declined a trade from ${partner}`
        : `${partner} declined your trade`;
      break;
    case "cancelled":
      title = "Trade Cancelled";
      body = `Trade with ${partner} was cancelled`;
      break;
    case "pending":
      if (direction === "incoming") {
        title = "New Trade Offer";
        body = `${partner} sent you a trade offer${items}`;
      }
      break;
    default:
      return;
  }

  if (!body) return;

  try {
    await sendPush(tokens, title, body, { type: "trade", status });
  } catch (err) {
    console.error(`[Trade] Push notification failed:`, err);
  }
}

/**
 * Generate a random sessionid for Steam CSRF protection.
 * Steam only checks that the Cookie value matches the POST body value.
 */
function generateSessionId(): string {
  return crypto.randomBytes(12).toString("hex");
}

function isSessionExpiredError(err: unknown): boolean {
  if (err instanceof SessionExpiredError) return true;
  if (err instanceof SteamSessionError) return true;
  return (err as any)?.code === "SESSION_EXPIRED";
}

/**
 * Get a valid session for the account, with a forced refresh retry.
 * If `forceRefresh` is true, always attempt refresh regardless of cached status.
 */
async function getValidSession(accountId: number, forceRefresh = false) {
  if (forceRefresh) {
    console.log(`[Trade] Force-refreshing session for accountId=${accountId}`);
    const result = await SteamSessionService.refreshSession(accountId);
    console.log(`[Trade] Force refresh result:`, result);
    if (result.refreshed) {
      const session = await SteamSessionService.getSession(accountId);
      if (session) return session;
    }
    throw new SessionExpiredError("Steam session expired. Please re-authenticate.");
  }
  return SteamSessionService.ensureValidSession(accountId);
}

// ─── Types ───────────────────────────────────────────────────────────────

export interface TradeItem {
  assetId: string;
  marketHashName?: string;
  iconUrl?: string;
  floatValue?: number;
  priceCents?: number;
}

export interface CreateTradeInput {
  partnerSteamId: string;
  tradeToken?: string;
  itemsToGive: TradeItem[];
  itemsToReceive: TradeItem[];
  message?: string;
  isQuickTransfer?: boolean;
}

export interface TradeOffer {
  id: string;
  direction: "incoming" | "outgoing";
  steamOfferId: string | null;
  partnerSteamId: string;
  partnerName: string | null;
  message: string | null;
  status: string;
  isQuickTransfer: boolean;
  isInternal: boolean;
  accountIdFrom: number | null;
  accountIdTo: number | null;
  accountFromName: string | null;
  accountToName: string | null;
  valueGiveCents: number;
  valueRecvCents: number;
  createdAt: string;
  updatedAt: string;
  items: TradeOfferItem[];
}

export interface TradeOfferItem {
  id: number;
  side: "give" | "receive";
  assetId: string;
  marketHashName: string | null;
  iconUrl: string | null;
  floatValue: number | null;
  priceCents: number;
}

// ─── Steam Trade Offer API ───────────────────────────────────────────────

const STEAM_COMMUNITY = "https://steamcommunity.com";
const STEAM_API = "https://api.steampowered.com";

// Rate limit: trade history sync at most once per 10 min per user
const tradeHistorySyncCache = new TTLCache<string, number>(10 * 60 * 1000, 500);
registerCache("tradeHistorySync", tradeHistorySyncCache as unknown as TTLCache<unknown, unknown>);

/**
 * Get the webTradeEligibility cookie from Steam.
 * Steam requires this cookie for all trade/market web pages since ~2024.
 * Without it, requests get stuck in a redirect loop with /market/eligibilitycheck/.
 */
async function getEligibilityCookie(session: SteamSession): Promise<string | null> {
  try {
    const resp = await axios.get(
      `${STEAM_COMMUNITY}/market/eligibilitycheck/?goto=%2F`,
      {
        headers: {
          Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        maxRedirects: 0,
        timeout: 10000,
        validateStatus: () => true,
      }
    );
    for (const c of resp.headers["set-cookie"] || []) {
      const match = c.match(/webTradeEligibility=([^;]+)/);
      if (match) return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build the full cookie string for Steam web requests, including eligibility cookie.
 */
async function buildSteamCookies(session: SteamSession): Promise<string> {
  const eligibility = await getEligibilityCookie(session);
  let cookies = `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`;
  if (eligibility) cookies += `; webTradeEligibility=${eligibility}`;
  return cookies;
}

/**
 * Fetch trade token for an account using its session cookies.
 * Parses the trade offers privacy page.
 */
export async function fetchTradeToken(
  session: { sessionId: string; steamLoginSecure: string }
): Promise<string | null> {
  try {
    const { data } = await axios.get(
      `${STEAM_COMMUNITY}/my/tradeoffers/privacy`,
      {
        headers: {
          Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        timeout: 10000,
        maxRedirects: 5,
      }
    );
    const html = data as string;

    // Try cheerio first: find the trade URL input field
    try {
      const $ = cheerio.load(html);
      const tradeUrl = $('input[id="trade_offer_access_url"]').val() as string
        || $('input[name="trade_offer_access_url"]').val() as string
        || "";
      const cheerioMatch = tradeUrl.match(/token=([A-Za-z0-9_-]+)/);
      if (cheerioMatch) return cheerioMatch[1];
    } catch {
      // cheerio parse failed, fall through to regex
    }

    // Fallback: regex
    const match = html.match(/token=([A-Za-z0-9_-]+)/);
    if (match) {
      console.warn("[Trade] Trade token extracted via regex fallback");
      return match[1];
    }
    return null;
  } catch (err) {
    console.warn("[Trade] Failed to fetch trade token:", (err as Error).message);
    return null;
  }
}

/**
 * Convert a 64-bit Steam ID to 32-bit account ID used in trade URLs.
 */
function steamId64ToAccountId(steamId64: string): string {
  const id = BigInt(steamId64);
  const accountId = id - BigInt("76561197960265728");
  return accountId.toString();
}

/**
 * Send a trade offer to a partner via Steam's web API.
 * Returns the Steam trade offer ID on success.
 */
async function sendSteamTradeOffer(
  session: SteamSession,
  partnerSteamId: string,
  tradeToken: string | undefined,
  itemsToGive: TradeItem[],
  itemsToReceive: TradeItem[],
  message?: string
): Promise<{ offerId: string }> {
  const partnerId32 = steamId64ToAccountId(partnerSteamId);
  const sessionId = session.sessionId;

  // Build Steam's trade offer JSON format
  const tradeOfferJson = {
    newversion: true,
    version: 4,
    me: {
      assets: itemsToGive.map((item) => ({
        appid: 730,
        contextid: "2",
        amount: 1,
        assetid: item.assetId,
      })),
      currency: [],
      ready: false,
    },
    them: {
      assets: itemsToReceive.map((item) => ({
        appid: 730,
        contextid: "2",
        amount: 1,
        assetid: item.assetId,
      })),
      currency: [],
      ready: false,
    },
  };

  // For friends: empty params. For non-friends: include trade token.
  const createParams = tradeToken
    ? { trade_offer_access_token: tradeToken }
    : {};

  const formData = new URLSearchParams({
    sessionid: sessionId,
    serverid: "1",
    partner: partnerSteamId,
    tradeoffermessage: message ?? "",
    json_tradeoffer: JSON.stringify(tradeOfferJson),
    captcha: "",
    trade_offer_create_params: JSON.stringify(createParams),
  });

  const cookies = await buildSteamCookies(session);

  const resp = await axios.post(
    `${STEAM_COMMUNITY}/tradeoffer/new/send`,
    formData.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
        Referer: tradeToken
          ? `${STEAM_COMMUNITY}/tradeoffer/new/?partner=${partnerId32}&token=${tradeToken}`
          : `${STEAM_COMMUNITY}/tradeoffer/new/?partner=${partnerId32}`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      timeout: 20000,
      validateStatus: () => true,
    }
  );
  const data = resp.data;

  console.log(`[Trade] Send response: status=${resp.status}, body=${JSON.stringify(data).substring(0, 500)}`);

  if (resp.status !== 200) {
    const msg = typeof data === "object" ? (data.strError || JSON.stringify(data)) : String(data).substring(0, 200);
    throw new Error(`Steam returned ${resp.status}: ${msg}`);
  }

  if (data.tradeofferid) {
    console.log(`[Trade] Sent offer ${data.tradeofferid} to ${partnerSteamId}`);
    return { offerId: data.tradeofferid };
  }

  console.error(`[Trade] Steam error:`, JSON.stringify(data));
  throw new Error(
    data.strError || `Steam trade API error: ${JSON.stringify(data)}`
  );
}

/**
 * Accept a trade offer via Steam's web API.
 */
async function acceptSteamTradeOffer(
  session: SteamSession,
  steamOfferId: string,
  partnerSteamId: string
): Promise<void> {
  const partnerId32 = steamId64ToAccountId(partnerSteamId);
  const sessionId = session.sessionId;
  const cookies = await buildSteamCookies(session);
  console.log(`[Trade] Accepting offer ${steamOfferId} partner64=${partnerSteamId} partner32=${partnerId32}`);

  let resp: any;
  try {
    resp = await axios.post(
      `${STEAM_COMMUNITY}/tradeoffer/${steamOfferId}/accept`,
      new URLSearchParams({
        sessionid: sessionId,
        serverid: "1",
        tradeofferid: steamOfferId,
        partner: partnerSteamId,
        captcha: "",
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookies,
          Referer: `${STEAM_COMMUNITY}/tradeoffer/${steamOfferId}/`,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        maxRedirects: 0,
        timeout: 15000,
        validateStatus: () => true,
      }
    );
  } catch (err: any) {
    console.error(`[Trade] Steam accept network error:`, err.message);
    throw new Error(`Steam accept failed (network: ${err.message})`);
  }

  const status = resp.status;
  const data = resp.data;
  const location = (resp.headers?.["location"] || "") as string;
  console.log(`[Trade] Accept response for ${steamOfferId}: HTTP ${status}, data=${typeof data === 'string' ? data.substring(0, 200) : JSON.stringify(data)}`);

  // Detect session expiry: redirect to login or 403
  if (status === 302 || status === 301) {
    if (location.includes("/login")) {
      throw new SessionExpiredError("Steam session expired — please re-authenticate.");
    }
  }
  if (status === 403) {
    throw new SessionExpiredError("Steam session expired — please re-authenticate.");
  }

  // Steam error codes in JSON response
  const strError = typeof data === "object" ? data?.strError : undefined;
  const steamCode = typeof data === "object" ? data?.success : undefined;

  // success:8 = InvalidState — offer already accepted/declined/expired/countered
  if (steamCode === 8) {
    const err = new Error("Trade offer is no longer active on Steam (already accepted, declined, or expired).");
    (err as any).code = "OFFER_INVALID_STATE";
    throw err;
  }

  if (strError?.includes("(42)") || steamCode === 42) {
    // Error 42 can mean expired session OR trade eligibility restriction.
    // On first attempt we treat it as session issue (triggers refresh + retry).
    // The caller handles retry logic — if retry also fails, it becomes a clear error.
    throw new SessionExpiredError("Steam session expired — please re-authenticate.");
  }
  if (strError?.includes("(25)") || steamCode === 25) {
    throw new Error("Trade offer has expired or is no longer valid on Steam.");
  }
  if (strError?.includes("(11)") || steamCode === 11) {
    throw new Error("Trade offer is no longer valid (already accepted, declined, or expired).");
  }

  // Non-2xx = unexpected error
  if (status >= 400) {
    throw new Error(strError || `Steam accept failed (HTTP ${status})`);
  }

  if (!data?.tradeid && !data?.needs_mobile_confirmation && !data?.needs_email_confirmation) {
    throw new Error(strError || "Failed to accept trade offer");
  }
}

/**
 * Decline a trade offer via Steam's web API.
 */
async function declineSteamTradeOffer(
  session: SteamSession,
  steamOfferId: string
): Promise<void> {
  const sessionId = session.sessionId;
  const cookies = await buildSteamCookies(session);
  console.log(`[Trade] Declining offer ${steamOfferId}`);

  let resp: any;
  try {
    resp = await axios.post(
      `${STEAM_COMMUNITY}/tradeoffer/${steamOfferId}/decline`,
      new URLSearchParams({
        sessionid: sessionId,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookies,
          Referer: `${STEAM_COMMUNITY}/tradeoffer/${steamOfferId}/`,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        maxRedirects: 0,
        timeout: 15000,
        validateStatus: () => true,
      }
    );
  } catch (err: any) {
    console.error(`[Trade] Steam decline network error:`, err.message);
    throw new Error(`Steam decline failed (network: ${err.message})`);
  }

  const status = resp.status;
  const data = resp.data;
  const location = (resp.headers?.["location"] || "") as string;
  console.log(`[Trade] Decline response for ${steamOfferId}: HTTP ${status}, location=${location || 'none'}, data=${typeof data === 'string' ? data.substring(0, 300) : JSON.stringify(data)}`);

  // Detect session expiry
  if ((status === 302 || status === 301) && location.includes("/login")) {
    throw new SessionExpiredError("Steam session expired — please re-authenticate.");
  }
  if (status === 403) {
    throw new SessionExpiredError("Steam session expired — please re-authenticate.");
  }

  const strError = typeof data === "object" ? data?.strError : undefined;
  const steamCode = typeof data === "object" ? data?.success : undefined;

  // success:8 = InvalidState — offer already accepted/declined/expired/countered
  if (steamCode === 8) {
    const err = new Error("Trade offer is no longer active on Steam (already accepted, declined, or expired).");
    (err as any).code = "OFFER_INVALID_STATE";
    throw err;
  }

  if (strError?.includes("(42)") || steamCode === 42) {
    throw new SessionExpiredError("Steam session expired — please re-authenticate.");
  }
  if (strError?.includes("(25)") || steamCode === 25) {
    throw new Error("Trade offer has expired or is no longer valid on Steam.");
  }
  if (strError?.includes("(11)") || steamCode === 11) {
    throw new Error("Trade offer is no longer valid (already accepted, declined, or expired).");
  }
  if (status >= 400) {
    throw new Error(strError || `Steam decline failed (HTTP ${status})`);
  }
}

/**
 * Fetch partner's inventory for trade item selection.
 */
export async function fetchPartnerInventory(
  partnerSteamId: string
): Promise<TradeItem[]> {
  const items: TradeItem[] = [];
  let lastAssetId: string | undefined;

  for (let page = 0; page < 5; page++) {
    const params: Record<string, string> = { l: "english", count: "500" };
    if (lastAssetId) params.start_assetid = lastAssetId;

    let data: any;
    try {
      const resp = await axios.get(
        `${STEAM_COMMUNITY}/inventory/${partnerSteamId}/730/2`,
        {
          params,
          timeout: 15000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          },
        }
      );
      data = resp.data;
    } catch (err: any) {
      if (err.response?.status === 403) {
        const e = new Error("Partner's inventory is private") as any;
        e.statusCode = 403;
        throw e;
      }
      if (err.response?.status === 429) {
        const e = new Error("Steam rate limit — try again later") as any;
        e.statusCode = 429;
        throw e;
      }
      throw err;
    }

    if (!data?.success || !data?.assets) break;

    const descMap = new Map<string, any>();
    for (const desc of data.descriptions ?? []) {
      descMap.set(`${desc.classid}_${desc.instanceid}`, desc);
    }

    for (const asset of data.assets) {
      const desc = descMap.get(`${asset.classid}_${asset.instanceid}`);
      if (!desc || desc.tradable !== 1) continue;

      // Skip non-tradable junk: medals, graffiti, charm removers, patches, etc.
      const name: string = desc.market_hash_name ?? "";
      const typeTag = desc.tags?.find((t: any) => t.category === "Type");
      const typeName: string = typeTag?.localized_tag_name ?? "";
      if (
        typeName === "Collectible" ||       // Service Medals, Coins, Pins
        typeName === "Graffiti" ||           // Graffiti (sealed or used)
        typeName === "Spray" ||              // Sprays
        typeName === "Patch" ||              // Patches
        name === "Charm Remover" ||
        name === "Storage Unit"
      ) continue;

      items.push({
        assetId: asset.assetid,
        marketHashName: desc.market_hash_name,
        iconUrl: desc.icon_url,
      });
    }

    if (!data.more_items) break;
    lastAssetId = data.assets[data.assets.length - 1].assetid;
    await new Promise((r) => setTimeout(r, 1500));
  }

  return items;
}

// ─── Database operations ─────────────────────────────────────────────────

/**
 * Create and send a trade offer.
 * Stores the offer in DB + sends to Steam.
 */
export async function createAndSendOffer(
  userId: number,
  input: CreateTradeInput
): Promise<TradeOffer> {
  // Ensure session is valid (will auto-refresh if expiring/expired)
  const accountId = await SteamSessionService.getActiveAccountId(userId);

  // Send to Steam first — retry once with forced refresh on session error
  let session = await getValidSession(accountId);
  if (!session) {
    throw new SessionExpiredError("Steam session not available. Please authenticate your Steam session in Settings.");
  }
  let steamOfferId: string;
  try {
    ({ offerId: steamOfferId } = await sendSteamTradeOffer(
      session,
      input.partnerSteamId,
      input.tradeToken,
      input.itemsToGive,
      input.itemsToReceive,
      input.message
    ));
  } catch (err: any) {
    if (isSessionExpiredError(err)) {
      console.log(`[Trade] Send failed with session error, retrying with refresh...`);
      session = await getValidSession(accountId, true);
      ({ offerId: steamOfferId } = await sendSteamTradeOffer(
        session,
        input.partnerSteamId,
        input.tradeToken,
        input.itemsToGive,
        input.itemsToReceive,
        input.message
      ));
    } else {
      throw err;
    }
  }

  // Look up prices for all items from DB
  const allNames = [
    ...input.itemsToGive.map((i) => i.marketHashName).filter(Boolean),
    ...input.itemsToReceive.map((i) => i.marketHashName).filter(Boolean),
  ] as string[];
  const priceMap = await getLatestPrices([...new Set(allNames)]);

  // Fill in missing prices from DB
  for (const item of [...input.itemsToGive, ...input.itemsToReceive]) {
    if (!item.priceCents && item.marketHashName) {
      const prices = priceMap.get(item.marketHashName);
      if (prices) {
        item.priceCents = Math.round(
          ((prices.steam ?? prices.skinport ?? 0) * 100)
        );
      }
    }
  }

  // Calculate estimated values
  const giveValue = input.itemsToGive.reduce(
    (s, i) => s + (i.priceCents ?? 0),
    0
  );
  const recvValue = input.itemsToReceive.reduce(
    (s, i) => s + (i.priceCents ?? 0),
    0
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO trade_offers
         (user_id, direction, steam_offer_id, partner_steam_id, message,
          status, is_quick_transfer, value_give_cents, value_recv_cents)
       VALUES ($1, 'outgoing', $2, $3, $4, 'pending', $5, $6, $7)
       RETURNING *`,
      [
        userId,
        steamOfferId,
        input.partnerSteamId,
        input.message ?? null,
        input.isQuickTransfer ?? false,
        giveValue,
        recvValue,
      ]
    );

    const offer = rows[0];

    // Insert items
    const allItems = [
      ...input.itemsToGive.map((i) => ({ ...i, side: "give" as const })),
      ...input.itemsToReceive.map((i) => ({ ...i, side: "receive" as const })),
    ];

    for (const item of allItems) {
      await client.query(
        `INSERT INTO trade_offer_items
           (offer_id, side, asset_id, market_hash_name, icon_url, float_value, price_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          offer.id,
          item.side,
          item.assetId,
          item.marketHashName ?? null,
          item.iconUrl ?? null,
          item.floatValue ?? null,
          item.priceCents ?? 0,
        ]
      );
    }

    await client.query("COMMIT");

    return mapOffer(offer, allItems);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resolve the correct Steam partner ID for accept/decline calls.
 * When the active account IS the partner_steam_id (receiver accepting),
 * we need the sender's steam_id instead.
 */
async function resolvePartnerForSteamApi(
  userId: number,
  rawPartnerSteamId: string
): Promise<string> {
  const activeSteamId = await getActiveSteamId(userId);
  if (activeSteamId && activeSteamId === rawPartnerSteamId) {
    // Active account is the receiver — find sender's steam_id
    // Sender is the other linked account
    const { rows } = await pool.query(
      `SELECT sa.steam_id FROM steam_accounts sa
       WHERE sa.user_id = $1 AND sa.steam_id != $2
       ORDER BY sa.id LIMIT 1`,
      [userId, activeSteamId]
    );
    if (rows[0]) return rows[0].steam_id;
  }
  return rawPartnerSteamId;
}

/**
 * Resolve which steam_accounts.id should perform a trade action.
 * Looks up linked accounts to detect internal trades and picks the right side:
 *   accept/decline → receiver account
 *   cancel         → sender account
 *
 * Also fixes is_internal / account_id_from / account_id_to in DB if missing.
 */
async function resolveAccountForTradeAction(
  userId: number,
  offer: { id: string; direction: string; partnerSteamId: string; isInternal: boolean; accountIdFrom: number | null; accountIdTo: number | null },
  action: "accept" | "decline" | "cancel"
): Promise<number> {
  const activeAccountId = await SteamSessionService.getActiveAccountId(userId);

  // If already correctly flagged AND from/to are different, use stored values
  if (offer.isInternal && offer.accountIdFrom && offer.accountIdTo && offer.accountIdFrom !== offer.accountIdTo) {
    if (action === "cancel") return offer.accountIdFrom;
    if (action === "accept" || action === "decline") return offer.accountIdTo;
  }

  // Detect internal by checking partner against linked accounts
  const { rows: linkedAccs } = await pool.query(
    `SELECT id, steam_id FROM steam_accounts WHERE user_id = $1`, [userId]
  );
  const partnerAcc = linkedAccs.find((a: any) => a.steam_id === offer.partnerSteamId);

  if (!partnerAcc) {
    // External trade — active account handles everything
    return activeAccountId;
  }

  // Internal trade: partner is one of our accounts.
  // For outgoing: sender = the OTHER account (not partner), receiver = partner
  // For incoming: sender = partner, receiver = the OTHER account (not partner)
  const otherAcc = linkedAccs.find((a: any) => a.id !== partnerAcc.id);
  const otherAccountId = otherAcc ? otherAcc.id : activeAccountId;
  const senderAccountId = offer.direction === "outgoing" ? otherAccountId : partnerAcc.id;
  const receiverAccountId = offer.direction === "outgoing" ? partnerAcc.id : otherAccountId;

  // Fix DB
  await pool.query(
    `UPDATE trade_offers SET is_internal = true,
       account_id_from = COALESCE(account_id_from, $1),
       account_id_to = COALESCE(account_id_to, $2)
     WHERE id = $3`,
    [senderAccountId, receiverAccountId, offer.id]
  );

  if (action === "cancel") return senderAccountId;
  return receiverAccountId; // accept & decline
}

/**
 * Fast accept a trade offer (no review).
 */
export async function acceptOffer(
  userId: number,
  offerId: string
): Promise<{ needsConfirmation: boolean }> {
  const offer = await getOfferRaw(offerId, userId);
  if (!offer) throw new Error("Trade offer not found");
  if (offer.status !== "pending" && offer.status !== "awaiting_confirmation")
    throw new Error(`Cannot accept offer with status: ${offer.status}`);

  const accountId = await resolveAccountForTradeAction(userId, offer, "accept");
  console.log(`[Trade] acceptOffer: offerId=${offerId}, accountId=${accountId}, steamOfferId=${offer.steamOfferId}, dbPartner=${offer.partnerSteamId}`);

  if (offer.steamOfferId) {
    const partnerForApi = await resolvePartnerForSteamApi(
      userId,
      offer.partnerSteamId
    );
    console.log(`[Trade] Resolved partner for Steam API: ${partnerForApi} (original: ${offer.partnerSteamId})`);

    // Try with current session, retry once with forced refresh on session error
    let session = await getValidSession(accountId);
    try {
      await acceptSteamTradeOffer(session, offer.steamOfferId, partnerForApi);
    } catch (err: any) {
      if (err.code === "OFFER_INVALID_STATE") {
        console.log(`[Trade] Accept: offer ${offer.steamOfferId} is no longer active on Steam, marking expired`);
        await pool.query(
          `UPDATE trade_offers SET status = 'expired', updated_at = NOW() WHERE id = $1 AND user_id = $2`,
          [offerId, userId]
        );
        throw new Error("This trade offer is no longer active on Steam (expired, declined, or already accepted).");
      }
      if (isSessionExpiredError(err)) {
        console.log(`[Trade] Accept failed with session error, retrying with refresh...`);
        try {
          session = await getValidSession(accountId, true);
          await acceptSteamTradeOffer(session, offer.steamOfferId, partnerForApi);
        } catch (retryErr: any) {
          if (retryErr.code === "OFFER_INVALID_STATE") {
            console.log(`[Trade] Accept retry: offer ${offer.steamOfferId} is no longer active on Steam, marking expired`);
            await pool.query(
              `UPDATE trade_offers SET status = 'expired', updated_at = NOW() WHERE id = $1 AND user_id = $2`,
              [offerId, userId]
            );
            throw new Error("This trade offer is no longer active on Steam (expired, declined, or already accepted).");
          }
          if (isSessionExpiredError(retryErr)) {
            console.error(`[Trade] Accept retry also failed — likely trade eligibility issue, not session`);
            // (42) after fresh session = not a session issue.
            // Could be: awaiting mobile confirmation, trade hold, or offer restriction.
            throw new Error("This trade offer requires mobile confirmation from the sender, or has a trade restriction.");
          }
          throw retryErr;
        }
      } else {
        throw err;
      }
    }
  }

  await pool.query(
    `UPDATE trade_offers SET status = 'accepted', updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [offerId, userId]
  );

  notifyTradeStatusChange(userId, offer.partnerSteamId, "accepted", offer.direction as any);

  return { needsConfirmation: false };
}

/**
 * Fast decline a trade offer (no review).
 */
export async function declineOffer(
  userId: number,
  offerId: string
): Promise<void> {
  const offer = await getOfferRaw(offerId, userId);
  if (!offer) throw new Error("Trade offer not found");
  if (offer.status !== "pending" && offer.status !== "awaiting_confirmation")
    throw new Error(`Cannot decline offer with status: ${offer.status}`);

  const accountId = await resolveAccountForTradeAction(userId, offer, "decline");

  if (offer.steamOfferId) {
    let session = await getValidSession(accountId);
    try {
      await declineSteamTradeOffer(session, offer.steamOfferId);
    } catch (err: any) {
      if (err.code === "OFFER_INVALID_STATE") {
        console.log(`[Trade] Decline: offer ${offer.steamOfferId} is no longer active on Steam, marking expired`);
        await pool.query(
          `UPDATE trade_offers SET status = 'expired', updated_at = NOW() WHERE id = $1 AND user_id = $2`,
          [offerId, userId]
        );
        throw new Error("This trade offer is no longer active on Steam (expired, accepted, or already declined).");
      }
      if (isSessionExpiredError(err)) {
        console.log(`[Trade] Decline failed with session error, retrying with refresh...`);
        try {
          session = await getValidSession(accountId, true);
          await declineSteamTradeOffer(session, offer.steamOfferId);
        } catch (retryErr: any) {
          if (retryErr.code === "OFFER_INVALID_STATE") {
            console.log(`[Trade] Decline retry: offer ${offer.steamOfferId} is no longer active on Steam, marking expired`);
            await pool.query(
              `UPDATE trade_offers SET status = 'expired', updated_at = NOW() WHERE id = $1 AND user_id = $2`,
              [offerId, userId]
            );
            throw new Error("This trade offer is no longer active on Steam (expired, accepted, or already declined).");
          }
          if (isSessionExpiredError(retryErr)) {
            console.error(`[Trade] Decline retry also failed — likely trade eligibility issue`);
            // (42) after fresh session = not a session issue.
            // Could be: awaiting mobile confirmation, trade hold, or offer restriction.
            throw new Error("This trade offer requires mobile confirmation from the sender, or has a trade restriction.");
          }
          throw retryErr;
        }
      } else {
        throw err;
      }
    }
  }

  await pool.query(
    `UPDATE trade_offers SET status = 'declined', updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [offerId, userId]
  );

  notifyTradeStatusChange(userId, offer.partnerSteamId, "declined", offer.direction as any);
}

/**
 * Cancel an outgoing trade offer.
 */
export async function cancelOffer(
  userId: number,
  offerId: string
): Promise<void> {
  const offer = await getOfferRaw(offerId, userId);
  if (!offer) throw new Error("Trade offer not found");
  if (offer.direction !== "outgoing")
    throw new Error("Can only cancel outgoing offers");

  const accountId = await resolveAccountForTradeAction(userId, offer, "cancel");

  // Steam uses /cancel for outgoing offers
  if (offer.steamOfferId) {
    const doCancelWithSession = async (sess: SteamSession) => {
      const cancelSessionId = sess.sessionId;
      const cookies = await buildSteamCookies(sess);
      console.log(`[Trade] Cancelling offer ${offer.steamOfferId}`);

      let resp: any;
      try {
        resp = await axios.post(
          `${STEAM_COMMUNITY}/tradeoffer/${offer.steamOfferId}/cancel`,
          new URLSearchParams({ sessionid: cancelSessionId }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Cookie: cookies,
              Referer: `${STEAM_COMMUNITY}/tradeoffer/${offer.steamOfferId}/`,
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            },
            maxRedirects: 0,
            timeout: 15000,
            validateStatus: () => true,
          }
        );
      } catch (err: any) {
        console.error(`[Trade] Steam cancel network error:`, err.message);
        throw new Error(`Steam cancel failed (network: ${err.message})`);
      }

      const status = resp.status;
      const data = resp.data;
      const location = (resp.headers?.["location"] || "") as string;
      console.log(`[Trade] Cancel response for ${offer.steamOfferId}: HTTP ${status}, data=${JSON.stringify(data)}, dataType=${typeof data}`);

      if ((status === 302 || status === 301) && location.includes("/login")) {
        throw new SessionExpiredError("Steam session expired — please re-authenticate.");
      }
      if (status === 403) {
        throw new SessionExpiredError("Steam session expired — please re-authenticate.");
      }

      const strError = typeof data === "object" ? data?.strError : undefined;
      const steamCode = typeof data === "object" ? data?.success : undefined;

      // success:8 = InvalidState — offer already accepted/declined/expired/countered
      if (steamCode === 8) {
        const err = new Error("Trade offer is no longer active on Steam (already accepted, declined, or expired).");
        (err as any).code = "OFFER_INVALID_STATE";
        throw err;
      }

      if (strError?.includes("(42)") || steamCode === 42) {
        throw new SessionExpiredError("Steam session expired — please re-authenticate.");
      }
      if (strError?.includes("(25)") || steamCode === 25) {
        throw new Error("Trade offer has expired or is no longer valid on Steam.");
      }
      if (strError?.includes("(11)") || steamCode === 11) {
        throw new Error("Trade offer is no longer valid (already accepted, declined, or expired).");
      }
      if (status >= 400) {
        throw new Error(strError || `Steam cancel failed (HTTP ${status})`);
      }
    };

    let session = await getValidSession(accountId);
    try {
      await doCancelWithSession(session);
    } catch (err: any) {
      if (err.code === "OFFER_INVALID_STATE") {
        console.log(`[Trade] Cancel: offer ${offer.steamOfferId} is no longer active on Steam, marking expired`);
        await pool.query(
          `UPDATE trade_offers SET status = 'expired', updated_at = NOW() WHERE id = $1 AND user_id = $2`,
          [offerId, userId]
        );
        throw new Error("This trade offer is no longer active on Steam (expired, accepted, or already cancelled).");
      }
      if (isSessionExpiredError(err)) {
        console.log(`[Trade] Cancel failed with session error, retrying with refresh...`);
        try {
          session = await getValidSession(accountId, true);
          await doCancelWithSession(session);
        } catch (retryErr: any) {
          if (retryErr.code === "OFFER_INVALID_STATE") {
            console.log(`[Trade] Cancel retry: offer ${offer.steamOfferId} is no longer active on Steam, marking expired`);
            await pool.query(
              `UPDATE trade_offers SET status = 'expired', updated_at = NOW() WHERE id = $1 AND user_id = $2`,
              [offerId, userId]
            );
            throw new Error("This trade offer is no longer active on Steam (expired, accepted, or already cancelled).");
          }
          if (isSessionExpiredError(retryErr)) {
            console.error(`[Trade] Cancel retry also failed — likely trade eligibility issue`);
            // (42) after fresh session = not a session issue.
            // Could be: awaiting mobile confirmation, trade hold, or offer restriction.
            throw new Error("This trade offer requires mobile confirmation from the sender, or has a trade restriction.");
          }
          throw retryErr;
        }
      } else {
        throw err;
      }
    }
  }

  await pool.query(
    `UPDATE trade_offers SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [offerId, userId]
  );

  notifyTradeStatusChange(userId, offer.partnerSteamId, "cancelled", offer.direction as any);
}

/**
 * Get the steam_id of the active account for a user.
 */
async function getActiveSteamId(userId: number): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT sa.steam_id FROM users u
     JOIN steam_accounts sa ON sa.id = u.active_account_id
     WHERE u.id = $1`,
    [userId]
  );
  return rows[0]?.steam_id ?? null;
}

/**
 * Flip a trade offer's perspective when viewing from the partner's side.
 * Swaps direction and give/receive items + values.
 */
function flipOfferPerspective(offer: TradeOffer): TradeOffer {
  return {
    ...offer,
    direction: offer.direction === "outgoing" ? "incoming" : "outgoing",
    valueGiveCents: offer.valueRecvCents,
    valueRecvCents: offer.valueGiveCents,
    items: offer.items.map((i) => ({
      ...i,
      side: i.side === "give" ? "receive" as const : "give" as const,
    })),
  };
}

/**
 * Get all trade offers for a user.
 * If the active account is the partner (not the sender), flips perspective.
 */
export async function listOffers(
  userId: number,
  status?: string,
  limit = 20,
  offset = 0,
  accountId?: number
): Promise<{ offers: TradeOffer[]; total: number; hasMore: boolean }> {
  const activeSteamId = await getActiveSteamId(userId);

  // Count query
  let countQuery = `SELECT COUNT(*) FROM trade_offers o WHERE o.user_id = $1`;
  const countParams: unknown[] = [userId];
  let countParamIdx = 2;
  if (status) {
    countQuery += ` AND o.status = $${countParamIdx}`;
    countParams.push(status);
    countParamIdx++;
  }
  if (accountId) {
    countQuery += ` AND (o.account_id_from = $${countParamIdx} OR o.account_id_to = $${countParamIdx})`;
    countParams.push(accountId);
    countParamIdx++;
  }
  const { rows: countRows } = await pool.query(countQuery, countParams);
  const total = parseInt(countRows[0].count) || 0;

  // Data query
  let query = `
    SELECT o.*,
      sa_from.display_name as account_from_name,
      sa_to.display_name as account_to_name,
      json_agg(
        json_build_object(
          'id', i.id, 'side', i.side, 'assetId', i.asset_id,
          'marketHashName', i.market_hash_name,
          'iconUrl', COALESCE(i.icon_url, ii.icon_url),
          'floatValue', i.float_value, 'priceCents', i.price_cents
        ) ORDER BY i.id
      ) AS items
    FROM trade_offers o
    LEFT JOIN trade_offer_items i ON i.offer_id = o.id
    LEFT JOIN LATERAL (
      SELECT icon_url FROM inventory_items
      WHERE market_hash_name = i.market_hash_name AND icon_url IS NOT NULL
      LIMIT 1
    ) ii ON true
    LEFT JOIN steam_accounts sa_from ON sa_from.id = o.account_id_from
    LEFT JOIN steam_accounts sa_to ON sa_to.id = o.account_id_to
    WHERE o.user_id = $1`;

  const params: unknown[] = [userId];
  let paramIdx = 2;

  if (status) {
    query += ` AND o.status = $${paramIdx}`;
    params.push(status);
    paramIdx++;
  }
  if (accountId) {
    query += ` AND (o.account_id_from = $${paramIdx} OR o.account_id_to = $${paramIdx})`;
    params.push(accountId);
    paramIdx++;
  }

  query += ` GROUP BY o.id, sa_from.display_name, sa_to.display_name ORDER BY o.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  params.push(limit, offset);

  const { rows } = await pool.query(query, params);
  const offers = rows.map((r) => {
    const offer = mapOfferRow(r);
    if (activeSteamId && offer.partnerSteamId === activeSteamId) {
      return flipOfferPerspective(offer);
    }
    return offer;
  });

  return { offers, total, hasMore: offset + offers.length < total };
}

/**
 * Get a single trade offer (raw, without perspective flip — used internally).
 */
async function getOfferRaw(
  offerId: string,
  userId: number
): Promise<TradeOffer | null> {
  const { rows } = await pool.query(
    `SELECT o.*, json_agg(
       json_build_object(
         'id', i.id, 'side', i.side, 'assetId', i.asset_id,
         'marketHashName', i.market_hash_name,
         'iconUrl', COALESCE(i.icon_url, ii.icon_url),
         'floatValue', i.float_value, 'priceCents', i.price_cents
       ) ORDER BY i.id
     ) AS items
     FROM trade_offers o
     LEFT JOIN trade_offer_items i ON i.offer_id = o.id
     LEFT JOIN LATERAL (
       SELECT icon_url FROM inventory_items
       WHERE market_hash_name = i.market_hash_name AND icon_url IS NOT NULL
       LIMIT 1
     ) ii ON true
     WHERE o.id = $1 AND o.user_id = $2
     GROUP BY o.id`,
    [offerId, userId]
  );

  if (rows.length === 0) return null;
  return mapOfferRow(rows[0]);
}

/**
 * Get a single trade offer with perspective flip for active account.
 */
export async function getOffer(
  offerId: string,
  userId: number
): Promise<TradeOffer | null> {
  const offer = await getOfferRaw(offerId, userId);
  if (!offer) return null;

  const activeSteamId = await getActiveSteamId(userId);
  if (activeSteamId && offer.partnerSteamId === activeSteamId) {
    return flipOfferPerspective(offer);
  }
  return offer;
}

// ─── Trade Analysis ──────────────────────────────────────────────────────

export interface TradeAnalysis {
  giveItems: Array<{ name: string; priceCents: number }>;
  recvItems: Array<{ name: string; priceCents: number }>;
  giveValueCents: number;
  recvValueCents: number;
  diffCents: number; // positive = good for user
  diffPct: number;
  verdict: string; // fun message
  verdictType: "great" | "good" | "neutral" | "bad" | "terrible";
}

const VERDICTS = {
  great: [
    "Bro, you absolutely cooked here 🔥",
    "Free money glitch activated 💰",
    "They didn't know what they had. You did.",
    "W trade. Hall of fame material.",
    "Your tradesman skills are legendary 🏆",
  ],
  good: [
    "Nice one! You came out on top 📈",
    "Solid trade, bro. Clean profit.",
    "A smart deal — you earned it.",
    "GG, you won this round.",
  ],
  neutral: [
    "Fair trade, no winners no losers. Respect.",
    "Even steven. Both happy, nobody scammed.",
    "Perfectly balanced, as all things should be.",
    "A gentleman's agreement. Clean.",
  ],
  bad: [
    "Hmm... I'd think twice about this one 🤔",
    "You might be leaving money on the table here.",
    "Not your best trade, chief.",
    "Are you sure about this? Just checking...",
  ],
  terrible: [
    "Bro... who hurt you? 💀",
    "This is a charity donation, not a trade.",
    "I'm calling the trade police on this one 🚨",
    "Delete this before anyone sees it.",
    "My brother in Christ, what are you doing?",
  ],
};

function getVerdict(diffPct: number): { verdict: string; verdictType: TradeAnalysis["verdictType"] } {
  let type: TradeAnalysis["verdictType"];
  if (diffPct >= 15) type = "great";
  else if (diffPct >= 3) type = "good";
  else if (diffPct >= -3) type = "neutral";
  else if (diffPct >= -15) type = "bad";
  else type = "terrible";

  const msgs = VERDICTS[type];
  const verdict = msgs[Math.floor(Math.random() * msgs.length)];
  return { verdict, verdictType: type };
}

export async function analyzeTradeOffer(
  offerId: string,
  userId: number
): Promise<TradeAnalysis | null> {
  const offer = await getOfferRaw(offerId, userId);
  if (!offer) return null;

  // Get all unique item names
  const names = [
    ...new Set(offer.items.map((i) => i.marketHashName).filter(Boolean) as string[]),
  ];

  // Lookup current prices
  const priceMap = await getLatestPrices(names);

  const giveItems: TradeAnalysis["giveItems"] = [];
  const recvItems: TradeAnalysis["recvItems"] = [];

  for (const item of offer.items) {
    const prices = item.marketHashName ? priceMap.get(item.marketHashName) : null;
    const priceCents = prices
      ? Math.round((prices.steam ?? prices.skinport ?? 0) * 100)
      : item.priceCents;

    const entry = { name: item.marketHashName || "Unknown", priceCents };

    if (item.side === "give") giveItems.push(entry);
    else recvItems.push(entry);
  }

  const giveValueCents = giveItems.reduce((s, i) => s + i.priceCents, 0);
  const recvValueCents = recvItems.reduce((s, i) => s + i.priceCents, 0);
  const diffCents = recvValueCents - giveValueCents;
  const diffPct = giveValueCents > 0
    ? Math.round((diffCents / giveValueCents) * 10000) / 100
    : recvValueCents > 0 ? 100 : 0;

  const { verdict, verdictType } = getVerdict(diffPct);

  return {
    giveItems,
    recvItems,
    giveValueCents,
    recvValueCents,
    diffCents,
    diffPct,
    verdict,
    verdictType,
  };
}

// ─── Steam Web API Key Management ────────────────────────────────────────

/**
 * Get or register a Steam Web API key for an account.
 * Tries the stored key first, then auto-registers via steamcommunity.com.
 */
async function getWebApiKey(accountId: number): Promise<string | null> {
  // Check if already stored
  const { rows } = await pool.query(
    `SELECT web_api_key FROM steam_accounts WHERE id = $1`,
    [accountId]
  );
  if (rows[0]?.web_api_key) return rows[0].web_api_key;

  // Try to auto-register
  const session = await SteamSessionService.getSession(accountId);
  if (!session) return null;

  const csrfToken = generateSessionId();
  try {
    // First check if key already exists
    const { data: page } = await axios.get(
      `${STEAM_COMMUNITY}/dev/apikey`,
      {
        headers: {
          Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${csrfToken}`,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        timeout: 10000,
        maxRedirects: 5,
      }
    );

    // Check if key is already on the page
    let keyMatch = (page as string).match(/Key:\s*([A-F0-9]{32})/i);
    if (keyMatch) {
      const apiKey = keyMatch[1];
      await pool.query(
        `UPDATE steam_accounts SET web_api_key = $1 WHERE id = $2`,
        [apiKey, accountId]
      );
      console.log(`[Trade] Found existing Web API key for account ${accountId}`);
      return apiKey;
    }

    // Check if we need to register — look for the registration form
    if ((page as string).includes("registerkey")) {
      const { data: regPage } = await axios.post(
        `${STEAM_COMMUNITY}/dev/registerkey`,
        new URLSearchParams({
          domain: "skinkeeper.app",
          agreeToTerms: "agreed",
          sessionid: csrfToken,
          Submit: "Register",
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${csrfToken}`,
            Referer: `${STEAM_COMMUNITY}/dev/apikey`,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
          timeout: 10000,
          maxRedirects: 5,
        }
      );

      keyMatch = (regPage as string).match(/Key:\s*([A-F0-9]{32})/i);
      if (keyMatch) {
        const apiKey = keyMatch[1];
        await pool.query(
          `UPDATE steam_accounts SET web_api_key = $1 WHERE id = $2`,
          [apiKey, accountId]
        );
        console.log(`[Trade] Registered new Web API key for account ${accountId}`);
        return apiKey;
      }
    }

    console.warn(`[Trade] Could not obtain Web API key for account ${accountId}`);
    return null;
  } catch (err) {
    console.warn(`[Trade] Failed to get Web API key:`, (err as Error).message);
    return null;
  }
}

// ─── Trade Offer Sync from Steam ─────────────────────────────────────────

interface SteamTradeOfferAsset {
  appid: number;
  contextid: string;
  assetid: string;
  classid: string;
  instanceid: string;
  amount: string;
}

interface SteamTradeOfferDesc {
  classid: string;
  instanceid: string;
  market_hash_name: string;
  icon_url: string;
  appid: number;
}

interface SteamTradeOfferRaw {
  tradeofferid: string;
  accountid_other: number;
  message: string;
  trade_offer_state: number;
  items_to_give?: SteamTradeOfferAsset[];
  items_to_receive?: SteamTradeOfferAsset[];
  time_created: number;
  time_updated: number;
}

// Steam trade offer states
const STEAM_OFFER_STATE: Record<number, string> = {
  1: "invalid",
  2: "pending",     // Active
  3: "accepted",
  4: "countered",
  5: "expired",
  6: "cancelled",
  7: "declined",
  8: "invalid",     // InvalidItems
  9: "awaiting_confirmation", // CreatedNeedsConfirmation
  10: "pending",    // CanceledBySecondFactor
  11: "pending",    // InEscrow
};

/**
 * Convert 32-bit account ID back to 64-bit Steam ID.
 */
function accountIdToSteamId64(accountId: number): string {
  return (BigInt(accountId) + BigInt("76561197960265728")).toString();
}

/**
 * Sync trade offers from Steam Web API into our database.
 * Fetches both sent and received active offers.
 */
export async function syncTradeOffers(userId: number): Promise<{ synced: number }> {
  // Sync from ALL linked accounts, not just active — trades exist on both sides
  const { rows: allAccounts } = await pool.query(
    `SELECT id FROM steam_accounts WHERE user_id = $1`,
    [userId]
  );

  let totalSynced = 0;
  for (const acc of allAccounts) {
    const result = await syncTradeOffersForAccount(userId, acc.id);
    totalSynced += result.synced;
  }

  // Sync trade history less frequently (at most once per 10 minutes per user)
  const historyKey = `trade_history_${userId}`;
  const lastHistorySync = tradeHistorySyncCache.get(historyKey) ?? 0;
  if (Date.now() - lastHistorySync > 10 * 60 * 1000) {
    for (const acc of allAccounts) {
      totalSynced += await syncTradeHistoryForAccount(userId, acc.id);
    }
    tradeHistorySyncCache.set(historyKey, Date.now());
  }

  return { synced: totalSynced };
}

/**
 * Parse trade offers from Steam HTML page.
 * Each offer block: <div class="tradeoffer" id="tradeofferid_XXXXX">
 * Contains: header (partner name), items (classinfo), banner (status), footer (actions).
 */
interface ScrapedOffer {
  steamOfferId: string;
  partnerSteamId: string | null;
  partnerName: string;
  message: string | null;
  status: string;
  itemClassIds: { side: "give" | "receive"; classid: string; instanceid: string; iconUrl: string }[];
}

function parseTradeOffersHtml(html: string, direction: "incoming" | "outgoing"): ScrapedOffer[] {
  // Try cheerio-based parsing first, fall back to regex
  try {
    return parseTradeOffersCheerio(html, direction);
  } catch (err) {
    console.warn("[Trade] Cheerio parse failed, falling back to regex:", (err as Error).message);
    return parseTradeOffersRegex(html, direction);
  }
}

function parseTradeOffersCheerio(html: string, direction: "incoming" | "outgoing"): ScrapedOffer[] {
  const $ = cheerio.load(html);
  const offers: ScrapedOffer[] = [];

  $(".tradeoffer").each((_i, el) => {
    const $offer = $(el);
    const offerId = $offer.attr("id")?.replace("tradeofferid_", "");
    if (!offerId) return;

    // Partner steam64 from profile link
    const profileLink = $offer.find('a[href*="/profiles/"]').attr("href") ?? "";
    const partnerMatch = profileLink.match(/profiles\/(\d{17})/);
    const partnerSteamId = partnerMatch ? partnerMatch[1] : null;

    // Partner name from header
    let partnerName = "Unknown";
    const headerText = $offer.find(".tradeoffer_header").text().trim();
    const nameMatch = headerText.match(/offered\s+(.+?)\s+a trade/) || headerText.match(/^(.+?)\s+offered you/);
    if (nameMatch) partnerName = nameMatch[1].trim();

    // Message
    const rawMsg = $offer.find(".quote").text().trim();
    const message = rawMsg || null;

    // Status from banner
    let status = "pending";
    const bannerText = $offer.find(".tradeoffer_items_banner").text().trim().toLowerCase();
    if (bannerText.includes("awaiting mobile")) status = "awaiting_confirmation";
    else if (bannerText.includes("accepted")) status = "accepted";
    else if (bannerText.includes("expired")) status = "expired";
    else if (bannerText.includes("canceled") || bannerText.includes("cancelled")) status = "cancelled";
    else if (bannerText.includes("declined")) status = "declined";
    else if (bannerText.includes("counter")) status = "countered";
    else if (bannerText.includes("escrow") || bannerText.includes("hold")) status = "on_hold";

    // Check for inactive state
    if ($offer.find(".tradeoffer_items_ctn.inactive").length > 0 && status === "pending") {
      status = "awaiting_confirmation";
    }

    // Items from primary and secondary sections
    const itemClassIds: ScrapedOffer["itemClassIds"] = [];
    const parseItems = ($section: ReturnType<typeof $>, side: "give" | "receive") => {
      $section.find("[data-economy-item]").each((_j, itemEl) => {
        const econData = $(itemEl).attr("data-economy-item") ?? "";
        const parts = econData.split("/");
        if (parts.length >= 3) {
          const classid = parts[parts.length - 2];
          const instanceid = parts[parts.length - 1];
          const imgSrc = $(itemEl).find("img").attr("src") ?? "";
          itemClassIds.push({ side, classid, instanceid, iconUrl: extractIconPath(imgSrc) });
        }
      });
    };

    const $primary = $offer.find(".tradeoffer_items.primary");
    const $secondary = $offer.find(".tradeoffer_items.secondary");

    if (direction === "outgoing") {
      parseItems($primary, "give");
      parseItems($secondary, "receive");
    } else {
      parseItems($primary, "receive");
      parseItems($secondary, "give");
    }

    offers.push({ steamOfferId: offerId, partnerSteamId, partnerName, message, status, itemClassIds });
  });

  return offers;
}

function parseTradeOffersRegex(html: string, direction: "incoming" | "outgoing"): ScrapedOffer[] {
  const offers: ScrapedOffer[] = [];

  // Split HTML into offer blocks
  const blocks = html.split(/<div class="tradeoffer" id="tradeofferid_/);
  blocks.shift(); // first chunk is before any offer

  for (const block of blocks) {
    const idMatch = block.match(/^(\d+)"/);
    if (!idMatch) continue;
    const steamOfferId = idMatch[1];

    const partnerMatch = block.match(/href="https:\/\/steamcommunity\.com\/profiles\/(\d{17})"/);
    const headerMatch = block.match(/tradeoffer_header">\s*(.*?)\s*<\/div>/s);
    let partnerName = "Unknown";
    if (headerMatch) {
      const h = headerMatch[1].trim();
      const nameMatch = h.match(/offered\s+(.+?)\s+a trade/) || h.match(/^(.+?)\s+offered you/);
      if (nameMatch) partnerName = nameMatch[1].trim();
    }

    const msgMatch = block.match(/class="quote">\s*([\s\S]*?)\s*<\/div>/);
    const rawMsg = msgMatch ? msgMatch[1].trim() : null;
    const message = rawMsg
      ? rawMsg.replace(/&nbsp;/g, " ").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || null
      : null;

    let status = "pending";
    const bannerMatch = block.match(/tradeoffer_items_banner[^>]*">\s*([\s\S]*?)(?:<span|<div)/);
    if (bannerMatch) {
      const bannerText = bannerMatch[1].trim().toLowerCase();
      if (bannerText.includes("awaiting mobile")) status = "awaiting_confirmation";
      else if (bannerText.includes("accepted")) status = "accepted";
      else if (bannerText.includes("expired")) status = "expired";
      else if (bannerText.includes("canceled") || bannerText.includes("cancelled")) status = "cancelled";
      else if (bannerText.includes("declined")) status = "declined";
      else if (bannerText.includes("counter")) status = "countered";
      else if (bannerText.includes("escrow") || bannerText.includes("hold")) status = "on_hold";
    }
    if (block.includes('tradeoffer_items_ctn  inactive') && status === "pending") {
      status = "awaiting_confirmation";
    }

    const itemClassIds: ScrapedOffer["itemClassIds"] = [];
    const primaryMatch = block.match(/tradeoffer_items primary">([\s\S]*?)tradeoffer_items secondary/);
    const secondaryMatch = block.match(/tradeoffer_items secondary">([\s\S]*?)(?:tradeoffer_footer|$)/);

    const parseItems = (section: string, side: "give" | "receive") => {
      const itemMatches = section.matchAll(/data-economy-item="classinfo\/\d+\/(\d+)\/(\d+)"/g);
      for (const m of itemMatches) {
        const imgMatch = section.match(new RegExp(`classinfo/\\d+/${m[1]}/${m[2]}"[\\s\\S]*?<img src="([^"]+)"`));
        itemClassIds.push({ side, classid: m[1], instanceid: m[2], iconUrl: extractIconPath(imgMatch ? imgMatch[1] : "") });
      }
    };

    if (direction === "outgoing") {
      if (primaryMatch) parseItems(primaryMatch[1], "give");
      if (secondaryMatch) parseItems(secondaryMatch[1], "receive");
    } else {
      if (primaryMatch) parseItems(primaryMatch[1], "receive");
      if (secondaryMatch) parseItems(secondaryMatch[1], "give");
    }

    offers.push({ steamOfferId, partnerSteamId: partnerMatch ? partnerMatch[1] : null, partnerName, message, status, itemClassIds });
  }
  return offers;
}

/**
 * Scrape active trade offers from Steam HTML pages.
 * Fallback for when GetTradeOffers API returns empty (known Steam bug since 2024).
 */
async function scrapeTradeOffersHtml(accountId: number): Promise<{ synced: number }> {
  const session = await SteamSessionService.getSession(accountId);
  if (!session) return { synced: 0 };

  const cookies = await buildSteamCookies(session);
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

  const { rows: accRows } = await pool.query(
    `SELECT user_id, steam_id FROM steam_accounts WHERE id = $1`, [accountId]
  );
  if (!accRows.length) return { synced: 0 };
  const userId = accRows[0].user_id;

  // Load linked accounts for internal detection
  const { rows: userAccounts } = await pool.query(
    `SELECT id, steam_id FROM steam_accounts WHERE user_id = $1`, [userId]
  );
  const userSteamIds = new Map(userAccounts.map((a: any) => [a.steam_id, a.id]));

  // Collect all scraped offer IDs to detect stale DB records
  const allScrapedIds = new Set<string>();
  let synced = 0;

  for (const [direction, suffix] of [["incoming", ""], ["outgoing", "sent/"]] as const) {
    try {
      const resp = await axios.get(
        `${STEAM_COMMUNITY}/my/tradeoffers/${suffix}`,
        {
          headers: { Cookie: cookies, "User-Agent": ua },
          maxRedirects: 5,
          timeout: 15000,
          validateStatus: () => true,
        }
      );
      if (resp.status !== 200) continue;
      const html = typeof resp.data === "string" ? resp.data : "";
      const offers = parseTradeOffersHtml(html, direction);

      for (const offer of offers) {
        allScrapedIds.add(offer.steamOfferId);
        const isInternal = offer.partnerSteamId ? userSteamIds.has(offer.partnerSteamId) : false;
        const partnerAccountId = offer.partnerSteamId ? userSteamIds.get(offer.partnerSteamId) ?? null : null;
        if (!isInternal && offer.partnerSteamId) {
          console.log(`[Trade] Scrape: offer ${offer.steamOfferId} partner=${offer.partnerSteamId} NOT internal. Known IDs: ${[...userSteamIds.keys()].join(', ')}`);
        }

        // Map scraped status to our status
        let dbStatus = "pending";
        if (offer.status === "accepted") dbStatus = "accepted";
        else if (offer.status === "expired") dbStatus = "expired";
        else if (offer.status === "cancelled") dbStatus = "cancelled";
        else if (offer.status === "declined") dbStatus = "declined";
        else if (offer.status === "awaiting_confirmation") dbStatus = "awaiting_confirmation";
        else if (offer.status === "on_hold") dbStatus = "on_hold";

        // Upsert: insert or update status, return old status to detect changes
        const { rows } = await pool.query(
          `INSERT INTO trade_offers
             (user_id, direction, steam_offer_id, partner_steam_id, message,
              status, is_quick_transfer, value_give_cents, value_recv_cents,
              is_internal, account_id_from, account_id_to,
              created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, FALSE, 0, 0,
                   $7, $8, $9, NOW(), NOW())
           ON CONFLICT (user_id, steam_offer_id) WHERE steam_offer_id IS NOT NULL
           DO UPDATE SET
             status = CASE WHEN trade_offers.status IN ('cancelled','declined','accepted','expired') THEN trade_offers.status ELSE EXCLUDED.status END,
             updated_at = NOW(),
             is_internal = EXCLUDED.is_internal,
             account_id_from = COALESCE(trade_offers.account_id_from, EXCLUDED.account_id_from),
             account_id_to = COALESCE(trade_offers.account_id_to, EXCLUDED.account_id_to)
           RETURNING id,
             (SELECT status FROM trade_offers t2 WHERE t2.id = trade_offers.id) AS new_status,
             CASE WHEN xmax = 0 THEN NULL ELSE $6 END AS was_insert`,
          [
            userId, direction, offer.steamOfferId,
            offer.partnerSteamId || offer.partnerName,
            offer.message, dbStatus, isInternal,
            direction === "outgoing" ? accountId : partnerAccountId,
            direction === "incoming" ? accountId : partnerAccountId,
          ]
        );

        if (rows.length > 0) {
          const offerId = rows[0].id;
          const wasInsert = rows[0].was_insert === null;

          // Notify on new incoming pending offers or status changes detected by sync
          if (wasInsert && direction === "incoming" && dbStatus === "pending") {
            notifyTradeStatusChange(userId, offer.partnerName, "pending", "incoming", offer.itemClassIds.length || undefined);
          }
          // Only insert items if none exist yet (don't overwrite API-synced items that have names)
          const { rows: existingItems } = await pool.query(
            `SELECT 1 FROM trade_offer_items WHERE offer_id = $1 AND market_hash_name IS NOT NULL LIMIT 1`,
            [offerId]
          );
          if (existingItems.length === 0 && offer.itemClassIds.length > 0) {
            await pool.query(`DELETE FROM trade_offer_items WHERE offer_id = $1`, [offerId]);
            const items = offer.itemClassIds;
            const oIds = items.map(() => offerId);
            const sSides = items.map(i => i.side);
            const aIds = items.map(i => `${i.classid}_${i.instanceid}`);
            const iUrls = items.map(i => i.iconUrl);
            await pool.query(
              `INSERT INTO trade_offer_items
                 (offer_id, side, asset_id, market_hash_name, icon_url, price_cents)
               SELECT unnest($1::uuid[]), unnest($2::text[]), unnest($3::text[]),
                      NULL, unnest($4::text[]), 0`,
              [oIds, sSides, aIds, iUrls]
            );
          }
          synced++;
        }
      }
    } catch (err: any) {
      console.warn(`[Trade] HTML scrape ${direction} failed for account ${accountId}:`, err.message);
    }
  }

  // Mark stale pending offers as expired if not found on Steam
  // Don't touch awaiting_confirmation or on_hold — they may not appear in scrape
  if (allScrapedIds.size > 0) {
    const { rows: pendingOffers } = await pool.query(
      `SELECT id, steam_offer_id, status FROM trade_offers
       WHERE user_id = $1 AND status IN ('pending', 'awaiting_confirmation')
       AND steam_offer_id IS NOT NULL
       AND (
         (status = 'pending' AND created_at < NOW() - INTERVAL '30 minutes')
         OR (status = 'awaiting_confirmation' AND created_at < NOW() - INTERVAL '2 hours')
       )`,
      [userId]
    );
    for (const po of pendingOffers) {
      if (!allScrapedIds.has(po.steam_offer_id)) {
        await pool.query(
          `UPDATE trade_offers SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          [po.id]
        );
        console.log(`[Trade] Marked stale ${po.status} offer ${po.steam_offer_id} as expired (not found on Steam)`);
      }
    }
  }

  return { synced };
}

async function syncTradeOffersForAccount(userId: number, accountId: number): Promise<{ synced: number }> {
  const apiKey = await getWebApiKey(accountId);
  if (!apiKey) {
    return { synced: 0 };
  }

  // Try Steam Web API first (may return empty due to known Steam API bug)
  let activeData: any;
  try {
    const resp = await axios.get(
      `${STEAM_API}/IEconService/GetTradeOffers/v1/`,
      {
        params: {
          key: apiKey,
          get_sent_offers: 1,
          get_received_offers: 1,
          get_descriptions: 1,
          active_only: 1,
          language: "english",
        },
        timeout: 15000,
      }
    );
    activeData = resp.data?.response;
  } catch (err: any) {
    if (err.response?.status === 403) {
      await pool.query(
        `UPDATE steam_accounts SET web_api_key = NULL WHERE id = $1`,
        [accountId]
      );
      console.warn(`[Trade] Web API key invalid for account ${accountId}, cleared`);
    }
    console.error(`[Trade] Sync active offers failed:`, err.message);
  }

  const apiHasOffers = (activeData?.trade_offers_sent?.length > 0 || activeData?.trade_offers_received?.length > 0);

  // GetTradeOffers API is broken since ~2024 (returns empty).
  // Fall back to HTML scraping with proper parsing.
  if (!apiHasOffers) {
    console.log(`[Trade] GetTradeOffers API returned empty for account ${accountId}, scraping HTML`);
    const scraped = await scrapeTradeOffersHtml(accountId);
    if (scraped.synced > 0) {
      console.log(`[Trade] HTML scrape synced ${scraped.synced} offers for account ${accountId}`);
      return scraped;
    }
  }

  // Also fetch historical via API (may also be empty due to same bug)
  let histData: any;
  try {
    const cutoff = Math.floor(Date.now() / 1000) - 14 * 24 * 3600;
    const resp = await axios.get(
      `${STEAM_API}/IEconService/GetTradeOffers/v1/`,
      {
        params: {
          key: apiKey,
          get_sent_offers: 1,
          get_received_offers: 1,
          get_descriptions: 1,
          active_only: 0,
          historical_only: 1,
          time_historical_cutoff: cutoff,
          language: "english",
        },
        timeout: 15000,
      }
    );
    histData = resp.data?.response;
  } catch (err: any) {
    console.warn(`[Trade] Sync historical offers failed (non-fatal):`, err.message);
  }

  // Merge active + historical
  const data = {
    trade_offers_sent: [
      ...(activeData?.trade_offers_sent ?? []),
      ...(histData?.trade_offers_sent ?? []),
    ],
    trade_offers_received: [
      ...(activeData?.trade_offers_received ?? []),
      ...(histData?.trade_offers_received ?? []),
    ],
    descriptions: [
      ...(activeData?.descriptions ?? []),
      ...(histData?.descriptions ?? []),
    ],
  };

  const seen = new Set<string>();
  const dedup = (offers: any[]) => offers.filter(o => {
    if (seen.has(o.tradeofferid)) return false;
    seen.add(o.tradeofferid);
    return true;
  });
  data.trade_offers_sent = dedup(data.trade_offers_sent);
  seen.clear();
  data.trade_offers_received = dedup(data.trade_offers_received);

  if (!data.trade_offers_sent.length && !data.trade_offers_received.length) return { synced: 0 };

  // Build description map for item names/icons
  const descMap = new Map<string, SteamTradeOfferDesc>();
  for (const desc of (data.descriptions ?? []) as SteamTradeOfferDesc[]) {
    descMap.set(`${desc.classid}_${desc.instanceid}`, desc);
  }

  // Gather all item names for price lookup
  const allNames = new Set<string>();
  for (const desc of descMap.values()) {
    if (desc.market_hash_name) allNames.add(desc.market_hash_name);
  }
  const priceMap = allNames.size > 0
    ? await getLatestPrices([...allNames])
    : new Map();

  const sentOffers = (data.trade_offers_sent ?? []) as SteamTradeOfferRaw[];
  const recvOffers = (data.trade_offers_received ?? []) as SteamTradeOfferRaw[];

  // Load user's linked accounts to detect internal transfers
  const { rows: userAccounts } = await pool.query(
    `SELECT id, steam_id FROM steam_accounts WHERE user_id = $1`,
    [userId]
  );
  const userSteamIds = new Map(userAccounts.map((a) => [a.steam_id, a.id]));

  let synced = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const offer of [...sentOffers, ...recvOffers]) {
      const isSent = sentOffers.includes(offer);
      const direction = isSent ? "outgoing" : "incoming";
      const partnerSteamId = accountIdToSteamId64(offer.accountid_other);
      const status = STEAM_OFFER_STATE[offer.trade_offer_state] ?? "pending";

      // Internal transfer detection: partner is one of user's own accounts
      const isInternal = userSteamIds.has(partnerSteamId);
      // account_id_from = the account that SENT the offer (not who synced)
      // account_id_to = the account that RECEIVES the offer
      const realSenderId = isSent ? accountId : (isInternal ? userSteamIds.get(partnerSteamId)! : null);
      const realReceiverId = isSent ? (isInternal ? userSteamIds.get(partnerSteamId)! : null) : accountId;

      // Resolve items
      const giveItems = (offer.items_to_give ?? []).map((a) => {
        const desc = descMap.get(`${a.classid}_${a.instanceid}`);
        const name = desc?.market_hash_name ?? null;
        const prices = name ? priceMap.get(name) : null;
        const priceCents = prices
          ? Math.round((prices.steam ?? prices.skinport ?? 0) * 100)
          : 0;
        return {
          side: "give" as const,
          assetId: a.assetid,
          marketHashName: name,
          iconUrl: desc?.icon_url ?? null,
          priceCents,
        };
      });

      const recvItems = (offer.items_to_receive ?? []).map((a) => {
        const desc = descMap.get(`${a.classid}_${a.instanceid}`);
        const name = desc?.market_hash_name ?? null;
        const prices = name ? priceMap.get(name) : null;
        const priceCents = prices
          ? Math.round((prices.steam ?? prices.skinport ?? 0) * 100)
          : 0;
        return {
          side: "receive" as const,
          assetId: a.assetid,
          marketHashName: name,
          iconUrl: desc?.icon_url ?? null,
          priceCents,
        };
      });

      const giveValue = giveItems.reduce((s, i) => s + i.priceCents, 0);
      const recvValue = recvItems.reduce((s, i) => s + i.priceCents, 0);

      // Upsert trade offer
      const { rows } = await client.query(
        `INSERT INTO trade_offers
           (user_id, direction, steam_offer_id, partner_steam_id, message,
            status, is_quick_transfer, value_give_cents, value_recv_cents,
            is_internal, account_id_from, account_id_to,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8,
                 $9, $10, $11,
                 to_timestamp($12), to_timestamp($13))
         ON CONFLICT (user_id, steam_offer_id)
           WHERE steam_offer_id IS NOT NULL
         DO UPDATE SET
           status = CASE WHEN trade_offers.status IN ('cancelled','declined','accepted','expired') AND EXCLUDED.status IN ('pending','awaiting_confirmation') THEN trade_offers.status ELSE EXCLUDED.status END,
           value_give_cents = EXCLUDED.value_give_cents,
           value_recv_cents = EXCLUDED.value_recv_cents,
           is_internal = EXCLUDED.is_internal,
           account_id_from = COALESCE(trade_offers.account_id_from, EXCLUDED.account_id_from),
           account_id_to = COALESCE(trade_offers.account_id_to, EXCLUDED.account_id_to),
           updated_at = EXCLUDED.updated_at
         RETURNING id, (xmax = 0) AS is_new`,
        [
          userId,
          direction,
          offer.tradeofferid,
          partnerSteamId,
          offer.message || null,
          status,
          giveValue,
          recvValue,
          isInternal,
          realSenderId,
          realReceiverId,
          offer.time_created,
          offer.time_updated,
        ]
      );

      const offerId = rows[0].id;
      const isNew = rows[0].is_new;

      // Only insert items for new offers (avoid duplicates)
      if (isNew) {
        const allItems = [...giveItems, ...recvItems];
        if (allItems.length > 0) {
          const offerIds = allItems.map(() => offerId);
          const sides = allItems.map(i => i.side);
          const assetIds = allItems.map(i => i.assetId);
          const marketNames = allItems.map(i => i.marketHashName);
          const iconUrls = allItems.map(i => i.iconUrl);
          const priceCents = allItems.map(i => i.priceCents);
          await client.query(
            `INSERT INTO trade_offer_items
               (offer_id, side, asset_id, market_hash_name, icon_url, price_cents)
             SELECT unnest($1::uuid[]), unnest($2::text[]), unnest($3::text[]),
                    unnest($4::text[]), unnest($5::text[]), unnest($6::int[])`,
            [offerIds, sides, assetIds, marketNames, iconUrls, priceCents]
          );
        }
        synced++;
      }
    }

    // Expire pending offers that Steam no longer returns as active
    // Only expire 'pending' — never touch 'awaiting_confirmation' or 'on_hold'
    const activeSteamIds = [
      ...(activeData?.trade_offers_sent ?? []).map((o: any) => o.tradeofferid),
      ...(activeData?.trade_offers_received ?? []).map((o: any) => o.tradeofferid),
    ];

    if (activeSteamIds.length > 0) {
      // Expire pending offers not found on Steam
      await client.query(
        `UPDATE trade_offers
         SET status = 'expired', updated_at = NOW()
         WHERE user_id = $1
           AND (account_id_from = $3 OR account_id_to = $3)
           AND is_internal = FALSE
           AND status IN ('pending', 'awaiting_confirmation')
           AND steam_offer_id IS NOT NULL
           AND steam_offer_id != ALL($2::text[])
           AND created_at > NOW() - INTERVAL '14 days'`,
        [userId, activeSteamIds, accountId]
      );
    } else {
      // API returned no active offers — expire pending (30min+) and awaiting_confirmation (2h+)
      await client.query(
        `UPDATE trade_offers
         SET status = 'expired', updated_at = NOW()
         WHERE user_id = $1
           AND (account_id_from = $2 OR account_id_to = $2)
           AND is_internal = FALSE
           AND steam_offer_id IS NOT NULL
           AND created_at > NOW() - INTERVAL '14 days'
           AND (
             (status = 'pending' AND created_at < NOW() - INTERVAL '30 minutes')
             OR (status = 'awaiting_confirmation' AND created_at < NOW() - INTERVAL '2 hours')
           )`,
        [userId, accountId]
      );
    }

    await client.query("COMMIT");
    console.log(`[Trade] Synced ${synced} new offers for user ${userId}`);
    return { synced };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[Trade] Sync DB error:`, err);
    return { synced: 0 };
  } finally {
    client.release();
  }
}

// ─── Trade History HTML Scraper ──────────────────────────────────────────

interface ScrapedHistoryTrade {
  partnerSteamId: string | null;
  partnerName: string;
  dateText: string; // "10 Mar, 2026 2:24pm"
  givenItems: { name: string; iconUrl: string }[];
  receivedItems: { name: string; iconUrl: string }[];
}

function parseTradeHistoryHtml(html: string): { trades: ScrapedHistoryTrade[]; nextUrl: string | null } {
  try {
    return parseTradeHistoryCheerio(html);
  } catch (err) {
    console.warn("[Trade] Cheerio history parse failed, falling back to regex:", err instanceof Error ? err.message : err);
    return parseTradeHistoryRegex(html);
  }
}

function parseTradeHistoryCheerio(html: string): { trades: ScrapedHistoryTrade[]; nextUrl: string | null } {
  const $ = cheerio.load(html);
  const trades: ScrapedHistoryTrade[] = [];

  $(".tradehistoryrow").each((_i, row) => {
    const $row = $(row);

    // Date + timestamp
    const $dateBlock = $row.find(".tradehistory_date");
    const dateMain = $dateBlock.contents().filter(function () { return this.type === "text"; }).text().trim();
    const timestamp = $dateBlock.find(".tradehistory_timestamp").text().trim();
    const dateText = `${dateMain} ${timestamp}`.trim();

    // Partner Steam64
    const partnerLink = $row.find('a[href*="steamcommunity.com/profiles/"]').attr("href") ?? "";
    const partnerSteamId = partnerLink.match(/profiles\/(\d{17})/)?.[1] ?? null;
    const partnerName = $row.find("[data-miniprofile]").text().trim() || "Unknown";

    const givenItems: { name: string; iconUrl: string }[] = [];
    const receivedItems: { name: string; iconUrl: string }[] = [];

    $row.find(".tradehistory_items_group").each((_j, group) => {
      const $group = $(group);
      const plusMinus = $group.find(".tradehistory_items_plusminus").text().trim();
      const isReceived = plusMinus === "+";
      const isGiven = plusMinus === "\u2013" || plusMinus === "-";
      const target = isReceived ? receivedItems : isGiven ? givenItems : receivedItems;

      // Item names are in a separate container (.trade_items_traded_names), not inside
      // each .history_item element. Collect names and icon URLs separately then pair by index.
      const names: string[] = [];
      $group.find("[class*='history_item_name']").each((_k, el) => {
        const name = $(el).text().trim();
        if (name) names.push(name);
      });

      const iconUrls: string[] = [];
      $group.find(".history_item img").each((_k, el) => {
        iconUrls.push(extractIconPath($(el).attr("src") ?? ""));
      });

      names.forEach((name, idx) => {
        target.push({ name, iconUrl: iconUrls[idx] ?? "" });
      });
    });

    trades.push({ partnerSteamId, partnerName, dateText, givenItems, receivedItems });
  });

  // Pagination
  const nextHref = $("a.pagebtn").filter(function () { return $(this).text().includes(">"); }).attr("href");
  const nextUrl = nextHref ? nextHref.replace(/^\?/, "") : null;

  return { trades, nextUrl };
}

function parseTradeHistoryRegex(html: string): { trades: ScrapedHistoryTrade[]; nextUrl: string | null } {
  const trades: ScrapedHistoryTrade[] = [];

  const blocks = html.split(/<div class="tradehistoryrow">/);
  blocks.shift(); // before first trade

  for (const block of blocks) {
    // Date: "10 Mar, 2026" + timestamp "2:24pm"
    const dateMatch = block.match(/tradehistory_date">\s*([\s\S]*?)<\/div>\s*<\/div>/);
    let dateText = "";
    if (dateMatch) {
      const raw = dateMatch[1].replace(/<div class="tradehistory_timestamp">/g, " ").replace(/<\/div>/g, "").trim();
      dateText = raw.replace(/\s+/g, " ");
    }

    // Partner Steam64
    const partnerMatch = block.match(/href="https:\/\/steamcommunity\.com\/profiles\/(\d{17})"/);
    // Partner name (inside <a> tag, may have quotes around the name)
    const nameMatch = block.match(/data-miniprofile="\d+">"?([^"<]+)"?<\/a>/);
    const partnerName = nameMatch ? nameMatch[1].trim() : "Unknown";

    // Items: split by +/– groups
    const givenItems: { name: string; iconUrl: string }[] = [];
    const receivedItems: { name: string; iconUrl: string }[] = [];

    // Each items group: <div class="tradehistory_items_plusminus">+</div> or –
    const itemGroups = block.split(/tradehistory_items_plusminus">/);
    for (let i = 1; i < itemGroups.length; i++) {
      const group = itemGroups[i];
      const isReceived = group.startsWith("+");
      const isGiven = group.startsWith("–") || group.startsWith("-");

      // Item names
      const nameMatches = group.matchAll(/history_item_name"[^>]*>([^<]+)<\/span>/g);
      const imgMatches = [...group.matchAll(/<img src="([^"]+)"/g)];
      let imgIdx = 0;

      for (const nm of nameMatches) {
        const itemName = nm[1].trim();
        const iconUrl = extractIconPath(imgIdx < imgMatches.length ? imgMatches[imgIdx][1] : "");
        imgIdx++;
        const item = { name: itemName, iconUrl };
        if (isReceived) receivedItems.push(item);
        else if (isGiven) givenItems.push(item);
      }
    }

    trades.push({
      partnerSteamId: partnerMatch ? partnerMatch[1] : null,
      partnerName,
      dateText,
      givenItems,
      receivedItems,
    });
  }

  // Pagination: <a class="pagebtn" href="?after_time=X&after_trade=Y">
  const nextMatch = html.match(/<a class="pagebtn" href="\?([^"]+)">&gt;<\/a>/);
  const nextUrl = nextMatch ? nextMatch[1] : null;

  return { trades, nextUrl };
}

/**
 * Scrape trade history from Steam HTML page.
 * More reliable than GetTradeHistory API, shows all completed trades.
 */
async function scrapeTradeHistoryHtml(
  userId: number,
  accountId: number,
  maxPages = 1
): Promise<number> {
  const session = await SteamSessionService.getSession(accountId);
  if (!session) return 0;

  const cookies = `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`;
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

  const { rows: accRows } = await pool.query(
    `SELECT steam_id FROM steam_accounts WHERE id = $1`, [accountId]
  );
  if (!accRows.length) return 0;

  // Load linked accounts for internal detection
  const { rows: userAccounts } = await pool.query(
    `SELECT id, steam_id FROM steam_accounts WHERE user_id = $1`, [userId]
  );
  const userSteamIds = new Map(userAccounts.map((a: any) => [a.steam_id, a.id]));

  // Get prices for all item names we find
  const allItemNames = new Set<string>();
  const allParsed: ScrapedHistoryTrade[] = [];

  let nextParams: string | null = null;
  let synced = 0;

  for (let page = 0; page < maxPages; page++) {
    try {
      const url = nextParams
        ? `${STEAM_COMMUNITY}/my/tradehistory/?${nextParams}`
        : `${STEAM_COMMUNITY}/my/tradehistory/`;

      const resp = await axios.get(url, {
        headers: { Cookie: cookies, "User-Agent": ua },
        maxRedirects: 5,
        timeout: 15000,
        validateStatus: () => true,
      });
      if (resp.status === 429) {
        console.warn(`[Trade] History scrape got 429 on page ${page}, stopping`);
        break;
      }
      if (resp.status !== 200) break;
      const html = typeof resp.data === "string" ? resp.data : "";
      const { trades, nextUrl } = parseTradeHistoryHtml(html);
      if (trades.length === 0) break;

      for (const t of trades) {
        for (const item of [...t.givenItems, ...t.receivedItems]) {
          allItemNames.add(item.name);
        }
      }
      allParsed.push(...trades);
      nextParams = nextUrl;
      if (!nextUrl) break;
    } catch (err: any) {
      console.warn(`[Trade] History HTML scrape page ${page} failed:`, err.message);
      break;
    }
  }

  if (allParsed.length === 0) return 0;

  // Batch price lookup
  const priceMap = allItemNames.size > 0
    ? await getLatestPrices([...allItemNames])
    : new Map();

  for (const trade of allParsed) {
    // Parse date: "10 Mar, 2026 2:24pm" → Date
    let tradeDate: Date | null = null;
    if (trade.dateText) {
      try {
        // "10 Mar, 2026 2:24pm" → "10 Mar 2026 2:24 pm"
        const normalized = trade.dateText
          .replace(",", "")
          .replace(/(\d{1,2}:\d{2})(am|pm)/i, "$1 $2");
        tradeDate = new Date(normalized);
        if (isNaN(tradeDate.getTime())) tradeDate = null;
      } catch { tradeDate = null; }
    }

    // Determine direction: if we gave items it's outgoing
    const direction = trade.givenItems.length > 0 ? "outgoing" : "incoming";
    const isInternal = trade.partnerSteamId ? userSteamIds.has(trade.partnerSteamId) : false;
    const partnerAccountId = trade.partnerSteamId ? userSteamIds.get(trade.partnerSteamId) ?? null : null;

    // Calculate values
    let giveValue = 0;
    let recvValue = 0;
    const giveItems = trade.givenItems.map(item => {
      const prices = priceMap.get(item.name);
      const priceCents = prices ? Math.round((prices.steam ?? prices.skinport ?? 0) * 100) : 0;
      giveValue += priceCents;
      return { side: "give" as const, name: item.name, iconUrl: item.iconUrl, priceCents };
    });
    const recvItems = trade.receivedItems.map(item => {
      const prices = priceMap.get(item.name);
      const priceCents = prices ? Math.round((prices.steam ?? prices.skinport ?? 0) * 100) : 0;
      recvValue += priceCents;
      return { side: "receive" as const, name: item.name, iconUrl: item.iconUrl, priceCents };
    });

    // Synthetic ID: combine partner + date epoch + item count for uniqueness
    const dateEpoch = tradeDate ? Math.floor(tradeDate.getTime() / 1000) : 0;
    const itemSig = [...trade.givenItems, ...trade.receivedItems].map(i => i.name).sort().join(",");
    const sigHash = crypto.createHash("md5").update(`${trade.partnerSteamId}_${dateEpoch}_${itemSig}`).digest("hex").substring(0, 12);
    const syntheticOfferId = `histhtml_${sigHash}`;

    try {
      const allItems = [...giveItems, ...recvItems];

      // Before inserting a new histhtml_ record, check if a real-ID record already exists
      // for the same partner + approximate date. This avoids duplicates when a trade was
      // captured by the active-offers scraper (real steam_offer_id) and then again by the
      // history scraper (histhtml_ synthetic ID).
      let offerId: string | null = null;
      if (trade.partnerSteamId && tradeDate) {
        const { rows: existing } = await pool.query(
          `SELECT id FROM trade_offers
           WHERE user_id = $1
             AND partner_steam_id = $2
             AND status = 'accepted'
             AND steam_offer_id NOT LIKE 'histhtml_%'
             AND created_at BETWEEN $3::timestamptz - INTERVAL '15 minutes'
                                AND $3::timestamptz + INTERVAL '15 minutes'
           ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - $3::timestamptz)))
           LIMIT 1`,
          [userId, trade.partnerSteamId, tradeDate]
        );
        if (existing.length > 0) {
          offerId = existing[0].id;
        }
      }

      if (offerId) {
        // Real-ID record found — backfill items if it has no named items yet
        if (allItems.length > 0) {
          const { rows: existingItems } = await pool.query(
            `SELECT 1 FROM trade_offer_items WHERE offer_id = $1 AND market_hash_name IS NOT NULL LIMIT 1`,
            [offerId]
          );
          if (existingItems.length === 0) {
            await pool.query(`DELETE FROM trade_offer_items WHERE offer_id = $1`, [offerId]);
            const offerIds = allItems.map(() => offerId);
            const sides = allItems.map(i => i.side);
            const assetIds = allItems.map(() => "0");
            const marketNames = allItems.map(i => i.name);
            const iconUrls = allItems.map(i => i.iconUrl);
            const priceCentsList = allItems.map(i => i.priceCents);
            await pool.query(
              `INSERT INTO trade_offer_items
                 (offer_id, side, asset_id, market_hash_name, icon_url, price_cents)
               SELECT unnest($1::uuid[]), unnest($2::text[]), unnest($3::text[]),
                      unnest($4::text[]), unnest($5::text[]), unnest($6::int[])`,
              [offerIds, sides, assetIds, marketNames, iconUrls, priceCentsList]
            );
            synced++;
          }
        }
      } else {
        // No existing real-ID record — upsert histhtml_ record.
        // Use DO UPDATE (no-op) so we always get the id back, even on conflict,
        // allowing items to be backfilled for existing 0-item records.
        const { rows } = await pool.query(
          `INSERT INTO trade_offers
             (user_id, direction, steam_offer_id, partner_steam_id, partner_name, message,
              status, is_quick_transfer, value_give_cents, value_recv_cents,
              is_internal, account_id_from, account_id_to,
              created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NULL, 'accepted', FALSE, $6, $7,
                   $8, $9, $10, $11, $11)
           ON CONFLICT (user_id, steam_offer_id) WHERE steam_offer_id IS NOT NULL
           DO UPDATE SET updated_at = trade_offers.updated_at
           RETURNING id, (xmax = 0) AS is_new`,
          [
            userId, direction, syntheticOfferId,
            trade.partnerSteamId || trade.partnerName,
            trade.partnerName,
            giveValue, recvValue, isInternal,
            direction === "outgoing" ? accountId : partnerAccountId,
            direction === "incoming" ? accountId : partnerAccountId,
            tradeDate || new Date(),
          ]
        );

        if (rows.length > 0) {
          offerId = rows[0].id;
          const isNew = rows[0].is_new;
          // Backfill items if: new record with items, OR existing record with no named items
          if (allItems.length > 0) {
            const { rows: existingItems } = await pool.query(
              `SELECT 1 FROM trade_offer_items WHERE offer_id = $1 AND market_hash_name IS NOT NULL LIMIT 1`,
              [offerId]
            );
            if (isNew || existingItems.length === 0) {
              await pool.query(`DELETE FROM trade_offer_items WHERE offer_id = $1`, [offerId]);
              const offerIds = allItems.map(() => offerId);
              const sides = allItems.map(i => i.side);
              const assetIds = allItems.map(() => "0");
              const marketNames = allItems.map(i => i.name);
              const iconUrls = allItems.map(i => i.iconUrl);
              const priceCentsList = allItems.map(i => i.priceCents);
              await pool.query(
                `INSERT INTO trade_offer_items
                   (offer_id, side, asset_id, market_hash_name, icon_url, price_cents)
                 SELECT unnest($1::uuid[]), unnest($2::text[]), unnest($3::text[]),
                        unnest($4::text[]), unnest($5::text[]), unnest($6::int[])`,
                [offerIds, sides, assetIds, marketNames, iconUrls, priceCentsList]
              );
            }
          }
          if (isNew) synced++;
        }
      }
    } catch (err: any) {
      console.warn(`[Trade] History HTML upsert failed:`, err.message);
    }
  }

  console.log(`[Trade] HTML history scrape synced ${synced} trades for account ${accountId} (${allParsed.length} parsed)`);
  return synced;
}

// ─── Trade History Sync (completed trades from GetTradeHistory API) ──────

/**
 * Sync completed trade history from Steam's GetTradeHistory endpoint.
 * This captures trades that GetTradeOffers doesn't return (completed, old).
 */
async function syncTradeHistoryForAccount(userId: number, accountId: number): Promise<number> {
  // Try HTML scraper first (more reliable)
  const htmlSynced = await scrapeTradeHistoryHtml(userId, accountId);
  if (htmlSynced > 0) return htmlSynced;

  // Fall back to API
  const apiKey = await getWebApiKey(accountId);
  if (!apiKey) return 0;

  const { rows: accRows } = await pool.query(
    `SELECT steam_id FROM steam_accounts WHERE id = $1`, [accountId]
  );
  const mySteamId = accRows[0]?.steam_id;
  if (!mySteamId) return 0;

  // Load user's linked accounts for internal detection
  const { rows: userAccounts } = await pool.query(
    `SELECT id, steam_id FROM steam_accounts WHERE user_id = $1`, [userId]
  );
  const userSteamIds = new Map(userAccounts.map((a) => [a.steam_id, a.id]));

  let synced = 0;
  try {
    const resp = await axios.get(
      `${STEAM_API}/IEconService/GetTradeHistory/v1/`,
      {
        params: {
          key: apiKey,
          max_trades: 50,
          get_descriptions: 1,
          include_total: 0,
          navigating_back: 0,
          include_failed: 0,
        },
        timeout: 15000,
      }
    );
    const data = resp.data?.response;
    if (!data?.trades?.length) return 0;

    // Build description map
    const descMap = new Map<string, any>();
    for (const desc of (data.descriptions ?? [])) {
      descMap.set(`${desc.classid}_${desc.instanceid}`, desc);
    }

    // Get prices for all item names
    const allNames = new Set<string>();
    for (const desc of descMap.values()) {
      if (desc.market_hash_name) allNames.add(desc.market_hash_name);
    }
    const priceMap = allNames.size > 0 ? await getLatestPrices([...allNames]) : new Map();

    for (const trade of data.trades) {
      const partnerSteamId = trade.steamid_other;
      if (!partnerSteamId) continue;

      // Determine direction: did I give items or receive?
      const giveAssets = trade.assets_given || [];
      const recvAssets = trade.assets_received || [];

      const direction = giveAssets.length > 0 ? "outgoing" as const : "incoming" as const;
      const isInternal = userSteamIds.has(partnerSteamId);

      const mapAssets = (assets: any[], side: "give" | "receive") =>
        assets.map((a: any) => {
          const desc = descMap.get(`${a.classid}_${a.instanceid}`);
          const name = desc?.market_hash_name ?? null;
          const prices = name ? priceMap.get(name) : null;
          const priceCents = prices ? Math.round((prices.steam ?? prices.skinport ?? 0) * 100) : 0;
          return { side, assetId: a.assetid || a.new_assetid || "0", marketHashName: name, iconUrl: desc?.icon_url ?? null, priceCents };
        });

      const giveItems = mapAssets(giveAssets, "give");
      const recvItems = mapAssets(recvAssets, "receive");
      const giveValue = giveItems.reduce((s: number, i: any) => s + i.priceCents, 0);
      const recvValue = recvItems.reduce((s: number, i: any) => s + i.priceCents, 0);

      // Use tradeid as a synthetic steam_offer_id (prefixed to avoid collision)
      const syntheticOfferId = `hist_${trade.tradeid}`;

      const { rows } = await pool.query(
        `INSERT INTO trade_offers
           (user_id, direction, steam_offer_id, partner_steam_id, message,
            status, is_quick_transfer, value_give_cents, value_recv_cents,
            is_internal, account_id_from, account_id_to,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, 'accepted', FALSE, $5, $6,
                 $7, $8, $9,
                 to_timestamp($10), to_timestamp($10))
         ON CONFLICT (user_id, steam_offer_id)
           WHERE steam_offer_id IS NOT NULL
         DO NOTHING
         RETURNING id`,
        [
          userId, direction, syntheticOfferId, partnerSteamId,
          giveValue, recvValue, isInternal,
          direction === "outgoing" ? accountId : (isInternal ? userSteamIds.get(partnerSteamId)! : null),
          direction === "incoming" ? accountId : (isInternal ? userSteamIds.get(partnerSteamId)! : null),
          trade.time_init,
        ]
      );

      if (rows.length > 0) {
        const offerId = rows[0].id;
        const allItems = [...giveItems, ...recvItems];
        if (allItems.length > 0) {
          const offerIds = allItems.map(() => offerId);
          const sides = allItems.map((i: any) => i.side);
          const assetIdsList = allItems.map((i: any) => i.assetId);
          const marketNames = allItems.map((i: any) => i.marketHashName);
          const iconUrls = allItems.map((i: any) => i.iconUrl);
          const priceCentsList = allItems.map((i: any) => i.priceCents);
          await pool.query(
            `INSERT INTO trade_offer_items
               (offer_id, side, asset_id, market_hash_name, icon_url, price_cents)
             SELECT unnest($1::uuid[]), unnest($2::text[]), unnest($3::text[]),
                    unnest($4::text[]), unnest($5::text[]), unnest($6::int[])`,
            [offerIds, sides, assetIdsList, marketNames, iconUrls, priceCentsList]
          );
        }
        synced++;
      }
    }

    console.log(`[Trade] Synced ${synced} historical trades for account ${accountId}`);
  } catch (err: any) {
    console.warn(`[Trade] Trade history sync failed for account ${accountId}:`, err.message);
  }

  return synced;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract the icon path hash from a full Steam CDN URL or passthrough if already a hash.
 * Flutter's fullIconUrl prepends the Steam CDN base, so we only want the path portion.
 * e.g. "https://community.fastly.steamstatic.com/economy/image/class/730/CLASSID/96fx96f"
 *   → "class/730/CLASSID" (strip size suffix)
 * e.g. "https://community.steamstatic.com/economy/image/HASH/360fx360f" → "HASH"
 * e.g. already a hash "i0CoZ81Ui0m..." → passthrough
 */
function extractIconPath(src: string): string {
  if (!src) return "";
  // Already a relative path (no http)
  if (!src.startsWith("http")) return src;
  // Full URL: extract everything after /economy/image/ and strip trailing size suffix
  const match = src.match(/\/economy\/image\/(.+?)(?:\/\d+fx\d+f)?$/);
  return match ? match[1] : src;
}

function mapOfferRow(row: any): TradeOffer {
  const items: TradeOfferItem[] = (row.items ?? [])
    .filter((i: any) => i.id !== null)
    .map((i: any) => ({
      id: i.id,
      side: i.side,
      assetId: i.assetId,
      marketHashName: i.marketHashName,
      iconUrl: i.iconUrl,
      floatValue: i.floatValue ? parseFloat(i.floatValue) : null,
      priceCents: i.priceCents ?? 0,
    }));

  return {
    id: row.id,
    direction: row.direction,
    steamOfferId: row.steam_offer_id,
    partnerSteamId: row.partner_steam_id,
    partnerName: row.partner_name,
    message: row.message,
    status: row.status,
    isQuickTransfer: row.is_quick_transfer,
    isInternal: row.is_internal ?? false,
    accountIdFrom: row.account_id_from ?? null,
    accountIdTo: row.account_id_to ?? null,
    accountFromName: row.account_from_name ?? null,
    accountToName: row.account_to_name ?? null,
    valueGiveCents: parseInt(row.value_give_cents) || 0,
    valueRecvCents: parseInt(row.value_recv_cents) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  };
}

function mapOffer(row: any, items: any[]): TradeOffer {
  return {
    id: row.id,
    direction: row.direction,
    steamOfferId: row.steam_offer_id,
    partnerSteamId: row.partner_steam_id,
    partnerName: row.partner_name,
    message: row.message,
    status: row.status,
    isQuickTransfer: row.is_quick_transfer,
    isInternal: row.is_internal ?? false,
    accountIdFrom: row.account_id_from ?? null,
    accountIdTo: row.account_id_to ?? null,
    accountFromName: null,
    accountToName: null,
    valueGiveCents: parseInt(row.value_give_cents) || 0,
    valueRecvCents: parseInt(row.value_recv_cents) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map((i, idx) => ({
      id: idx,
      side: i.side,
      assetId: i.assetId,
      marketHashName: i.marketHashName ?? null,
      iconUrl: i.iconUrl ?? null,
      floatValue: i.floatValue ?? null,
      priceCents: i.priceCents ?? 0,
    })),
  };
}
