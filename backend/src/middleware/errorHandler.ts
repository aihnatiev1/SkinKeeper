import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";
import { log } from "../utils/logger.js";

/**
 * Global error handler -- catches thrown errors and maps to HTTP responses.
 * Must be registered AFTER all routes.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: err.message,
      code: err.code,
    });
    if (err.status >= 500) {
      log.error("app_error", { name: err.name, status: err.status, path: req.originalUrl }, err);
    }
    return;
  }

  // Unknown errors
  const message = err instanceof Error ? err.message : "Internal server error";
  log.error("unhandled_error", { path: req.originalUrl }, err);
  res.status(500).json({ error: message });
}
