import { Router, Request, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import {
  isStripeConfigured,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
  handleWebhookEvent,
} from "../services/stripe.js";
import { getSubscriptionStatus } from "../services/purchases.js";

const router = Router();

// POST /api/stripe/checkout — create Stripe Checkout session
router.post(
  "/checkout",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Stripe not configured" });
        return;
      }

      const { plan } = req.body;
      if (!plan || !["monthly", "yearly"].includes(plan)) {
        res.status(400).json({ error: "Invalid plan (monthly or yearly)" });
        return;
      }

      // Build URLs — support both web and desktop
      const origin = req.headers.origin || process.env.WEB_APP_URL || "http://localhost:3001";
      const successUrl = `${origin}/settings?stripe=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}/settings?stripe=cancelled`;

      const { url, sessionId } = await createCheckoutSession(
        req.userId!,
        plan,
        successUrl,
        cancelUrl
      );

      res.json({ url, sessionId });
    } catch (err: any) {
      console.error("[Stripe] Checkout error:", err);
      res.status(500).json({ error: err.message || "Failed to create checkout" });
    }
  }
);

// POST /api/stripe/portal — create Stripe Customer Portal session
router.post(
  "/portal",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Stripe not configured" });
        return;
      }

      const origin = req.headers.origin || process.env.WEB_APP_URL || "http://localhost:3001";
      const returnUrl = `${origin}/settings`;

      const url = await createPortalSession(req.userId!, returnUrl);
      res.json({ url });
    } catch (err: any) {
      console.error("[Stripe] Portal error:", err);
      res.status(500).json({ error: err.message || "Failed to create portal session" });
    }
  }
);

// GET /api/stripe/status — get Stripe subscription status
router.get(
  "/status",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const status = await getSubscriptionStatus(req.userId!);
      res.json(status);
    } catch (err) {
      console.error("[Stripe] Status error:", err);
      res.status(500).json({ error: "Failed to get status" });
    }
  }
);

// POST /api/stripe/webhook — Stripe webhook handler (no auth — verified by signature)
// IMPORTANT: This needs raw body, not JSON-parsed
router.post(
  "/webhook",
  async (req: Request, res: Response) => {
    try {
      const signature = req.headers["stripe-signature"] as string;
      if (!signature) {
        res.status(400).json({ error: "Missing stripe-signature" });
        return;
      }

      const event = constructWebhookEvent(req.body, signature);
      await handleWebhookEvent(event);

      res.json({ received: true });
    } catch (err: any) {
      console.error("[Stripe] Webhook error:", err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

export default router;
