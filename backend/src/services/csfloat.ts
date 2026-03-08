import axios from "axios";

interface CSFloatListing {
  id: string;
  price: number; // cents
  item: {
    market_hash_name: string;
    float_value: number;
  };
}

/**
 * Fetch the lowest listing price for a single item on CSFloat.
 * Returns price in USD (cents / 100) or null if unavailable.
 */
export async function fetchCSFloatItemPrice(
  marketHashName: string,
  apiKey: string
): Promise<number | null> {
  try {
    const { data } = await axios.get<CSFloatListing[]>(
      "https://csfloat.com/api/v1/listings",
      {
        params: {
          market_hash_name: marketHashName,
          sort_by: "lowest_price",
          limit: 1,
        },
        headers: { Authorization: apiKey },
        timeout: 10000,
      }
    );

    if (data.length > 0) {
      return data[0].price / 100;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch prices for multiple items from CSFloat.
 * Deduplicates names, adds 200ms delay between requests for rate limiting.
 * Returns Map<market_hash_name, price_usd>.
 */
export async function fetchCSFloatPrices(
  marketHashNames: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  const apiKey = process.env.CSFLOAT_API_KEY;
  if (!apiKey) {
    console.warn("[CSFloat] CSFLOAT_API_KEY not set, skipping price fetch");
    return prices;
  }

  const uniqueNames = [...new Set(marketHashNames)];

  for (let i = 0; i < uniqueNames.length; i++) {
    const name = uniqueNames[i];
    const price = await fetchCSFloatItemPrice(name, apiKey);
    if (price !== null) {
      prices.set(name, price);
    }

    // Rate limiting: 200ms delay between requests (skip after last)
    if (i < uniqueNames.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(`[CSFloat] Fetched ${prices.size}/${uniqueNames.length} prices`);
  return prices;
}
