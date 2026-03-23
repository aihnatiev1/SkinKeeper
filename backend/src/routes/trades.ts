import { Router, Response, NextFunction } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { sendTradeSchema, quickTransferSchema, tradeTokenSchema, tradesListQuerySchema } from "../middleware/schemas.js";
import {
  createAndSendOffer,
  acceptOffer,
  declineOffer,
  cancelOffer,
  listOffers,
  getOffer,
  analyzeTradeOffer,
  fetchPartnerInventory,
  fetchTradeToken,
  syncTradeOffers,
  type CreateTradeInput,
} from "../services/tradeOffers.js";
import { fetchSteamFriends } from "../services/steam.js";
import { SteamSessionService } from "../services/steamSession.js";
import { pool } from "../db/pool.js";

const router = Router();

// ─── Friends List (must be before /:id to avoid route conflict) ─────────

/**
 * GET /api/trades/friends
 * Fetch user's Steam friends list with profiles and online status.
 */
router.get(
  "/friends",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      // Get steam_id from active account (respects account switch)
      const accountId = await SteamSessionService.getActiveAccountId(req.userId!);
      const { rows } = await pool.query(
        `SELECT steam_id FROM steam_accounts WHERE id = $1`,
        [accountId]
      );
      if (rows.length === 0) {
        res.status(404).json({ error: "No active account found" });
        return;
      }

      const friends = await fetchSteamFriends(rows[0].steam_id);
      res.json({ friends, count: friends.length });
    } catch (err: any) {
      // Private friends list returns 401 from Steam
      if (err.response?.status === 401) {
        res.status(403).json({
          error: "Friends list is private. Make it public in Steam privacy settings.",
        });
        return;
      }
      console.error("Friends list error:", err);
      res.status(500).json({ error: "Failed to load friends list" });
    }
  }
);

// ─── Linked Accounts (must be before /:id to avoid route conflict) ──────

/**
 * GET /api/trades/accounts
 * List user's linked accounts with trade token status.
 */
