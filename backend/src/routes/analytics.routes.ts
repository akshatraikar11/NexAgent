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

// GET /analytics/summary — Optimized via DB-level aggregates (no full-table memory loads)
analyticsRouter.get('/summary', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    // Per-pipeline type breakdown
    const pipelineTypes = ['TICKET_TRIAGE','INCIDENT_RESPONSE','CI_TRIAGE','BUILD_DEPLOY','MERGEGATE','KB_SELF_LEARNING'] as const;

    const pipelineSummary = await Promise.all(
      pipelineTypes.map(async (type) => {
        const [totalRuns, completed, decisionStats, ccepAgg] = await Promise.all([
          prisma.pipelineRun.count({ where: { type } }),
          prisma.pipelineRun.count({ where: { type, status: 'COMPLETED' } }),
          prisma.decision.groupBy({
            by: ['decision'],
            where: { pipelineRun: { type } },
            _count: { _all: true },
          }),
          prisma.decision.aggregate({
            where: { pipelineRun: { type } },
            _avg: { ccepScore: true },
          }),
        ]);

        let autoResolved = 0;
        let escalated = 0;
        let totalDecisions = 0;

        for (const stat of decisionStats) {
          totalDecisions += stat._count._all;
          if (stat.decision === 'AUTO_RESOLVE') autoResolved = stat._count._all;
          if (stat.decision === 'ESCALATE') escalated = stat._count._all;
        }

        const avgCCEP = ccepAgg._avg.ccepScore ?? 0;

        return {
          type,
          totalRuns,
          completed,
          autoResolved,
          escalated,
          autoResolveRate: totalDecisions ? autoResolved / totalDecisions : 0,
          avgCCEPScore: Number(avgCCEP.toFixed(4)),
        };
      })
    );

    // Totals via DB aggregates
    const [totalDecisions, totalAuto, totalEscalated, totalOverrides, totalKBEntries] = await Promise.all([
      prisma.decision.count(),
      prisma.decision.count({ where: { decision: 'AUTO_RESOLVE' } }),
      prisma.decision.count({ where: { decision: 'ESCALATE' } }),
      prisma.humanOverride.count(),
      prisma.kBEntry.count({ where: { isOverridden: false } }),
    ]);
    const overallAutoRate = totalDecisions ? totalAuto / totalDecisions : 0;

    res.json({
      pipelines: pipelineSummary,
      totals: {
        decisions: totalDecisions,
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
