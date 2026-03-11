import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

interface SteamRequestOptions {
  /** Full URL to request */
  url: string;
  /** HTTP method (default: GET) */
  method?: "GET" | "POST";
  /** Steam session cookies */
  cookies?: {
    steamLoginSecure: string;
    sessionId: string;
    webTradeEligibility?: string;
  };
  /** Additional headers */
  headers?: Record<string, string>;
  /** URL params */
  params?: Record<string, string | number>;
  /** POST body (form-encoded) */
  data?: Record<string, string | number> | string;
  /** Content-Type for POST (default: application/x-www-form-urlencoded) */
  contentType?: string;
  /** Request timeout in ms (default: 15000) */
  timeout?: number;
  /** Max retries on 429/5xx (default: 3) */
  maxRetries?: number;
  /** Follow redirects (default: true) */
  followRedirects?: boolean;
  /** Custom validateStatus */
  validateStatus?: (status: number) => boolean;
}

interface SteamResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
  durationMs: number;
}

// --- Metrics ---------------------------------------------------------------

interface RequestMetric {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  timestamp: number;
  retry: number;
}

const recentRequests: RequestMetric[] = [];
const MAX_METRICS = 500;

function recordMetric(metric: RequestMetric): void {
  recentRequests.push(metric);
  if (recentRequests.length > MAX_METRICS) {
    recentRequests.splice(0, recentRequests.length - MAX_METRICS);
  }
}

/** Get request timing stats for monitoring */
export function getSteamClientMetrics(): {
  totalRequests: number;
  avgDurationMs: number;
  p95DurationMs: number;
  errorRate: string;
  recentErrors: Array<{ url: string; status: number; timestamp: number }>;
} {
  if (recentRequests.length === 0) {
    return { totalRequests: 0, avgDurationMs: 0, p95DurationMs: 0, errorRate: "N/A", recentErrors: [] };
  }
  const durations = recentRequests.map((r) => r.durationMs).sort((a, b) => a - b);
  const errors = recentRequests.filter((r) => r.status >= 400);
  const p95Index = Math.floor(durations.length * 0.95);

  return {
    totalRequests: recentRequests.length,
    avgDurationMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    p95DurationMs: durations[p95Index] ?? 0,
    errorRate: `${((errors.length / recentRequests.length) * 100).toFixed(1)}%`,
    recentErrors: errors.slice(-10).map((e) => ({
      url: e.url.replace(/steamLoginSecure=[^;]+/, "steamLoginSecure=***"),
      status: e.status,
      timestamp: e.timestamp,
    })),
  };
}

// --- Core Request Function -------------------------------------------------

/**
 * Make an HTTP request to Steam with retry logic, rate limit handling,
 * and session expiry detection.
 */
export async function steamRequest<T = unknown>(
  opts: SteamRequestOptions
): Promise<SteamResponse<T>> {
  const method = opts.method ?? "GET";
  const timeout = opts.timeout ?? 15000;
  const maxRetries = opts.maxRetries ?? 3;

  // Build cookie header
  let cookieHeader: string | undefined;
  if (opts.cookies) {
    cookieHeader = `steamLoginSecure=${opts.cookies.steamLoginSecure}; sessionid=${opts.cookies.sessionId}`;
    if (opts.cookies.webTradeEligibility) {
      cookieHeader += `; webTradeEligibility=${opts.cookies.webTradeEligibility}`;
    }
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    try {
      const config: AxiosRequestConfig = {
        url: opts.url,
        method,
        params: opts.params,
        timeout,
        headers: {
          "User-Agent": USER_AGENT,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          ...(opts.headers ?? {}),
        },
        maxRedirects: opts.followRedirects === false ? 0 : 5,
        validateStatus: opts.validateStatus ?? ((s) => s < 400),
      };

      if (opts.data && method === "POST") {
        if (typeof opts.data === "string") {
          config.data = opts.data;
        } else {
          config.data = new URLSearchParams(
            Object.entries(opts.data).map(([k, v]) => [k, String(v)])
          ).toString();
        }
        config.headers!["Content-Type"] =
          opts.contentType ?? "application/x-www-form-urlencoded";
      }

      const resp: AxiosResponse<T> = await axios(config);
      const durationMs = Date.now() - start;

      recordMetric({
        url: opts.url,
        method,
        status: resp.status,
        durationMs,
        timestamp: Date.now(),
        retry: attempt,
      });

      // Detect session expiry (302 redirect to login)
      if (resp.status === 302 || resp.status === 303) {
        const location = resp.headers.location ?? "";
        if (location.includes("/login") || location.includes("steampowered.com/login")) {
          throw new SteamSessionError("Steam session expired (redirected to login)");
        }
      }

      return {
        data: resp.data,
        status: resp.status,
        headers: resp.headers as Record<string, string>,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      const axiosErr = err as { response?: { status: number; headers?: Record<string, string> }; message?: string };
      const status = axiosErr.response?.status ?? 0;

      recordMetric({
        url: opts.url,
        method,
        status: status || 999,
        durationMs,
        timestamp: Date.now(),
        retry: attempt,
      });

      // Re-throw SteamSessionError as-is (check before status-based detection)
      if (err instanceof SteamSessionError) throw err;

      // Session expiry detection
      if (status === 403 || status === 401) {
        throw new SteamSessionError(
          `Steam session error (HTTP ${status})`
        );
      }

      // Retry on 429 or 5xx
      if ((status === 429 || status >= 500) && attempt < maxRetries) {
        const retryAfter = parseInt(
          axiosErr.response?.headers?.["retry-after"] ?? "0",
          10
        );
        const backoffMs = retryAfter > 0
          ? retryAfter * 1000
          : Math.min(1000 * Math.pow(2, attempt), 30000);

        console.log(
          `[SteamClient] ${method} ${opts.url} -> ${status}, retry ${attempt + 1}/${maxRetries} in ${backoffMs}ms`
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      throw new SteamRequestError(
        `Steam request failed: ${method} ${opts.url} -> ${status || (axiosErr.message ?? "unknown")}`,
        status
      );
    }
  }

  throw new SteamRequestError(
    `Steam request failed after ${maxRetries} retries: ${method} ${opts.url}`,
    429
  );
}

// --- Error Classes ---------------------------------------------------------

export class SteamSessionError extends Error {
  readonly code = "SESSION_EXPIRED";
  constructor(message: string) {
    super(message);
    this.name = "SteamSessionError";
  }
}

export class SteamRequestError extends Error {
  constructor(message: string, public readonly httpStatus: number) {
    super(message);
    this.name = "SteamRequestError";
  }
}
