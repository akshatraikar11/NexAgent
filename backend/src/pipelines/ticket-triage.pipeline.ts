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
import { getHistoricalErrorRate, getActionReversibilityWeight } from '../ccep/signals.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';

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
      let historicalErrorRate = await getHistoricalErrorRate(ctx.categoryId);
      if (ctx.category === 'BILLING') {
        historicalErrorRate = Math.max(historicalErrorRate, 0.60);
      }
      let actionReversibilityWeight = getActionReversibilityWeight(ctx.actionType || 'jira_comment');
      if (ctx.category === 'BILLING') {
        actionReversibilityWeight = Math.max(actionReversibilityWeight, 0.85);
      }

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
      const isAutoResolve = ctx.decision === 'AUTO_RESOLVE';

      if (isAutoResolve) {
        // Fix #9 — redact PII from LLM response before posting to Slack
        const safeResponse = redactPIIFromText(ctx.llmResponse || '').slice(0, 300);
        const commentResult = await jiraConnector.createComment(
          ctx.externalTicketId || 'JIRA-101',
          `[NexAgent Auto-Resolved]: ${safeResponse}`
        );
        const slackResult = await slackConnector.postMessage(
          '#it-support',
          `✅ Ticket ${ctx.externalTicketId} auto-resolved with CCEP score ${ctx.ccepScore} (Threshold: ${ctx.threshold})`
        );
        ctx.stepResults['execute_or_escalate'] = { action: 'AUTO_RESOLVE_EXECUTED', commentResult, slackResult };
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

      return ctx;
    },
  },
];
