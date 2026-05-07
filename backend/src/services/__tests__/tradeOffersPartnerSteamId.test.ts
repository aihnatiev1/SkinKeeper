/**
 * Regression guard for the `[Trade] History HTML upsert failed: value too
 * long for type character varying(17)` bug.
 *
 * The schema has:
 *   trade_offers.partner_steam_id  VARCHAR(17)   — actual 17-digit Steam ID
 *   trade_offers.partner_name      VARCHAR(100)  — display name
 *
 * Two upsert paths used `trade.partnerSteamId || trade.partnerName` for the
 * partner_steam_id column. When partnerSteamId was missing (HTML scrape
 * couldn't find a /profiles/<id> link, or GetTradeOffers returned a
 * partner whose 64-bit ID didn't fit), the partner's display name (up to
 * 100 chars) was written into the 17-char column. Postgres rejected the
 * row, the trade was silently dropped, and the user saw nothing.
 *
 * This test is a static guard: re-introducing the `|| trade.partnerName`
 * or `|| offer.partnerName` shape into a partner_steam_id slot will fail
 * the test. We assert against the source rather than a mocked DB so the
 * guard fires regardless of whether anyone wires up the integration.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tradeOffersSrc = readFileSync(
  resolve(here, "../tradeOffers.ts"),
  "utf8"
);

describe("trade_offers.partner_steam_id varchar(17) guard", () => {
  it("does not fall back to partnerName for partner_steam_id", () => {
    // The bug pattern. Either fallback (`|| offer.partnerName` or
    // `|| trade.partnerName`) used as a partner_steam_id value would
    // re-introduce the silent-row-drop crash.
    const badPatterns = [
      /partnerSteamId\s*\|\|\s*offer\.partnerName/,
      /partnerSteamId\s*\|\|\s*trade\.partnerName/,
    ];
    for (const pat of badPatterns) {
      expect(tradeOffersSrc).not.toMatch(pat);
    }
  });

  it("uses null as the explicit fallback for missing Steam IDs", () => {
    // Both upsert paths should now read `partnerSteamId || null` so the
    // database column receives either a real 17-digit ID or NULL, never
    // an overflowing display name.
    expect(tradeOffersSrc).toMatch(/offer\.partnerSteamId\s*\|\|\s*null/);
    expect(tradeOffersSrc).toMatch(/trade\.partnerSteamId\s*\|\|\s*null/);
  });

  it("documents the partner_steam_id contract in code comments", () => {
    // A short comment near each fallback explains *why* — protects the
    // next person from "fixing" the null fallback by re-adding partnerName.
    expect(tradeOffersSrc).toContain("partner_steam_id holds a real 17-digit Steam ID");
  });
});
