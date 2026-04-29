import { SteamGateway } from "../infra/SteamGateway.js";

const STEAM_API_KEY = () => process.env.STEAM_API_KEY!;

interface SteamPlayerSummary {
  steamid: string;
  personaname: string;
  avatarfull: string;
}

export async function getSteamProfile(
  steamId: string
): Promise<SteamPlayerSummary> {
  const { data } = await SteamGateway.request<{ response: { players: SteamPlayerSummary[] } }>({
    url: "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
    params: { key: STEAM_API_KEY(), steamids: steamId },
  });
  const players = data.response.players as SteamPlayerSummary[];
  if (players.length === 0) throw new Error("Steam user not found");
  return players[0];
}

/**
 * Validates Steam OpenID 2.0 assertion. Per spec the relying party MUST verify
 * `openid.return_to` and `openid.realm` match values it would have sent — without
 * this check, an attacker can replay an assertion that Steam signed for a
 * different relying party.
 */
export async function verifySteamOpenId(
  params: Record<string, string>
): Promise<string> {
  // 1. Validate return_to / realm match our configured callback. This MUST happen
  //    before the check_authentication round-trip — otherwise we'd accept replays.
  const expectedReturnTo = `${process.env.BASE_URL || ""}/api/auth/steam/callback`;
  const returnTo = params["openid.return_to"] || "";
  // Steam preserves return_to byte-for-byte but appends its own query params
  // (openid.* fields) — match by ignoring trailing query.
  const returnToBase = returnTo.split("?")[0];
  if (!process.env.BASE_URL || returnToBase !== expectedReturnTo) {
    throw new Error("OpenID return_to does not match expected callback");
  }
  const realm = params["openid.realm"];
  // realm must be a prefix of return_to per spec; here we set it equal in our flows
  if (realm && realm !== expectedReturnTo) {
    throw new Error("OpenID realm does not match expected callback");
  }

  // 2. Round-trip the assertion to Steam to confirm it's genuinely signed.
  const verifyParams = { ...params, "openid.mode": "check_authentication" };

  const { data } = await SteamGateway.request<string>({
    url: "https://steamcommunity.com/openid/login",
    method: "POST",
    data: verifyParams,
  });

  if (!data.includes("is_valid:true")) {
    throw new Error("Steam OpenID verification failed");
  }

  // 3. Extract SteamID from claimed_id.
  // Format: https://steamcommunity.com/openid/id/76561198XXXXXXXXX
  const claimedId = params["openid.claimed_id"];
  const match = claimedId?.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/);
  if (!match) throw new Error("Invalid claimed_id");
  return match[1];
}

interface SteamInventoryAsset {
  assetid: string;
  classid: string;
  instanceid: string;
  amount: string;
}

interface SteamInventoryDescription {
  classid: string;
  instanceid: string;
  market_hash_name: string;
  icon_url: string;
  tradable: number;
  marketable: number;
  tags?: Array<{
    category: string;
    localized_tag_name: string;
    color?: string;
  }>;
  actions?: Array<{
    link: string;
    name: string;
  }>;
  owner_descriptions?: Array<{
    type?: string;
    value: string;
    color?: string;
  }>;
}

/** Items to skip — non-sellable junk or tools with no trading value */
const EXCLUDED_NAMES = [
  'Charm Remover',
  'Charm Detachment Pack',
  'Storage Unit',
];

export interface ParsedInventoryItem {
  asset_id: string;
  market_hash_name: string;
  icon_url: string;
  wear: string | null;
  rarity: string | null;
  rarity_color: string | null;
  tradable: boolean;
  trade_ban_until: string | null; // ISO date string
  inspect_link: string | null;
}

export interface SteamFriend {
  steamId: string;
  personaName: string;
  avatarUrl: string;
  profileUrl: string;
  onlineStatus: string;
}

/**
 * Fetch user's Steam friends list with profile summaries.
 */
