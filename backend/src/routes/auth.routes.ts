import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { prisma, isDatabaseConnected } from '../db/client.js';
import { config } from '../config/index.js';
import { RegisterInputSchema, LoginInputSchema } from '../schemas/auth.schema.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';

export const authRouter = Router();

// ── Cookie options ────────────────────────────────────────────────────────────
const AUTH_COOKIE = 'nexagent_auth';
const cookieOptions = () => ({
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 1000, // 1 hour (matches JWT expiry)
  path: '/',
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Prevents brute-force attacks on login/register endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Too many auth attempts. Try again in 15 minutes.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,                   // stricter for login
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Try again in 15 minutes.' },
});

authRouter.post('/register', authLimiter, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const dbConnected = await isDatabaseConnected();
    if (!dbConnected) {
      res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Database is unavailable. Cannot register users without a database connection.',
      });
      return;
    }

    const input = RegisterInputSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });

    if (existing) {
      // Generic message to prevent account enumeration
      res.status(400).json({ error: 'REGISTRATION_FAILED', message: 'Registration failed. Please try a different email.' });
      return;
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        role: 'OPERATOR', // Hardcoded — only admin seeding or explicit promotion can grant ADMIN
      },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '1h' }
    );

    // Set httpOnly cookie (not readable by JS — immune to XSS token theft)
    res.cookie(AUTH_COOKIE, token, cookieOptions());

    res.status(201).json({
      token, // Still returned in body for API clients / backward compat
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', loginLimiter, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const dbConnected = await isDatabaseConnected();
    if (!dbConnected) {
      res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Database is unavailable. Start PostgreSQL and run the seed script to enable login.',
      });
      return;
    }

    const input = LoginInputSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    if (!user) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      return;
    }

    const match = await bcrypt.compare(input.password, user.passwordHash);
    if (!match) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '1h' }
    );

    // Set httpOnly cookie
    res.cookie(AUTH_COOKIE, token, cookieOptions());

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/dev-session', async (_req, res: Response, next) => {
  try {
    if (config.nodeEnv === 'production') {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Dev session disabled in production' });
      return;
    }
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      res.status(404).json({ error: 'NO_ADMIN_FOUND', message: 'Admin account not seeded' });
      return;
    }
    const token = jwt.sign(
      { userId: admin.id, email: admin.email, role: admin.role },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
    res.cookie(AUTH_COOKIE, token, cookieOptions());
    res.json({
      token,
      user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', (_req, res: Response) => {
  res.clearCookie(AUTH_COOKIE, { httpOnly: true, path: '/' });
  res.json({ success: true });
});

authRouter.get('/me', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    if (!user) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});
