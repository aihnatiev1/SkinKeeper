/**
 * /api/users — authenticated user-scoped endpoints (non-admin).
 *
 * Currently exposes the resolved feature flag map for the requesting user.
 * The Flutter client polls this on app launch (and after auth) and on the
 * 5-min cadence shared with the backend service-level cache.
 */
import crypto from "crypto";
import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { getFeatureFlagsForUser } from "../services/featureFlags.js";

const router = Router();

/**
 * GET /api/users/feature-flags
 *
 * Auth: requires JWT (no premium gate — free users also need to know which
 * features are available so the UI can render the correct CTA).
 *
 * Response shape:
 *   {
 *     flags: { auto_sell: bool, smart_alerts: bool, tour: bool, ... },
 *     version: string  // sha256 hash of stable JSON of `flags`
 *   }
 *
 * `version` is an ETag-style fingerprint so the Flutter client can decide if
 * its cached map is still current. We do NOT compute server-side ETag matching
 * here — Flutter just compares its previously-stored version against the new
 * one to know whether to invalidate dependent providers.
 *
 * Cache: response carries `Cache-Control: private, max-age=300` (5 min, same
 * window as the in-memory TTLCache inside `getFeatureFlagsForUser`). We do not
 * add a second layer here — the service-level cache is sufficient and avoids
 * a stampede-on-restart problem that a separate route-level cache would have.
 *
 * No admin-only fields (raw overrides, bucket, kill-switch state) leak into
 * the response — those live on the admin endpoint only.
 */
router.get(
  "/feature-flags",
  authMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    try {
      const flags = await getFeatureFlagsForUser(req.userId);
      // Stable stringify (sorted keys) so version is deterministic across runs.
      const stable = JSON.stringify(
        Object.keys(flags)
          .sort()
          .reduce<Record<string, boolean>>((acc, k) => {
            acc[k] = flags[k] === true;
            return acc;
          }, {})
      );
      const version = crypto.createHash("sha256").update(stable).digest("hex").slice(0, 16);

      res.setHeader("Cache-Control", "private, max-age=300");
      res.json({ flags, version });
    } catch (err: any) {
      console.error("[users/feature-flags] error:", err);
      res.status(500).json({ error: "Failed to load feature flags" });
    }
  }
);

export default router;