export async function fetchSteamFriends(
  steamId: string
): Promise<SteamFriend[]> {
  // Get friend list
  const { data: friendsData } = await SteamGateway.request<any>({
    url: "https://api.steampowered.com/ISteamUser/GetFriendList/v1/",
    params: {
      key: STEAM_API_KEY(),
      steamid: steamId,
      relationship: "friend",
    },
    timeout: 10000,
  });

  const friends = friendsData?.friendslist?.friends as
    | Array<{ steamid: string; friend_since: number }>
    | undefined;
  if (!friends || friends.length === 0) return [];

  // Get profile summaries in batches of 100 (Steam API limit)
  const allFriends: SteamFriend[] = [];
  for (let i = 0; i < friends.length; i += 100) {
    const batch = friends.slice(i, i + 100);
    const ids = batch.map((f) => f.steamid).join(",");

    const { data: summaryData } = await SteamGateway.request<any>({
      url: "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
      params: { key: STEAM_API_KEY(), steamids: ids },
      timeout: 10000,
    });

    const players = summaryData?.response?.players as SteamPlayerSummary[] ?? [];
    for (const p of players) {
      const statusMap: Record<number, string> = {
        0: "offline",
        1: "online",
        2: "busy",
        3: "away",
        4: "snooze",
        5: "looking_to_trade",
        6: "looking_to_play",
      };
      allFriends.push({
        steamId: p.steamid,
        personaName: p.personaname,
        avatarUrl: p.avatarfull,
        profileUrl: `https://steamcommunity.com/profiles/${p.steamid}`,
        onlineStatus: statusMap[(p as any).personastate ?? 0] ?? "offline",
      });
    }

    if (i + 100 < friends.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // Sort: online/trading first, then alphabetically
  allFriends.sort((a, b) => {
    const onlineOrder = (s: string) =>
      s === "looking_to_trade" ? 0 : s === "online" ? 1 : s === "offline" ? 3 : 2;
    const diff = onlineOrder(a.onlineStatus) - onlineOrder(b.onlineStatus);
    if (diff !== 0) return diff;
    return a.personaName.localeCompare(b.personaName);
  });

  return allFriends;
}

export async function fetchSteamInventory(
  steamId: string,
  cookies?: { steamLoginSecure: string; sessionId: string }
): Promise<ParsedInventoryItem[]> {
  // Try IEconService API first (like CSFloat) — much less rate-limited
  if (cookies?.steamLoginSecure) {
    const accessToken = extractAccessTokenFromCookie(cookies.steamLoginSecure);
    if (accessToken) {
      try {
        const items = await fetchInventoryViaAPI(steamId, accessToken);
        if (items.length > 0) {
          console.log(`[Steam] Inventory via API: ${items.length} items (${items.filter(i => !i.tradable).length} trade-banned)`);
          return items;
        }
      } catch (err: any) {
        console.warn(`[Steam] API inventory failed, falling back to community: ${err.message}`);
      }
    }
  }

  // Fallback: community endpoint (more rate-limited)
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  };
  if (cookies) {
    headers.Cookie = `steamLoginSecure=${cookies.steamLoginSecure}; sessionid=${cookies.sessionId}`;
  }

  const contexts = cookies ? ["2", "16"] : ["2"];
  const allItems: ParsedInventoryItem[] = [];
  const seenAssetIds = new Set<string>();

  for (const ctx of contexts) {
    const ctxItems = await fetchInventoryContext(steamId, ctx, headers);
    for (const item of ctxItems) {
      if (!seenAssetIds.has(item.asset_id)) {
        seenAssetIds.add(item.asset_id);
        allItems.push(item);
      }
    }
  }

  console.log(`[Steam] Inventory total: ${allItems.length} items (${allItems.filter(i => !i.tradable).length} trade-banned)`);

  if (allItems.length === 0) {
    console.warn(`[Steam] Inventory returned 0 items for ${steamId} — empty or fetch failed`);
  }

  return allItems;
}

/**
 * Extract access token (JWT) from steamLoginSecure cookie.
 * Format: steamId%7C%7CaccessToken or steamId||accessToken
 */
function extractAccessTokenFromCookie(steamLoginSecure: string): string | null {
  const decoded = decodeURIComponent(steamLoginSecure);
  const parts = decoded.split("||");
  return parts.length >= 2 ? parts.slice(1).join("||") : null;
}

/**
 * Fetch inventory via Steam IEconService API (like CSFloat does).
 * Uses access_token auth — separate infra from community, much less rate-limited.
 */
async function fetchInventoryViaAPI(
  steamId: string,
  accessToken: string
): Promise<ParsedInventoryItem[]> {
  const items: ParsedInventoryItem[] = [];
  let lastAssetId: string | undefined;

  for (let page = 0; page < 20; page++) {
    const params: Record<string, string> = {
      access_token: accessToken,
      steamid: steamId,
      appid: "730",
      contextid: "2",
      get_descriptions: "1",
      count: "1000",
      language: "english",
    };
    if (lastAssetId) params.start_assetid = lastAssetId;

    const resp = await SteamGateway.request<any>({
      url: "https://api.steampowered.com/IEconService/GetInventoryItemsWithDescriptions/v1/",
      params,
      timeout: 20000,
    });

    const result = resp.data?.response;
    if (!result?.assets?.length) break;

    const assets = result.assets as any[];
    const descriptions = (result.descriptions || []) as any[];

    console.log(`[Steam] API page ${page}: ${assets.length} assets, more=${!!result.more_items}`);

    const descMap = new Map<string, any>();
    for (const desc of descriptions) {
      descMap.set(`${desc.classid}_${desc.instanceid}`, desc);
    }

    for (const asset of assets) {
      const desc = descMap.get(`${asset.classid}_${asset.instanceid}`);
      if (!desc) continue;
      if (EXCLUDED_NAMES.includes(desc.market_hash_name)) continue;

      // Parse trade ban
      let tradeBanUntil: string | null = null;
      if (!desc.tradable && desc.owner_descriptions) {
        for (const od of desc.owner_descriptions) {
          const cleaned = (od.value || "").replace(/<[^>]+>/g, "");
          const match = cleaned.match(/(?:Tradable|Marketable) After (.+?)(?:\s*\(|$)/i)
            || cleaned.match(/until ([A-Z][a-z]{2} \d{1,2}, \d{4})/i);
          if (match) {
            const parsed = new Date(match[1]);
            if (!isNaN(parsed.getTime())) tradeBanUntil = parsed.toISOString();
          }
        }
      }

      if (!desc.tradable && !tradeBanUntil && !desc.marketable) continue;

      // Parse wear, rarity, inspect link from tags/actions (same as community endpoint)
      let wear: string | null = null;
      let rarity: string | null = null;
      let rarityColor: string | null = null;
      let inspectLink: string | null = null;

      if (desc.tags) {
        for (const tag of desc.tags) {
          if (tag.category === "Exterior") wear = tag.localized_tag_name || tag.name;
          if (tag.category === "Rarity") {
            rarity = tag.localized_tag_name || tag.name;
            rarityColor = tag.color || null;
          }
        }
      }
      // Build per-asset property map for resolving %propid:N% templates
      const propMap = new Map<number, string>();
      if (asset.item_properties) {
        for (const prop of asset.item_properties) {
          if (prop.property_defid != null && prop.property_value != null) {
            propMap.set(prop.property_defid, prop.property_value);
          }
        }
      }

      if (desc.actions) {
        for (const action of desc.actions) {
          if (action.link?.includes("csgo_econ_action_preview")) {
            inspectLink = action.link
              .replace("%owner_steamid%", steamId)
              .replace("%assetid%", asset.assetid)
              .replace(/%propid:(\d+)%/g, (_: string, id: string) => propMap.get(Number(id)) ?? "");
          }
        }
      }

      items.push({
        asset_id: asset.assetid,
        market_hash_name: desc.market_hash_name,
        icon_url: desc.icon_url
          ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}`
          : "",
        wear,
        rarity,
        rarity_color: rarityColor,
        tradable: !!desc.tradable,
        trade_ban_until: tradeBanUntil,
        inspect_link: inspectLink,
      });
    }

    if (!result.more_items) break;
    lastAssetId = result.last_assetid || assets[assets.length - 1]?.assetid;
    if (!lastAssetId) break;
  }

  if (items.length > 0 && items.length < 10) {
    console.warn(`[Steam] API inventory returned only ${items.length} items — possible partial fetch`);
  }

  return items;
}

/** Fetch and parse a single inventory context (paginated). Rate limiting via SteamGateway. */
async function fetchInventoryContext(
  steamId: string,
  contextId: string,
  headers: Record<string, string>
): Promise<ParsedInventoryItem[]> {
  const items: ParsedInventoryItem[] = [];
  let lastAssetId: string | undefined;
  let totalFiltered = 0;

  for (let page = 0; page < 20; page++) {
    const params: Record<string, string> = { l: "english", count: "2000" };
    if (lastAssetId) params.start_assetid = lastAssetId;

    let data: any;
    try {
      const resp = await SteamGateway.request<any>({
        url: `https://steamcommunity.com/inventory/${steamId}/730/${contextId}`,
        params,
        timeout: 15000,
        headers,
        maxRetries: 5,
        validateStatus: (s: number) => s < 400 || s === 403,
      });

      if (resp.status === 403 && contextId === "2") {
        throw new Error("INVENTORY_PRIVATE");
      }
      data = resp.data;
    } catch (err: any) {
      if (err.message === "INVENTORY_PRIVATE") throw err;
      // Check for 403 wrapped in SteamRequestError
      if (err.httpStatus === 403 && contextId === "2") {
        throw new Error("INVENTORY_PRIVATE");
      }
      console.log(`[Steam] Error ctx${contextId} page ${page}: ${err.message}, returning ${items.length} items`);
      return items;
    }

    if (!data?.success) {
      // If context 2 returns success:false with no assets on first page, inventory is likely private
      if (contextId === "2" && page === 0 && !data?.assets) {
        throw new Error('INVENTORY_PRIVATE');
      }
      break;
    }
    if (!data?.assets) break;

    const assets = data.assets as SteamInventoryAsset[];
    const descriptions = data.descriptions as SteamInventoryDescription[];

    console.log(`[Steam] ctx${contextId} page ${page}: ${assets.length} assets, more=${data.more_items}`);

    const descMap = new Map<string, SteamInventoryDescription>();
    for (const desc of descriptions) {
      descMap.set(`${desc.classid}_${desc.instanceid}`, desc);
    }

    for (const asset of assets) {
      const desc = descMap.get(`${asset.classid}_${asset.instanceid}`);
      if (!desc) continue;

      if (EXCLUDED_NAMES.includes(desc.market_hash_name)) continue;

      // Parse trade ban date from owner_descriptions
      let tradeBanUntil: string | null = null;
      if (!desc.tradable && desc.owner_descriptions) {
        for (const od of desc.owner_descriptions) {
          const cleaned = od.value.replace(/<[^>]+>/g, '');
          // "Tradable After ...", "Marketable After ...", or "until Mar 18, 2026 (7:00:00) GMT"
          const match = cleaned.match(/(?:Tradable|Marketable) After (.+?)(?:\s*\(|$)/i)
            || cleaned.match(/until ([A-Z][a-z]{2} \d{1,2}, \d{4})/i);
          if (match) {
            const parsed = new Date(match[1]);
            if (!isNaN(parsed.getTime())) {
              tradeBanUntil = parsed.toISOString();
            }
          }
        }
      }

      // Context 16 items are always trade-banned — if we couldn't parse date, still keep them
      if (contextId === "16" && !desc.tradable && !tradeBanUntil) {
        // Try to extract any date-like pattern as fallback
        for (const od of desc.owner_descriptions ?? []) {
          const dateMatch = od.value.match(/([A-Z][a-z]{2} \d{1,2}, \d{4})/);
          if (dateMatch) {
            const parsed = new Date(dateMatch[1]);
            if (!isNaN(parsed.getTime())) {
              tradeBanUntil = parsed.toISOString();
              break;
            }
          }
        }
        // Even without a date, keep ctx16 items — they're real items with temp ban
        if (!tradeBanUntil) {
          tradeBanUntil = "unknown";
        }
      }

      // Skip permanently non-marketable items (graffiti, medals, coins, etc.)
      // but KEEP items that are temporarily non-marketable (trade ban)
      if (!desc.marketable && !tradeBanUntil) {
        totalFiltered++;
        continue;
      }

      const wearMatch = desc.market_hash_name.match(
        /\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/
      );
      const rarityTag = desc.tags?.find((t) => t.category === "Rarity");
      const inspectAction = desc.actions?.find((a) =>
        a.link.includes("csgo_econ_action_preview")
      );
      let inspectLink: string | null = null;
      if (inspectAction) {
        inspectLink = inspectAction.link
          .replace("%owner_steamid%", steamId)
          .replace("%assetid%", asset.assetid);
      }

      items.push({
        asset_id: asset.assetid,
        market_hash_name: desc.market_hash_name,
        icon_url: desc.icon_url,
        wear: wearMatch ? wearMatch[1] : null,
        rarity: rarityTag?.localized_tag_name ?? null,
        rarity_color: rarityTag?.color ?? null,
        tradable: !!desc.tradable,
        trade_ban_until: tradeBanUntil !== "unknown" ? tradeBanUntil : null,
        inspect_link: inspectLink,
      });
    }

    if (!data.more_items) break;
    lastAssetId = data.last_assetid ?? assets[assets.length - 1].assetid;
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`[Steam] ctx${contextId} done: ${items.length} kept, ${totalFiltered} filtered`);
  return items;
}
