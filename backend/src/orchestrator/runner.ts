import { Step, PipelineContext } from './types.js';
import { RetryableError, FatalError } from './errors.js';
import { prisma, isDatabaseConnected } from '../db/client.js';
import { sseManager } from '../sse/manager.js';
import { logger } from '../utils/logger.js';
import { tracePipelineStep, traceCCEPDecision } from '../observability/langfuse.js';

export interface RunPipelineOptions {
  backoffBaseMs?: number; // Base delay for exponential backoff (default: 1000ms, set smaller in tests)
}

export async function runPipeline(
  steps: Step[],
  initialContext: PipelineContext,
  options: RunPipelineOptions = {}
): Promise<PipelineContext> {
  const backoffBaseMs = options.backoffBaseMs ?? 1000;
  let context = { ...initialContext };
  const runId = context.runId;

  logger.info(`[ORCHESTRATOR] Starting pipeline runId: ${runId} with ${steps.length} steps.`);

  const dbConnected = await isDatabaseConnected();

  // Update PipelineRun status to RUNNING in database if DB is connected
  if (dbConnected) {
    try {
      await prisma.pipelineRun.update({
        where: { id: runId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
    } catch (err) {
      logger.warn({ err }, `[ORCHESTRATOR] Could not update PipelineRun status in DB`);
    }
  }

  for (const step of steps) {
    let attempt = 0;
    const maxRetries = step.maxRetries ?? 3;
    let stepCompleted = false;

    // Update PipelineRun currentStep in DB
    if (dbConnected) {
      try {
        await prisma.pipelineRun.update({
          where: { id: runId },
          data: { currentStep: step.name, context: JSON.parse(JSON.stringify(context)) },
        });
      } catch (err) {
        logger.warn({ err }, `[ORCHESTRATOR] Could not update PipelineRun.currentStep for runId: ${runId}`);
      }
    }

    // Create StepLog entry in DB
    let stepLogId: string | null = null;
    if (dbConnected) {
      try {
        const stepLog = await prisma.stepLog.create({
          data: {
            pipelineRunId: runId,
            stepName: step.name,
            status: 'RUNNING',
            input: JSON.parse(JSON.stringify(context.stepResults)),
            startedAt: new Date(),
          },
        });
        stepLogId = stepLog.id;
      } catch (err) {
        logger.warn({ err }, `[ORCHESTRATOR] Could not create StepLog for step: ${step.name}, runId: ${runId}`);
      }
    }

    // Emit SSE event: STARTED
    sseManager.emitEvent(runId, {
      runId,
      stepName: step.name,
      status: 'STARTED',
      timestamp: new Date().toISOString(),
    });

    while (!stepCompleted) {
      attempt++;
      const stepStart = Date.now();
      try {
        logger.info(`[ORCHESTRATOR] Executing step: ${step.name} (Attempt ${attempt}/${maxRetries + 1}) for runId: ${runId}`);
        tracePipelineStep({
          runId,
          stepName: step.name,
          tool: step.tool,
          action: step.action,
          status: attempt > 1 ? 'RETRYING' : 'STARTED',
          attempt,
        });
        context = await step.execute(context);
        stepCompleted = true;
        tracePipelineStep({
          runId,
          stepName: step.name,
          tool: step.tool,
          action: step.action,
          status: 'COMPLETED',
          attempt,
          latencyMs: Date.now() - stepStart,
        });

        if (step.name === 'ccep_evaluate' && context.ccepScore !== undefined) {
          traceCCEPDecision({
            runId,
            ccepScore: context.ccepScore,
            threshold: context.threshold,
            decision: context.decision,
            modelConfidence: context.modelConfidence,
            dualModelAgreed: context.dualModelAgreed,
            cosineSimilarity: context.cosineSimilarity,
            historicalErrorRate: context.historicalErrorRate,
            guardrailFlagCount: context.guardrailFlagCount,
            actionReversibilityWeight: context.actionReversibilityWeight,
            signalBreakdown: context.signalBreakdown,
          });
        }

        // Persist step success in StepLog
        if (dbConnected && stepLogId) {
          try {
            await prisma.stepLog.update({
              where: { id: stepLogId },
              data: {
                status: 'COMPLETED',
                output: JSON.parse(JSON.stringify(context.stepResults[step.name] ?? {})),
                completedAt: new Date(),
                retryCount: attempt - 1,
              },
            });
          } catch (err) {
            logger.warn({ err }, `[ORCHESTRATOR] Could not update StepLog (COMPLETED) for step: ${step.name}`);
          }
        }

        // Emit SSE event: COMPLETED
        sseManager.emitEvent(runId, {
          runId,
          stepName: step.name,
          status: 'COMPLETED',
          timestamp: new Date().toISOString(),
          data: context.stepResults[step.name],
        });

      } catch (err: unknown) {
        let currentError = err;

        if (currentError instanceof RetryableError) {
          logger.warn(`[ORCHESTRATOR] RetryableError in step ${step.name} (Attempt ${attempt}): ${currentError.message}`);

          if (attempt <= maxRetries) {
            const delay = backoffBaseMs * Math.pow(2, attempt - 1);
            logger.info(`[ORCHESTRATOR] Retrying step ${step.name} in ${delay}ms...`);

            sseManager.emitEvent(runId, {
              runId,
              stepName: step.name,
              status: 'RETRYING',
              timestamp: new Date().toISOString(),
              data: { attempt, delay, error: currentError.message },
            });

            await new Promise((resolve) => setTimeout(resolve, delay));
            continue; // Retry step loop
          } else {
            logger.error(`[ORCHESTRATOR] Step ${step.name} exhausted all ${maxRetries} retries. Converting to FatalError.`);
            currentError = new FatalError(`Exhausted retries (${maxRetries}): ${currentError.message}`, step.name);
          }
        }

        // Handle FatalError or non-retryable error
        const errorMessage = currentError instanceof Error ? currentError.message : String(currentError);
        logger.error(`[ORCHESTRATOR] Fatal error in step ${step.name} for runId ${runId}: ${errorMessage}`);
        tracePipelineStep({
          runId,
          stepName: step.name,
          tool: step.tool,
          action: step.action,
          status: 'FAILED',
          attempt,
          latencyMs: Date.now() - stepStart,
          error: errorMessage,
        });

        // Update StepLog
        if (dbConnected && stepLogId) {
          try {
            await prisma.stepLog.update({
              where: { id: stepLogId },
              data: {
                status: 'FAILED',
                error: errorMessage,
                completedAt: new Date(),
                retryCount: attempt - 1,
              },
            });
          } catch (err) {
            logger.warn({ err }, `[ORCHESTRATOR] Could not update StepLog (FAILED) for step: ${step.name}`);
          }
        }

        // Update PipelineRun to FAILED
        if (dbConnected) {
          try {
            await prisma.pipelineRun.update({
              where: { id: runId },
              data: {
                status: 'FAILED',
                error: errorMessage,
                completedAt: new Date(),
                context: JSON.parse(JSON.stringify(context)),
              },
            });
          } catch (err) {
            logger.warn({ err }, `[ORCHESTRATOR] Could not update PipelineRun to FAILED for runId: ${runId}`);
          }
        }

        // Emit SSE event: FAILED
        sseManager.emitEvent(runId, {
          runId,
          stepName: step.name,
          status: 'FAILED',
          timestamp: new Date().toISOString(),
          data: { error: errorMessage },
        });

        // Set context decision to ESCALATE on failure
        context.decision = 'ESCALATE';
        context.metadata.error = errorMessage;
        context.metadata.failedAtStep = step.name;

        // Halt pipeline execution and return context
        return context;
      }
    }
  }

  // Update PipelineRun to COMPLETED
  if (dbConnected) {
    try {
      await prisma.pipelineRun.update({
        where: { id: runId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          context: JSON.parse(JSON.stringify(context)),
        },
      });
    } catch (err) {
        logger.warn({ err }, `[ORCHESTRATOR] Could not update PipelineRun to COMPLETED for runId: ${runId}`);
      }
  }

  logger.info(`[ORCHESTRATOR] Successfully completed pipeline runId: ${runId}. Final decision: ${context.decision}`);
  return context;
}