router.get(
  "/accounts",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, steam_id, display_name, avatar_url,
                trade_token IS NOT NULL AS has_trade_token
         FROM steam_accounts WHERE user_id = $1
         ORDER BY id`,
        [req.userId!]
      );
      res.json({ accounts: rows });
    } catch (err) {
      console.error("List accounts error:", err);
      res.status(500).json({ error: "Failed to list accounts" });
    }
  }
);

/**
 * PUT /api/trades/accounts/:id/trade-token
 * Set trade token for a linked account.
 * Body: { tradeToken }
 */
router.put(
  "/accounts/:id/trade-token",
  authMiddleware,
  validateBody(tradeTokenSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { tradeToken } = req.body;

      const { rowCount } = await pool.query(
        `UPDATE steam_accounts SET trade_token = $1
         WHERE id = $2 AND user_id = $3`,
        [tradeToken, req.params.id as string, req.userId!]
      );

      if (!rowCount || rowCount === 0) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Set trade token error:", err);
      res.status(500).json({ error: "Failed to set trade token" });
    }
  }
);

// ─── Partner Inventory (must be before /:id) ─────────────────────────────

/**
 * GET /api/trades/partner-inventory/:steamId
 * Load a partner's CS2 inventory for trade item selection.
 */
router.get(
  "/partner-inventory/:steamId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const steamId = req.params.steamId as string;
      console.log(`[Trade] Fetching partner inventory for ${steamId}`);
      const items = await fetchPartnerInventory(steamId);
      console.log(`[Trade] Partner inventory: ${items.length} tradable items for ${steamId}`);
      res.json({ items, count: items.length });
    } catch (err: any) {
      console.error("Partner inventory error:", err.message);
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message || "Failed to load partner inventory" });
    }
  }
);

// ─── Trade Offer Sync ─────────────────────────────────────────────────────

/**
 * POST /api/trades/sync
 * Sync trade offers from Steam into local DB.
 */
router.post(
  "/sync",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await syncTradeOffers(req.userId!);
      res.json(result);
    } catch (err) {
      console.error("Trade sync error:", err);
      res.status(500).json({ error: "Failed to sync trade offers" });
    }
  }
);

// ─── Trade Offers CRUD ───────────────────────────────────────────────────

/**
 * GET /api/trades
 * List trade offers. Optional ?status=pending filter.
 * Auto-syncs from Steam on first page load (offset=0).
 */
router.get("/", authMiddleware, validateQuery(tradesListQuerySchema), async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = req.query.limit as unknown as number;
    const offset = req.query.offset as unknown as number;
    const accountIdParam = req.query.accountId as string | undefined;
    const accountId = accountIdParam ? parseInt(accountIdParam) : undefined;

    // Auto-sync on first page load (fire and forget to avoid slowing response)
    if (offset === 0) {
      syncTradeOffers(req.userId!).catch((err) =>
        console.error("[Trade] Background sync error:", err.message)
      );
    }

    const result = await listOffers(req.userId!, status, limit, offset, accountId);
    res.json(result);
  } catch (err) {
    console.error("List trade offers error:", err);
    res.status(500).json({ error: "Failed to list trade offers" });
  }
});

/**
 * GET /api/trades/:id/analysis
 * Analyze a trade offer: give/recv values, diff, verdict.
 */
router.get(
  "/:id/analysis",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const analysis = await analyzeTradeOffer(req.params.id as string, req.userId!);
      if (!analysis) {
        res.status(404).json({ error: "Trade offer not found" });
        return;
      }
      res.json(analysis);
    } catch (err) {
      console.error("Trade analysis error:", err);
      res.status(500).json({ error: "Failed to analyze trade" });
    }
  }
);

/**
 * GET /api/trades/:id
 * Get a single trade offer with items.
 */
router.get("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const offer = await getOffer(req.params.id as string, req.userId!);
    if (!offer) {
      res.status(404).json({ error: "Trade offer not found" });
      return;
    }
    res.json(offer);
  } catch (err) {
    console.error("Get trade offer error:", err);
    res.status(500).json({ error: "Failed to get trade offer" });
  }
});

/**
 * POST /api/trades/send
 * Create and send a new trade offer.
 * Body: { partnerSteamId, tradeToken, itemsToGive, itemsToReceive, message?, isQuickTransfer? }
 */
router.post(
  "/send",
  authMiddleware,
  validateBody(sendTradeSchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const input = req.body as CreateTradeInput;

      if (input.itemsToGive.length === 0 && input.itemsToReceive.length === 0) {
        res.status(400).json({ error: "At least one side must have items" });
        return;
      }

      const offer = await createAndSendOffer(req.userId!, input);
      res.json(offer);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/trades/:id/accept
 * Fast accept — no review, just accept.
 */
router.post(
  "/:id/accept",
  authMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await acceptOffer(req.userId!, req.params.id as string);
      res.json({
        status: "accepted",
        needsConfirmation: result.needsConfirmation,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/trades/:id/decline
 * Fast decline — no review, just decline.
 */
router.post(
  "/:id/decline",
  authMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      await declineOffer(req.userId!, req.params.id as string);
      res.json({ status: "declined" });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/trades/:id/cancel
 * Cancel an outgoing trade offer.
 */
router.post(
  "/:id/cancel",
  authMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      await cancelOffer(req.userId!, req.params.id as string);
      res.json({ status: "cancelled" });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Quick Transfer (own accounts) ───────────────────────────────────────

/**
 * POST /api/trades/quick-transfer
 * Transfer items between user's own linked accounts.
 * Body: { fromAccountId, toAccountId, items: [{ assetId, marketHashName?, priceCents? }] }
 */
router.post(
  "/quick-transfer",
  authMiddleware,
  validateBody(quickTransferSchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { fromAccountId, toAccountId, items } = req.body;

      // Verify both accounts belong to this user
      const { rows: accounts } = await pool.query(
        `SELECT id, steam_id, trade_token FROM steam_accounts
         WHERE user_id = $1 AND id IN ($2, $3)`,
        [req.userId!, fromAccountId, toAccountId]
      );

      if (accounts.length !== 2) {
        res.status(400).json({ error: "Invalid accounts" });
        return;
      }

      const toAccount = accounts.find((a) => a.id === toAccountId);
      if (!toAccount) {
        res.status(400).json({ error: "Receiving account not found" });
        return;
      }

      // Auto-fetch trade token if not stored
      let tradeToken = toAccount.trade_token;
      if (!tradeToken) {
        const toSession = await SteamSessionService.getSession(toAccountId);
        if (toSession) {
          tradeToken = await fetchTradeToken(toSession);
          if (tradeToken) {
            // Save for future use
            await pool.query(
              `UPDATE steam_accounts SET trade_token = $1 WHERE id = $2`,
              [tradeToken, toAccountId]
            );
          }
        }
      }

      // Create trade offer: give items from sender, receive nothing
      const offer = await createAndSendOffer(req.userId!, {
        partnerSteamId: toAccount.steam_id,
        tradeToken: tradeToken || undefined,
        itemsToGive: items.map((i: { assetId: string; marketHashName?: string; priceCents?: number }) => ({
          assetId: i.assetId,
          marketHashName: i.marketHashName,
          priceCents: i.priceCents,
        })),
        itemsToReceive: [],
        message: `SkinKeeper quick transfer`,
        isQuickTransfer: true,
      });

      res.json(offer);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
