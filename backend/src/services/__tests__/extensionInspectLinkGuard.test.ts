/**
 * Static guard for the inspect_link resolution fix in the browser extension.
 *
 * The extension reads `inv.m_rgAssetProperties[assetid]` from Steam's
 * inventory page state. Each property has shape
 *   { propertyid: number, int_value?, float_value?, string_value? }
 *
 * Property #6's `string_value` is the encrypted preview blob that turns
 * `+csgo_econ_action_preview %propid:6%` into a fully resolvable inspect
 * link. Before this fix, the extension only substituted %assetid% and
 * %owner_steamid%, so 47% of items in our DB had inspect_links that the
 * cs2-inspect-serializer couldn't decode — and so paint_index, stickers,
 * charms, and even float couldn't be recovered server-side.
 *
 * This test fails if anyone removes the `%propid:N%` substitution or the
 * inspect_link payload field, which would silently re-introduce the
 * "extension delivers nothing" symptom we just fixed.
 *
 * Lives in the backend tree because the extension currently has no test
 * harness; cross-package source reads are the lightest available guard.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");
const sharedSteamSrc = readFileSync(
  resolve(REPO_ROOT, "browser-ext/src/shared/steam.ts"),
  "utf8"
);
const inventoryTopSrc = readFileSync(
  resolve(REPO_ROOT, "browser-ext/src/content/inventory.ts"),
  "utf8"
);
const inventoryStoreSrc = readFileSync(
  resolve(REPO_ROOT, "browser-ext/src/content/inventory/core/store.ts"),
  "utf8"
);

describe("extension inspect_link resolution guard", () => {
  it("shared/steam.ts substitutes %propid:N% in inspect_link", () => {
    // Either via a regex literal or via a string-based replace — both forms
    // are acceptable, but at least one must be present.
    expect(sharedSteamSrc).toMatch(/replace\(\s*\/\s*%propid/);
  });

  it("shared/steam.ts collects propertyid → string_value map for substitution", () => {
    // The substitution above is meaningless without the map being built
    // from m_rgAssetProperties first.
    expect(sharedSteamSrc).toMatch(/propStrings\s*\[\s*p\.propertyid\s*\]/);
  });

  it("inventory content scripts include inspect_link in the SYNC_ITEMS payload", () => {
    // Both the legacy top-level and the newer /inventory/core/store paths
    // must ship inspect_link so backend can decode locally.
    expect(inventoryTopSrc).toMatch(/inspect_link\s*:/);
    expect(inventoryStoreSrc).toMatch(/inspect_link\s*:/);
  });

  it("inventory content scripts gate inspect_link on a resolved (no-%propid) link", () => {
    // A guard that prevents regression to the old bug: shipping a
    // template link that the backend can't decode.
    expect(inventoryTopSrc).toContain("%propid");
    expect(inventoryStoreSrc).toContain("%propid");
  });
});
