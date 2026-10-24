import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db/client.js';
import { RunPipelineInputSchema } from '../schemas/pipeline.schema.js';
import { getPipelineSteps } from '../orchestrator/registry.js';
import { runPipeline } from '../orchestrator/runner.js';
import { PipelineContext } from '../orchestrator/types.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { DEFAULT_CCEP_THRESHOLD, MERGEGATE_THRESHOLD } from '../ccep/constants.js';

export const pipelineRouter = Router();

// Fix #12 Medium — rate limit pipeline execution to prevent LLM cost exhaustion
// Each user limited to 30 pipeline runs per 10 minutes
const pipelineLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req as AuthenticatedRequest).user?.userId ?? req.ip ?? 'unknown',
  validate: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Pipeline rate limit exceeded. Max 30 runs per 10 minutes.' },
});

/**
 * POST /pipelines/run
 *
 * ASYNC pattern (SSE-safe):
 *   1. Create PipelineRun record immediately → return { runId, status: "RUNNING" }
 *   2. Fire pipeline execution in background (no await on response)
 *   3. Client connects SSE to /sse/pipeline/:runId BEFORE steps execute
 *   4. Polling: GET /pipelines/:runId for final result
 *
 * This is the correct fix for the SSE timing bug — the frontend can now
 * subscribe to live step events because the HTTP response is sent before
 * any pipeline step begins.
 */
pipelineRouter.post('/run', authenticateJWT, pipelineLimiter, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const input = RunPipelineInputSchema.parse(req.body);
    const steps = getPipelineSteps(input.pipelineType);

    // 1. Create PipelineRun immediately
    const pipelineRun = await prisma.pipelineRun.create({
      data: {
        type: input.pipelineType,
        status: 'PENDING',
        context: {
          ...JSON.parse(JSON.stringify(input)),
          userId: req.user!.userId,
        },
      },
    });

    const initialContext: PipelineContext = {
      runId: pipelineRun.id,
      ticketId: input.ticketId,
      externalTicketId: input.externalTicketId,
      alertId: input.alertId,
      ticketTitle: input.ticketTitle,
      ticketDescription: input.ticketDescription,
      categoryId: input.categoryId,
      actionType: input.actionType,
      // MergeGate uses the unified threshold (0.32) with rev=0.30 and 4 safety preconditions.
      // Preconditions (CI passing, 0 guardrails, bounded diff, unprotected branch) gate the action.
      threshold: input.threshold || (input.pipelineType === 'MERGEGATE' ? MERGEGATE_THRESHOLD : config.ccepThreshold),
      kbMatches: [],
      llmResponse: '',
      geminiConfidence: 0,
      groqConfidence: 0,
      cosineSimilarity: 0,
      modelConfidence: 0,
      dualModelAgreed: true,
      guardrailFlags: [],
      guardrailFlagCount: 0,
      normalizedGuardrailScore: 0,
      historicalErrorRate: 0,
      actionReversibilityWeight: 0,
      ccepScore: 0,
      decision: 'PENDING',
      stepResults: {},
      metadata: input.metadata || {},
    };

    // 2. Fire pipeline in background — do NOT await before responding
    setImmediate(async () => {
      try {
        await runPipeline(steps, initialContext);
      } catch (_) {
        // errors are handled inside runPipeline and written to DB
      }
    });

    // 3. Return runId immediately so client can connect SSE before steps start
    res.status(202).json({
      runId: pipelineRun.id,
      status: 'RUNNING',
      pipelineType: input.pipelineType,
      decision: 'PENDING',
      ccepScore: 0,
      message: `Pipeline ${input.pipelineType} started. Connect SSE at /sse/pipeline/${pipelineRun.id}`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /pipelines/:runId
 * Poll for final result after SSE stream ends.
 * IDOR protection: verified caller ownership unless ADMIN.
 */
pipelineRouter.get('/:runId', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: String(req.params.runId) },
      include: {
        stepLogs: { orderBy: { startedAt: 'asc' } },
        decisions: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!run) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Pipeline run not found' });
      return;
    }

    const runContext = (run.context as Record<string, unknown>) || {};
    const runUserId = runContext.userId as string | undefined;

    // IDOR check: if run was created by a specific user, ensure only that user or ADMIN can inspect it
    if (req.user!.role !== 'ADMIN' && runUserId && runUserId !== req.user!.userId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied to this pipeline run' });
      return;
    }

    const decision = run.decisions?.[0];
    const metadata = (runContext.metadata as Record<string, unknown>) || {};
    const stepResults = (runContext.stepResults as Record<string, { liveHostTelemetry?: unknown }>) || {};
    const liveHostTelemetry = metadata.liveHostTelemetry || stepResults['execute_or_escalate']?.liveHostTelemetry;

    res.json({
      ...run,
      decision: decision?.decision ?? 'PENDING',
      ccepScore: decision?.ccepScore ?? 0,
      threshold: decision?.threshold ?? config.ccepThreshold,
      isMockLLM: (metadata.isMockLLM as boolean | undefined) ?? (config.mockMode || !config.geminiApiKey),
      liveHostTelemetry,
    });
  } catch (error) {
    next(error);
  }
});
