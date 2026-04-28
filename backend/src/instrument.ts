import * as Sentry from "@sentry/node";
import dotenv from "dotenv";

dotenv.config({ override: true });

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || "unknown",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false, // GDPR — don't send IPs/cookies/headers by default

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
      // Strip known sensitive path tokens from URLs.
      // google-rtdn webhook path contains a secret token segment — never log it.
      if (event.request?.url?.includes("google-rtdn-")) {
        event.request.url = event.request.url.replace(
          /google-rtdn-[a-f0-9]+/i,
          "google-rtdn-REDACTED"
        );
      }

      // Strip JWT from authorization header — it's a 30d secret.
      // sendDefaultPii: false suppresses many headers automatically, but the
      // authorization header can still appear in manually-attached request data.
      if (event.request?.headers?.authorization) {
        event.request.headers.authorization = "REDACTED";
      }

      // pg pool acquire timeouts — keep one in ten to surface trends without flooding
      const err = hint.originalException as { code?: string } | undefined;
      if (err && typeof err === "object" && "code" in err && err.code === "CONN_TIMEOUT") {
        return Math.random() < 0.1 ? event : null;
      }

      return event;
    },
  });
} else if (process.env.NODE_ENV === "production") {
  console.error("[Sentry] SENTRY_DSN not set in production — error tracking DISABLED");
}
