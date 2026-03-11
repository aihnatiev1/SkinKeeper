import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";

/**
 * Global error handler -- catches thrown errors and maps to HTTP responses.
 * Must be registered AFTER all routes.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: err.message,
      code: err.code,
    });
    if (err.status >= 500) {
      console.error(`[${err.name}] ${err.message}`, err.stack);
    }
    return;
  }

  // Unknown errors
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[UnhandledError]", err);
  res.status(500).json({ error: message });
}
