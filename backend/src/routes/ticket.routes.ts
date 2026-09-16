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
        metadata: JSON.parse(JSON.stringify(input.metadata || {})),
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
    const tickets = await prisma.ticket.findMany({
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

    res.json(ticket);
  } catch (error) {
    next(error);
  }
});
