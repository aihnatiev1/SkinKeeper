import axios from "axios";
import type { SteamSession } from "./steamSession.js";
import { SteamSessionService } from "./steamSession.js";
import { convertUsdToWallet, getWalletCurrency, getCurrencyInfo, getExchangeRate, parseSteamPrice } from "./currency.js";
import { log } from "../utils/logger.js";
import { getLatestPrices } from "./prices.js";
import { getSteamDepth } from "./steamMarketDepth.js";

interface SellResult {
  success: boolean;
  requiresConfirmation: boolean;
  message?: string;
}

interface MarketPriceInfo {
  lowestPrice: number | null; // in cents
  medianPrice: number | null;
  volume: string | null;
}

// Get current lowest price from Steam Market
// currency: Steam currency ID (1=USD, 18=UAH, etc.)
export async function getMarketPrice(
  marketHashName: string,
  currency: number = 1
): Promise<MarketPriceInfo> {
  try {
    const { data } = await axios.get(
      "https://steamcommunity.com/market/priceoverview/",
      {
        params: {
          appid: 730,
          currency,
          market_hash_name: marketHashName,
        },
        timeout: 10000,
      }
    );

    if (!data.success) return { lowestPrice: null, medianPrice: null, volume: null };

    const info = getCurrencyInfo(currency);
    const decimals = info?.decimals ?? 2;

    // Parse any Steam price format ("$12.34", "₴123,45", "¥1,234") into smallest unit
    const parsePrice = (s: string | undefined): number | null => {
      const val = parseSteamPrice(s);
      if (val === null) return null;
      return Math.round(val * Math.pow(10, decimals));
    };

    return {
      lowestPrice: parsePrice(data.lowest_price),
      medianPrice: parsePrice(data.median_price),
      volume: data.volume ?? null,
    };
  } catch {
    return { lowestPrice: null, medianPrice: null, volume: null };
  }
}

// Calculate buyer pays price from seller receives price
// Steam takes 15% fee (5% Steam + 10% CS2)
function sellerReceivesToBuyerPays(sellerReceivesCents: number): number {
  // Valve fee: floor(buyer_pays * 0.05), min 1 cent
  // CS2 fee: floor(buyer_pays * 0.10), min 1 cent
  // seller_receives = buyer_pays - valve_fee - cs2_fee
  // Approximate: buyer_pays ≈ seller_receives / 0.8696
  let buyerPays = Math.ceil(sellerReceivesCents / 0.8696);

  // Verify and adjust
  const valveFee = Math.max(1, Math.floor(buyerPays * 0.05));
  const cs2Fee = Math.max(1, Math.floor(buyerPays * 0.10));
  const actualReceives = buyerPays - valveFee - cs2Fee;

  if (actualReceives < sellerReceivesCents) {
    buyerPays += 1;
  }

  return buyerPays;
}

/**
 * Fetch a fresh sessionid from Steam using steamLoginSecure cookie.
 * Steam's sessionid is a CSRF token — the cookie value MUST exactly match
 * the POST body value. Fetching it fresh avoids stale / encoding mismatches.
 * Returns the raw cookie value (no decoding) for exact match.
 */
