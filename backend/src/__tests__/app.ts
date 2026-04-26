/**
 * Creates a minimal Express app for integration testing — no DB migrations,
 * no price jobs, just routes wired up. Each test file mocks the DB pool.
 */
import express from "express";
import cors from "cors";
import authRoutes from "../routes/auth.js";
import inventoryRoutes from "../routes/inventory.js";
import portfolioRoutes from "../routes/portfolio.js";
import alertsRoutes from "../routes/alerts.js";
import marketRoutes from "../routes/market.js";
import transactionsRoutes from "../routes/transactions.js";
import tradesRoutes from "../routes/trades.js";
import adminRoutes from "../routes/admin.js";
import autoSellRoutes from "../routes/autoSell.js";
import manualTxRoutes from "../routes/manualTransactions.js";
import sessionRoutes from "../routes/session.js";
import purchasesRoutes from "../routes/purchases.js";
import usersRoutes from "../routes/users.js";
import { errorHandler } from "../middleware/errorHandler.js";

export function createTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api/auth", authRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/portfolio", portfolioRoutes);
  app.use("/api/alerts", alertsRoutes);
  app.use("/api/market", marketRoutes);
  app.use("/api/transactions", transactionsRoutes);
  app.use("/api/transactions", manualTxRoutes);
  app.use("/api/trades", tradesRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/auto-sell", autoSellRoutes);
  app.use("/api/session", sessionRoutes);
  app.use("/api/purchases", purchasesRoutes);
  app.use("/api/users", usersRoutes);

  app.use(errorHandler);
  return app;
}
