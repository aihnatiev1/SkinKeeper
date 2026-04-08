/**
 * Steam wallet currency service.
 *
 * Steam's /market/sellitem/ interprets the `price` parameter in the user's
 * wallet currency, NOT USD. This module:
 *   1. Detects the wallet currency from Steam community pages
 *   2. Maintains an exchange rate cache (USD → wallet currency)
 *   3. Converts USD cents to wallet currency smallest unit before sell
 */

import axios from "axios";
import { pool } from "../db/pool.js";
import { TTLCache } from "../utils/TTLCache.js";
import { registerCache } from "../utils/cacheRegistry.js";

// ─── Steam currency ID → metadata ──────────────────────────────────────

interface CurrencyInfo {
  code: string;
  symbol: string;
  /** Decimal places used (2 for most, 0 for JPY/VND/KRW) */
  decimals: number;
  /**
   * Minimum undercut step in the currency's smallest unit (cents/kopecks).
   * Steam's market enforces minimum price steps per currency:
   *   - USD/EUR/GBP: 1 cent  (minUnit: 1)
   *   - UAH: 1 hryvnia       (minUnit: 100 = 100 kopecks)
   *   - RUB: 1 ruble         (minUnit: 100 = 100 kopecks)
   *   - KZT: 1 tenge         (minUnit: 100)
   *   - IDR: 1 rupiah * 100  (minUnit: 100 — Steam rounds to hundreds)
   *   - VND: 1 dong * 100    (minUnit: 100)
   *   - COP: 1 peso * 100    (minUnit: 100)
   *   - ARS: 1 peso          (minUnit: 100)
   *   - JPY/KRW: 1 unit      (minUnit: 1 — no decimal places)
   * Defaults to 1 if not specified.
   */
  minUnit: number;
}

const STEAM_CURRENCIES: Record<number, CurrencyInfo> = {
  1:  { code: "USD", symbol: "$",     decimals: 2, minUnit: 1 },
  2:  { code: "GBP", symbol: "£",     decimals: 2, minUnit: 1 },
  3:  { code: "EUR", symbol: "€",     decimals: 2, minUnit: 1 },
  5:  { code: "RUB", symbol: "₽",     decimals: 2, minUnit: 100 },
  6:  { code: "PLN", symbol: "zł",    decimals: 2, minUnit: 1 },
  7:  { code: "BRL", symbol: "R$",    decimals: 2, minUnit: 1 },
  8:  { code: "JPY", symbol: "¥",     decimals: 0, minUnit: 1 },
  9:  { code: "NOK", symbol: "kr",    decimals: 2, minUnit: 1 },
  10: { code: "IDR", symbol: "Rp",    decimals: 2, minUnit: 100 },
  11: { code: "MYR", symbol: "RM",    decimals: 2, minUnit: 1 },
  12: { code: "PHP", symbol: "₱",     decimals: 2, minUnit: 1 },
  13: { code: "SGD", symbol: "S$",    decimals: 2, minUnit: 1 },
  14: { code: "THB", symbol: "฿",     decimals: 2, minUnit: 1 },
  15: { code: "VND", symbol: "₫",     decimals: 0, minUnit: 100 },
  16: { code: "KRW", symbol: "₩",     decimals: 0, minUnit: 1 },
  17: { code: "TRY", symbol: "₺",     decimals: 2, minUnit: 1 },
  18: { code: "UAH", symbol: "₴",     decimals: 2, minUnit: 100 },
  19: { code: "MXN", symbol: "Mex$",  decimals: 2, minUnit: 1 },
  20: { code: "CAD", symbol: "C$",    decimals: 2, minUnit: 1 },
  21: { code: "AUD", symbol: "A$",    decimals: 2, minUnit: 1 },
  22: { code: "NZD", symbol: "NZ$",   decimals: 2, minUnit: 1 },
  23: { code: "CNY", symbol: "¥",     decimals: 2, minUnit: 1 },
  24: { code: "INR", symbol: "₹",     decimals: 2, minUnit: 1 },
  25: { code: "CLP", symbol: "CLP$",  decimals: 0, minUnit: 1 },
  26: { code: "PEN", symbol: "S/.",   decimals: 2, minUnit: 1 },
  27: { code: "COP", symbol: "COL$",  decimals: 2, minUnit: 100 },
  28: { code: "ZAR", symbol: "R",     decimals: 2, minUnit: 1 },
  29: { code: "HKD", symbol: "HK$",   decimals: 2, minUnit: 1 },
  30: { code: "TWD", symbol: "NT$",   decimals: 0, minUnit: 1 },
  31: { code: "SAR", symbol: "SR",    decimals: 2, minUnit: 1 },
  32: { code: "AED", symbol: "AED",   decimals: 2, minUnit: 1 },
  34: { code: "ARS", symbol: "ARS$",  decimals: 2, minUnit: 100 },
  35: { code: "ILS", symbol: "₪",     decimals: 2, minUnit: 1 },
  37: { code: "KZT", symbol: "₸",     decimals: 2, minUnit: 100 },
};

