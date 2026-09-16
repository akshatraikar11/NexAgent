import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { prisma, isDatabaseConnected } from '../db/client.js';
import { config } from '../config/index.js';
import { RegisterInputSchema, LoginInputSchema } from '../schemas/auth.schema.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';

export const authRouter = Router();

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
      res.status(400).json({ error: 'EMAIL_EXISTS', message: 'User with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        role: input.role || 'OPERATOR',
      },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '1h' }
    );

    res.status(201).json({
      token,
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

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    next(error);
  }
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
