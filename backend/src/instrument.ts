import * as Sentry from "@sentry/node";
import dotenv from "dotenv";

dotenv.config({ override: true });

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0.05,
    sendDefaultPii: false,

    // Drop noisy, expected errors before they hit the free quota.
    // Steam flakiness (403/429/503) and trade-sync auth failures for
    // accounts with expired sessions are already handled by retry +
    // circuit-breaker logic — they're not actionable issues.
    ignoreErrors: [
      "Steam session error",
      "SteamSessionError",
      "Circuit open for",
      "Maximum number of redirects exceeded",
      /Request failed with status code (403|429|503|504)/,
      "timeout of 15000ms exceeded",
      "Invalid inspect link",
    ],

    beforeSend(event, hint) {
      const err = hint.originalException as { code?: string; status?: number } | undefined;
      // pg pool acquire timeouts — keep one in ten to surface trends without flooding
      if (err && typeof err === "object" && "code" in err && err.code === "CONN_TIMEOUT") {
        return Math.random() < 0.1 ? event : null;
      }
      return event;
    },
  });
}
