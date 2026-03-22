/**
 * Structured JSON logger. Replaces raw console.log with PII-safe,
 * machine-parseable output for production monitoring.
 *
 * Usage:
 *   log.info("sell_listed", { assetId, price })
 *   log.warn("price_stale", { marketHashName, ageHours })
 *   log.error("sell_failed", { operationId }, err)
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

// Fields that should NEVER appear in logs (PII protection)
const REDACTED_FIELDS = new Set([
  "steamLoginSecure",
  "steamRefreshToken",
  "accessToken",
  "sessionId",
  "jwt",
  "token",
  "password",
  "secret",
  "cookie",
]);

function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (REDACTED_FIELDS.has(key)) {
      clean[key] = "[REDACTED]";
    } else if (typeof value === "string" && value.length > 500) {
      clean[key] = value.substring(0, 500) + "…";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      clean[key] = sanitize(value as Record<string, unknown>);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function emit(level: LogLevel, event: string, data?: Record<string, unknown>, err?: unknown) {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitize(data ?? {}),
  };

  if (err instanceof Error) {
    entry.error = err.message;
    if (level === "error") {
      entry.stack = err.stack?.split("\n").slice(0, 5).join("\n");
    }
  }

  const line = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) => emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>, err?: unknown) => emit("warn", event, data, err),
  error: (event: string, data?: Record<string, unknown>, err?: unknown) => emit("error", event, data, err),
};
