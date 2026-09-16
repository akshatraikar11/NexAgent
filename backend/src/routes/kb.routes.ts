import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { isDatabaseConnected } from '../db/client.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';

export const kbRouter = Router();

const ManualKBEntrySchema = z.object({
  content: z.string().min(10, 'Solution content must be at least 10 characters'),
  title: z.string().min(3, 'Title required'),
  category: z.string().optional().default('GENERAL'),
  confidenceAtIngestion: z.number().min(0).max(1).optional().default(0.85),
});

/**
 * GET /kb
 */
kbRouter.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const dbConnected = await isDatabaseConnected();
    if (!dbConnected) { res.json([]); return; }
    const entries = await prisma.kBEntry.findMany({
      orderBy: { ingestedAt: 'desc' },
      include: { sourceTicket: { select: { id: true, externalId: true, title: true } } },
    });
    res.json(entries);
  } catch (error) { next(error); }
});

/**
 * POST /kb/manual — explicitly add a KB entry (explicit knowledge capture).
 * Implements the Externalization phase of the SECI model —
 * operators can directly document known solutions without a pipeline run.
 */
kbRouter.post('/manual', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const input = ManualKBEntrySchema.parse(req.body);
    const embeddingId = `kb-manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const entry = await prisma.kBEntry.create({
      data: {
        content: input.content,
        embeddingId,
        confidenceAtIngestion: input.confidenceAtIngestion,
        timesReused: 0,
        isOverridden: false,
        sourceTicketId: null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.userId,
        action: 'KB_MANUAL_ENTRY',
        entityType: 'KBEntry',
        entityId: entry.id,
        after: JSON.parse(JSON.stringify({ content: input.content, category: input.category, title: input.title })),
      },
    }).catch(() => {});

    res.status(201).json(entry);
  } catch (error) { next(error); }
});

/**
 * GET /kb/analytics — knowledge management statistics for SECI visualization
 */
kbRouter.get('/analytics', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const dbConnected = await isDatabaseConnected();
    if (!dbConnected) {
      res.json({ totalEntries: 0, activeEntries: 0, manualEntries: 0, autoEntries: 0, totalReuses: 0, overrideConversionRate: 0, topEntries: [], categories: [] });
      return;
    }

    const [entries, decisions, overrides, categories] = await Promise.all([
      prisma.kBEntry.findMany({ include: { sourceTicket: { select: { id: true, title: true, categoryId: true } } } }),
      prisma.decision.count(),
      prisma.humanOverride.count(),
      prisma.category.findMany({ orderBy: { overrideCount: 'desc' }, take: 8 }),
    ]);

    const active = entries.filter((e) => !e.isOverridden);
    const manualEntries = entries.filter((e) => e.embeddingId.startsWith('kb-manual-'));
    const autoEntries = entries.filter((e) => !e.embeddingId.startsWith('kb-manual-'));
    const totalReuses = entries.reduce((s, e) => s + e.timesReused, 0);

    // SECI conversion rate: how many overrides became KB entries
    const overrideConversionRate = overrides > 0
      ? Math.min(autoEntries.length / overrides, 1.0)
      : 0;

    // Top 5 most reused entries
    const topEntries = [...entries]
      .sort((a, b) => b.timesReused - a.timesReused)
      .slice(0, 5)
      .map((e) => ({ id: e.id, content: e.content.slice(0, 80), timesReused: e.timesReused, isOverridden: e.isOverridden }));

    // Override rates per category (tacit knowledge signals)
    const catStats = categories.map((c) => ({
      id: c.id,
      name: c.name,
      totalDecisions: c.totalDecisions,
      overrideCount: c.overrideCount,
      overrideRate: c.totalDecisions > 0 ? Number((c.overrideCount / c.totalDecisions).toFixed(4)) : 0,
      tacitSignalStrength: c.overrideCount > 5 ? 'HIGH' : c.overrideCount > 2 ? 'MEDIUM' : 'LOW',
    }));

    res.json({
      totalEntries: entries.length,
      activeEntries: active.length,
      manualEntries: manualEntries.length,
      autoEntries: autoEntries.length,
      totalReuses,
      overrideConversionRate: Number(overrideConversionRate.toFixed(4)),
      totalDecisions: decisions,
      totalOverrides: overrides,
      topEntries,
      categories: catStats,
    });
  } catch (error) { next(error); }
});

/**
 * PATCH /kb/:id/override
 */
kbRouter.patch('/:id/override', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const entryId = String(req.params.id);
    const entry = await prisma.kBEntry.findUnique({ where: { id: entryId } });
    if (!entry) { res.status(404).json({ error: 'NOT_FOUND', message: 'KB entry not found' }); return; }
    const updated = await prisma.kBEntry.update({
      where: { id: entryId },
      data: { isOverridden: !entry.isOverridden },
    });
    res.json(updated);
  } catch (error) { next(error); }
});
