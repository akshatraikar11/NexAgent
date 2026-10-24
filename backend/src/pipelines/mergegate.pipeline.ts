/**
 * Workflow 6 — MergeGate PR Review Pipeline (Stretch)
 * =====================================================
 * Scans PR diff & CI status; auto-merges trivial low-risk PRs, escalates high-risk diffs.
 * Steps: fetch_pr → assess_risk → run_guardrails → ccep_evaluate → execute_or_escalate
 *
 * AUTO_RESOLVE → Auto-merges the PR (low risk, CI green, small diff)
 * ESCALATE    → Requests senior dev review (high risk, large diff, sensitive modules)
 */

import { Step, PipelineContext } from '../orchestrator/types.js';
import { GitHubMCPConnector } from '../mcp/github.connector.js';
import { SlackMCPConnector } from '../mcp/slack.connector.js';
import { generateDualLLMResponse } from '../llm/router.js';
import { scanGuardrails } from '../guardrails/scanner.js';
import { computeCCEPScore } from '../ccep/scorer.js';
import { loadCCEPWeights } from '../ccep/weights.js';
import { getActionReversibilityWeight } from '../ccep/signals.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

const githubConnector = new GitHubMCPConnector();
const slackConnector = new SlackMCPConnector();

// Modules that always trigger escalation regardless of CCEP score
const HIGH_RISK_MODULES = ['payments/', 'billing/', 'auth/', 'security/', 'api/checkout', 'crypto/'];

/**
 * Explicit, checkable preconditions for auto-merging a PR.
 *
 * These are necessary conditions — a PR that fails any of them escalates
 * unconditionally and the numeric CCEP gate is never consulted. The numeric
 * gate is a *second, independent* condition that runs only after all of these
 * pass (see MERGEGATE_THRESHOLD).
 *
 * `protectedBranches` deliberately excludes `main`: MergeGate is the gate that
 * governs `main`, so branch protection there is expressed by the preconditions
 * themselves. Repos that also protect `main` at the Git level can add it via
 * MERGEGATE_PROTECTED_BRANCHES, and MergeGate will then refuse to auto-merge.
 */
export const MERGEGATE_PRECONDITIONS = {
  maxFilesChanged: 20,
  maxChangedLines: 500,
  protectedBranches: (process.env.MERGEGATE_PROTECTED_BRANCHES
    ? process.env.MERGEGATE_PROTECTED_BRANCHES.split(',').map((b) => b.trim().toLowerCase()).filter(Boolean)
    : ['release', 'production', 'hotfix'])
} as const;

export interface MergePreconditions {
  requiredChecksGreen: boolean;
  zeroGuardrailFlags: boolean;
  boundedDiffSize: boolean;
  targetBranchUnprotected: boolean;
  allPassed: boolean;
  failures: string[];
  effectiveGuardrailFlagCount: number;
}

/**
 * Evaluate the four explicit merge preconditions against the pipeline context.
 * Pure function of the context — no I/O — so it is directly unit-testable.
 */
export function evaluateMergePreconditions(ctx: PipelineContext): MergePreconditions {
  const pr = ctx.metadata['pr'] as {
    prNumber: number; filesChanged: number; additions: number; deletions: number;
    ciStatus: string; baseBranch: string;
  } | undefined;

  const touchesHighRisk = ctx.metadata['touchesHighRisk'] as boolean | undefined;
  const diffScan = ctx.metadata['diffGuardrailScan'] as { flagCount?: number } | undefined;

  // run_guardrails overwrites ctx.guardrailFlagCount, so re-add the diff scan's
  // flags from metadata. High-risk modules carry a forced floor of 2 flags — the
  // same floor ccep_evaluate applies — so they can never satisfy this precondition.
  const effectiveGuardrailFlagCount =
    (ctx.guardrailFlagCount ?? 0) + (diffScan?.flagCount ?? 0) + (touchesHighRisk ? 2 : 0);

  const changedLines = (pr?.additions ?? 0) + (pr?.deletions ?? 0);
  const requiredChecksGreen = pr?.ciStatus === 'success';
  const zeroGuardrailFlags = effectiveGuardrailFlagCount === 0;
  const boundedDiffSize =
    (pr?.filesChanged ?? Number.POSITIVE_INFINITY) <= MERGEGATE_PRECONDITIONS.maxFilesChanged &&
    changedLines <= MERGEGATE_PRECONDITIONS.maxChangedLines;

  const baseBranch = (pr?.baseBranch ?? '').toLowerCase();
  const targetBranchUnprotected =
    baseBranch.length > 0 &&
    !MERGEGATE_PRECONDITIONS.protectedBranches.some(
      (b) => baseBranch === b || baseBranch.startsWith(`${b}/`) || baseBranch.startsWith(`${b}-`)
    );

  const failures: string[] = [];
  if (!requiredChecksGreen) failures.push(`required checks not green (ciStatus=${pr?.ciStatus ?? 'unknown'})`);
  if (!zeroGuardrailFlags) failures.push(`${effectiveGuardrailFlagCount} guardrail flag(s) present`);
  if (!boundedDiffSize) failures.push(`diff out of bounds (${pr?.filesChanged ?? '?'} files, ${changedLines} lines)`);
  if (!targetBranchUnprotected) failures.push(`target branch '${pr?.baseBranch ?? '?'}' is protected`);

  return {
    requiredChecksGreen,
    zeroGuardrailFlags,
    boundedDiffSize,
    targetBranchUnprotected,
    allPassed: failures.length === 0,
    failures,
    effectiveGuardrailFlagCount,
  };
}

