import axios from "axios";
import type { SteamSession } from "./steamSession.js";

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

// Sell an item on Steam Community Market
export async function sellItem(
  session: SteamSession,
  assetId: string,
  priceInCents: number // price seller receives (after fees)
): Promise<SellResult> {
  try {
    const buyerPays = sellerReceivesToBuyerPays(priceInCents);

    const { data } = await axios.post(
      "https://steamcommunity.com/market/sellitem/",
      new URLSearchParams({
        sessionid: session.sessionId,
        appid: "730",
        contextid: "2",
        assetid: assetId,
        amount: "1",
        price: priceInCents.toString(), // seller receives in cents
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`,
          Referer: "https://steamcommunity.com/my/inventory/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        timeout: 15000,
      }
    );

    if (data.success) {
      return {
        success: true,
        requiresConfirmation: data.requires_confirmation === 1,
        message: `Listed for $${(buyerPays / 100).toFixed(2)} (you receive $${(priceInCents / 100).toFixed(2)})`,
      };
    }

    return {
      success: false,
      requiresConfirmation: false,
      message: data.message || "Failed to create listing",
    };
  } catch (err: any) {
    return {
      success: false,
      requiresConfirmation: false,
      message: err.response?.data?.message || err.message,
    };
  }
}

// Quick sell: lowest price - 1 cent
export async function quickSellPrice(
  marketHashName: string
): Promise<number | null> {
  const price = await getMarketPrice(marketHashName);
  if (price.lowestPrice === null) return null;
  // lowestPrice is what buyer pays, we need seller receives
  const valveFee = Math.max(1, Math.floor(price.lowestPrice * 0.05));
  const cs2Fee = Math.max(1, Math.floor(price.lowestPrice * 0.10));
  const sellerReceives = price.lowestPrice - valveFee - cs2Fee;
  // Minus 1 cent from seller receives
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
