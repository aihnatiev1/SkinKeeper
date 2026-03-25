import { Response, NextFunction } from "express";
import { AuthRequest, DEMO_STEAM_ID } from "./auth.js";

/**
 * Middleware that returns fake success responses for demo user
 * on endpoints that require real Steam session.
 * Attach to routes that would otherwise fail for demo accounts.
 */
export function demoStub(fakeResponse: Record<string, unknown>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.isDemo) {
      res.json(fakeResponse);
      return;
    }
    next();
  };
}

/** Stubs for specific endpoints */
export const demoStubs = {
  // POST /inventory/refresh
  inventoryRefresh: demoStub({ success: true, total_items: 5 }),

  // POST /transactions/sync
  transactionSync: demoStub({ success: true, fetched: 0, newCount: 0, elapsed: 0.1 }),

  // POST /trades/sync
  tradeSync: demoStub({ synced: 0 }),

  // POST /trades/send
  tradeSend: demoStub({
    id: "demo_trade",
    direction: "outgoing",
    status: "pending",
    partnerSteamId: "76561198012345678",
    partnerName: "TradeBot",
    message: "Demo trade",
    isQuickTransfer: false,
    isInternal: false,
    items: [],
    valueGiveCents: 0,
    valueRecvCents: 0,
    createdAt: new Date().toISOString(),
  }),

  // POST /trades/:id/accept, decline, cancel
  tradeAction: demoStub({ success: true }),

  // POST /market/sell-operation
  sellOperation: demoStub({
    operationId: "demo_sell_op",
    status: "completed",
    totalItems: 1,
    results: [{ assetId: "demo", success: true, message: "Listed (demo)" }],
  }),

  // POST /session/token, /session/login, /session/guard, /session/refresh
  sessionAction: demoStub({ success: true, status: "valid" }),

  // POST /market/session
  marketSession: demoStub({ success: true }),
};
