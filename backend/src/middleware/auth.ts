import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

/**
 * Parse cookies from the raw Cookie header without requiring cookie-parser.
 */
function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );
}

/**
 * Authenticate requests via:
 *   1. Authorization: Bearer <token>  (API clients, backward compat)
 *   2. httpOnly cookie "nexagent_auth" (browser sessions — not readable by JS)
 */
export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  let token: string | undefined;

  // 1. Try Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Fall back to httpOnly cookie
  if (!token) {
    const cookies = parseCookieHeader(req.headers.cookie);
    token = cookies['nexagent_auth'];
  }

  if (!token) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; email: string; role: string };
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired JWT token' });
  }
}

export function requireRole(role: 'ADMIN' | 'OPERATOR') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || (req.user.role !== role && req.user.role !== 'ADMIN')) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient role permissions' });
      return;
    }
    next();
  };
}