/**
 * Get the minimum undercut step for a currency (in its smallest unit).
 * E.g., USD → 1 (1 cent), UAH → 100 (1 hryvnia).
 */
export function getMinUndercutUnit(steamCurrencyId: number): number {
  return STEAM_CURRENCIES[steamCurrencyId]?.minUnit ?? 1;
}

export function getCurrencyInfo(steamCurrencyId: number): CurrencyInfo | null {
  return STEAM_CURRENCIES[steamCurrencyId] ?? null;
}

// ─── Exchange rate cache ────────────────────────────────────────────────

const RATE_TTL_MS = 60 * 60 * 1000; // 1 hour
const rateCache = new TTLCache<number, number>(RATE_TTL_MS, 50);
registerCache("exchangeRate", rateCache as unknown as TTLCache<unknown, unknown>);

// Multiple probe items for resilience against rate limits
const RATE_PROBE_ITEMS = [
  "AK-47 | Redline (Field-Tested)",
  "AWP | Asiimov (Field-Tested)",
  "Desert Eagle | Blaze (Factory New)",
];

/**
 * Parse a Steam-formatted price string into a float.
 * Handles: "$12.34", "12,34€", "12,34₴", "123 456,78₽", "¥1,234"
 */
export function parseSteamPrice(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^\d.,]/g, "").replace(/\s/g, "");
  if (!cleaned) return null;
  let normalized: string;
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const val = parseFloat(normalized);
  return isNaN(val) ? null : val;
}

/**
 * Fetch the exchange rate from USD to a Steam currency.
 * Uses Steam's own priceoverview endpoint to derive the real rate.
 * Tries multiple items in case of rate limiting.
 */