async function getFreshSessionId(
  steamLoginSecure: string
): Promise<string | null> {
  try {
    // Use steamcommunity.com root — more reliable than /market/ for cookie extraction
    const response = await axios.get(
      "https://steamcommunity.com/",
      {
        headers: {
          Cookie: `steamLoginSecure=${steamLoginSecure}`,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        maxRedirects: 5,
        timeout: 10000,
        // Capture all response headers including Set-Cookie
        validateStatus: (s: number) => s < 500,
      }
    );

    const cookies = response.headers["set-cookie"];
    if (cookies) {
      for (const cookie of cookies) {
        const match = cookie.match(/sessionid=([^;]+)/);
        if (match) {
          log.info("sell_session_refreshed");
          return match[1]; // raw value, no decode
        }
      }
    }

    log.warn("sell_no_sessionid");
    return null;
  } catch (err: any) {
    log.warn("sell_session_refresh_failed", {}, err);
    return null;
  }
}

// Sell an item on Steam Community Market
// priceCurrencyId: currency of priceInCents (e.g. 18=UAH when from quickSellPrice with wallet currency)
export async function sellItem(
  session: SteamSession,
  assetId: string,
  priceInCents: number,
  accountId?: number,
  priceCurrencyId: number = 1
): Promise<SellResult> {
  try {
    let walletPriceCents = priceInCents;
    let currencyLabel = getCurrencyInfo(priceCurrencyId)?.code ?? "USD";

    if (accountId) {
      const walletCurrency = await getWalletCurrency(accountId, session.steamLoginSecure);
      if (walletCurrency && walletCurrency !== priceCurrencyId) {
        // Price is in a different currency than wallet — need conversion
        // First convert to USD if not already, then to wallet currency
        let usdCents = priceInCents;
        if (priceCurrencyId !== 1) {
          // Convert from source currency to USD (reverse rate)
          const sourceRate = await getExchangeRate(priceCurrencyId);
          if (sourceRate && sourceRate > 0) {
            usdCents = Math.round(priceInCents / sourceRate);
          } else {
            log.error("sell_currency_conversion_failed", { from: currencyLabel, to: "USD" });
            return {
              success: false,
              requiresConfirmation: false,
              message: `Currency conversion from ${currencyLabel} failed. Please try again.`,
            };
          }
        }
        if (walletCurrency !== 1) {
          const converted = await convertUsdToWallet(usdCents, walletCurrency);
          if (converted !== null) {
            walletPriceCents = converted;
            const info = getCurrencyInfo(walletCurrency);
            currencyLabel = info?.code ?? `currency#${walletCurrency}`;
            log.info("sell_currency_converted", { from: getCurrencyInfo(priceCurrencyId)?.code, to: currencyLabel, inputCents: priceInCents, outputCents: walletPriceCents });
          } else {
            const info = getCurrencyInfo(walletCurrency);
            const code = info?.code ?? `currency#${walletCurrency}`;
            log.error("sell_currency_conversion_failed", { to: code });
            return {
              success: false,
              requiresConfirmation: false,
              message: `Currency conversion to ${code} failed. Please try again or set your wallet currency manually in Settings.`,
            };
          }
        } else {
          walletPriceCents = usdCents;
          currencyLabel = "USD";
        }
      } else {
        // Price is already in wallet currency — use as-is
        if (walletCurrency) {
          const info = getCurrencyInfo(walletCurrency);
          currencyLabel = info?.code ?? currencyLabel;
        }
      }
    }

    const buyerPays = sellerReceivesToBuyerPays(walletPriceCents);

    // steamLoginSecure stored as-is from Steam (may contain %7C%7C)
    // Send it exactly as stored — Steam expects the same format it issued
    const freshSessionId = await getFreshSessionId(session.steamLoginSecure);
    const sessionId = freshSessionId ?? session.sessionId;

    // Fetch webTradeEligibility cookie — Steam gates market operations behind this
    let eligCookie: string | undefined;
    try {
      const eligRes = await axios.get(
        "https://steamcommunity.com/market/eligibilitycheck/",
        {
          headers: {
            Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${sessionId}`,
          },
          maxRedirects: 0,
          validateStatus: (s: number) => s >= 200 && s < 400,
        }
      );
      const setCookies: string[] = eligRes.headers["set-cookie"] ?? [];
      eligCookie = setCookies
        .map((c: string) => c.split(";")[0])
        .find((c: string) => c.startsWith("webTradeEligibility="));
    } catch (e: any) {
      log.warn("sell_eligibility_check_failed", {}, e);
    }

    log.info("sell_listing", { assetId, sellerReceivesCents: walletPriceCents, buyerPaysCents: buyerPays, currency: currencyLabel });

    const formBody = [
      `sessionid=${sessionId}`,
      `appid=730`,
      `contextid=2`,
      `assetid=${assetId}`,
      `amount=1`,
      `price=${walletPriceCents}`,
    ].join("&");

    const resp = await axios.post(
      "https://steamcommunity.com/market/sellitem/",
      formBody,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${sessionId}${eligCookie ? "; " + eligCookie : ""}`,
          Referer: "https://steamcommunity.com/my/inventory/",
          Origin: "https://steamcommunity.com",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          "X-Requested-With": "XMLHttpRequest",
        },
        timeout: 15000,
        validateStatus: () => true, // don't throw on non-2xx
      }
    );
    const data = resp.data;

    log.info("sell_steam_response", { status: resp.status, success: data.success });

    if (data.success) {
      // Update stored sessionId if it changed
      if (freshSessionId && freshSessionId !== session.sessionId) {
        session.sessionId = freshSessionId;
      }

      const symbol = getCurrencyInfo(priceCurrencyId)?.symbol ?? "$";
      return {
        success: true,
        requiresConfirmation: data.requires_confirmation === 1,
        message: `Listed for ${(buyerPays / 100).toFixed(2)} ${currencyLabel} (you receive ${symbol}${(walletPriceCents / 100).toFixed(2)})`,
      };
    }

    return {
      success: false,
      requiresConfirmation: false,
      message: data.message || "Failed to create listing",
    };
  } catch (err: any) {
    log.error("sell_error", { assetId }, err);
    return {
      success: false,
      requiresConfirmation: false,
      message: err.response?.data?.message || err.message,
    };
  }
}

export interface QuickSellResult {
  sellerReceivesCents: number;
  /** "live" = fresh Steam API, "depth" / "cached" = fallback (stale) */
  source: "live" | "depth" | "cached";
  /** Currency of sellerReceivesCents (Steam currency ID, e.g. 1=USD, 18=UAH) */
  currencyId: number;
}

// Quick sell: live Steam price - 1 smallest-unit (listing/buyer-pays side).
// When walletCurrencyId is provided, fetches price directly from Steam in that currency.
// Fallback chain if Steam API returns 429 or fails:
//   1. Live Steam API in wallet currency (freshest + native currency = exact undercut)
//   2. Steam Market Depth lowestAsk (USD, converted to wallet currency)
//   3. Cached steam price from current_prices (USD, converted to wallet currency)
export async function quickSellPrice(
  marketHashName: string,
  walletCurrencyId: number = 1
): Promise<QuickSellResult | null> {
  const undercut = (buyerPaysCents: number): number => {
    const listing = Math.max(1, buyerPaysCents - 1);
    const valveFee = Math.max(1, Math.floor(listing * 0.05));
    const cs2Fee = Math.max(1, Math.floor(listing * 0.10));
    return Math.max(1, listing - valveFee - cs2Fee);
  };

  // Helper: convert USD cents to wallet currency (for fallback sources stored in USD)
  const toWallet = async (usdCents: number): Promise<number | null> => {
    if (walletCurrencyId === 1) return usdCents;
    return convertUsdToWallet(usdCents, walletCurrencyId);
  };

  const currencyCode = getCurrencyInfo(walletCurrencyId)?.code ?? "USD";

  // 1. Live Steam API — fetch in wallet currency directly
  const live = await getMarketPrice(marketHashName, walletCurrencyId);
  if (live.lowestPrice !== null && live.lowestPrice > 0) {
    log.info("quicksell_live_price", { marketHashName, currency: currencyCode, price: live.lowestPrice });
    return { sellerReceivesCents: undercut(live.lowestPrice), source: "live", currencyId: walletCurrencyId };
  }

  // 2. Steam Market Depth (stored in USD — convert to wallet currency)
  const depth = getSteamDepth(marketHashName);
  if (depth && depth.lowestAsk > 0) {
    const usdCents = Math.round(depth.lowestAsk * 100);
    const walletCents = await toWallet(usdCents);
    if (walletCents !== null) {
      log.warn("quicksell_fallback_depth", { marketHashName, currency: currencyCode, walletCents });
      return { sellerReceivesCents: undercut(walletCents), source: "depth", currencyId: walletCurrencyId };
    }
  }

  // 3. Cached steam price from current_prices (USD, already filtered to < 48h)
  const priceMap = await getLatestPrices([marketHashName]);
  const sources = priceMap.get(marketHashName);
  const cachedSteam = sources?.["steam"];
  if (cachedSteam && cachedSteam > 0) {
    const usdCents = Math.round(cachedSteam * 100);
    const walletCents = await toWallet(usdCents);
    if (walletCents !== null) {
      log.warn("quicksell_fallback_cached", { marketHashName, currency: currencyCode, walletCents });
      return { sellerReceivesCents: undercut(walletCents), source: "cached", currencyId: walletCurrencyId };
    }
  }

  return null;
}

// Bulk sell multiple items at same price
export async function bulkSell(
  session: SteamSession,
  items: Array<{ assetId: string; priceInCents: number }>,
  accountId?: number
): Promise<Array<{ assetId: string; result: SellResult }>> {
  const results: Array<{ assetId: string; result: SellResult }> = [];

  for (const item of items) {
    const result = await sellItem(session, item.assetId, item.priceInCents, accountId);
    results.push({ assetId: item.assetId, result });

    // Pause between sells to avoid rate limit
    await new Promise((r) => setTimeout(r, 1500));
  }

  return results;
}

/**
 * Check if a specific asset is currently listed on Steam Market.
 * Used for phantom listing detection (network dropout after Steam accepted listing).
 * Returns "listed" if found, "not_listed" if confirmed absent, "unknown" if check failed.
 */
export async function checkAssetListed(
  session: SteamSession,
  assetId: string
): Promise<"listed" | "not_listed" | "unknown"> {
  try {
    const { data } = await axios.get(
      "https://steamcommunity.com/market/mylistings",
      {
        params: { norender: 1, start: 0, count: 100 },
        headers: {
          Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        timeout: 15000,
      }
    );

    if (!data?.success) return "unknown";

    // Check active listings, to-confirm, and on-hold
    const allListings = [
      ...((data.listings as unknown[]) ?? []),
      ...((data.listings_to_confirm as unknown[]) ?? []),
      ...((data.listings_on_hold as unknown[]) ?? []),
    ];

    for (const listing of allListings) {
      const l = listing as Record<string, unknown>;
      const asset = l.asset as Record<string, unknown> | undefined;
      if (asset?.id === assetId || asset?.assetid === assetId) {
        return "listed";
      }
    }

    return "not_listed";
  } catch {
    return "unknown";
  }
}
