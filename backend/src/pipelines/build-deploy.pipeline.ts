/**
 * Workflow 5 — Build/Deploy Triage Pipeline (Stretch)
 * =====================================================
 * Classifies build/deploy errors into transient infra issues vs real code/config errors.
 * Steps: fetch_build → classify_error → run_guardrails → ccep_evaluate → execute_or_escalate
 *
 * AUTO_RESOLVE → Retries the build automatically (transient infra)
 * ESCALATE    → Alerts DevOps team (code/config error requiring human fix)
 */

import { Step, PipelineContext } from '../orchestrator/types.js';
import { GitHubMCPConnector } from '../mcp/github.connector.js';
import { SlackMCPConnector } from '../mcp/slack.connector.js';
import { generateDualLLMResponse } from '../llm/router.js';
import { scanGuardrails } from '../guardrails/scanner.js';
import { computeCCEPScore } from '../ccep/scorer.js';
import { loadCCEPWeights } from '../ccep/weights.js';
import { getActionReversibilityWeight, computeTransienceScore } from '../ccep/signals.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';

const githubConnector = new GitHubMCPConnector();
const slackConnector = new SlackMCPConnector();

export const BUILD_DEPLOY_STEPS: Step[] = [
  {
    name: 'fetch_build',
    tool: 'github_mcp',
    action: 'get_build',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const buildId = (ctx.metadata?.['buildId'] as string) || 'BUILD-501';
      const build = await githubConnector.getBuild(buildId);

      ctx.ticketTitle = `Build Failure: ${build.workflow} on ${build.branch} [${build.environment}]`;
      ctx.ticketDescription = `Error: ${build.errorMessage}. Type: ${build.errorType}. Duration: ${build.duration}s.`;
      ctx.metadata['build'] = build;
      ctx.metadata['errorType'] = build.errorType;
      ctx.stepResults['fetch_build'] = build;

      return ctx;
    },
  },
  {
    name: 'classify_error',
    tool: 'llm_router',
    action: 'generate',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const build = ctx.metadata['build'] as {
        buildId: string;
        errorType: string; errorMessage: string; workflow: string;
        branch: string; environment: string;
      };

      const prompt = [
        `Build/Deploy failure in workflow: ${build.workflow}`,
        `Environment: ${build.environment}, Branch: ${build.branch}`,
        `Error type hint: ${build.errorType}`,
        `Error message: ${build.errorMessage}`,
        `Classify: is this a transient infrastructure issue (safe to auto-retry) or a code/config error (needs human fix)?`,
        `Provide confidence score (0.0–1.0) that this is safe to AUTO_RESOLVE (retry).`,
      ].join('\n');

      const llmResult = await generateDualLLMResponse(prompt, `Build error: ${build.errorType}`);

      // Record this build execution in history, then compute real transience signal.
      // passed=false because we only reach classify_error on a failed build.
      let transienceScore: number | null = null;
      try {
        await prisma.testRunHistory.create({
          data: {
            testName: `${build.workflow}:${build.environment}`,
            branch: build.branch,
            passed: false,
            kind: 'build',
          },
        });
        const raw = await computeTransienceScore(build.workflow, build.environment);
        // 0.5 means "unknown" (< 5 runs) — treat as no signal
        if (raw !== 0.5) transienceScore = raw;
      } catch (err) {
        logger.warn({ err }, '[BUILD_DEPLOY] Could not write TestRunHistory or compute transience; using LLM-only confidence');
      }

      let adjustedConfidence: number;
      if (transienceScore !== null) {
        // Real signal: blend 60% LLM / 40% transience
        adjustedConfidence = Number((0.6 * llmResult.modelConfidence + 0.4 * transienceScore).toFixed(4));
      } else {
        // No history yet — fall back to errorType-based directional adjustment
        const isTransient = build.errorType === 'transient_infra';
        adjustedConfidence = isTransient
          ? Math.min(1.0, llmResult.modelConfidence + 0.25)
          : Math.min(llmResult.modelConfidence, 0.10);
      }

      ctx.llmResponse = llmResult.response;
      ctx.geminiConfidence = llmResult.geminiConfidence;
      ctx.groqConfidence = llmResult.groqConfidence;
      ctx.cosineSimilarity = llmResult.cosineSimilarity;
      ctx.modelConfidence = adjustedConfidence;
      ctx.dualModelAgreed = llmResult.dualModelAgreed;
      ctx.stepResults['classify_error'] = { ...llmResult, transienceScore, adjustedConfidence };

      return ctx;
    },
  },
  {
    name: 'run_guardrails',
    tool: 'guardrails',
    action: 'scan',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const combinedText = `${ctx.ticketTitle || ''} ${ctx.ticketDescription || ''} ${ctx.llmResponse || ''}`;
      const scan = scanGuardrails(combinedText);

      ctx.guardrailFlags = scan.flags.map((f) => `${f.category}:${f.patternName}`);
      ctx.guardrailFlagCount = scan.flagCount;
      ctx.normalizedGuardrailScore = scan.normalizedScore;
      ctx.stepResults['run_guardrails'] = scan;

      return ctx;
    },
  },
  {
    name: 'ccep_evaluate',
    tool: 'ccep_engine',
    action: 'score',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const weights = loadCCEPWeights();
      const build = ctx.metadata['build'] as { environment: string };

      // Low adjusted confidence → LLM + history both say "persistent error" → higher error rate
      const likelyPersistent = (ctx.modelConfidence ?? 0.5) < 0.4;
      const historicalErrorRate = likelyPersistent ? 0.55 : 0.30;

      // Production deploys are high-reversibility risk
      const actionType = build.environment === 'production' ? 'prod_deploy' : 'status_change';
      const actionReversibilityWeight = getActionReversibilityWeight(
        ctx.actionType || actionType
      );

      ctx.historicalErrorRate = historicalErrorRate;
      ctx.actionReversibilityWeight = actionReversibilityWeight;

      const scoreResult = computeCCEPScore(
        {
          modelConfidence: ctx.modelConfidence,
          historicalErrorRate,
          guardrailFlagCount: ctx.guardrailFlagCount,
          actionReversibilityWeight,
        },
        weights,
        ctx.threshold || 0.60
      );

      ctx.ccepScore = scoreResult.ccepScore;
      ctx.threshold = scoreResult.threshold;
      ctx.decision = scoreResult.decision;
      ctx.signalBreakdown = scoreResult.signalBreakdown;
      ctx.stepResults['ccep_evaluate'] = scoreResult;

      return ctx;
    },
  },
  {
    name: 'execute_or_escalate',
    tool: 'dispatcher',
    action: 'decide',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const build = ctx.metadata['build'] as { buildId: string; workflow: string; environment: string; errorType: string };
      const isAutoResolve = ctx.decision === 'AUTO_RESOLVE';

      if (isAutoResolve) {
        const retryResult = await githubConnector.retryBuild(build.buildId);
        const slackResult = await slackConnector.postMessage(
          '#deployments',
          `🔁 Transient build failure auto-retried for \`${build.workflow}\` [${build.environment}] (CCEP: ${ctx.ccepScore.toFixed(3)}, new build: ${retryResult.newBuildId})`
        );
        ctx.stepResults['execute_or_escalate'] = { action: 'BUILD_AUTO_RETRIED', retryResult, slackResult };
      } else {
        const severity = build.environment === 'production' ? 'CRITICAL' : 'HIGH';
        const slackResult = await slackConnector.postAlert(
          '#devops-alerts',
          severity,
          `🚨 Build/Deploy escalated — ${build.errorType} in \`${build.workflow}\` [${build.environment}] (CCEP: ${ctx.ccepScore.toFixed(3)} ≥ ${ctx.threshold}). Manual intervention required: ${ctx.ticketDescription}`
        );
        ctx.stepResults['execute_or_escalate'] = { action: 'BUILD_ESCALATED_TO_DEVOPS', slackResult };
      }

      try {
        await prisma.decision.create({
          data: {
            pipelineRunId: ctx.runId,
            ccepScore: ctx.ccepScore,
            threshold: ctx.threshold,
            decision: ctx.decision,
            modelConfidence: ctx.modelConfidence,
            dualModelAgreed: ctx.dualModelAgreed,
            historicalErrorRate: ctx.historicalErrorRate,
            guardrailFlagsCount: ctx.guardrailFlagCount,
            normalizedGuardrailScore: ctx.normalizedGuardrailScore,
            actionReversibilityWeight: ctx.actionReversibilityWeight,
            signalBreakdown: JSON.parse(JSON.stringify(ctx.signalBreakdown || {})),
          },
        });
      } catch (err) {
        logger.warn({ err }, '[BUILD_DEPLOY] Could not persist decision to DB');
      }

      return ctx;
    },
  },
];
