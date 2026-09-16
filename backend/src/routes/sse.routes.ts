/**
 * SSE Routes — Fix #5 High: authenticated SSE endpoint.
 *
 * Previously unauthenticated — any caller who guessed a runId could subscribe
 * to live pipeline events including ticket text, LLM responses, and CCEP scores.
 *
 * Now requires a valid JWT Bearer token OR a short-lived query token
 * (for browser EventSource which cannot set custom headers).
 *
 * Browser flow:
 *   1. Client calls GET /sse/token  (authenticated, returns { sseToken, expiresAt })
 *   2. Client connects  GET /sse/pipeline/:runId?token=<sseToken>
 */
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { sseManager } from '../sse/manager.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export const sseRouter = Router();

// In-memory short-lived SSE token store (valid 60 s)
const sseTokens = new Map<string, { userId: string; expiresAt: number }>();

// Cleanup expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, val] of sseTokens.entries()) {
    if (val.expiresAt < now) sseTokens.delete(token);
  }
}, 5 * 60 * 1000);

/**
 * GET /sse/token — issue a short-lived SSE token for browser EventSource.
 * Requires standard JWT auth. Returns a single-use 60-second token.
 */
sseRouter.get('/token', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const sseToken = jwt.sign(
    { userId: req.user!.userId, type: 'sse' },
    config.jwtSecret,
    { expiresIn: '60s' }
  );
  const expiresAt = Date.now() + 60_000;
  sseTokens.set(sseToken, { userId: req.user!.userId, expiresAt });
  res.json({ sseToken, expiresAt });
});

/**
 * GET /sse/pipeline/:runId — live event stream.
 * Auth: Bearer token in Authorization header (API clients)
 *    OR ?token=<sseToken> query param (browser EventSource).
 */
sseRouter.get('/pipeline/:runId', async (req: Request, res: Response) => {
  const runId = String(req.params.runId);

  // Try Authorization header first
  const authHeader = req.headers.authorization;
  let authenticated = false;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      jwt.verify(authHeader.split(' ')[1], config.jwtSecret);
      authenticated = true;
    } catch { authenticated = false; }
  }

  // Fall back to query token (browser EventSource)
  if (!authenticated && req.query.token) {
    const queryToken = String(req.query.token);
    const stored = sseTokens.get(queryToken);
    if (stored && stored.expiresAt > Date.now()) {
      try {
        jwt.verify(queryToken, config.jwtSecret);
        sseTokens.delete(queryToken); // single-use
        authenticated = true;
      } catch { authenticated = false; }
    }
  }

  if (!authenticated) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Valid token required for SSE stream' });
    return;
  }

  logger.info(`[SSE] Authenticated stream opened for runId: ${runId}`);
  await sseManager.registerSession(runId, req, res);
});
