import axios from "axios";
import crypto from "crypto";
import { pool } from "../db/pool.js";
import { getLatestPrices } from "./prices.js";
import { SteamSessionService } from "./steamSession.js";

/**
 * Generate a random sessionid for Steam CSRF protection.
 * Steam only checks that the Cookie value matches the POST body value.
 */
function generateSessionId(): string {
  return crypto.randomBytes(12).toString("hex");
}

function isSessionExpiredError(err: any): boolean {
  return err?.code === "SESSION_EXPIRED";
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
    const error = new Error("Steam session expired. Please re-authenticate.");
    (error as any).code = "SESSION_EXPIRED";
    throw error;
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
    // Token is in URL: https://steamcommunity.com/tradeoffer/new/?partner=XXXXX&token=YYYYY
    const match = (data as string).match(/token=([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
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
  steamLoginSecure: string,
  partnerSteamId: string,
  tradeToken: string | undefined,
  itemsToGive: TradeItem[],
  itemsToReceive: TradeItem[],
  message?: string
): Promise<{ offerId: string }> {
  const partnerId32 = steamId64ToAccountId(partnerSteamId);
  const sessionId = generateSessionId();

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

  const { data } = await axios.post(
    `${STEAM_COMMUNITY}/tradeoffer/new/send`,
    formData.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `steamLoginSecure=${steamLoginSecure}; sessionid=${sessionId}`,
        Referer: tradeToken
          ? `${STEAM_COMMUNITY}/tradeoffer/new/?partner=${partnerId32}&token=${tradeToken}`
          : `${STEAM_COMMUNITY}/tradeoffer/new/?partner=${partnerId32}`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      timeout: 20000,
    }
  );

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
  steamLoginSecure: string,
  steamOfferId: string,
  partnerSteamId: string
): Promise<void> {
  const partnerId32 = steamId64ToAccountId(partnerSteamId);
  const sessionId = generateSessionId();
  console.log(`[Trade] Accepting offer ${steamOfferId} with partner64=${partnerSteamId} partner32=${partnerId32}`);
  let data: any;
  try {
    const resp = await axios.post(
      `${STEAM_COMMUNITY}/tradeoffer/${steamOfferId}/accept`,
      new URLSearchParams({
        sessionid: sessionId,
        serverid: "1",
        tradeofferid: steamOfferId,
        partner: partnerId32,
        captcha: "",
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `steamLoginSecure=${steamLoginSecure}; sessionid=${sessionId}`,
          Referer: `${STEAM_COMMUNITY}/tradeoffer/${steamOfferId}/`,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        maxRedirects: 0,
        timeout: 15000,
        validateStatus: (s: number) => s < 400,
      }
    );
    data = resp.data;
  } catch (err: any) {
    const status = err.response?.status;
    const respData = err.response?.data;
    const strError = typeof respData === "object" ? respData?.strError : undefined;
    console.error(`[Trade] Steam accept error: HTTP ${status}, strError=${strError}, raw=${typeof respData === 'string' ? respData.substring(0, 200) : JSON.stringify(respData)}`);

    // HTTP 302 → Steam redirected to login = session expired
    if (status === 302 || status === 403) {
      const sessionErr = new Error("Steam session expired — please re-authenticate.");
      (sessionErr as any).code = "SESSION_EXPIRED";
      throw sessionErr;
    }
    // Steam error 42 = invalid session / not authenticated
    if (strError?.includes("(42)")) {
      const sessionErr = new Error("Steam session expired — please re-authenticate.");
      (sessionErr as any).code = "SESSION_EXPIRED";
      throw sessionErr;
    }
    // Steam error 25 = offer expired, not session issue
    if (strError?.includes("(25)")) {
      throw new Error("Trade offer has expired or is no longer valid on Steam.");
    }
    throw new Error(strError || `Steam accept failed (${status ?? "network"})`);
  }

  console.log(`[Trade] Accept response for ${steamOfferId}:`, JSON.stringify(data));
  if (!data.tradeid && !data.needs_mobile_confirmation && !data.needs_email_confirmation) {
    throw new Error(data.strError || "Failed to accept trade offer");
  }
}

/**
 * Decline a trade offer via Steam's web API.
 */
async function declineSteamTradeOffer(
  steamLoginSecure: string,
  steamOfferId: string
): Promise<void> {
  const sessionId = generateSessionId();
  try {
    await axios.post(
      `${STEAM_COMMUNITY}/tradeoffer/${steamOfferId}/decline`,
      new URLSearchParams({
        sessionid: sessionId,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `steamLoginSecure=${steamLoginSecure}; sessionid=${sessionId}`,
          Referer: `${STEAM_COMMUNITY}/tradeoffer/${steamOfferId}/`,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        timeout: 15000,
      }
    );
  } catch (err: any) {
    const respData = err.response?.data;
    const strError = typeof respData === "object" ? respData?.strError : undefined;
    const steamCode = typeof respData === "object" ? respData?.success : undefined;
    console.error(`[Trade] Steam decline error: HTTP ${err.response?.status}, strError=${strError}, steamCode=${steamCode}`);
    if (strError?.includes("(42)") || steamCode === 42 || err.response?.status === 403) {
      const sessionErr = new Error("Steam session expired — please re-authenticate.");
      (sessionErr as any).code = "SESSION_EXPIRED";
      throw sessionErr;
    }
    if (strError?.includes("(25)") || steamCode === 25) {
      throw new Error("Trade offer has expired or is no longer valid on Steam.");
    }
    throw new Error(strError || `Steam decline failed (${err.response?.status ?? "network"})`);
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
  let steamOfferId: string;
  try {
    ({ offerId: steamOfferId } = await sendSteamTradeOffer(
      session.steamLoginSecure,
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
        session.steamLoginSecure,
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
 * Fast accept a trade offer (no review).
 */
export async function acceptOffer(
  userId: number,
  offerId: string
): Promise<{ needsConfirmation: boolean }> {
  const offer = await getOfferRaw(offerId, userId);
  if (!offer) throw new Error("Trade offer not found");
  if (offer.status !== "pending")
    throw new Error(`Cannot accept offer with status: ${offer.status}`);

  const accountId = await SteamSessionService.getActiveAccountId(userId);
  console.log(`[Trade] acceptOffer: offerId=${offerId}, activeAccountId=${accountId}, steamOfferId=${offer.steamOfferId}, dbPartner=${offer.partnerSteamId}`);

  if (offer.steamOfferId) {
    const partnerForApi = await resolvePartnerForSteamApi(
      userId,
      offer.partnerSteamId
    );
    console.log(`[Trade] Resolved partner for Steam API: ${partnerForApi} (original: ${offer.partnerSteamId})`);

    // Try with current session, retry once with forced refresh on session error
    let session = await getValidSession(accountId);
    try {
      await acceptSteamTradeOffer(session.steamLoginSecure, offer.steamOfferId, partnerForApi);
    } catch (err: any) {
      if (isSessionExpiredError(err)) {
        console.log(`[Trade] Accept failed with session error, retrying with refresh...`);
        session = await getValidSession(accountId, true);
        await acceptSteamTradeOffer(session.steamLoginSecure, offer.steamOfferId, partnerForApi);
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

  return { needsConfirmation: true }; // Steam Guard confirmation typically required
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
  if (offer.status !== "pending")
    throw new Error(`Cannot decline offer with status: ${offer.status}`);

  const accountId = await SteamSessionService.getActiveAccountId(userId);

  if (offer.steamOfferId) {
    let session = await getValidSession(accountId);
    try {
      await declineSteamTradeOffer(session.steamLoginSecure, offer.steamOfferId);
    } catch (err: any) {
      if (isSessionExpiredError(err)) {
        console.log(`[Trade] Decline failed with session error, retrying with refresh...`);
        session = await getValidSession(accountId, true);
        await declineSteamTradeOffer(session.steamLoginSecure, offer.steamOfferId);
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

  const accountId = await SteamSessionService.getActiveAccountId(userId);

  // Steam uses /cancel for outgoing offers
  if (offer.steamOfferId) {
    const doCancelWithSession = async (steamLoginSecure: string) => {
      const cancelSessionId = generateSessionId();
      try {
        await axios.post(
          `${STEAM_COMMUNITY}/tradeoffer/${offer.steamOfferId}/cancel`,
          new URLSearchParams({ sessionid: cancelSessionId }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Cookie: `steamLoginSecure=${steamLoginSecure}; sessionid=${cancelSessionId}`,
              Referer: `${STEAM_COMMUNITY}/tradeoffer/${offer.steamOfferId}/`,
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            },
            timeout: 15000,
          }
        );
      } catch (err: any) {
        const respData = err.response?.data;
        const strError = typeof respData === "object" ? respData?.strError : undefined;
        const steamCode = typeof respData === "object" ? respData?.success : undefined;
        console.error(`[Trade] Steam cancel error: HTTP ${err.response?.status}, strError=${strError}, steamCode=${steamCode}`);
        if (strError?.includes("(42)") || steamCode === 42 || err.response?.status === 403) {
          const sessionErr = new Error("Steam session expired — please re-authenticate.");
          (sessionErr as any).code = "SESSION_EXPIRED";
          throw sessionErr;
        }
        if (strError?.includes("(25)") || steamCode === 25) {
          throw new Error("Trade offer has expired or is no longer valid on Steam.");
        }
        throw new Error(strError || `Steam cancel failed (${err.response?.status ?? "network"})`);
      }
    };

    let session = await getValidSession(accountId);
    try {
      await doCancelWithSession(session.steamLoginSecure);
    } catch (err: any) {
      if (isSessionExpiredError(err)) {
        console.log(`[Trade] Cancel failed with session error, retrying with refresh...`);
        session = await getValidSession(accountId, true);
        await doCancelWithSession(session.steamLoginSecure);
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
  offset = 0
): Promise<{ offers: TradeOffer[]; total: number; hasMore: boolean }> {
  const activeSteamId = await getActiveSteamId(userId);

  // Count query
  let countQuery = `SELECT COUNT(*) FROM trade_offers o WHERE o.user_id = $1`;
  const countParams: unknown[] = [userId];
  if (status) {
    countQuery += ` AND o.status = $2`;
    countParams.push(status);
  }
  const { rows: countRows } = await pool.query(countQuery, countParams);
  const total = parseInt(countRows[0].count) || 0;

  // Data query
  let query = `
    SELECT o.*, json_agg(
      json_build_object(
        'id', i.id, 'side', i.side, 'assetId', i.asset_id,
        'marketHashName', i.market_hash_name, 'iconUrl', i.icon_url,
        'floatValue', i.float_value, 'priceCents', i.price_cents
      ) ORDER BY i.id
    ) AS items
    FROM trade_offers o
    LEFT JOIN trade_offer_items i ON i.offer_id = o.id
    WHERE o.user_id = $1`;

  const params: unknown[] = [userId];
  let paramIdx = 2;

  if (status) {
    query += ` AND o.status = $${paramIdx}`;
    params.push(status);
    paramIdx++;
  }

  query += ` GROUP BY o.id ORDER BY o.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
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
         'marketHashName', i.market_hash_name, 'iconUrl', i.icon_url,
         'floatValue', i.float_value, 'priceCents', i.price_cents
       ) ORDER BY i.id
     ) AS items
     FROM trade_offers o
     LEFT JOIN trade_offer_items i ON i.offer_id = o.id
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

const STEAM_API = "https://api.steampowered.com";

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
  9: "pending",     // CreatedNeedsConfirmation
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
  return { synced: totalSynced };
}

async function syncTradeOffersForAccount(userId: number, accountId: number): Promise<{ synced: number }> {
  const apiKey = await getWebApiKey(accountId);
  if (!apiKey) {
    return { synced: 0 };
  }

  let data: any;
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
    data = resp.data?.response;
  } catch (err: any) {
    // If API key is invalid (403), clear it so it gets re-registered next time
    if (err.response?.status === 403) {
      await pool.query(
        `UPDATE steam_accounts SET web_api_key = NULL WHERE id = $1`,
        [accountId]
      );
      console.warn(`[Trade] Web API key invalid for account ${accountId}, cleared`);
    }
    console.error(`[Trade] Sync failed:`, err.message);
    return { synced: 0 };
  }

  if (!data) return { synced: 0 };

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
           status = EXCLUDED.status,
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
        for (const item of [...giveItems, ...recvItems]) {
          await client.query(
            `INSERT INTO trade_offer_items
               (offer_id, side, asset_id, market_hash_name, icon_url, price_cents)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [offerId, item.side, item.assetId, item.marketHashName, item.iconUrl, item.priceCents]
          );
        }
        synced++;
      }
    }

    // Expire pending offers that Steam no longer returns
    // Only expire offers that THIS account would see (sent by or received by this account)
    // Never expire internal offers from other account's perspective
    const activeSteamIds = [
      ...sentOffers.map((o) => o.tradeofferid),
      ...recvOffers.map((o) => o.tradeofferid),
    ];

    if (activeSteamIds.length > 0) {
      await client.query(
        `UPDATE trade_offers
         SET status = 'expired', updated_at = NOW()
         WHERE user_id = $1
           AND (account_id_from = $3 OR account_id_to = $3)
           AND is_internal = FALSE
           AND status = 'pending'
           AND steam_offer_id IS NOT NULL
           AND steam_offer_id != ALL($2::text[])
           AND created_at > NOW() - INTERVAL '14 days'`,
        [userId, activeSteamIds, accountId]
      );
    } else {
      await client.query(
        `UPDATE trade_offers
         SET status = 'expired', updated_at = NOW()
         WHERE user_id = $1
           AND (account_id_from = $2 OR account_id_to = $2)
           AND is_internal = FALSE
           AND status = 'pending'
           AND steam_offer_id IS NOT NULL
           AND created_at > NOW() - INTERVAL '14 days'`,
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

// ─── Helpers ─────────────────────────────────────────────────────────────

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
