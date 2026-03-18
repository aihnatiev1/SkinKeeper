/**
 * Zod validation schemas for all route inputs.
 * Used with validateBody/validateQuery from validate.ts.
 */
import { z } from "zod";

// ─── Alerts ──────────────────────────────────────────────────────────────

export const createAlertSchema = z.object({
  market_hash_name: z.string().min(1).max(255),
  condition: z.enum(["above", "below", "changePct", "bargain", "sellNow", "arbitrage"]),
  threshold: z.number().positive(),
  source: z.enum(["steam", "skinport", "csfloat", "dmarket", "any"]).optional().default("any"),
  cooldown_minutes: z.number().int().min(1).max(1440).optional().default(60),
});

export const toggleAlertSchema = z.object({
  is_active: z.boolean(),
});

export const registerDeviceSchema = z.object({
  fcm_token: z.string().min(1),
  platform: z.string().min(1).max(10),
  push_prefs: z.record(z.string(), z.boolean()).optional(),
});

// ─── Trades ──────────────────────────────────────────────────────────────

export const sendTradeSchema = z.object({
  partnerSteamId: z.string().regex(/^\d{17}$/, "Must be a 17-digit Steam ID"),
  tradeToken: z.string().max(20).optional(),
  itemsToGive: z.array(z.object({
    assetId: z.string().min(1),
    marketHashName: z.string().optional(),
    iconUrl: z.string().optional(),
    floatValue: z.number().optional(),
    priceCents: z.number().int().optional(),
  })).max(256).default([]),
  itemsToReceive: z.array(z.object({
    assetId: z.string().min(1),
    marketHashName: z.string().optional(),
    iconUrl: z.string().optional(),
    floatValue: z.number().optional(),
    priceCents: z.number().int().optional(),
  })).max(256).default([]),
  message: z.string().max(256).optional(),
  isQuickTransfer: z.boolean().optional(),
});

export const quickTransferSchema = z.object({
  fromAccountId: z.number().int().positive(),
  toAccountId: z.number().int().positive(),
  items: z.array(z.object({
    assetId: z.string().min(1),
    marketHashName: z.string().optional(),
    priceCents: z.number().int().optional(),
  })).min(1).max(256),
});

export const tradeTokenSchema = z.object({
  tradeToken: z.string().min(1).max(20),
});

// ─── Market / Sell ───────────────────────────────────────────────────────

export const sellOperationSchema = z.object({
  items: z.array(z.object({
    assetId: z.string().min(1),
    marketHashName: z.string().min(1),
    priceCents: z.number().int().min(1).max(100_000_000),
    accountId: z.number().int().positive().optional(),
  })).min(1).max(50),
});

export const sellItemSchema = z.object({
  assetId: z.string().min(1),
  priceInCents: z.number().int().min(1).max(100_000_000),
  accountId: z.union([z.string(), z.number()]).optional(),
});

export const sessionCookiesSchema = z.object({
  sessionId: z.string().min(1),
  steamLoginSecure: z.string().min(1),
  accountId: z.union([z.string(), z.number()]).optional(),
});

export const clientTokenSchema = z.object({
  steamid: z.string().min(1),
  token: z.string().min(1),
  accountId: z.union([z.string(), z.number()]).optional(),
});

// ─── Transactions ────────────────────────────────────────────────────────

export const transactionQuerySchema = z.object({
  type: z.enum(["buy", "sell", "trade"]).optional(),
  item: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const manualTransactionSchema = z.object({
  marketHashName: z.string().min(1).max(255),
  priceCents: z.number().int().min(1).max(10_000_000),
  type: z.enum(["buy", "sell"]).optional().default("buy"),
  date: z.string().optional(),
  source: z.string().max(20).optional().default("manual"),
  note: z.string().max(250).optional(),
  iconUrl: z.string().optional(),
  portfolioId: z.number().int().positive().optional(),
});

export const batchManualSchema = z.object({
  marketHashName: z.string().min(1).max(255),
  priceCentsPerUnit: z.number().int().min(1).max(10_000_000),
  quantity: z.number().int().min(1).max(100000).optional().default(1),
  type: z.enum(["buy", "sell"]).optional().default("buy"),
  date: z.string().optional(),
  source: z.string().max(20).optional().default("manual"),
  note: z.string().max(250).optional(),
  iconUrl: z.string().optional(),
  portfolioId: z.number().int().positive().optional(),
});

export const csvImportSchema = z.object({
  rows: z.array(z.object({
    marketHashName: z.string().min(1),
    priceCents: z.number().int().min(1),
    type: z.enum(["buy", "sell"]).optional().default("buy"),
    date: z.string().optional(),
    source: z.string().max(20).optional().default("csv"),
    note: z.string().max(500).optional(),
  })).min(1).max(500),
});

// ─── Portfolio ───────────────────────────────────────────────────────────

export const plHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

// ─── Prices ──────────────────────────────────────────────────────────────

export const batchPricesSchema = z.object({
  names: z.array(z.string().min(1)).max(500),
});

export const priceHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

// ─── Inventory ───────────────────────────────────────────────────────────

export const inventoryQuerySchema = z.object({
  accountId: z.coerce.number().int().positive().optional(),
});

export const inspectBatchSchema = z.object({
  assetIds: z.array(z.string().min(1)).min(1).max(20),
});

// ─── Export ──────────────────────────────────────────────────────────────

export const exportQuerySchema = z.object({
  type: z.enum(["all", "buy", "sell"]).optional().default("all"),
  from: z.string().optional(),
  to: z.string().optional(),
});

// ─── Trades Query ────────────────────────────────────────────────────────

export const tradesListQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
