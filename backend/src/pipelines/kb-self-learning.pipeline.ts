import { Step, PipelineContext } from '../orchestrator/types.js';
import { chromaKBClient } from '../chromadb/client.js';
import { scanGuardrails } from '../guardrails/scanner.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';

export const KB_SELF_LEARNING_STEPS: Step[] = [
  {
    name: 'extract_solution',
    tool: 'jira_mcp',
    action: 'extract_resolution',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const ticketId = ctx.ticketId || 'JIRA-101';
      ctx.ticketId = ticketId;

      if (!ctx.llmResponse) {
        ctx.metadata['qualityGatePassed'] = false;
        ctx.metadata['qualityGateReason'] = 'No solution text available for ingestion';
        ctx.stepResults['extract_solution'] = {
          ticketId,
          solution: null,
          skipped: true,
          reason: 'No solution text available for ingestion',
        };
        return ctx;
      }

      ctx.stepResults['extract_solution'] = { ticketId, solution: ctx.llmResponse };
      return ctx;
    },
  },
  {
    name: 'quality_gate',
    tool: 'quality_gate_engine',
    action: 'verify_eligibility',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      const ticketId = ctx.ticketId || 'JIRA-101';

      // Verify quality gate eligibility: non-overridden auto-resolution
      try {
        const ticket = await prisma.ticket.findUnique({
          where: { id: ticketId },
          include: { decisions: { include: { humanOverrides: true } } },
        });

        if (ticket) {
          const hasOverride = ticket.decisions.some((d) => d.humanOverrides.length > 0);
          if (hasOverride) {
            ctx.metadata['qualityGatePassed'] = false;
            ctx.metadata['qualityGateReason'] = 'Human override present for ticket';
            ctx.stepResults['quality_gate'] = { passed: false, reason: 'Human override present' };
            return ctx;
          }
        }
      } catch (_) {}

      ctx.metadata['qualityGatePassed'] = true;
      ctx.stepResults['quality_gate'] = { passed: true, reason: 'Non-overridden auto-resolution eligible for ingestion' };
      return ctx;
    },
  },
  {
    name: 'run_guardrails',
    tool: 'guardrails',
    action: 'scan',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      if (ctx.metadata['qualityGatePassed'] === false) {
        ctx.stepResults['run_guardrails'] = { skipped: true, reason: ctx.metadata['qualityGateReason'] };
        return ctx;
      }
      const scan = scanGuardrails(ctx.llmResponse);
      ctx.guardrailFlags = scan.flags.map((f) => `${f.category}:${f.patternName}`);
      ctx.guardrailFlagCount = scan.flagCount;
      ctx.normalizedGuardrailScore = scan.normalizedScore;
      ctx.stepResults['run_guardrails'] = scan;
      return ctx;
    },
  },
  {
    name: 'ingest_kb',
    tool: 'chromadb',
    action: 'ingest_document',
    maxRetries: 3,
    execute: async (ctx: PipelineContext): Promise<PipelineContext> => {
      if (ctx.metadata['qualityGatePassed'] === false) {
        logger.warn(`[KB INGESTION] Skipping ingestion: ${ctx.metadata['qualityGateReason'] || 'Quality Gate rejected'}`);
        ctx.stepResults['ingest_kb'] = { ingested: false, reason: ctx.metadata['qualityGateReason'] };
        return ctx;
      }

      const result = await chromaKBClient.ingestKBSolution({
        ticketId: ctx.ticketId || 'JIRA-101',
        solutionText: ctx.llmResponse,
        confidenceAtIngestion: ctx.modelConfidence || 0.90,
      });

      ctx.stepResults['ingest_kb'] = { ingested: result.success, kbId: result.kbId, reason: result.reason };
      return ctx;
    },
  },
];
