/**
 * Analytics Routes — pipeline performance metrics
 * GET /analytics/summary          — per-pipeline auto-resolve rate, avg CCEP, avg latency
 * GET /analytics/decisions/trend  — daily decision counts for last 14 days
 * GET /analytics/steps/latency    — avg step latency across all pipeline types
 * GET /analytics/categories/top   — top 5 most escalated categories
 */
import { Router, Response } from 'express';
import { prisma } from '../db/client.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';

export const analyticsRouter = Router();

// GET /analytics/summary
analyticsRouter.get('/summary', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    // Per-pipeline type breakdown
    const pipelineTypes = ['TICKET_TRIAGE','INCIDENT_RESPONSE','CI_TRIAGE','BUILD_DEPLOY','MERGEGATE','KB_SELF_LEARNING'] as const;

    const pipelineSummary = await Promise.all(
      pipelineTypes.map(async (type) => {
        const runs = await prisma.pipelineRun.findMany({
          where: { type },
          include: { decisions: true },
        });

        const completed = runs.filter((r) => r.status === 'COMPLETED').length;
        const decisions = runs.flatMap((r) => r.decisions);
        const autoResolved = decisions.filter((d) => d.decision === 'AUTO_RESOLVE').length;
        const escalated = decisions.filter((d) => d.decision === 'ESCALATE').length;
        const avgCCEP = decisions.length
          ? decisions.reduce((s, d) => s + d.ccepScore, 0) / decisions.length
          : 0;

        return {
          type,
          totalRuns: runs.length,
          completed,
          autoResolved,
          escalated,
          autoResolveRate: decisions.length ? autoResolved / decisions.length : 0,
          avgCCEPScore: Number(avgCCEP.toFixed(4)),
        };
      })
    );

    // Totals
    const allDecisions = await prisma.decision.findMany();
    const totalAuto = allDecisions.filter((d) => d.decision === 'AUTO_RESOLVE').length;
    const totalEscalated = allDecisions.filter((d) => d.decision === 'ESCALATE').length;
    const overallAutoRate = allDecisions.length ? totalAuto / allDecisions.length : 0;

    const totalOverrides = await prisma.humanOverride.count();
    const totalKBEntries = await prisma.kBEntry.count({ where: { isOverridden: false } });

    res.json({
      pipelines: pipelineSummary,
      totals: {
        decisions: allDecisions.length,
        autoResolved: totalAuto,
        escalated: totalEscalated,
        overallAutoResolveRate: Number(overallAutoRate.toFixed(4)),
        humanOverrides: totalOverrides,
        activeKBEntries: totalKBEntries,
      },
    });
  } catch (err) { next(err); }
});

// GET /analytics/decisions/trend — daily counts last 14 days
analyticsRouter.get('/decisions/trend', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const days = 14;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const decisions = await prisma.decision.findMany({
      where: { createdAt: { gte: since } },
      select: { decision: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Bucket by day
    const buckets: Record<string, { date: string; auto: number; escalate: number; total: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { date: key, auto: 0, escalate: 0, total: 0 };
    }

    for (const dec of decisions) {
      const key = new Date(dec.createdAt).toISOString().slice(0, 10);
      if (buckets[key]) {
        buckets[key].total++;
        if (dec.decision === 'AUTO_RESOLVE') buckets[key].auto++;
        else if (dec.decision === 'ESCALATE') buckets[key].escalate++;
      }
    }

    res.json(Object.values(buckets));
  } catch (err) { next(err); }
});

// GET /analytics/steps/latency — avg step latency per step name
analyticsRouter.get('/steps/latency', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const logs = await prisma.stepLog.findMany({
      where: { status: 'COMPLETED', completedAt: { not: null } },
      select: { stepName: true, startedAt: true, completedAt: true },
    });

    const byStep: Record<string, number[]> = {};
    for (const log of logs) {
      if (!log.completedAt) continue;
      const ms = new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime();
      if (!byStep[log.stepName]) byStep[log.stepName] = [];
      byStep[log.stepName].push(ms);
    }

    const result = Object.entries(byStep).map(([stepName, latencies]) => ({
      stepName,
      avgLatencyMs: Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length),
      minLatencyMs: Math.min(...latencies),
      maxLatencyMs: Math.max(...latencies),
      samples: latencies.length,
    })).sort((a, b) => b.avgLatencyMs - a.avgLatencyMs);

    res.json(result);
  } catch (err) { next(err); }
});

// GET /analytics/categories/top — top escalated categories
analyticsRouter.get('/categories/top', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { totalDecisions: { gt: 0 } },
      orderBy: { overrideCount: 'desc' },
      take: 8,
    });

    res.json(
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        totalDecisions: c.totalDecisions,
        overrideCount: c.overrideCount,
        overrideRate: c.totalDecisions > 0 ? Number((c.overrideCount / c.totalDecisions).toFixed(4)) : 0,
      }))
    );
  } catch (err) { next(err); }
});