export const MERGEGATE_STEPS: Step[] = [
  {
    name: 'fetch_pr',
    tool: 'github_mcp',
    action: 'get_pull_request',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const prIdentifier = (ctx.metadata?.['prNumber'] as string) || 'PR-42';
      const pr = await githubConnector.getPR(prIdentifier);

      ctx.ticketTitle = `PR #${pr.prNumber}: ${pr.title}`;
      ctx.ticketDescription = [
        `Author: ${pr.author}`,
        `Branch: ${pr.branch} → ${pr.baseBranch}`,
        `Files changed: ${pr.filesChanged} (+${pr.additions} -${pr.deletions})`,
        `CI Status: ${pr.ciStatus}`,
        `Risk: ${pr.riskLevel}`,
        `Modules: ${pr.touchedModules.join(', ')}`,
        `Description: ${pr.description}`,
      ].join(' | ');
      ctx.metadata['pr'] = pr;

      // Check if any touched module is in the high-risk list
      const touchesHighRisk = pr.touchedModules.some((mod) =>
        HIGH_RISK_MODULES.some((risky) => mod.startsWith(risky))
      );
      ctx.metadata['touchesHighRisk'] = touchesHighRisk;
      ctx.stepResults['fetch_pr'] = { ...pr, touchesHighRisk };

      return ctx;
    },
  },
  {
    name: 'assess_risk',
    tool: 'llm_router',
    action: 'generate',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const pr = ctx.metadata['pr'] as {
        prNumber: number;
        title: string; filesChanged: number; additions: number; deletions: number;
        ciStatus: string; riskLevel: string; touchedModules: string[]; description: string;
      };
      const touchesHighRisk = ctx.metadata['touchesHighRisk'] as boolean;

      // Fetch actual diff and scan it for secrets/PII/injection patterns
      const prIdentifier = (ctx.metadata?.['prNumber'] as string) || pr.prNumber;
      let diffGuardrailFlagCount = 0;
      try {
        const diff = await githubConnector.getDiff(prIdentifier);
        const diffScan = scanGuardrails(diff);
        diffGuardrailFlagCount = diffScan.flagCount;
        ctx.metadata['diffGuardrailScan'] = diffScan;
        if (diffGuardrailFlagCount > 0) {
          logger.warn(
            `[MERGEGATE] diff guardrail scan found ${diffGuardrailFlagCount} flag(s) in PR #${pr.prNumber}: ` +
              diffScan.flags.map((f) => `${f.category}:${f.patternName}`).join(', ')
          );
        }
      } catch (err) {
        logger.warn({ err }, '[MERGEGATE] getDiff failed, continuing without diff scan');
      }

      // Fold diff flags into ctx so ccep_evaluate can see them
      ctx.guardrailFlagCount = (ctx.guardrailFlagCount ?? 0) + diffGuardrailFlagCount;

      const prompt = [
        `Pull Request: ${pr.title}`,
        `Diff size: ${pr.filesChanged} files, +${pr.additions}/-${pr.deletions} lines`,
        `CI Status: ${pr.ciStatus}`,
        `Risk level: ${pr.riskLevel}`,
        `Touches high-risk modules: ${touchesHighRisk}`,
        `Modules changed: ${pr.touchedModules.join(', ')}`,
        `Description: ${pr.description}`,
        `Diff guardrail flags: ${diffGuardrailFlagCount}`,
        `Assess: is this PR safe to auto-merge without senior review?`,
        `Score (0.0–1.0): confidence this is AUTO_RESOLVE (safe to merge).`,
      ].join('\n');

      const llmResult = await generateDualLLMResponse(prompt, `PR risk: ${pr.riskLevel}`);

      // Hard-reduce confidence for high-risk modules — always escalate
      let adjustedConfidence = llmResult.modelConfidence;
      if (touchesHighRisk) {
        adjustedConfidence = Math.min(adjustedConfidence, 0.20);
      }
      // Also reduce for large diffs
      if (pr.filesChanged > 20 || pr.additions > 500) {
        adjustedConfidence = Math.min(adjustedConfidence, 0.35);
      }
      // Boost for CI failure — always escalate failed CI
      if (pr.ciStatus !== 'success') {
        adjustedConfidence = Math.min(adjustedConfidence, 0.10);
      }
      // Any diff guardrail hit forces escalation
      if (diffGuardrailFlagCount > 0) {
        adjustedConfidence = Math.min(adjustedConfidence, 0.10);
      }

      ctx.llmResponse = llmResult.response;
      ctx.geminiConfidence = llmResult.geminiConfidence;
      ctx.groqConfidence = llmResult.groqConfidence;
      ctx.cosineSimilarity = llmResult.cosineSimilarity;
      ctx.modelConfidence = adjustedConfidence;
      ctx.dualModelAgreed = llmResult.dualModelAgreed;
      ctx.stepResults['assess_risk'] = {
        ...llmResult,
        adjustedConfidence,
        touchesHighRisk,
        diffGuardrailFlagCount,
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
      const touchesHighRisk = ctx.metadata['touchesHighRisk'] as boolean;

      // Preconditions are necessary. The numeric gate below is a second,
      // independent condition that is only allowed to decide when these pass.
      const preconditions = evaluateMergePreconditions(ctx);
      ctx.metadata['mergePreconditions'] = preconditions;

      // PR auto-merge is high reversibility risk
      const actionReversibilityWeight = getActionReversibilityWeight(
        ctx.actionType || 'auto_merge_pr'
      );
      // High-risk module PRs have historically higher error rates — reflect that in the signal.
      // ponytail: 0.45 for high-risk, 0.25 for normal — upgrade path is live overrideCount per repo.
      const historicalErrorRate = touchesHighRisk ? 0.45 : 0.25;

      ctx.historicalErrorRate = historicalErrorRate;
      ctx.actionReversibilityWeight = actionReversibilityWeight;

      const scoreResult = computeCCEPScore(
        {
          modelConfidence: ctx.modelConfidence,
          historicalErrorRate,
          guardrailFlagCount: touchesHighRisk ? Math.max(ctx.guardrailFlagCount, 2) : ctx.guardrailFlagCount,
          actionReversibilityWeight,
        },
        weights,
        ctx.threshold ?? config.ccepThreshold
      );

      ctx.ccepScore = scoreResult.ccepScore;
      ctx.threshold = scoreResult.threshold;
      // Precondition failure escalates unconditionally — the score is still
      // recorded for audit, but it does not get a vote.
      ctx.decision = preconditions.allPassed ? scoreResult.decision : 'ESCALATE';
      ctx.signalBreakdown = scoreResult.signalBreakdown;
      ctx.stepResults['ccep_evaluate'] = {
        ...scoreResult,
        decision: ctx.decision,
        numericDecision: scoreResult.decision,
        preconditions,
      };

      if (!preconditions.allPassed) {
        logger.info(
          `[MERGEGATE] PR preconditions failed → ESCALATE unconditionally: ${preconditions.failures.join('; ')}`
        );
      }

      return ctx;
    },
  },
  {
    name: 'execute_or_escalate',
    tool: 'dispatcher',
    action: 'decide',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const pr = ctx.metadata['pr'] as { prNumber: number; title: string; author: string; branch: string };
      const isAutoResolve = ctx.decision === 'AUTO_RESOLVE';

      if (isAutoResolve) {
        const mergeResult = await githubConnector.mergePR(pr.prNumber, 'squash');
        const slackResult = await slackConnector.postMessage(
          '#engineering',
          `✅ PR #${pr.prNumber} auto-merged by NexAgent MergeGate: "${pr.title}" (CCEP: ${ctx.ccepScore.toFixed(3)}, commit: ${mergeResult.mergeCommit.slice(0, 12)})`
        );
        ctx.stepResults['execute_or_escalate'] = { action: 'PR_AUTO_MERGED', mergeResult, slackResult };
      } else {
        const pre = ctx.metadata['mergePreconditions'] as MergePreconditions | undefined;
        const reason = pre && !pre.allPassed
          ? `preconditions failed: ${pre.failures.join('; ')}`
          : `score ${ctx.ccepScore.toFixed(3)} ≥ numeric gate ${ctx.threshold}`;
        await githubConnector.requestReview(pr.prNumber, ['senior-dev-team']);
        const slackResult = await slackConnector.postAlert(
          '#code-review',
          'HIGH',
          `👀 PR #${pr.prNumber} escalated for senior review: "${pr.title}" by ${pr.author} (${reason}). Branch: \`${pr.branch}\``
        );
        ctx.stepResults['execute_or_escalate'] = { action: 'PR_ESCALATED_FOR_REVIEW', escalationReason: reason, slackResult };
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
        logger.warn({ err }, '[MERGEGATE] Could not persist decision to DB');
      }

      return ctx;
    },
  },
];
