import axios from "axios";
import type { SteamSession } from "./steamSession.js";
import { SteamSessionService } from "./steamSession.js";
import { convertUsdToWallet, getWalletCurrency, getCurrencyInfo } from "./currency.js";
import { getLatestPrices } from "./prices.js";

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
export async function getMarketPrice(
  marketHashName: string
): Promise<MarketPriceInfo> {
  try {
    const { data } = await axios.get(
      "https://steamcommunity.com/market/priceoverview/",
      {
        params: {
          appid: 730,
          currency: 1, // USD
          market_hash_name: marketHashName,
        },
        timeout: 10000,
      }
    );

    if (!data.success) return { lowestPrice: null, medianPrice: null, volume: null };

    // Parse "$12.34" -> 1234 (cents)
    const parsePrice = (s: string | undefined): number | null => {
      if (!s) return null;
      return Math.round(parseFloat(s.replace(/[^0-9.]/g, "")) * 100);
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
          console.log(`[Sell] Fresh sessionId obtained: ${match[1].substring(0, 8)}…`);
          return match[1]; // raw value, no decode
        }
      }
    }

    console.warn("[Sell] No sessionid in Set-Cookie response");
    return null;
  } catch (err: any) {
    console.warn("[Sell] Failed to fetch fresh sessionId:", err.message);
    return null;
  }
}

// Sell an item on Steam Community Market
export async function sellItem(
  session: SteamSession,
  assetId: string,
  priceInCents: number, // price seller receives in USD cents
  accountId?: number // steam_accounts.id — needed for wallet currency conversion
): Promise<SellResult> {
  try {
    // Convert USD cents to wallet currency if needed
    let walletPriceCents = priceInCents;
    let currencyLabel = "USD";

    if (accountId) {
      const walletCurrency = await getWalletCurrency(accountId, session.steamLoginSecure);
      if (walletCurrency && walletCurrency !== 1) {
        const converted = await convertUsdToWallet(priceInCents, walletCurrency);
        if (converted !== null) {
          walletPriceCents = converted;
          const info = getCurrencyInfo(walletCurrency);
          currencyLabel = info?.code ?? `currency#${walletCurrency}`;
          console.log(
            `[Sell] Currency conversion: ${priceInCents} USD cents → ${walletPriceCents} ${currencyLabel} cents`
          );
        } else {
          console.warn(
            `[Sell] Currency conversion failed for currency ${walletCurrency}, falling back to USD`
          );
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
      console.warn(`[Sell] Eligibility check failed, proceeding without:`, e.message);
    }

    console.log(
      `[Sell] assetId=${assetId} price=${walletPriceCents}c (${currencyLabel}) sessionId=${sessionId.substring(0, 8)}… fresh=${!!freshSessionId} eligibility=${!!eligCookie}`
    );

    const formBody = [
      `sessionid=${sessionId}`,
      `appid=730`,
      `contextid=2`,
      `assetid=${assetId}`,
      `amount=1`,
      `price=${walletPriceCents}`,
    ].join("&");

    const { data } = await axios.post(
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
      }
    );

    console.log(`[Sell] Response:`, JSON.stringify(data));

    if (data.success) {
      // Update stored sessionId if it changed
      if (freshSessionId && freshSessionId !== session.sessionId) {
        session.sessionId = freshSessionId;
      }

      return {
        success: true,
        requiresConfirmation: data.requires_confirmation === 1,
        message:
          currencyLabel === "USD"
            ? `Listed for $${(buyerPays / 100).toFixed(2)} (you receive $${(priceInCents / 100).toFixed(2)})`
            : `Listed for ${(buyerPays / 100).toFixed(2)} ${currencyLabel} (≈ $${(priceInCents / 100).toFixed(2)} USD)`,
      };
    }

    return {
      success: false,
      requiresConfirmation: false,
      message: data.message || "Failed to create listing",
    };
  } catch (err: any) {
    console.error(`[Sell] Error for assetId=${assetId}:`, err.response?.data || err.message);
    return {
      success: false,
      requiresConfirmation: false,
      message: err.response?.data?.message || err.message,
    };
  }
}

// Quick sell: Steam price - 1 cent (since we sell on Steam Market)
// Uses cached Steam price; falls back to direct Steam API
export async function quickSellPrice(
  marketHashName: string
): Promise<number | null> {
  // Try cached Steam price first (no rate limits)
  const priceMap = await getLatestPrices([marketHashName]);
  const sources = priceMap.get(marketHashName);

  if (sources) {
    // Prefer Steam price since we're listing on Steam Market
    const steamPrice = sources["steam"];
    if (steamPrice && steamPrice > 0) {
      const steamCents = Math.round(steamPrice * 100);
      const valveFee = Math.max(1, Math.floor(steamCents * 0.05));
      const cs2Fee = Math.max(1, Math.floor(steamCents * 0.10));
      const sellerReceives = steamCents - valveFee - cs2Fee;
      return Math.max(1, sellerReceives - 1);
    }

    // Fallback to any available price if Steam not yet crawled
    const prices = Object.values(sources).filter((p) => p > 0);
    if (prices.length > 0) {
      // Use median to avoid outliers from a single bad source
      prices.sort((a, b) => a - b);
      const medianUsd = prices[Math.floor(prices.length / 2)];
      const medianCents = Math.round(medianUsd * 100);
      const valveFee = Math.max(1, Math.floor(medianCents * 0.05));
      const cs2Fee = Math.max(1, Math.floor(medianCents * 0.10));
      const sellerReceives = medianCents - valveFee - cs2Fee;
      return Math.max(1, sellerReceives - 1);
    }
  }

  // Fallback: direct Steam API call
  const price = await getMarketPrice(marketHashName);
  if (price.lowestPrice === null) return null;
  const valveFee = Math.max(1, Math.floor(price.lowestPrice * 0.05));
  const cs2Fee = Math.max(1, Math.floor(price.lowestPrice * 0.10));
  const sellerReceives = price.lowestPrice - valveFee - cs2Fee;
  return Math.max(1, sellerReceives - 1);
}

// Bulk sell multiple items at same price
export async function bulkSell(
  session: SteamSession,
  items: Array<{ assetId: string; priceInCents: number }>
): Promise<Array<{ assetId: string; result: SellResult }>> {
  const results: Array<{ assetId: string; result: SellResult }> = [];

  for (const item of items) {
    const result = await sellItem(session, item.assetId, item.priceInCents);
    results.push({ assetId: item.assetId, result });

    // Pause between sells to avoid rate limit
    await new Promise((r) => setTimeout(r, 1500));
  }

  return results;
}
