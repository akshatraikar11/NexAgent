import { Step, PipelineContext } from '../orchestrator/types.js';
import { SentryMCPConnector } from '../mcp/sentry.connector.js';
import { SlackMCPConnector } from '../mcp/slack.connector.js';
import { pagerdutyConnector } from '../mcp/pagerduty.connector.js';
import { generateDualLLMResponse } from '../llm/router.js';
import { scanGuardrails, redactPIIFromText } from '../guardrails/scanner.js';
import { computeCCEPScore } from '../ccep/scorer.js';
import { loadCCEPWeights } from '../ccep/weights.js';
import { getActionReversibilityWeight } from '../ccep/signals.js';
import { classifyIncidentSeverity, severityToReversibilityHint } from '../agency/severity.js';
import { buildIncidentPrompt } from '../agency/prompts.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';

const sentryConnector = new SentryMCPConnector();
const slackConnector = new SlackMCPConnector();

export const INCIDENT_RESPONSE_STEPS: Step[] = [
  {
    name: 'parse_alert',
    tool: 'sentry_mcp',
    action: 'parse_alert',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const alertId = ctx.alertId || 'INC-8891';
      const alert = await sentryConnector.parseAlert(alertId);

      ctx.alertId = alert.alertId;
      ctx.ticketTitle = alert.title;
      ctx.ticketDescription = alert.description;
      ctx.category = 'INFRASTRUCTURE';
      ctx.metadata['sentryAlert'] = alert;
      ctx.stepResults['parse_alert'] = alert;
      return ctx;
    },
  },
  {
    name: 'classify_severity',
    tool: 'agency_nexus',
    action: 'classify_p0_p3',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const alert = ctx.metadata['sentryAlert'] as { errorCount?: number; environment?: string; severity?: string } | undefined;
      const classification = classifyIncidentSeverity(
        ctx.ticketTitle || '',
        ctx.ticketDescription || '',
        alert?.errorCount ?? 0,
        alert?.environment ?? 'production'
      );

      ctx.metadata['severityClassification'] = classification;
      ctx.metadata['incidentSeverity'] = classification.severity;
      ctx.metadata['responseTeam'] = classification.responseTeam;
      ctx.stepResults['classify_severity'] = classification;
      return ctx;
    },
  },
  {
    name: 'correlate_history',
    tool: 'database',
    action: 'query_past_incidents',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      try {
        const { isDatabaseConnected } = await import('../db/client.js');
        if (!(await isDatabaseConnected())) {
          throw new Error('DB offline');
        }

        const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

        // Fetch recent INCIDENT_RESPONSE decisions with their pipeline context
        const recentRuns = await prisma.pipelineRun.findMany({
          where: {
            type: 'INCIDENT_RESPONSE',
            startedAt: { gte: since },
            status: 'COMPLETED',
          },
          select: {
            id: true,
            context: true,
            startedAt: true,
          },
          orderBy: { startedAt: 'desc' },
          take: 200,
        });

        // Simple keyword overlap: tokenise the current alert title/category
        const currentTokens = new Set(
          `${ctx.ticketTitle || ''} ${ctx.category || ''}`
            .toLowerCase()
            .split(/\W+/)
            .filter((t) => t.length > 3)
        );

        const matched: { title: string; date: string }[] = [];
        for (const run of recentRuns) {
          const runCtx = run.context as Record<string, unknown>;
          const pastTitle = String(runCtx['ticketTitle'] || '');
          const pastTokens = pastTitle
            .toLowerCase()
            .split(/\W+/)
            .filter((t) => t.length > 3);
          const overlap = pastTokens.filter((t) => currentTokens.has(t)).length;
          if (overlap >= 1 && pastTitle) {
            matched.push({ title: pastTitle, date: run.startedAt.toISOString().slice(0, 10) });
          }
        }

        const count = matched.length;
        const correlatedSummary =
          count === 0
            ? 'No similar incidents found in the past 90 days.'
            : `Found ${count} similar incident${count > 1 ? 's' : ''} in the past 90 days: ${matched
                .slice(0, 3)
                .map((m) => `"${m.title}" (${m.date})`)
                .join('; ')}${count > 3 ? ` and ${count - 3} more` : ''}.`;

        ctx.stepResults['correlate_history'] = { pastIncidentsCount: count, correlatedSummary };
      } catch (_) {
        logger.warn('[INCIDENT_RESPONSE] correlate_history: DB unavailable, skipping history lookup');
        ctx.stepResults['correlate_history'] = {
          pastIncidentsCount: 0,
          correlatedSummary: 'No history available (DB offline)',
        };
      }
      return ctx;
    },
  },
  {
    name: 'generate_response',
    tool: 'llm_router',
    action: 'generate',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const severity = String(ctx.metadata['incidentSeverity'] || 'P2');
      const correlated = (ctx.stepResults['correlate_history'] as { correlatedSummary?: string })?.correlatedSummary;
      const prompt = buildIncidentPrompt(
        ctx.ticketTitle || '',
        ctx.ticketDescription || '',
        severity,
        correlated
      );
      const llmResult = await generateDualLLMResponse(prompt, ctx.ticketTitle);

      ctx.llmResponse = llmResult.response;
      ctx.geminiConfidence = llmResult.geminiConfidence;
      ctx.groqConfidence = llmResult.groqConfidence;
      ctx.cosineSimilarity = llmResult.cosineSimilarity;
      ctx.modelConfidence = llmResult.modelConfidence;
      ctx.dualModelAgreed = llmResult.dualModelAgreed;
      ctx.stepResults['generate_response'] = llmResult;

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
      const severity = String(ctx.metadata['incidentSeverity'] || 'P2') as 'P0' | 'P1' | 'P2' | 'P3';
      const historicalErrorRate = severity === 'P0' || severity === 'P1' ? 0.65 : severity === 'P2' ? 0.40 : 0.15;
      const actionReversibilityWeight = getActionReversibilityWeight(
        ctx.actionType || (severity === 'P0' ? 'prod_deploy' : 'slack_notification')
      );
      const severityHint = severityToReversibilityHint(severity);
      const effectiveReversibility = Math.max(actionReversibilityWeight, severityHint);

      ctx.historicalErrorRate = historicalErrorRate;
      ctx.actionReversibilityWeight = effectiveReversibility;

      const scoreResult = computeCCEPScore(
        {
          modelConfidence: ctx.modelConfidence,
          historicalErrorRate,
          guardrailFlagCount: ctx.guardrailFlagCount,
          actionReversibilityWeight: effectiveReversibility,
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
      const isAuto = ctx.decision === 'AUTO_RESOLVE';
      const severity = String(ctx.metadata['incidentSeverity'] || 'P2');

      if (isAuto) {
        const safeResponse = redactPIIFromText(ctx.llmResponse || '').slice(0, 200);
        const slackResult = await slackConnector.postAlert(
          '#sre-incidents',
          'INFO',
          `[${severity}] Automated summary for ${ctx.alertId}: ${safeResponse}`
        );
        ctx.stepResults['execute_or_escalate'] = { action: 'INCIDENT_SUMMARY_POSTED', slackResult };
      } else {
        const team = (ctx.metadata['responseTeam'] as string[])?.join(', ') || 'SRE On-Call';

        // Trigger PagerDuty incident for ESCALATE decisions (P0/P1 severity)
        let pdIncidentId: string | undefined;
        if (severity === 'P0' || severity === 'P1') {
          try {
            const pdResult = await pagerdutyConnector.triggerIncident(
              ctx.ticketTitle || 'Incident escalated by NexAgent',
              `CCEP Score: ${ctx.ccepScore?.toFixed(3)} | Alert: ${ctx.alertId} | Severity: ${severity}`,
              severity === 'P0' ? 'critical' : 'error'
            );
            pdIncidentId = pdResult.id;
            logger.info(`[INCIDENT_RESPONSE] PagerDuty incident triggered: ${pdResult.id}`);
          } catch (pdErr) {
            logger.warn({ err: pdErr }, '[INCIDENT_RESPONSE] PagerDuty trigger failed, continuing with Slack only');
          }
        }

        const slackResult = await slackConnector.postAlert(
          '#sre-oncall',
          severity,
          `INCIDENT ESCALATED to ${team} (CCEP: ${ctx.ccepScore?.toFixed(3)}): ${ctx.ticketTitle}${pdIncidentId ? ` | PD: ${pdIncidentId}` : ''}`
        );
        ctx.stepResults['execute_or_escalate'] = { action: 'ONCALL_ESCALATION_HELD', slackResult, pdIncidentId };
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
      } catch (_) {}

      return ctx;
    },
  },
];
