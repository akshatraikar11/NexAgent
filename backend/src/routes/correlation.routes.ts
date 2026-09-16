/**
 * Alert Correlation Routes — groups related incidents to reduce noise
 * Mirrors PagerDuty's "Alert Grouping" and Moogsoft's "Situation" features.
 *
 * POST /correlation/correlate   — correlate a new alert against open groups
 * GET  /correlation/groups      — list all alert groups with members
 * GET  /correlation/groups/:id  — single group detail
 * PATCH /correlation/groups/:id/resolve — mark a group resolved
 */
import { Router, Response } from 'express';
import { prisma } from '../db/client.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';
import { CorrelateAlertSchema } from '../schemas/sla.schema.js';

export const correlationRouter = Router();

// Extract significant keywords from alert text (stopword-filtered)
const STOPWORDS = new Set([
  'the','a','an','in','on','at','for','to','of','and','or','is','are','was',
  'has','have','with','from','by','this','that','it','its','be','been','alert',
  'error','warning','failed','failure','issue','problem','detected',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 12); // top 12 tokens
}

// Jaccard similarity between two keyword sets
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

const SEVERITY_ORDER = ['P0', 'P1', 'P2', 'P3', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
function higherSeverity(a: string, b: string): string {
  const ai = SEVERITY_ORDER.indexOf(a);
  const bi = SEVERITY_ORDER.indexOf(b);
  if (ai === -1) return b;
  if (bi === -1) return a;
  return ai <= bi ? a : b;
}

// POST /correlation/correlate
correlationRouter.post('/correlate', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { alertId, alertTitle, alertDescription, severity, source } = CorrelateAlertSchema.parse(req.body);

    const keywords = extractKeywords(`${alertTitle} ${alertDescription}`);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    // Find open groups created in the last 2 hours
    const openGroups = await prisma.alertGroup.findMany({
      where: { status: 'OPEN', createdAt: { gte: twoHoursAgo } },
      include: { members: true },
    });

    // Score each group by keyword similarity
    let bestGroup: (typeof openGroups)[0] | null = null;
    let bestScore = 0;
    for (const group of openGroups) {
      const score = jaccardSimilarity(keywords, group.keywords);
      if (score > bestScore && score >= 0.2) { // threshold: ≥20% overlap
        bestScore = score;
        bestGroup = group;
      }
    }

    if (bestGroup) {
      // Add to existing group
      const updatedGroup = await prisma.alertGroup.update({
        where: { id: bestGroup.id },
        data: {
          memberCount: { increment: 1 },
          severity: higherSeverity(bestGroup.severity, severity),
          alertIds: { push: alertId },
          keywords: [...new Set([...bestGroup.keywords, ...keywords])].slice(0, 20),
          updatedAt: new Date(),
        },
      });
      await prisma.alertGroupMember.create({
        data: { groupId: bestGroup.id, alertId, alertTitle, source },
      });
      res.json({
        action: 'ADDED_TO_GROUP',
        groupId: bestGroup.id,
        similarityScore: bestScore,
        group: updatedGroup,
      });
    } else {
      // Create new group
      const rootCauseHint = keywords.slice(0, 3).join(' / ');
      const newGroup = await prisma.alertGroup.create({
        data: {
          title: `${alertTitle.slice(0, 80)} [cluster]`,
          rootCause: `Probable root cause area: ${rootCauseHint}`,
          severity,
          alertIds: [alertId],
          keywords,
          memberCount: 1,
        },
      });
      await prisma.alertGroupMember.create({
        data: { groupId: newGroup.id, alertId, alertTitle, source },
      });
      res.json({
        action: 'NEW_GROUP_CREATED',
        groupId: newGroup.id,
        similarityScore: 0,
        group: newGroup,
      });
    }
  } catch (err) { next(err); }
});

// GET /correlation/groups
correlationRouter.get('/groups', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const groups = await prisma.alertGroup.findMany({
      include: { members: { orderBy: { joinedAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(groups);
  } catch (err) { next(err); }
});

// GET /correlation/groups/:id
correlationRouter.get('/groups/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const group = await prisma.alertGroup.findUnique({
      where: { id: String(req.params.id) },
      include: { members: { orderBy: { joinedAt: 'asc' } } },
    });
    if (!group) { res.status(404).json({ error: 'Group not found' }); return; }
    res.json(group);
  } catch (err) { next(err); }
});

// PATCH /correlation/groups/:id/resolve
correlationRouter.patch('/groups/:id/resolve', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const group = await prisma.alertGroup.update({
      where: { id: String(req.params.id) },
      data: { status: 'RESOLVED', updatedAt: new Date() },
    });
    res.json(group);
  } catch (err) { next(err); }
});