async function fetchExchangeRate(
  targetCurrencyId: number
): Promise<number | null> {
  if (targetCurrencyId === 1) return 1;

  for (const item of RATE_PROBE_ITEMS) {
    try {
      // Sequential calls to avoid double rate-limiting
      const usdRes = await axios.get(
        "https://steamcommunity.com/market/priceoverview/",
        {
          params: { appid: 730, currency: 1, market_hash_name: item },
          timeout: 10000,
        }
      );

      if (!usdRes.data.success) continue;

      // Small delay between requests to avoid rate limit
      await new Promise((r) => setTimeout(r, 1500));

      const targetRes = await axios.get(
        "https://steamcommunity.com/market/priceoverview/",
        {
          params: {
            appid: 730,
            currency: targetCurrencyId,
            market_hash_name: item,
          },
          timeout: 10000,
        }
      );

      if (!targetRes.data.success) continue;

      const usdPrice = parseSteamPrice(
        usdRes.data.lowest_price || usdRes.data.median_price
      );
      const targetPrice = parseSteamPrice(
        targetRes.data.lowest_price || targetRes.data.median_price
      );

      if (!usdPrice || !targetPrice || usdPrice === 0) continue;

      const rate = targetPrice / usdPrice;
      console.log(
        `[Currency] Exchange rate USD → ${getCurrencyInfo(targetCurrencyId)?.code}: ${rate.toFixed(4)} (${item}: $${usdPrice} → ${targetPrice})`
      );
      return rate;
    } catch (err: any) {
      console.warn(
        `[Currency] Rate probe failed for "${item}":`,
        err.response?.status || err.message
      );
      // Wait before trying next item
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  // Fallback: try a forex API
  return fetchForexRate(targetCurrencyId);
}

/**
 * Fallback: get exchange rate from a free forex API.
 * Less accurate than Steam's own rates but always available.
 */
async function fetchForexRate(
  targetCurrencyId: number
): Promise<number | null> {
  const info = getCurrencyInfo(targetCurrencyId);
  if (!info) return null;

  try {
    // Use exchangerate.host (free, no API key required)
    const { data } = await axios.get(
      `https://open.er-api.com/v6/latest/USD`,
      { timeout: 10000 }
    );
    const rate = data.rates?.[info.code];
    if (typeof rate === "number" && rate > 0) {
      console.log(
        `[Currency] Forex fallback rate USD → ${info.code}: ${rate.toFixed(4)}`
      );
      return rate;
    }
    return null;
  } catch (err: any) {
    console.error("[Currency] Forex API failed:", err.message);
    return null;
  }
}

/**
 * Get the exchange rate from USD to a Steam wallet currency.
 * Returns cached value if fresh, otherwise fetches from Steam.
 */
export async function getExchangeRate(
  targetCurrencyId: number
): Promise<number | null> {
  if (targetCurrencyId === 1) return 1;

  const cached = rateCache.get(targetCurrencyId);
  if (cached !== undefined) {
    return cached;
  }

  const rate = await fetchExchangeRate(targetCurrencyId);
  if (rate !== null) {
    rateCache.set(targetCurrencyId, rate);
  }

  return rate;
}

/**
 * Convert USD cents to wallet currency smallest unit.
 * Returns null if conversion is not possible.
 */
export async function convertUsdToWallet(
  usdCents: number,
  walletCurrencyId: number
): Promise<number | null> {
  if (walletCurrencyId === 1) return usdCents; // already USD

  const rate = await getExchangeRate(walletCurrencyId);
  if (rate === null) return null;

  // Convert: walletSmallestUnit = usdCents * rate
  // Both are in "cents" (smallest unit), so the rate maps directly
  const result = Math.round(usdCents * rate);

  // Sanity check: reject obviously wrong conversions (rate drift, float bugs)
  if (rate > 0.001 && rate < 100000 && usdCents > 0) {
    if (result <= 0) {
      console.error(`[Currency] Conversion produced non-positive result: ${usdCents} * ${rate} = ${result}`);
      return null;
    }
  }

  return result;
}

// ─── Wallet currency detection ──────────────────────────────────────────

/**
 * Detect wallet currency from Steam community page HTML.
 * Parses the g_rgWalletInfo JSON embedded in the page.
 */
// Country code → Steam currency ID mapping
const COUNTRY_CURRENCY: Record<string, number> = {
  US: 1, // USD
  GB: 2, UK: 2, // GBP
  // EUR countries
  DE: 3, FR: 3, IT: 3, ES: 3, NL: 3, BE: 3, AT: 3, IE: 3, PT: 3, FI: 3,
  GR: 3, SK: 3, SI: 3, LT: 3, LV: 3, EE: 3, LU: 3, MT: 3, CY: 3, HR: 3,
  RU: 5, BY: 5, // RUB
  PL: 6, // PLN
  BR: 7, // BRL
  JP: 8, // JPY
  NO: 9, // NOK
  ID: 10, // IDR
  MY: 11, // MYR
  PH: 12, // PHP
  SG: 13, // SGD
  TH: 14, // THB
  VN: 15, // VND
  KR: 16, // KRW
  TR: 17, // TRY
  UA: 18, // UAH
  MX: 19, // MXN
  CA: 20, // CAD
  AU: 21, // AUD
  NZ: 22, // NZD
  CN: 23, // CNY
  IN: 24, // INR
  CL: 25, // CLP
  PE: 26, // PEN
  CO: 27, // COP
  ZA: 28, // ZAR
  HK: 29, // HKD
  TW: 30, // TWD
  SA: 31, // SAR
  AE: 32, // AED
  AR: 34, // ARS
  IL: 35, // ILS
  KZ: 37, // KZT
};

/**
 * Detect wallet currency from Steam.
 *
 * Strategy:
 * 1. Try to parse g_rgWalletInfo from a Steam page (market listing, etc.)
 * 2. Try g_nWalletCurrency variable (available even without full wallet info)
 * 3. Fall back to steamCountry cookie → country-currency mapping
 */
export async function detectWalletCurrency(
  steamLoginSecure: string
): Promise<number | null> {
  try {
    // Make a request to Steam to get cookies and potentially wallet info
    const response = await axios.get(
      "https://steamcommunity.com/market/",
      {
        headers: {
          Cookie: `steamLoginSecure=${steamLoginSecure}`,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        },
        maxRedirects: 0,
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    // Strategy 1 & 2: Parse HTML variables (if 200)
    if (response.status !== 200) {
      console.warn(`[Currency] Steam market returned HTTP ${response.status} (expected 200)`);
    }
    if (response.status === 200) {
      const html = response.data as string;

      // Strategy 1: Try g_rgWalletInfo (full wallet object)
      const match = html.match(/g_rgWalletInfo\s*=\s*(\{[^}]+\})/);
      if (match) {
        try {
          const walletInfo = JSON.parse(match[1]);
          const currencyId = walletInfo.wallet_currency;
          if (typeof currencyId === "number" && currencyId > 0) {
            const info = getCurrencyInfo(currencyId);
            console.log(
              `[Currency] Detected from walletInfo: ${info?.code ?? "unknown"} (ID: ${currencyId})`
            );
            return currencyId;
          }
        } catch { /* parse failed, fall through */ }
      }

      // Strategy 2: Try g_nWalletCurrency (scalar, often present even without g_rgWalletInfo)
      const nMatch = html.match(/g_nWalletCurrency\s*=\s*(\d+)/);
      if (nMatch) {
        const currencyId = parseInt(nMatch[1], 10);
        if (currencyId > 0 && STEAM_CURRENCIES[currencyId]) {
          const info = getCurrencyInfo(currencyId);
          console.log(
            `[Currency] Detected from g_nWalletCurrency: ${info?.code ?? "unknown"} (ID: ${currencyId})`
          );
          return currencyId;
        }
      }
    }

    // Strategy 3: Parse steamCountry from Set-Cookie
    const cookies = response.headers["set-cookie"];
    if (cookies) {
      for (const cookie of cookies) {
        const countryMatch = cookie.match(/steamCountry=([A-Z]{2})/);
        if (countryMatch) {
          const countryCode = countryMatch[1];
          const currencyId = COUNTRY_CURRENCY[countryCode];
          if (currencyId) {
            const info = getCurrencyInfo(currencyId);
            console.log(
              `[Currency] Detected from steamCountry=${countryCode}: ${info?.code ?? "unknown"} (ID: ${currencyId})`
            );
            return currencyId;
          }
        }
      }
    }

    const cookieHeader = response.headers["set-cookie"];
    console.warn(
      `[Currency] Could not detect wallet currency from Steam response` +
      ` (status=${response.status}, hasCookies=${!!cookieHeader}, cookieCount=${cookieHeader?.length ?? 0})`
    );
    return null;
  } catch (err: any) {
    console.error("[Currency] Failed to detect wallet currency:", err.message);
    return null;
  }
}

/**
 * Get and cache the wallet currency for an account.
 * First checks DB, then detects from Steam if needed.
 * @param accountId — steam_accounts.id
 */
export async function getWalletCurrency(
  accountId: number,
  _steamLoginSecure?: string
): Promise<number | null> {
  // Return stored currency — no auto-detect (server IP gives wrong country).
  // User sets currency in Settings. Returns null if not set (caller defaults to USD).
  const { rows } = await pool.query(
    "SELECT wallet_currency FROM steam_accounts WHERE id = $1",
    [accountId]
  );
  return rows[0]?.wallet_currency ?? null;
}

/**
 * Get wallet info for API response.
 * @param accountId — steam_accounts.id
 */
export async function getWalletInfo(
  accountId: number
): Promise<{
  currencyId: number;
  code: string;
  symbol: string;
  rate: number | null;
  source: string;
} | null> {
  const { rows } = await pool.query(
    "SELECT wallet_currency, currency_source FROM steam_accounts WHERE id = $1",
    [accountId]
  );
  const currencyId = rows[0]?.wallet_currency;
  if (!currencyId) return null;

  const info = getCurrencyInfo(currencyId);
  if (!info) return null;

  const rate = await getExchangeRate(currencyId);

  return {
    currencyId,
    code: info.code,
    symbol: info.symbol,
    rate,
    source: rows[0].currency_source || "auto",
  };
}

/**
 * Manually set wallet currency for an account.
 * @returns The currency info that was set.
 */
export async function setWalletCurrency(
  accountId: number,
  currencyId: number
): Promise<{ currencyId: number; code: string; symbol: string } | null> {
  const info = getCurrencyInfo(currencyId);
  if (!info) return null;

  await pool.query(
    "UPDATE steam_accounts SET wallet_currency = $1, currency_source = 'manual' WHERE id = $2",
    [currencyId, accountId]
  );

  console.log(
    `[Currency] Manually set for account ${accountId}: ${info.code} (ID: ${currencyId})`
  );

  return { currencyId, code: info.code, symbol: info.symbol };
}

/** All supported Steam currencies for the client to render a picker. */
export function getSteamCurrencies(): Array<{ id: number; code: string; symbol: string }> {
  return Object.entries(STEAM_CURRENCIES).map(([id, info]) => ({
    id: parseInt(id, 10),
    code: info.code,
    symbol: info.symbol,
  }));
}
