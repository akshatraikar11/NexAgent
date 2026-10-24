import { Step, PipelineContext } from '../orchestrator/types.js';
import { JiraMCPConnector } from '../mcp/jira.connector.js';
import { SlackMCPConnector } from '../mcp/slack.connector.js';
import { chromaKBClient } from '../chromadb/client.js';
import { generateDualLLMResponse } from '../llm/router.js';
import { buildTicketTriagePrompt } from '../agency/prompts.js';
import { classifyIncidentSeverity } from '../agency/severity.js';
import { scanGuardrails, redactPIIFromText } from '../guardrails/scanner.js';
import { screenTicketInput } from '../guardrails/pre-llm-screen.js';
import { computeCCEPScore } from '../ccep/scorer.js';
import { loadCCEPWeights } from '../ccep/weights.js';
import { getHistoricalErrorRate, getActionReversibilityWeight, resolveCategory } from '../ccep/signals.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { isNetworkOrVpnTicket, executeHostRemediation } from '../agency/host-remediation.js';
import { sseManager } from '../sse/manager.js';
import { config } from '../config/index.js';

const jiraConnector = new JiraMCPConnector();
const slackConnector = new SlackMCPConnector();

export const TICKET_TRIAGE_STEPS: Step[] = [
  {
    name: 'fetch_ticket',
    tool: 'jira_mcp',
    action: 'get_issue',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const issueKey = ctx.externalTicketId || ctx.ticketId || 'JIRA-101';
      const issue = await jiraConnector.getIssue(issueKey);

      ctx.externalTicketId = issue.key;
      ctx.ticketTitle = issue.title;
      ctx.ticketDescription = issue.description;
      ctx.category = issue.category;

      // Upsert the category into DB so historicalErrorRate can accumulate real override data.
      // This wires the tacit knowledge feedback loop — overrides from the Approvals page
      // will increase this category's overrideCount and future CCEP scores will reflect it.
      try {
        const { isDatabaseConnected } = await import('../db/client.js');
        if (await isDatabaseConnected() && !ctx.categoryId) {
          const cat = await prisma.category.upsert({
            where: { name: issue.category },
            update: {},
            create: { name: issue.category, description: `Auto-created from ticket ${issue.key}` },
          });
          ctx.categoryId = cat.id;
        }
      } catch (err) {
        logger.warn({ err }, '[TICKET_TRIAGE] Could not upsert category — historicalErrorRate will use defaults');
      }

      ctx.stepResults['fetch_ticket'] = issue;
      return ctx;
    },
  },
  {
    name: 'classify_itil',
    tool: 'agency_itil',
    action: 'impact_urgency_matrix',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const classification = classifyIncidentSeverity(
        ctx.ticketTitle || '',
        ctx.ticketDescription || ''
      );
      ctx.metadata['itilClassification'] = classification;
      ctx.metadata['itilPriority'] = classification.severity;
      ctx.stepResults['classify_itil'] = classification;
      return ctx;
    },
  },
  {
    name: 'search_kb',
    tool: 'chromadb',
    action: 'similarity_search',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const queryText = `${ctx.ticketTitle || ''} ${ctx.ticketDescription || ''}`;
      const matches = await chromaKBClient.searchKB(queryText, 3);

      ctx.kbMatches = matches;
      ctx.stepResults['search_kb'] = matches;

      return ctx;
    },
  },
  {
    name: 'generate_response',
    tool: 'llm_router',
    action: 'generate',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      // Fix #7 — pre-screen user input before it reaches the LLM
      const screened = screenTicketInput(ctx.ticketTitle || '', ctx.ticketDescription || '');
      if (screened.wasRedacted) {
        logger.warn(`[TICKET_TRIAGE] Pre-LLM screen redacted injection attempt in ticket ${ctx.externalTicketId}`);
        ctx.metadata['preScreenRedacted'] = true;
      }

      const kbContext = ctx.kbMatches?.map((m) => `- ${m.content} (score: ${m.score})`).join('\n');
      const prompt = buildTicketTriagePrompt(
        screened.title,
        screened.description,
        kbContext
      );
      const llmResult = await generateDualLLMResponse(prompt, ctx.ticketTitle);

      ctx.llmResponse = llmResult.response;
      ctx.geminiConfidence = llmResult.geminiConfidence;
      ctx.groqConfidence = llmResult.groqConfidence;
      ctx.cosineSimilarity = llmResult.cosineSimilarity;
      ctx.modelConfidence = llmResult.modelConfidence;
      ctx.dualModelAgreed = llmResult.dualModelAgreed;
      ctx.metadata['isMockLLM'] = llmResult.isMock;
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
      const categoryLookup = ctx.categoryId || ctx.category;
      let historicalErrorRate = await getHistoricalErrorRate(categoryLookup);

      // Auto-populate ctx.categoryId if matched by name so future overrides link properly
      if (!ctx.categoryId && categoryLookup) {
        const cat = await resolveCategory(categoryLookup);
        if (cat) ctx.categoryId = cat.id;
      }

      let actionReversibilityWeight = getActionReversibilityWeight(ctx.actionType || 'jira_comment');
      let effectiveConfidence = ctx.modelConfidence;

      // DEMO_POLICY_OVERRIDES: Hard safety rules for financial/critical categories.
      // Default: FALSE — CCEP formula alone decides.
      // When TRUE: these are explicit policy rules (not learned behavior), flagged in metadata.
      // Defensible framing: "billing always needs a human" is a policy choice, not a CCEP output.
      const demoPolicyEnabled = process.env.DEMO_POLICY_OVERRIDES === 'true';
      const itilSeverity = (ctx.metadata['itilClassification'] as { severity?: string })?.severity;
      const isHighRiskInfra = ctx.category === 'INFRASTRUCTURE' && (itilSeverity === 'P0' || itilSeverity === 'P1');

      if (demoPolicyEnabled && (ctx.category === 'BILLING' || isHighRiskInfra)) {
        const policyTarget = ctx.category === 'BILLING' ? 'BILLING' : 'critical INFRASTRUCTURE';
        logger.info(`[CCEP] Demo policy override ACTIVE for ${policyTarget}: forcing escalation signals`);

        historicalErrorRate = Math.max(historicalErrorRate, ctx.category === 'BILLING' ? 0.70 : 0.65);
        actionReversibilityWeight = Math.max(actionReversibilityWeight, 0.85);
        if (effectiveConfidence > 0.50) {
          effectiveConfidence = Math.min(effectiveConfidence, 0.20);
        }

        ctx.metadata['demoPolicyOverrideApplied'] = policyTarget;
      }

      ctx.historicalErrorRate = historicalErrorRate;
      ctx.actionReversibilityWeight = actionReversibilityWeight;

      const scoreResult = computeCCEPScore(
        {
          modelConfidence: effectiveConfidence,
          historicalErrorRate,
          guardrailFlagCount: ctx.guardrailFlagCount,
          actionReversibilityWeight,
        },
        weights,
        ctx.threshold ?? config.ccepThreshold
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
      const isAutoResolve = ctx.decision === 'AUTO_RESOLVE';

      if (isAutoResolve) {
        // Fix #9 — redact PII from LLM response before posting to Slack
        const safeResponse = redactPIIFromText(ctx.llmResponse || '').slice(0, 300);

        // Real host diagnostic & remediation on the live machine
        let liveHostTelemetry: Awaited<ReturnType<typeof executeHostRemediation>> | undefined = undefined;
        if (isNetworkOrVpnTicket(ctx.ticketTitle, ctx.ticketDescription, ctx.category)) {
          try {
            logger.info(`[TICKET_TRIAGE] Executing live host remediation for ticket: ${ctx.ticketTitle}`);
            liveHostTelemetry = await executeHostRemediation(ctx.ticketTitle || '', ctx.ticketDescription || '');
            ctx.metadata['liveHostTelemetry'] = liveHostTelemetry;

            // Broadcast real-time execution log over SSE
            if (ctx.runId) {
              for (const cmdLog of liveHostTelemetry.commandLogs) {
                sseManager.emitEvent(ctx.runId, {
                  runId: ctx.runId,
                  stepName: 'execute_or_escalate',
                  status: 'STARTED',
                  timestamp: new Date().toISOString(),
                  data: { log: cmdLog },
                });
              }
            }

            // VERIFICATION GATE: if remediation ran but verification failed,
            // do NOT claim success. Record as its own outcome and escalate instead.
            if (!liveHostTelemetry.verificationPassed) {
              logger.warn(`[TICKET_TRIAGE] Host remediation FAILED verification for ticket: ${ctx.ticketTitle}. Escalating.`);
              ctx.decision = 'AUTO_RESOLVE_FAILED_VERIFICATION';
              ctx.metadata['verificationFailed'] = true;
              ctx.metadata['verificationErrors'] = liveHostTelemetry.errors;

              const slackResult = await slackConnector.postAlert(
                '#it-escalations',
                'HIGH',
                `⚠️ Ticket ${ctx.externalTicketId} — CCEP scored AUTO_RESOLVE but host remediation FAILED verification. Escalating to human. Errors: ${liveHostTelemetry.errors.join('; ')}`
              );
              const commentResult = await jiraConnector.createComment(
                ctx.externalTicketId || 'JIRA-101',
                `[NexAgent] Auto-remediation attempted but FAILED verification. Escalating to human review. Errors: ${liveHostTelemetry.errors.join('; ')}`
              );
              ctx.stepResults['execute_or_escalate'] = {
                action: 'AUTO_RESOLVE_FAILED_VERIFICATION',
                commentResult,
                slackResult,
                liveHostTelemetry,
              };

              // Persist this distinct outcome and return
              await persistDecision(ctx);
              return ctx;
            }
          } catch (remErr) {
            logger.warn({ remErr }, '[TICKET_TRIAGE] Host remediation encountered error, proceeding with standard resolution');
          }
        }

        // Verification passed (or no host remediation needed) — claim success
        const commentText = liveHostTelemetry?.verificationPassed
          ? `[NexAgent Live Host Remediation — VERIFIED]: ${liveHostTelemetry.summary}\nAI Diagnostic: ${safeResponse}`
          : `[NexAgent Auto-Resolved]: ${safeResponse}`;

        const commentResult = await jiraConnector.createComment(
          ctx.externalTicketId || 'JIRA-101',
          commentText
        );
        const slackResult = await slackConnector.postMessage(
          '#it-support',
          liveHostTelemetry?.verificationPassed
            ? `✅ Ticket ${ctx.externalTicketId} live-remediated on host (VERIFIED — DNS flushed, RasMan verified): ${liveHostTelemetry.summary}`
            : `✅ Ticket ${ctx.externalTicketId} auto-resolved with CCEP score ${ctx.ccepScore} (Threshold: ${ctx.threshold})`
        );
        ctx.stepResults['execute_or_escalate'] = {
          action: 'AUTO_RESOLVE_EXECUTED',
          commentResult,
          slackResult,
          liveHostTelemetry,
        };
      } else {
        // Hold for human review & notify Slack escalation channel
        const slackResult = await slackConnector.postAlert(
          '#it-escalations',
          'HIGH',
          `⚠️ Ticket ${ctx.externalTicketId} ESCALATED to human review (CCEP Score: ${ctx.ccepScore} >= Threshold: ${ctx.threshold})`
        );
        ctx.stepResults['execute_or_escalate'] = { action: 'HUMAN_ESCALATION_HELD', slackResult };
      }

      // Persist Decision entry in database
      await persistDecision(ctx);

      return ctx;
    },
  },
];

/** Persist Decision to database — extracted to avoid duplication between verification paths. */
async function persistDecision(ctx: PipelineContext): Promise<void> {
  try {
    await prisma.decision.create({
      data: {
        ticketId: ctx.ticketId,
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
    logger.warn({ err }, `[TICKET_TRIAGE] Could not persist decision to DB`);
  }
}
