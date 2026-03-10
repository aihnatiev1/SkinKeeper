import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import {
  PRODUCT_IDS,
  verifyAppleReceipt,
  verifyGoogleReceipt,
  activatePremium,
  getSubscriptionStatus,
} from "../services/purchases.js";

const router = Router();

// GET /api/purchases/products — return available product IDs
router.get("/products", (_req, res: Response) => {
  res.json({
    products: PRODUCT_IDS,
    monthly: "skinkeeper_pro_monthly",
    yearly: "skinkeeper_pro_yearly",
    pricing: {
      monthly: { price: 4.99, currency: "USD" },
      yearly: { price: 29.99, currency: "USD" },
    },
  });
});

// POST /api/purchases/verify — verify receipt and activate premium
router.post(
  "/verify",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { store, receiptData, purchaseToken, productId } = req.body;

      if (!store || !["apple", "google"].includes(store)) {
        res.status(400).json({ error: "Invalid store (apple or google)" });
        return;
      }

      let result;

      if (store === "apple") {
        if (!receiptData) {
          res.status(400).json({ error: "Missing receiptData" });
          return;
        }
        result = await verifyAppleReceipt(receiptData);
      } else {
        if (!purchaseToken || !productId) {
          res
            .status(400)
            .json({ error: "Missing purchaseToken or productId" });
          return;
        }
        result = await verifyGoogleReceipt(purchaseToken, productId);
      }

      if (!result.valid) {
        res.status(400).json({ error: result.error || "Invalid receipt" });
        return;
      }

      await activatePremium(req.userId!, store, result);

      console.log(
        `[Purchase] User ${req.userId} activated premium via ${store}: ${result.productId}`
      );

      const status = await getSubscriptionStatus(req.userId!);
      res.json({ success: true, subscription: status });
    } catch (err) {
      console.error("Purchase verification error:", err);
      res.status(500).json({ error: "Failed to verify purchase" });
    }
  }
);

// GET /api/purchases/status — get subscription status
router.get(
  "/status",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const status = await getSubscriptionStatus(req.userId!);
      res.json(status);
    } catch (err) {
      console.error("Subscription status error:", err);
      res.status(500).json({ error: "Failed to get status" });
    }
  }
);

// POST /api/purchases/restore — restore purchases (re-verify existing receipts)
router.post(
  "/restore",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { store, receiptData, purchaseToken, productId } = req.body;

      if (!store) {
        res.status(400).json({ error: "Missing store" });
        return;
      }

      let result;
      if (store === "apple") {
        result = await verifyAppleReceipt(receiptData);
      } else {
        result = await verifyGoogleReceipt(purchaseToken, productId);
      }

      if (!result.valid) {
        res.status(400).json({ error: "No valid purchase found" });
        return;
      }

      await activatePremium(req.userId!, store, result);

      const status = await getSubscriptionStatus(req.userId!);
      res.json({ success: true, subscription: status });
    } catch (err) {
      console.error("Restore error:", err);
      res.status(500).json({ error: "Failed to restore purchase" });
    }
  }
);

export default router;
