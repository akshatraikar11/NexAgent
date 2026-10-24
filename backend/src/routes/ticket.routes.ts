import { Router, Response } from 'express';
import { prisma } from '../db/client.js';
import { CreateTicketInputSchema } from '../schemas/ticket.schema.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';

export const ticketRouter = Router();

const SLA_HOURS: Record<string, number> = {
  P1: 1, P2: 4, P3: 8, P4: 24,
  CRITICAL: 1, HIGH: 4, MEDIUM: 8, LOW: 24,
};

ticketRouter.post('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const input = CreateTicketInputSchema.parse(req.body);
    const ticket = await prisma.ticket.create({
      data: {
        externalId: input.externalId,
        title: input.title,
        description: input.description,
        categoryId: input.categoryId,
        priority: input.priority || 'MEDIUM',
        source: input.source || 'JIRA',
        metadata: {
          ...JSON.parse(JSON.stringify(input.metadata || {})),
          createdBy: req.user!.userId,
        },
      },
    });

    // Auto-create SLA record based on ticket priority
    const priority = ticket.priority || 'MEDIUM';
    const slaHours = SLA_HOURS[priority.toUpperCase()] ?? 8;
    const slaBreachAt = new Date(ticket.createdAt.getTime() + slaHours * 60 * 60 * 1000);
    await prisma.ticketSLA.create({
      data: { ticketId: ticket.id, priority, slaHours, slaBreachAt },
    }).catch(() => {}); // non-blocking — don't fail ticket creation if SLA fails

    res.status(201).json(ticket);
  } catch (error) {
    next(error);
  }
});

ticketRouter.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 100);
    const page = Math.max(parseInt(String(req.query.page ?? '1'), 10), 1);
    const skip = (page - 1) * limit;

    const tickets = await prisma.ticket.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { category: true, decisions: true },
    });
    res.json(tickets);
  } catch (error) {
    next(error);
  }
});

ticketRouter.get('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: String(req.params.id) },
      include: { category: true, decisions: { include: { humanOverrides: true } } },
    });

    if (!ticket) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Ticket not found' });
      return;
    }

    const meta = (ticket.metadata as Record<string, unknown> | null) || {};
    const createdBy = meta.createdBy as string | undefined;

    // IDOR protection: if ticket has a specific creator, only that user or ADMIN can access
    if (req.user!.role !== 'ADMIN' && createdBy && createdBy !== req.user!.userId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied to this ticket' });
      return;
    }

    res.json(ticket);
  } catch (error) {
    next(error);
  }
});
