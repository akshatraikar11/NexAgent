/**
 * SLA Routes — tracks SLA breach deadlines per ticket priority
 * GET  /sla/summary               — counts by status
 * GET  /sla/breached              — all tickets past their SLA deadline
 * GET  /sla/at-risk               — tickets breaching within the next 2 hours
 * GET  /sla/all                   — full list with computed status
 * GET  /sla/policy                — current SLA policy table
 * POST /sla/tickets/:ticketId     — create or refresh SLA record for a ticket
 * PATCH /sla/tickets/:ticketId/resolve — mark ticket SLA resolved
 */
import { Router, Response } from 'express';
import { prisma } from '../db/client.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';

export const slaRouter = Router();

// SLA hours by priority
const SLA_HOURS: Record<string, number> = {
  P1: 1, P2: 4, P3: 8, P4: 24,
  CRITICAL: 1, HIGH: 4, MEDIUM: 8, LOW: 24,
};

function slaHoursForPriority(priority: string): number {
  return SLA_HOURS[priority.toUpperCase()] ?? 8;
}

function computeBreachAt(priority: string, createdAt: Date): Date {
  const hours = slaHoursForPriority(priority);
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

function slaStatus(breachAt: Date, resolvedAt: Date | null): 'ON_TRACK' | 'AT_RISK' | 'BREACHED' {
  if (resolvedAt) return 'ON_TRACK';
  const now = new Date();
  const msLeft = breachAt.getTime() - now.getTime();
  if (msLeft < 0) return 'BREACHED';
  if (msLeft < 2 * 60 * 60 * 1000) return 'AT_RISK';
  return 'ON_TRACK';
}

// GET /sla/summary
slaRouter.get('/summary', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const slas = await prisma.ticketSLA.findMany({ include: { ticket: { include: { category: true } } } });

    const summary: Record<string, number> = { ON_TRACK: 0, AT_RISK: 0, BREACHED: 0 };
    for (const s of slas) {
      const status = slaStatus(s.slaBreachAt, s.resolvedAt);
      summary[status] = (summary[status] ?? 0) + 1;
    }

    res.json({ total: slas.length, ...summary, asOf: new Date().toISOString() });
  } catch (err) { next(err); }
});

// GET /sla/breached
slaRouter.get('/breached', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const now = new Date();
    const breached = await prisma.ticketSLA.findMany({
      where: { slaBreachAt: { lt: now }, resolvedAt: null },
      include: { ticket: { include: { category: true, decisions: { take: 1, orderBy: { createdAt: 'desc' } } } } },
      orderBy: { slaBreachAt: 'asc' },
    });
    res.json(breached.map((s) => ({
      ...s,
      status: 'BREACHED' as const,
      overdueMs: now.getTime() - new Date(s.slaBreachAt).getTime(),
    })));
  } catch (err) { next(err); }
});

// GET /sla/at-risk
slaRouter.get('/at-risk', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const atRisk = await prisma.ticketSLA.findMany({
      where: { slaBreachAt: { gte: now, lte: twoHoursLater }, resolvedAt: null },
      include: { ticket: { include: { category: true } } },
      orderBy: { slaBreachAt: 'asc' },
    });
    res.json(atRisk.map((s) => ({
      ...s,
      status: 'AT_RISK' as const,
      msUntilBreach: new Date(s.slaBreachAt).getTime() - now.getTime(),
    })));
  } catch (err) { next(err); }
});

// GET /sla/all
slaRouter.get('/all', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const slas = await prisma.ticketSLA.findMany({
      include: { ticket: { include: { category: true, decisions: { take: 1, orderBy: { createdAt: 'desc' } } } } },
      orderBy: { slaBreachAt: 'asc' },
    });
    const now = new Date();
    res.json(slas.map((s) => ({
      ...s,
      status: slaStatus(s.slaBreachAt, s.resolvedAt),
      msUntilBreach: new Date(s.slaBreachAt).getTime() - now.getTime(),
    })));
  } catch (err) { next(err); }
});

// GET /sla/policy
slaRouter.get('/policy', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const policies = await prisma.sLAPolicy.findMany({ orderBy: { slaHours: 'asc' } });
    res.json(policies);
  } catch (err) { next(err); }
});

// POST /sla/tickets/:ticketId
slaRouter.post('/tickets/:ticketId', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const ticketId = String(req.params.ticketId);
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) { res.status(404).json({ error: 'Ticket not found' }); return; }

    const priority = ticket.priority || 'MEDIUM';
    const slaHours = slaHoursForPriority(priority);
    const slaBreachAt = computeBreachAt(priority, ticket.createdAt);

    const sla = await prisma.ticketSLA.upsert({
      where: { ticketId },
      update: { priority, slaHours, slaBreachAt },
      create: { ticketId, priority, slaHours, slaBreachAt },
    });
    res.status(201).json({ ...sla, status: slaStatus(sla.slaBreachAt, sla.resolvedAt) });
  } catch (err) { next(err); }
});

// PATCH /sla/tickets/:ticketId/resolve
slaRouter.patch('/tickets/:ticketId/resolve', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const ticketId = String(req.params.ticketId);
    const sla = await prisma.ticketSLA.update({
      where: { ticketId },
      data: { resolvedAt: new Date() },
    });
    res.json({ ...sla, status: 'ON_TRACK' });
  } catch (err) { next(err); }
});
