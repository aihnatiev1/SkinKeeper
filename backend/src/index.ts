import "./instrument.js";
import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { migrate } from "./db/migrate.js";
import { pool, checkPoolHealth, getPoolStats } from "./db/pool.js";
import { startPriceJobs, stopAllJobs } from "./services/priceJob.js";
import { initFirebase } from "./services/firebase.js";
import authRoutes from "./routes/auth.js";
import inventoryRoutes from "./routes/inventory.js";
import pricesRoutes from "./routes/prices.js";
import portfolioRoutes, { portfoliosRouter } from "./routes/portfolio.js";
import alertsRoutes from "./routes/alerts.js";
import marketRoutes from "./routes/market.js";
import transactionsRoutes from "./routes/transactions.js";
import sessionRouter from "./routes/session.js";
import tradesRoutes from "./routes/trades.js";
import purchasesRoutes from "./routes/purchases.js";
import stripeRoutes from "./routes/stripe.js";
import extensionRoutes from "./routes/extension.js";
import exportRoutes from "./routes/export.js";
import manualTxRoutes from "./routes/manualTransactions.js";
import legalRoutes from "./routes/legal.js";
import adminRoutes from "./routes/admin.js";
import dataRoutes from "./routes/data.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { log } from "./utils/logger.js";
import { preloadCSGOData } from "./services/csgoData.js";

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors());

// Stripe webhook needs raw body for signature verification — must be before express.json()
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));

app.use(express.json());

// Apple App Site Association for Universal Links
app.get("/.well-known/apple-app-site-association", (_req, res) => {
  res.set("Content-Type", "application/json");
  res.json({
    applinks: {
      apps: [],
      details: [{
        appIDs: ["QTLQ56U8D2.app.skinkeeper.store"],
        components: [
          { "/": "/auth/callback*" },
          { "/": "/ref/*" },
        ]
      }]
    }
  });
});

// Android Digital Asset Links for App Links verification
app.get("/.well-known/assetlinks.json", (_req, res) => {
  res.set("Content-Type", "application/json");
  res.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "app.skinkeeper.store",
      sha256_cert_fingerprints: [process.env.ANDROID_SHA256_FINGERPRINT || "TODO:ADD_YOUR_SHA256"],
    },
  }]);
});

// Legal pages (no auth required)
app.use("/legal", legalRoutes);

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,            // 120 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down" },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                   // 30 auth attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, try again later" },
});
app.use("/api", globalLimiter);
app.use("/api/auth/steam", (req, res, next) => {
  // Poll endpoint is not an auth attempt — skip auth rate limiter
  if (req.path.startsWith("/poll/")) return next();
  return authLimiter(req, res, next);
});
app.use("/api/auth/token", authLimiter);
app.use("/api/auth/qr", authLimiter);

// Structured request logger (errors + slow requests only)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    if (status >= 400 || ms > 2000) {
      log.info("http_request", {
        method: req.method,
        path: req.originalUrl,
        status,
        ms,
      });
    }
  });
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/prices", pricesRoutes);
app.use("/api", portfoliosRouter);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/session", sessionRouter);
app.use("/api/trades", tradesRoutes);
app.use("/api/purchases", purchasesRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/ext", extensionRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/transactions", manualTxRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/data", dataRoutes);

// Sentry error handler must come before the custom one
Sentry.setupExpressErrorHandler(app);

// Global error handler (must be after all routes)
app.use(errorHandler);

// Health check. Used by external uptime monitors — must reflect real
// reachability, not just "process is up", so we ping the DB with a
// bounded timeout and return 503 if it's unhealthy.
app.get("/api/health", async (_req, res) => {
  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db timeout")), 2000)
      ),
    ]);
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      pool: getPoolStats(),
    });
  } catch (err) {
    res.status(503).json({
      status: "degraded",
      reason: "database unreachable",
      timestamp: new Date().toISOString(),
      pool: getPoolStats(),
    });
  }
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

  // Verify database connectivity
  await checkPoolHealth();

  // Run migrations
  await migrate();

  // Initialize Firebase for push notifications
  initFirebase();

  // Cleanup orphaned sell operations from previous crash
  import("./services/sellOperations.js").then(({ cleanupOrphanedOperations }) =>
    cleanupOrphanedOperations().catch((err) => console.warn("[Cleanup] sell ops:", err.message))
  );

  // Pre-warm CSGO-API static data cache
  preloadCSGOData();

  // Seed Steam item_nameids for histogram API (non-blocking)
  import("./services/steamHistogram.js").then(({ seedItemNameIds }) =>
    seedItemNameIds().catch((err) => console.warn("[Seed] item_nameids failed:", err.message))
  );

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

// Graceful shutdown
let isShuttingDown = false;
async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[${signal}] Shutting down gracefully...`);

  // Stop background jobs first (crawlers, cron)
  try {
    stopAllJobs();
    console.log("[Shutdown] Background jobs stopped");
  } catch (err) {
    console.error("[Shutdown] Error stopping jobs:", err);
  }

  // Close DB pool (waits for in-flight queries)
  try {
    await pool.end();
    console.log("[Shutdown] Pool connections closed");
  } catch (err) {
    console.error("[Shutdown] Error closing pool:", err);
  }

  process.exit(0);
}

// Force exit after 10s if graceful shutdown hangs
function forceExit(signal: string) {
  shutdown(signal);
  setTimeout(() => {
    console.error("[Shutdown] Forced exit after timeout");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => forceExit("SIGTERM"));
process.on("SIGINT", () => forceExit("SIGINT"));
