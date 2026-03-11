/**
 * Base application error with HTTP status and machine-readable code.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = "Not authenticated") {
    super(message, "AUTH_ERROR", 401);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Not found") {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class SteamError extends AppError {
  constructor(
    message: string,
    public readonly steamCode?: number
  ) {
    super(message, "STEAM_ERROR", 502);
    this.name = "SteamError";
  }
}

export class SessionExpiredError extends AppError {
  constructor(message: string = "Steam session expired") {
    super(message, "SESSION_EXPIRED", 401);
    this.name = "SessionExpiredError";
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = "Rate limited", public readonly retryAfterMs?: number) {
    super(message, "RATE_LIMITED", 429);
    this.name = "RateLimitError";
  }
}
