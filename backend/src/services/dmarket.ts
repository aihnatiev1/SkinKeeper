import crypto from "node:crypto";
import axios from "axios";
import { record429, recordFailure } from "./priceStats.js";
import {
  initProxyPool,
  getAvailableSlot,
  getSlotConfig,
  recordSlot429,
  recordSlotSuccess,
} from "./proxyPool.js";

interface DMarketItem {
  title: string;
  price: { USD: string }; // cents as string
  extra: {
    exterior?: string;
    floatPartValue?: string;
  };
}

interface DMarketResponse {
  objects: DMarketItem[];
  total: { items: number };
  cursor: string;
}

const DMARKET_DOMAIN = "api.dmarket.com";

/**
 * Sign a DMarket API request using Ed25519.
 * Message format: METHOD + PATH_WITH_QUERY + BODY + TIMESTAMP
 * Returns hex-encoded signature string.
 */
export function signDMarketRequest(
  method: string,
  pathWithQuery: string,
  body: string,
  timestamp: string
): string {
  const message = method + pathWithQuery + body + timestamp;
  const secretKeyHex = process.env.DMARKET_SECRET_KEY!;

  // Convert hex secret to 32-byte seed, build PKCS8 DER for Ed25519
  const seed = Buffer.from(secretKeyHex, "hex").subarray(0, 32);

  // PKCS8 DER prefix for Ed25519 private key (RFC 8410)
  const pkcs8Prefix = Buffer.from(
    "302e020100300506032b657004220420",
    "hex"
  );
  const pkcs8Der = Buffer.concat([pkcs8Prefix, seed]);

  const privateKey = crypto.createPrivateKey({
    key: pkcs8Der,
    format: "der",
    type: "pkcs8",
  });

  const signature = crypto.sign(null, Buffer.from(message), privateKey);
  return signature.toString("hex");
}

/**
 * Fetch the cheapest listing price for a single item on DMarket.
 * Routes through proxy pool for 429 rotation.
 */
export async function fetchDMarketItemPrice(
  marketHashName: string
): Promise<number | null> {
  const publicKey = process.env.DMARKET_PUBLIC_KEY;
  const secretKey = process.env.DMARKET_SECRET_KEY;

  if (!publicKey || !secretKey) {
    return null;
  }

  initProxyPool();

  const path = "/exchange/v1/market/items";
  const query = `?gameId=a8db&title=${encodeURIComponent(marketHashName)}&limit=1&currency=USD&orderBy=price&orderDir=asc`;
  const fullPath = path + query;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const signature = signDMarketRequest("GET", fullPath, "", timestamp);

  // Try with proxy rotation on 429
  const triedSlots = new Set<number>();
  for (let attempt = 0; attempt < 3; attempt++) {
    const slot = getAvailableSlot(DMARKET_DOMAIN);
    if (!slot || triedSlots.has(slot.index)) break;
    triedSlots.add(slot.index);

    try {
      const { data } = await axios.get<DMarketResponse>(
        `https://api.dmarket.com${fullPath}`,
        {
          headers: {
            "X-Api-Key": publicKey,
            "X-Sign-Date": timestamp,
            "X-Request-Sign": `dmar ed25519 ${signature}`,
          },
          timeout: 10000,
          ...getSlotConfig(slot.index),
        }
      );

      recordSlotSuccess(slot.index, DMARKET_DOMAIN);

      if (data.objects?.length > 0) {
        return parseInt(data.objects[0].price.USD, 10) / 100;
      }
      return null;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        const retryAfter = parseInt(err.response?.headers?.["retry-after"] || "0", 10);
        record429("dmarket");
        recordSlot429(slot.index, DMARKET_DOMAIN, retryAfter);
        console.warn(`[DMarket] 429 for ${marketHashName} via ${slot.name}`);
        continue; // Try next slot
      } else {
        recordFailure("dmarket", err.message || String(err));
      }
      return null;
    }
  }

  return null;
}

/**
 * Fetch prices for multiple items from DMarket.
 * Deduplicates names, adds 200ms delay between requests.
 * Returns Map<market_hash_name, price_usd>.
 */
export async function fetchDMarketPrices(
  marketHashNames: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  const publicKey = process.env.DMARKET_PUBLIC_KEY;
  const secretKey = process.env.DMARKET_SECRET_KEY;
  if (!publicKey || !secretKey) {
    console.warn(
      "[DMarket] DMARKET_PUBLIC_KEY or DMARKET_SECRET_KEY not set, skipping price fetch"
    );
    return prices;
  }

  const uniqueNames = [...new Set(marketHashNames)];

  for (let i = 0; i < uniqueNames.length; i++) {
    const name = uniqueNames[i];
    const price = await fetchDMarketItemPrice(name);
    if (price !== null) {
      prices.set(name, price);
    }

    // Rate limiting: 200ms delay between requests (skip after last)
    if (i < uniqueNames.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(`[DMarket] Fetched ${prices.size}/${uniqueNames.length} prices`);
  return prices;
}
