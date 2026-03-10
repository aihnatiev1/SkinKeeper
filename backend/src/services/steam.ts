import axios from "axios";

const STEAM_API_KEY = () => process.env.STEAM_API_KEY!;

interface SteamPlayerSummary {
  steamid: string;
  personaname: string;
  avatarfull: string;
}

export async function getSteamProfile(
  steamId: string
): Promise<SteamPlayerSummary> {
  const { data } = await axios.get(
    "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
    { params: { key: STEAM_API_KEY(), steamids: steamId } }
  );
  const players = data.response.players as SteamPlayerSummary[];
  if (players.length === 0) throw new Error("Steam user not found");
  return players[0];
}

export async function verifySteamOpenId(
  params: Record<string, string>
): Promise<string> {
  // Change mode to check_authentication
  const verifyParams = { ...params, "openid.mode": "check_authentication" };

  const { data } = await axios.post(
    "https://steamcommunity.com/openid/login",
    new URLSearchParams(verifyParams).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  if (!data.includes("is_valid:true")) {
    throw new Error("Steam OpenID verification failed");
  }

  // Extract SteamID from claimed_id
  // Format: https://steamcommunity.com/openid/id/76561198XXXXXXXXX
  const claimedId = params["openid.claimed_id"];
  const match = claimedId?.match(/\/id\/(\d+)$/);
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
  const { data: friendsData } = await axios.get(
    "https://api.steampowered.com/ISteamUser/GetFriendList/v1/",
    {
      params: {
        key: STEAM_API_KEY(),
        steamid: steamId,
        relationship: "friend",
      },
      timeout: 10000,
    }
  );

  const friends = friendsData?.friendslist?.friends as
    | Array<{ steamid: string; friend_since: number }>
    | undefined;
  if (!friends || friends.length === 0) return [];

  // Get profile summaries in batches of 100 (Steam API limit)
  const allFriends: SteamFriend[] = [];
  for (let i = 0; i < friends.length; i += 100) {
    const batch = friends.slice(i, i + 100);
    const ids = batch.map((f) => f.steamid).join(",");

    const { data: summaryData } = await axios.get(
      "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
      {
        params: { key: STEAM_API_KEY(), steamids: ids },
        timeout: 10000,
      }
    );

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
  steamLoginSecure?: string
): Promise<ParsedInventoryItem[]> {
  const items: ParsedInventoryItem[] = [];
  let lastAssetId: string | undefined;

  // Paginate through inventory
  for (let page = 0; page < 20; page++) {
    const url = `https://steamcommunity.com/inventory/${steamId}/730/2`;
    const params: Record<string, string> = { l: "english", count: "500" };
    if (lastAssetId) params.start_assetid = lastAssetId;

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    };
    // Use session cookies to see trade-banned / private items
    if (steamLoginSecure) {
      headers.Cookie = `steamLoginSecure=${steamLoginSecure}`;
    }

    let data: any;
    for (let retry = 0; retry < 3; retry++) {
      try {
        const resp = await axios.get(url, {
          params,
          timeout: 15000,
          headers,
        });
        data = resp.data;
        break;
      } catch (err: any) {
        if (err.response?.status === 429 && retry < 2) {
          console.log(`[Steam] Rate limited, waiting ${(retry + 1) * 10}s...`);
          await new Promise((r) => setTimeout(r, (retry + 1) * 10000));
          continue;
        }
        // Return what we have so far on error
        console.log(`[Steam] Error on page ${page}, returning ${items.length} items`);
        return items;
      }
    }

    if (!data?.success || !data?.assets) break;

    const assets = data.assets as SteamInventoryAsset[];
    const descriptions = data.descriptions as SteamInventoryDescription[];

    // Build lookup map: classid_instanceid -> description
    const descMap = new Map<string, SteamInventoryDescription>();
    for (const desc of descriptions) {
      descMap.set(`${desc.classid}_${desc.instanceid}`, desc);
    }

    for (const asset of assets) {
      const desc = descMap.get(`${asset.classid}_${asset.instanceid}`);
      if (!desc) continue;

      // Skip known junk items by name
      if (EXCLUDED_NAMES.includes(desc.market_hash_name)) continue;

      // Parse trade ban date from owner_descriptions
      let tradeBanUntil: string | null = null;
      if (desc.tradable === 0 && desc.owner_descriptions) {
        for (const od of desc.owner_descriptions) {
          // Match both "Tradable After" and "Marketable After" date formats
          const match = od.value.match(/(?:Tradable|Marketable) After (.+?)(?:\s*\(|$)/i);
          if (match) {
            const parsed = new Date(match[1]);
            if (!isNaN(parsed.getTime())) {
              tradeBanUntil = parsed.toISOString();
            }
          }
        }
      }

      // Skip permanently non-marketable items (used graffiti, default items, etc.)
      // but KEEP items that are only temporarily non-marketable (trade ban)
      if (desc.marketable === 0 && !tradeBanUntil) continue;

      // Extract wear from market_hash_name: "AK-47 | Redline (Field-Tested)"
      const wearMatch = desc.market_hash_name.match(
        /\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/
      );

      // Extract rarity from tags
      const rarityTag = desc.tags?.find((t) => t.category === "Rarity");

      // Build inspect link from actions
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
        tradable: desc.tradable === 1,
        trade_ban_until: tradeBanUntil,
        inspect_link: inspectLink,
      });
    }

    // Check if more pages
    if (!data.more_items) break;
    lastAssetId = assets[assets.length - 1].assetid;

    // Respect rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  return items;
}
