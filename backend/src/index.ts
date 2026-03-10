import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { migrate } from "./db/migrate.js";
import { startPriceJobs } from "./services/priceJob.js";
import { initFirebase } from "./services/firebase.js";
import authRoutes from "./routes/auth.js";
import inventoryRoutes from "./routes/inventory.js";
import pricesRoutes from "./routes/prices.js";
import portfolioRoutes from "./routes/portfolio.js";
import alertsRoutes from "./routes/alerts.js";
import marketRoutes from "./routes/market.js";
import transactionsRoutes from "./routes/transactions.js";
import sessionRouter from "./routes/session.js";
import tradesRoutes from "./routes/trades.js";
import purchasesRoutes from "./routes/purchases.js";
import exportRoutes from "./routes/export.js";
import manualTxRoutes from "./routes/manualTransactions.js";
import legalRoutes from "./routes/legal.js";
import adminRoutes from "./routes/admin.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Legal pages (no auth required)
app.use("/legal", legalRoutes);

// Request logger
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/prices", pricesRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/session", sessionRouter);
app.use("/api/trades", tradesRoutes);
app.use("/api/purchases", purchasesRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/transactions", manualTxRoutes);
app.use("/api/admin", adminRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

async function start() {
  // Validate required environment variables
  const required = ["JWT_SECRET", "DATABASE_URL", "ENCRYPTION_KEY"];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`FATAL: ${key} environment variable is not set.`);
      process.exit(1);
    }
  }

  // Run migrations
  await migrate();

  // Initialize Firebase for push notifications
  initFirebase();

  // Start background price fetching
  startPriceJobs();

  app.listen(PORT, () => {
    console.log(`SkinKeeper API running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
