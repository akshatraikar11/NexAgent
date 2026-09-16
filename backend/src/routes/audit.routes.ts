import { Router, Response } from 'express';
import { prisma } from '../db/client.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';

export const auditRouter = Router();

auditRouter.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'), 10));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '100'), 10)));
    const skip  = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        include: { actor: { select: { id: true, email: true, name: true } }, ticket: true },
        take: limit,
        skip,
      }),
      prisma.auditLog.count(),
    ]);

    res.json({ data: logs, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});
