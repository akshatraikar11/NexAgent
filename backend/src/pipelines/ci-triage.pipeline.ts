/**
 * Workflow 4 — CI Test Triage Pipeline (Stretch)
 * ================================================
 * Differentiates flaky test failures from real regression bugs.
 * Steps: fetch_ci_run → analyze_failure → run_guardrails → ccep_evaluate → execute_or_escalate
 *
 * AUTO_RESOLVE → Retries the flaky test automatically
 * ESCALATE    → Blocks the PR and flags the developer
 */

import { Step, PipelineContext } from '../orchestrator/types.js';
import { GitHubMCPConnector } from '../mcp/github.connector.js';
import { SlackMCPConnector } from '../mcp/slack.connector.js';
import { generateDualLLMResponse } from '../llm/router.js';
import { scanGuardrails } from '../guardrails/scanner.js';
import { computeCCEPScore } from '../ccep/scorer.js';
import { loadCCEPWeights } from '../ccep/weights.js';
import { getActionReversibilityWeight, computeFlakinessScore } from '../ccep/signals.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';

const githubConnector = new GitHubMCPConnector();
const slackConnector = new SlackMCPConnector();

export const CI_TRIAGE_STEPS: Step[] = [
  {
    name: 'fetch_ci_run',
    tool: 'github_mcp',
    action: 'get_ci_run',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const runId = (ctx.metadata?.['ciRunId'] as string) || 'RUN-1001';
      const ciRun = await githubConnector.getCIRun(runId);

      ctx.ticketTitle = `CI Failure: ${ciRun.workflowName} on ${ciRun.branch}`;
      ctx.ticketDescription = `Failed tests: ${ciRun.failedTests.join(', ')}. Logs: ${ciRun.errorLogs}`;
      ctx.metadata['ciRun'] = ciRun;
      ctx.metadata['isFlaky'] = ciRun.isFlaky;
      ctx.stepResults['fetch_ci_run'] = ciRun;

      return ctx;
    },
  },
  {
    name: 'analyze_failure',
    tool: 'llm_router',
    action: 'generate',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const ciRun = ctx.metadata['ciRun'] as {
        failedTests: string[]; errorLogs: string; isFlaky: boolean; branch: string;
        runId: string;
      };
      const prompt = [
        `CI run failed on branch: ${ciRun.branch}`,
        `Failed tests: ${ciRun.failedTests.join(', ')}`,
        `Error logs: ${ciRun.errorLogs}`,
        `Classify: is this a flaky test failure (transient) or a real code regression?`,
        `Provide a confidence score (0.0-1.0) for AUTO_RESOLVE (retry the flaky test).`,
      ].join('\n');

      const llmResult = await generateDualLLMResponse(prompt, ciRun.failedTests[0] || 'CI Failure');

      // Record this test execution in history, then compute real flakiness signal
      const primaryTest = ciRun.failedTests[0] || 'unknown';
      let flakinessScore: number | null = null;
      try {
        await prisma.testRunHistory.create({
          data: {
            testName: primaryTest,
            branch: ciRun.branch,
            passed: false, // we only land here on failure
            kind: 'test',
          },
        });
        const raw = await computeFlakinessScore(primaryTest);
        // 0.5 means "unknown" (< 5 runs) — treat as no signal
        if (raw !== 0.5) flakinessScore = raw;
      } catch (err) {
        logger.warn({ err }, '[CI_TRIAGE] Could not write TestRunHistory or compute flakiness; using LLM-only confidence');
      }

      let adjustedConfidence: number;
      if (flakinessScore !== null) {
        // Real signal available: blend 60% LLM / 40% flakiness
        adjustedConfidence = Number((0.6 * llmResult.modelConfidence + 0.4 * flakinessScore).toFixed(4));
      } else {
        // No history yet — fall back to LLM-only directional adjustment
        // Use error log content as a tiebreaker: timeout/network keywords suggest flakiness
        const looksFlaky = /timeout|etimedout|network|flaky|intermittent/i.test(ciRun.errorLogs);
        adjustedConfidence = looksFlaky
          ? Math.min(1.0, llmResult.modelConfidence + 0.20)
          : Math.min(llmResult.modelConfidence, 0.08);
      }

      ctx.llmResponse = llmResult.response;
      ctx.geminiConfidence = llmResult.geminiConfidence;
      ctx.groqConfidence = llmResult.groqConfidence;
      ctx.cosineSimilarity = llmResult.cosineSimilarity;
      ctx.modelConfidence = adjustedConfidence;
      ctx.dualModelAgreed = llmResult.dualModelAgreed;
      ctx.stepResults['analyze_failure'] = {
        ...llmResult,
        flakinessScore,
        adjustedConfidence,
      };

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
      // blendedConfidence already encodes flakiness: high = likely flaky = lower risk.
      // Use modelConfidence < 0.4 as a proxy for "real regression" signal.
      const likelyRegression = (ctx.modelConfidence ?? 0.5) < 0.4;
      const historicalErrorRate = likelyRegression ? 0.60 : 0.20;
      const actionReversibilityWeight = likelyRegression
        ? Math.max(getActionReversibilityWeight(ctx.actionType || 'status_change'), 0.75)
        : getActionReversibilityWeight(ctx.actionType || 'status_change');

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
      const ciRun = ctx.metadata['ciRun'] as { runId: string; failedTests: string[]; branch: string; prNumber?: number };
      const isAutoResolve = ctx.decision === 'AUTO_RESOLVE';

      if (isAutoResolve) {
        // Auto-retry the flaky test
        const retryResult = await githubConnector.retryFailedTests(ciRun.runId);
        const slackResult = await slackConnector.postMessage(
          '#ci-monitoring',
          `🔁 Flaky test auto-retried on \`${ciRun.branch}\`: ${ciRun.failedTests.join(', ')} (CCEP Score: ${ctx.ccepScore.toFixed(3)}, new run: ${retryResult.newRunId})`
        );
        ctx.stepResults['execute_or_escalate'] = { action: 'FLAKY_TEST_RETRIED', retryResult, slackResult };
      } else {
        // Real regression — block the PR and alert the developer
        if (ciRun.prNumber) {
          await githubConnector.blockPR(
            ciRun.prNumber,
            `Real regression detected by NexAgent CI Triage (CCEP Score: ${ctx.ccepScore.toFixed(3)})`
          );
        }
        const slackResult = await slackConnector.postAlert(
          '#engineering',
          'HIGH',
          `🚨 Real regression detected on \`${ciRun.branch}\`: ${ciRun.failedTests.join(', ')} — CCEP Score: ${ctx.ccepScore.toFixed(3)} ≥ Threshold: ${ctx.threshold}. PR blocked for developer review.`
        );
        ctx.stepResults['execute_or_escalate'] = { action: 'REGRESSION_ESCALATED', slackResult };
      }

      // Persist Decision
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
        logger.warn({ err }, '[CI_TRIAGE] Could not persist decision to DB');
      }

      return ctx;
    },
  },
];
