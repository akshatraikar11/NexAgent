import { Router, Response } from 'express';
import { prisma } from '../db/client.js';
import { OverrideDecisionInputSchema } from '../schemas/decision.schema.js';
import { authenticateJWT, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { createNotification } from './notifications.routes.js';

export const decisionRouter = Router();

decisionRouter.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
    const skip  = (page - 1) * limit;

    const [decisions, total] = await Promise.all([
      prisma.decision.findMany({
        orderBy: { createdAt: 'desc' },
        include: { ticket: true, humanOverrides: { include: { operator: true } } },
        take: limit,
        skip,
      }),
      prisma.decision.count(),
    ]);

    res.json({ data: decisions, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});

decisionRouter.post('/:id/override', authenticateJWT, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const input = OverrideDecisionInputSchema.parse(req.body);
    const decisionId = String(req.params.id);

    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      include: { ticket: true },
    });

    if (!decision) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Decision not found' });
      return;
    }

    const override = await prisma.humanOverride.create({
      data: {
        decisionId,
        operatorId: req.user!.userId,
        originalDecision: decision.decision,
        overriddenDecision: input.overriddenDecision,
        reason: input.reason,
      },
    });

    // Increment category override count if ticket category exists
    if (decision.ticket?.categoryId) {
      await prisma.category.update({
        where: { id: decision.ticket.categoryId },
        data: { overrideCount: { increment: 1 } },
      });
    }

    // Add Audit Log
    await prisma.auditLog.create({
      data: {
        ticketId: decision.ticketId ?? undefined,
        actorId: req.user!.userId,
        action: 'HUMAN_OVERRIDE',
        entityType: 'Decision',
        entityId: decisionId,
        before: JSON.parse(JSON.stringify({ decision: decision.decision })),
        after: JSON.parse(JSON.stringify({ decision: input.overriddenDecision, reason: input.reason })),
      },
    });

    // Fire notification broadcast for the override
    await createNotification({
      type: 'OVERRIDE',
      title: `Decision overridden → ${input.overriddenDecision}`,
      body: `Operator manually changed decision from ${decision.decision} to ${input.overriddenDecision}. Reason: ${input.reason}`,
      severity: 'WARNING',
      entityType: 'Decision',
      entityId: decisionId,
    }).catch(() => {}); // non-blocking

    res.status(201).json(override);
  } catch (error) {
    next(error);
  }
});
