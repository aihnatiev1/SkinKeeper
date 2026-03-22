/**
 * Apple App Store Server API client.
 *
 * Validates in-app purchase transactions server-side using Apple's
 * App Store Server API v1. Requires:
 *   - APPLE_KEY_ID: Key ID from App Store Connect
 *   - APPLE_ISSUER_ID: Issuer ID from App Store Connect
 *   - APPLE_PRIVATE_KEY: .p8 key contents (PEM or base64)
 *   - APPLE_BUNDLE_ID: App bundle ID (e.g. app.skinkeeper.store)
 */

import jwt from "jsonwebtoken";
import axios from "axios";

// ─── Config ──────────────────────────────────────────────────────────

const KEY_ID = process.env.APPLE_KEY_ID;
const ISSUER_ID = process.env.APPLE_ISSUER_ID;
const BUNDLE_ID = process.env.APPLE_BUNDLE_ID ?? "app.skinkeeper.store";

function getPrivateKey(): string | null {
  const raw = process.env.APPLE_PRIVATE_KEY;
  if (!raw) return null;
  // Support both raw PEM and base64-encoded PEM
  if (raw.startsWith("-----BEGIN")) return raw;
  return Buffer.from(raw, "base64").toString("utf8");
}

/** Returns true if all required env vars are configured. */
export function isAppleApiConfigured(): boolean {
  return !!(KEY_ID && ISSUER_ID && getPrivateKey());
}

const BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.storekit.itunes.apple.com"
    : "https://api.storekit-sandbox.itunes.apple.com";

// ─── JWT ─────────────────────────────────────────────────────────────

let cachedToken: { jwt: string; expiresAt: number } | null = null;

function createAppleJWT(): string {
  // Reuse token if still valid (>2 min remaining)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 120_000) {
    return cachedToken.jwt;
  }

  const privateKey = getPrivateKey();
  if (!privateKey || !KEY_ID || !ISSUER_ID) {
    throw new Error("Apple API credentials not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      iss: ISSUER_ID,
      iat: now,
      exp: now + 20 * 60, // 20 minutes
      aud: "appstoreconnect-v1",
      bid: BUNDLE_ID,
    },
    privateKey,
    {
      algorithm: "ES256",
      header: { alg: "ES256", kid: KEY_ID, typ: "JWT" },
    }
  );

  cachedToken = { jwt: token, expiresAt: (now + 20 * 60) * 1000 };
  return token;
}

// ─── API ─────────────────────────────────────────────────────────────

export interface AppleTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  bundleId: string;
  purchaseDate: number; // ms since epoch
  expiresDate: number | null; // ms since epoch, null for consumables
  environment: "Production" | "Sandbox";
  revocationDate?: number;
}

/**
 * Get transaction info from Apple App Store Server API.
 * Verifies the transaction exists and belongs to our app.
 */
export async function getTransactionInfo(
  transactionId: string
): Promise<AppleTransactionInfo | null> {
  try {
    const token = createAppleJWT();

    const { data } = await axios.get(
      `${BASE_URL}/inApps/v1/transactions/${transactionId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      }
    );

    // Response contains signedTransactionInfo as a JWS (3-part dot-separated)
    const jws: string = data.signedTransactionInfo;
    if (!jws) {
      console.error("[Apple] No signedTransactionInfo in response");
      return null;
    }

    // Decode JWS payload (we trust Apple's signature — the response came over TLS from Apple's server)
    const parts = jws.split(".");
    if (parts.length !== 3) {
      console.error("[Apple] Invalid JWS format");
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );

    // Validate bundle ID
    if (payload.bundleId !== BUNDLE_ID) {
      console.error(
        `[Apple] Bundle ID mismatch: ${payload.bundleId} !== ${BUNDLE_ID}`
      );
      return null;
    }

    // Check for revocation
    if (payload.revocationDate) {
      console.warn(
        `[Apple] Transaction ${transactionId} was revoked at ${payload.revocationDate}`
      );
    }

    return {
      transactionId: payload.transactionId ?? payload.originalTransactionId,
      originalTransactionId: payload.originalTransactionId,
      productId: payload.productId,
      bundleId: payload.bundleId,
      purchaseDate: payload.purchaseDate,
      expiresDate: payload.expiresDate ?? null,
      environment: payload.environment,
      revocationDate: payload.revocationDate,
    };
  } catch (err: any) {
    if (err.response?.status === 404) {
      console.warn(`[Apple] Transaction ${transactionId} not found`);
      return null;
    }
    console.error(
      `[Apple] Failed to get transaction info:`,
      err.response?.status || err.message
    );
    return null;
  }
}
