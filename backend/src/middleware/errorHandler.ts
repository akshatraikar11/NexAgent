import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Zod validation errors — safe to surface schema details to the client
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Request payload validation failed',
      details: err.errors,
    });
    return;
  }

  const errorMessage = err instanceof Error ? err.message : String(err);

  // Always log full error server-side with context
  logger.error({ err, url: req.url, method: req.method }, `[SERVER_ERROR] ${errorMessage}`);

  // Fix #4 High — Never leak internal error details to clients in production.
  // In development we surface the raw message to ease debugging.
  // In production a generic message is returned; the full error stays in server logs only.
  const isProd = process.env.NODE_ENV === 'production';

  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: isProd
      ? 'An unexpected error occurred. Please try again or contact support.'
      : errorMessage,
  });
}
