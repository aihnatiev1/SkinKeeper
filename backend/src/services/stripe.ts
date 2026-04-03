import Stripe from "stripe";
import { pool } from "../db/pool.js";
import { invalidatePremiumCache } from "../middleware/auth.js";

// Lazy-initialized Stripe instance
let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
  }
  return stripe;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// Price IDs from Stripe Dashboard — set these in .env
const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY || "",
  yearly: process.env.STRIPE_PRICE_YEARLY || "",
};

// ─── Customer Management ──────────────────────────────────────────────

async function getOrCreateCustomer(userId: number): Promise<string> {
  // Check if user already has a Stripe customer ID
  const { rows } = await pool.query(
    `SELECT stripe_customer_id, steam_id, display_name FROM users WHERE id = $1`,
    [userId]
  );

  if (!rows[0]) throw new Error("User not found");

  if (rows[0].stripe_customer_id) {
    return rows[0].stripe_customer_id;
  }

  // Create Stripe customer
  const customer = await getStripe().customers.create({
    metadata: {
      skinkeeper_user_id: String(userId),
      steam_id: rows[0].steam_id,
    },
    name: rows[0].display_name || undefined,
  });

  // Save customer ID
  await pool.query(
    `UPDATE users SET stripe_customer_id = $2 WHERE id = $1`,
    [userId, customer.id]
  );

  return customer.id;
}

// ─── Checkout Session ─────────────────────────────────────────────────

export async function createCheckoutSession(
  userId: number,
  plan: "monthly" | "yearly",
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string; sessionId: string }> {
  const priceId = PRICE_IDS[plan];
  if (!priceId) throw new Error(`Price ID not configured for ${plan}`);

  const customerId = await getOrCreateCustomer(userId);

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      skinkeeper_user_id: String(userId),
      plan,
    },
    subscription_data: {
      metadata: {
        skinkeeper_user_id: String(userId),
        plan,
      },
    },
    allow_promotion_codes: true,
  });

  return { url: session.url!, sessionId: session.id };
}

// ─── Customer Portal ──────────────────────────────────────────────────

export async function createPortalSession(
  userId: number,
  returnUrl: string
): Promise<string> {
  const customerId = await getOrCreateCustomer(userId);

  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

// ─── Webhook Event Handling ───────────────────────────────────────────

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
      break;

    case "customer.subscription.updated":
      await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    case "invoice.payment_succeeded":
      await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;

    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    default:
      console.log(`[Stripe] Unhandled event type: ${event.type}`);
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.skinkeeper_user_id;
  if (!userId) {
    console.warn("[Stripe] Checkout session missing skinkeeper_user_id");
    return;
  }

  const subscriptionId = session.subscription as string;
  if (!subscriptionId) return;

  // Fetch the subscription to get dates
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  await activateStripeSubscription(parseInt(userId), subscription);

  console.log(`[Stripe] Checkout complete: user=${userId} sub=${subscriptionId}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.skinkeeper_user_id;
  if (!userId) return;

  if (subscription.status === "active" || subscription.status === "trialing") {
    await activateStripeSubscription(parseInt(userId), subscription);
  } else if (subscription.status === "past_due" || subscription.status === "unpaid") {
    console.log(`[Stripe] Subscription ${subscription.status}: user=${userId}`);
    // Keep premium active during grace period — Stripe handles retry
  } else {
    // canceled, incomplete_expired, etc.
    await deactivateStripePremium(parseInt(userId), subscription.id);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.skinkeeper_user_id;
  if (!userId) return;

  await deactivateStripePremium(parseInt(userId), subscription.id);
  console.log(`[Stripe] Subscription deleted: user=${userId} sub=${subscription.id}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const sub = invoice.parent?.subscription_details;
  const subscriptionId = sub?.subscription as string | undefined;
  if (!subscriptionId) return;

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const userId = subscription.metadata?.skinkeeper_user_id;
  if (!userId) return;

  await activateStripeSubscription(parseInt(userId), subscription);
  console.log(`[Stripe] Payment succeeded: user=${userId} sub=${subscriptionId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const sub = invoice.parent?.subscription_details;
  const subscriptionId = sub?.subscription as string | undefined;
  if (!subscriptionId) return;

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const userId = subscription.metadata?.skinkeeper_user_id;
  if (!userId) return;

  console.warn(`[Stripe] Payment failed: user=${userId} sub=${subscriptionId} attempt=${invoice.attempt_count}`);
}

// ─── Activate/Deactivate Helpers ──────────────────────────────────────

async function activateStripeSubscription(
  userId: number,
  subscription: Stripe.Subscription
): Promise<void> {
  const item = subscription.items.data[0];
  const priceId = item?.price?.id;
  const productId = priceId === PRICE_IDS.monthly
    ? "skinkeeper_pro_monthly"
    : priceId === PRICE_IDS.yearly
      ? "skinkeeper_pro_yearly"
      : "skinkeeper_pro_unknown";

  // current_period_end lives on SubscriptionItem in newer Stripe API versions
  const periodEnd = item?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 86400;
  const currentPeriodEnd = new Date(periodEnd * 1000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Save/update receipt
    await client.query(
      `INSERT INTO purchase_receipts
        (user_id, store, product_id, transaction_id, original_transaction_id,
         purchase_date, expires_date, is_trial)
       VALUES ($1, 'stripe', $2, $3, $3, NOW(), $4, $5)
       ON CONFLICT (transaction_id) DO UPDATE SET
         expires_date = EXCLUDED.expires_date,
         verified_at = NOW()`,
      [
        userId,
        productId,
        subscription.id,
        currentPeriodEnd,
        subscription.status === "trialing",
      ]
    );

    // Activate premium
    await client.query(
      `UPDATE users SET is_premium = TRUE, premium_until = $2 WHERE id = $1`,
      [userId, currentPeriodEnd]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  invalidatePremiumCache(userId);
}

async function deactivateStripePremium(
  userId: number,
  subscriptionId: string
): Promise<void> {
  // Only deactivate if current subscription matches
  const { rows } = await pool.query(
    `SELECT id FROM purchase_receipts
     WHERE user_id = $1 AND store = 'stripe' AND transaction_id = $2`,
    [userId, subscriptionId]
  );

  if (rows.length === 0) return; // Not our subscription

  await pool.query(
    `UPDATE users SET is_premium = FALSE WHERE id = $1`,
    [userId]
  );

  invalidatePremiumCache(userId);
  console.log(`[Stripe] Premium deactivated: user=${userId}`);
}

// ─── Construct Webhook Event ──────────────────────────────────────────

export function constructWebhookEvent(
  body: Buffer,
  signature: string
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  return getStripe().webhooks.constructEvent(body, signature, secret);
}
